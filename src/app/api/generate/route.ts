import { NextRequest, NextResponse } from "next/server";
import { getFigmaFile } from "@/lib/figma-api";
import { runPipeline } from "@/lib/pipeline";
import { buildUITree, getTreeStats } from "@/lib/smart-parser";
import { generateSmartReactFile } from "@/lib/codegen-react";
import { generateSwiftUIFile } from "@/lib/codegen-swiftui";
import { generateSmartComposeFile } from "@/lib/codegen-compose-ai";
import { generateFlutterFile } from "@/lib/codegen-flutter";
import { extractDesignSystem } from "@/lib/design-system";
import { extractAllAssets, groupAssetsByFormat, getAssetStats } from "@/lib/svg-extractor";

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

  // Asset URLs are fetched lazily via /api/assets to avoid 429 rate limits.
  // The generate endpoint returns assets without exportUrls — the client
  // fetches previews on-demand when the user opens the Assets tab.
  const assets = rawAssets;
  const assetStats = getAssetStats(assets);

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
        { name: 'Extract Assets', status: 'done', detail: `${assetStats.icons} icons, ${assetStats.images} images (${svgIds.length} SVG + ${pngIds.length} PNG nodes)` },
      ],
    },
    designSystem,
    assets,
    assetStats,
    fileKey,
    componentName,
  });
}
