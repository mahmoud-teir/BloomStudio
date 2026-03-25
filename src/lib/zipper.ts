import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ExtractedAsset } from './svg-extractor';

/**
 * Downloads an asset from its export URL and returns the blob.
 * Handles CORS and redirect issues gracefully.
 */
async function fetchAssetBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function createAndDownloadZip(
  projectName: string,
  reactCode: Record<string, string>,
  htmlCode: Record<string, string>,
  composeCode: Record<string, string>,
  assets: ExtractedAsset[],
  onProgress?: (msg: string) => void
) {
  const zip = new JSZip();

  // ── 1. React Code ──
  const reactFolder = zip.folder('react-components');
  Object.entries(reactCode).forEach(([fileName, content]) => {
    reactFolder?.file(`${fileName}.tsx`, content);
  });

  // ── 2. HTML Code ──
  const htmlFolder = zip.folder('html');
  Object.entries(htmlCode).forEach(([fileName, content]) => {
    htmlFolder?.file(`${fileName}.html`, content);
  });

  // ── 3. Jetpack Compose Code ──
  const composeFolder = zip.folder('compose');
  Object.entries(composeCode).forEach(([fileName, content]) => {
    composeFolder?.file(`${fileName}.kt`, content);
  });

  // ── 4. Assets → organized into /icons, /images, /drawable ──
  if (assets.length > 0) {
    const iconsFolder = zip.folder('icons');
    const imagesFolder = zip.folder('images');
    const drawableFolder = zip.folder('drawable');
    // Also a flat assets folder for web use
    const assetsFolder = zip.folder('assets');

    const downloadPromises = assets.map(async (asset, idx) => {
      onProgress?.(`Downloading asset ${idx + 1}/${assets.length}: ${asset.name}`);

      if (!asset.exportUrl) {
        // No URL — create a placeholder
        const placeholder = asset.format === 'svg'
          ? `<!-- SVG placeholder for: ${asset.originalName} (${asset.width}x${asset.height}) -->\n<svg xmlns="http://www.w3.org/2000/svg" width="${asset.width}" height="${asset.height}" viewBox="0 0 ${asset.width} ${asset.height}"><rect width="100%" height="100%" fill="#ccc"/></svg>`
          : '';

        switch (asset.category) {
          case 'icon':
            iconsFolder?.file(`${asset.name}.svg`, placeholder);
            assetsFolder?.file(`${asset.name}.svg`, placeholder);
            break;
          case 'image':
            imagesFolder?.file(`${asset.name}.png`, '');  // empty; needs real URL
            break;
          case 'drawable':
            drawableFolder?.file(`ic_${asset.name}.xml`, generateVectorDrawablePlaceholder(asset));
            break;
        }
        return;
      }

      // Fetch the real asset
      const blob = await fetchAssetBlob(asset.exportUrl);
      if (!blob) return;

      switch (asset.category) {
        case 'icon':
          iconsFolder?.file(`${asset.name}.svg`, blob);
          assetsFolder?.file(`${asset.name}.svg`, blob);
          break;
        case 'image':
          imagesFolder?.file(`${asset.name}.png`, blob);
          assetsFolder?.file(`${asset.name}.png`, blob);
          break;
        case 'drawable':
          // For drawable, if we have an SVG blob, we save it + generate VectorDrawable XML
          if (asset.format === 'svg') {
            const svgText = await blob.text();
            drawableFolder?.file(`ic_${asset.name}.xml`, svgToVectorDrawable(svgText, asset));
          } else {
            // PNG drawable: just copy it
            drawableFolder?.file(`${asset.name}.png`, blob);
          }
          break;
      }
    });

    await Promise.all(downloadPromises);

    // ── Generate asset manifest ──
    const manifest = generateAssetManifest(assets);
    zip.file('asset-manifest.json', JSON.stringify(manifest, null, 2));
  }

  // ── 5. Generate ZIP ──
  onProgress?.('Generating ZIP...');
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${projectName.replace(/[^a-zA-Z0-9_\-]/g, '_')}-export.zip`);
}

/* ──────── VectorDrawable Generator ──────── */

function generateVectorDrawablePlaceholder(asset: ExtractedAsset): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Auto-generated from Figma: ${asset.originalName} -->
<!-- Replace this with the actual VectorDrawable converted from SVG -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${asset.width}dp"
    android:height="${asset.height}dp"
    android:viewportWidth="${asset.width}"
    android:viewportHeight="${asset.height}">
    <!-- TODO: Convert SVG paths to Android vector paths -->
    <path
        android:fillColor="#CCCCCC"
        android:pathData="M0,0h${asset.width}v${asset.height}H0z"/>
</vector>
`;
}

/**
 * Basic SVG → Android VectorDrawable converter.
 * Handles simple SVG paths; complex SVGs need Android Studio conversion.
 */
function svgToVectorDrawable(svgContent: string, asset: ExtractedAsset): string {
  // Extract viewBox
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1].split(/[\s,]+/) : [0, 0, asset.width, asset.height];

  // Extract all <path> elements
  const pathRegex = /<path[^>]*d="([^"]+)"[^>]*(?:fill="([^"]*)")?[^>]*\/?>/gi;
  const paths: { d: string; fill: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(svgContent)) !== null) {
    paths.push({
      d: match[1],
      fill: match[2] || '#000000',
    });
  }

  // Also try to extract fill from path attributes like fill="..." that appear after d
  const pathRegex2 = /<path[^>]*(?:fill="([^"]*)")?[^>]*d="([^"]+)"[^>]*\/?>/gi;
  while ((match = pathRegex2.exec(svgContent)) !== null) {
    const existing = paths.find(p => p.d === match![2]);
    if (!existing) {
      paths.push({
        d: match![2],
        fill: match![1] || '#000000',
      });
    }
  }

  const pathElements = paths.map(p => {
    const androidColor = p.fill.startsWith('#')
      ? `#FF${p.fill.replace('#', '').toUpperCase().padEnd(6, '0')}`.substring(0, 9)
      : '#FF000000';
    return `    <path
        android:fillColor="${androidColor}"
        android:pathData="${p.d}"/>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Auto-generated from Figma: ${asset.originalName} -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${asset.width}dp"
    android:height="${asset.height}dp"
    android:viewportWidth="${viewBox[2]}"
    android:viewportHeight="${viewBox[3]}">
${pathElements || `    <path
        android:fillColor="#FFCCCCCC"
        android:pathData="M0,0h${asset.width}v${asset.height}H0z"/>`}
</vector>
`;
}

/* ──────── Asset Manifest ──────── */

function generateAssetManifest(assets: ExtractedAsset[]) {
  const icons = assets.filter(a => a.category === 'icon');
  const images = assets.filter(a => a.category === 'image');
  const drawables = assets.filter(a => a.category === 'drawable');

  return {
    generated: new Date().toISOString(),
    summary: {
      totalAssets: assets.length,
      uniqueNodes: new Set(assets.map(a => a.id)).size,
      icons: icons.length,
      images: images.length,
      drawables: drawables.length,
    },
    icons: icons.map(a => ({
      file: `icons/${a.name}.svg`,
      original: a.originalName,
      size: `${a.width}x${a.height}`,
    })),
    images: images.map(a => ({
      file: `images/${a.name}.png`,
      original: a.originalName,
      size: `${a.width}x${a.height}`,
    })),
    drawables: drawables.map(a => ({
      file: `drawable/ic_${a.name}.xml`,
      original: a.originalName,
      size: `${a.width}x${a.height}`,
    })),
  };
}
