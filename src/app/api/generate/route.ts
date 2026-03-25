import { NextRequest, NextResponse } from "next/server";
import { getFigmaFile } from "@/lib/figma-api";
import { runPipeline } from "@/lib/pipeline";
import { buildUITree, getTreeStats } from "@/lib/smart-parser";
import { generateSmartReactFile } from "@/lib/codegen-react";
import { generateSwiftUIFile } from "@/lib/codegen-swiftui";
import { generateSmartComposeFile } from "@/lib/codegen-compose-ai";
import { generateFlutterFile } from "@/lib/codegen-flutter";
import { extractDesignSystem } from "@/lib/design-system";
import { extractAllAssets, groupAssetsByFormat, attachExportUrls, getAssetStats } from "@/lib/svg-extractor";
import { getFigmaImages } from "@/lib/figma-api";

function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const keyIndex = Math.max(parts.indexOf('design'), parts.indexOf('file'));
    if (keyIndex === -1 || keyIndex + 1 >= parts.length) return null;
    return {
      fileKey: parts[keyIndex + 1],
      nodeId: parsed.searchParams.get('node-id') ?? undefined,
    };
  } catch {
    return null;
  }
}

function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9 _\-]/g, '')
    .split(/[\s_\-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('') || 'FigmaComponent';
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
  if (url.length > 2000) return NextResponse.json({ error: "URL too long" }, { status: 400 });

  const parsed = parseFigmaUrl(url);
  if (!parsed) return NextResponse.json({ error: "Invalid Figma URL. Expected format: https://www.figma.com/design/<file-key>/..." }, { status: 400 });

  const { fileKey, nodeId } = parsed;

  let fileData: any;
  try {
    fileData = await getFigmaFile(fileKey, nodeId);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const apiNodeId = nodeId?.replace(/-/g, ':');
  const rawNode = apiNodeId && fileData.nodes?.[apiNodeId]
    ? fileData.nodes[apiNodeId].document
    : fileData.document?.children?.[0]?.children?.[0] ?? fileData.document?.children?.[0];

  if (!rawNode) return NextResponse.json({ error: "No renderable node found" }, { status: 422 });

  const { cleanedTree, issues, stats: pipelineStats } = runPipeline(rawNode);
  const uiTree = buildUITree(cleanedTree);
  const stats = getTreeStats(uiTree);
  const componentName = sanitizeName(uiTree.name || fileData.name || 'FigmaComponent');
  const designSystem = extractDesignSystem(rawNode);

  const reactCode = generateSmartReactFile(uiTree, componentName);
  const swiftUICode = generateSwiftUIFile(uiTree, componentName);
  const composeCode = generateSmartComposeFile(uiTree, componentName);
  const flutterCode = generateFlutterFile(uiTree, componentName);

  // ── Extract assets (SVG icons + PNG images) ──
  const rawAssets = extractAllAssets(rawNode);
  const { svgIds, pngIds } = groupAssetsByFormat(rawAssets);

  // Fetch export URLs from Figma Images API (batch in chunks, with rate limit delays)
  const svgUrls: Record<string, string | null> = {};
  const pngUrls: Record<string, string | null> = {};

  const assetErrors: string[] = [];

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  async function batchFetchImages(ids: string[], format: 'svg' | 'png', scale: number, target: Record<string, string | null>) {
    const batchSize = 30; // smaller batches to avoid rate limits
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      let retries = 0;
      const maxRetries = 3;

      while (retries <= maxRetries) {
        try {
          const data = await getFigmaImages(fileKey, batch, format, scale);
          if (data.images) {
            Object.assign(target, data.images);
          } else if (data.err) {
            const msg = `Figma API error (${format}): ${data.err}`;
            console.error(msg);
            assetErrors.push(msg);
          }
          break; // success, exit retry loop
        } catch (err: any) {
          const is429 = err.message?.includes('429') || err.response?.status === 429;
          if (is429 && retries < maxRetries) {
            retries++;
            const backoff = retries * 2000; // 2s, 4s, 6s
            console.warn(`Rate limited (${format} batch ${Math.floor(i / batchSize)}), retrying in ${backoff}ms...`);
            await delay(backoff);
            continue;
          }
          const msg = `Asset batch fetch failed (${format}, batch ${Math.floor(i / batchSize)}): ${err.message || err}`;
          console.error(msg);
          assetErrors.push(msg);
          break;
        }
      }

      // Small delay between batches to stay under rate limits
      if (i + batchSize < ids.length) {
        await delay(500);
      }
    }
  }

  // Fetch SVG and PNG URLs sequentially to avoid rate limits (not in parallel)
  if (svgIds.length > 0) {
    await batchFetchImages(svgIds, 'svg', 1, svgUrls);
  }
  if (pngIds.length > 0) {
    if (svgIds.length > 0) await delay(500); // gap between SVG and PNG runs
    await batchFetchImages(pngIds, 'png', 2, pngUrls);
  }

  const assets = attachExportUrls(rawAssets, svgUrls, pngUrls);
  const assetStats = getAssetStats(assets);
  const assetsWithUrls = assets.filter(a => a.exportUrl).length;

  return NextResponse.json({
    stats,
    code: { react: reactCode, swiftui: swiftUICode, compose: composeCode, flutter: flutterCode },
    uiTree,
    cleanedTree,
    pipeline: {
      issues,
      pipelineStats,
      stages: [
        { name: 'Clean', status: 'done', detail: `Removed ${pipelineStats.nodesRemoved} nodes` },
        { name: 'Normalize', status: 'done', detail: `Normalized ${pipelineStats.nodesNormalized} nodes` },
        { name: 'Validate', status: 'done', detail: `${pipelineStats.issueCount.error} errors, ${pipelineStats.issueCount.warning} warnings, ${pipelineStats.issueCount.info} info` },
        { name: 'Build UI Tree', status: 'done', detail: `${stats.totalNodes} total nodes` },
        { name: 'Generate Code', status: 'done', detail: '4 platforms' },
        { name: 'Extract Assets', status: assetErrors.length > 0 ? 'warning' : 'done', detail: `${assetStats.icons} icons, ${assetStats.images} images (${assetsWithUrls} with preview URLs)${assetErrors.length > 0 ? ` — ${assetErrors[0]}` : ''}` },
      ],
    },
    designSystem,
    assets,
    assetStats,
    assetErrors: assetErrors.length > 0 ? assetErrors : undefined,
    fileKey,
    componentName,
  });
}
