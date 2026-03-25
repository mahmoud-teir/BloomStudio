/**
 * Asset Extractor 🎨
 *
 * Deep-traverses the Figma node tree and classifies every exportable node
 * into one of three categories:
 *
 *   /icons      → SVG vector icons (small elements ≤ 48px, or named icon/ic_)
 *   /images     → PNG raster images (IMAGE fills, photos, avatars, thumbnails)
 *   /drawable   → Android VectorDrawable XML (converted from icon SVGs)
 *
 * Also builds the Figma API batch request to fetch render URLs.
 */

import { FigmaNode } from './parser';

/* ──────────── Asset Categories ──────────── */

export type AssetCategory = 'icon' | 'image' | 'drawable';

export interface ExtractedAsset {
  id: string;                   // Figma node ID (used in Images API)
  name: string;                 // sanitized filename
  originalName: string;         // raw Figma layer name
  category: AssetCategory;      // icon | image | drawable
  format: 'svg' | 'png';       // export format
  width: number;
  height: number;
  exportUrl?: string;           // populated after Figma Images API call
}

/* ──────────── Detection ──────────── */

function sanitizeName(raw: string): string {
  return raw
    .replace(/\//g, '_')        // slashes → underscores
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/__+/g, '_')       // collapse multiple underscores
    .replace(/^_|_$/g, '')      // trim edges
    .toLowerCase();
}

function isIconNode(node: FigmaNode): boolean {
  const n = (node.name || '').toLowerCase();
  // Name-based
  if (n.includes('icon') || n.startsWith('ic_') || n.startsWith('ic/') || n.includes('/icon')) return true;
  // Size-based: small vector element
  if (node.absoluteBoundingBox) {
    const { width, height } = node.absoluteBoundingBox;
    if (width > 0 && width <= 48 && height > 0 && height <= 48 && node.type !== 'TEXT') return true;
  }
  return false;
}

function isImageNode(node: FigmaNode): boolean {
  const n = (node.name || '').toLowerCase();
  // Name-based
  if (n.includes('image') || n.includes('photo') || n.includes('avatar') ||
      n.includes('thumbnail') || n.includes('banner') || n.includes('hero') ||
      n.includes('cover') || n.includes('picture') || n.includes('bg_')) return true;
  // Fill-based: explicit IMAGE fill type
  if (node.fills?.some(f => f.type === 'IMAGE')) return true;
  return false;
}

function isVectorExportable(node: FigmaNode): boolean {
  // VECTOR, BOOLEAN_OPERATION, STAR, LINE, ELLIPSE, POLYGON types
  const vectorTypes = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'REGULAR_POLYGON'];
  return vectorTypes.includes(node.type);
}

/* ──────────── Main Extractor ──────────── */

export function extractAllAssets(root: FigmaNode): ExtractedAsset[] {
  const assets: ExtractedAsset[] = [];
  const seenIds = new Set<string>();

  function traverse(node: FigmaNode) {
    if (!node || node.visible === false) return;

    const w = node.absoluteBoundingBox?.width || 0;
    const h = node.absoluteBoundingBox?.height || 0;

    // ── Icons (SVG) ──
    if (isIconNode(node) && !seenIds.has(node.id)) {
      seenIds.add(node.id);
      const name = sanitizeName(node.name);
      assets.push({
        id: node.id,
        name: name,
        originalName: node.name,
        category: 'icon',
        format: 'svg',
        width: Math.round(w),
        height: Math.round(h),
      });
      // Icons also go to drawable as VectorDrawable
      assets.push({
        id: node.id,
        name: name,
        originalName: node.name,
        category: 'drawable',
        format: 'svg',
        width: Math.round(w),
        height: Math.round(h),
      });
      return; // don't recurse into icon children
    }

    // ── Images (PNG) ──
    if (isImageNode(node) && !seenIds.has(node.id)) {
      seenIds.add(node.id);
      assets.push({
        id: node.id,
        name: sanitizeName(node.name),
        originalName: node.name,
        category: 'image',
        format: 'png',
        width: Math.round(w),
        height: Math.round(h),
      });
      return; // don't recurse into image children
    }

    // ── Standalone vectors (export as SVG icon) ──
    if (isVectorExportable(node) && !seenIds.has(node.id) && w > 0 && h > 0) {
      seenIds.add(node.id);
      const name = sanitizeName(node.name);
      assets.push({
        id: node.id,
        name: name,
        originalName: node.name,
        category: 'icon',
        format: 'svg',
        width: Math.round(w),
        height: Math.round(h),
      });
      assets.push({
        id: node.id,
        name: name,
        originalName: node.name,
        category: 'drawable',
        format: 'svg',
        width: Math.round(w),
        height: Math.round(h),
      });
      return;
    }

    // Recurse
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(root);
  return assets;
}

/* ──────────── Batch ID grouping for Figma Images API ──────────── */

export function groupAssetsByFormat(assets: ExtractedAsset[]): {
  svgIds: string[];
  pngIds: string[];
} {
  const svgSet = new Set<string>();
  const pngSet = new Set<string>();

  for (const a of assets) {
    if (a.format === 'svg') svgSet.add(a.id);
    else pngSet.add(a.id);
  }

  return {
    svgIds: Array.from(svgSet),
    pngIds: Array.from(pngSet),
  };
}

/* ──────────── Attach export URLs to assets ──────────── */

export function attachExportUrls(
  assets: ExtractedAsset[],
  svgUrls: Record<string, string | null>,
  pngUrls: Record<string, string | null>
): ExtractedAsset[] {
  return assets.map(a => {
    const urlMap = a.format === 'svg' ? svgUrls : pngUrls;
    return {
      ...a,
      exportUrl: urlMap[a.id] || undefined,
    };
  });
}

/* ──────────── Stats ──────────── */

export function getAssetStats(assets: ExtractedAsset[]) {
  const icons = assets.filter(a => a.category === 'icon');
  const images = assets.filter(a => a.category === 'image');
  const drawables = assets.filter(a => a.category === 'drawable');
  return {
    total: assets.length,
    icons: icons.length,
    images: images.length,
    drawables: drawables.length,
    uniqueNodes: new Set(assets.map(a => a.id)).size,
  };
}
