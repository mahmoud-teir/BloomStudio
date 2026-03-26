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

function hasSemanticName(name: string): boolean {
  // Returns false for generic Figma auto-names like "Frame 123", "Group", "Rectangle 5"
  const generic = /^(frame|group|rectangle|ellipse|line|vector|polygon|star|instance|component)\s*\d*$/i;
  return !generic.test(name.trim());
}

function isIconNode(node: FigmaNode): boolean {
  const n = (node.name || '').toLowerCase();
  // Name-based: explicit icon/logo names
  if (n.includes('icon') || n.startsWith('ic_') || n.startsWith('ic/') || n.includes('/icon') || n.includes('logo')) return true;
  // Size-based: small vector element (≤ 48px) that's not text
  if (node.absoluteBoundingBox) {
    const { width, height } = node.absoluteBoundingBox;
    if (width > 0 && width <= 48 && height > 0 && height <= 48 && node.type !== 'TEXT') {
      const vectorLike = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'ELLIPSE', 'REGULAR_POLYGON', 'COMPONENT', 'INSTANCE'];
      if (vectorLike.includes(node.type)) return true;
      // FRAME/GROUP only if they have a meaningful name (not "Frame 12")
      if ((node.type === 'FRAME' || node.type === 'GROUP') && hasSemanticName(node.name)) return true;
    }
  }
  return false;
}

function isImageNode(node: FigmaNode): boolean {
  const n = (node.name || '').toLowerCase();
  // Name-based
  if (n.includes('image') || n.includes('photo') || n.includes('avatar') ||
      n.includes('thumbnail') || n.includes('banner') || n.includes('hero') ||
      n.includes('cover') || n.includes('picture') || n.includes('bg_') ||
      n.includes('illustration') || n.includes('graphic') || n.includes('artwork') ||
      n.includes('screenshot') || n.includes('preview') || n.includes('placeholder')) return true;
  // Fill-based: explicit IMAGE fill type
  if (node.fills?.some(f => f.type === 'IMAGE')) return true;
  return false;
}

function isVectorExportable(node: FigmaNode): boolean {
  // Skip LINE (usually separators/dividers, not meaningful assets)
  const vectorTypes = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'ELLIPSE', 'REGULAR_POLYGON'];
  if (!vectorTypes.includes(node.type)) return false;
  // Skip generic auto-named vectors
  if (!hasSemanticName(node.name)) return false;
  return true;
}

function hasExportSettings(node: FigmaNode): boolean {
  return Array.isArray(node.exportSettings) && node.exportSettings.length > 0;
}

function getExportFormat(node: FigmaNode): 'svg' | 'png' {
  const settings = node.exportSettings;
  if (settings?.some(s => s.format === 'SVG')) return 'svg';
  return 'png';
}

function isExportableComponent(node: FigmaNode): boolean {
  // COMPONENT or INSTANCE that are medium-sized (not tiny icons, not full screens)
  if (node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return false;
  const w = node.absoluteBoundingBox?.width || 0;
  const h = node.absoluteBoundingBox?.height || 0;
  // Skip if already caught as icon (≤48px) or if it's a full screen (>600px both)
  if (w <= 48 && h <= 48) return false;
  if (w > 600 && h > 600) return false;
  // Must have some visual content
  if (node.fills?.some(f => f.visible !== false && (f.type === 'SOLID' || f.type === 'GRADIENT_LINEAR' || f.type === 'GRADIENT_RADIAL' || f.type === 'IMAGE'))) return true;
  // Or has children (it's a composed component)
  if (node.children && node.children.length > 0) return true;
  return false;
}

/* ──────────── Main Extractor ──────────── */

export function extractAllAssets(root: FigmaNode): ExtractedAsset[] {
  const assets: ExtractedAsset[] = [];
  const seenIds = new Set<string>();

  function traverse(node: FigmaNode) {
    if (!node || node.visible === false) return;

    const w = node.absoluteBoundingBox?.width || 0;
    const h = node.absoluteBoundingBox?.height || 0;

    // ── Designer-marked exports (strongest signal) ──
    if (hasExportSettings(node) && !seenIds.has(node.id) && w > 0 && h > 0) {
      seenIds.add(node.id);
      const name = sanitizeName(node.name);
      const format = getExportFormat(node);
      const category: AssetCategory = format === 'svg' ? 'icon' : 'image';
      assets.push({ id: node.id, name, originalName: node.name, category, format, width: Math.round(w), height: Math.round(h) });
      if (format === 'svg') {
        assets.push({ id: node.id, name, originalName: node.name, category: 'drawable', format: 'svg', width: Math.round(w), height: Math.round(h) });
      }
      return; // designer already chose what to export
    }

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

    // ── Exportable components (PNG — buttons, cards, UI pieces) ──
    if (isExportableComponent(node) && !seenIds.has(node.id) && w > 0 && h > 0) {
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
      // Still recurse into component children for nested icons/images
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
