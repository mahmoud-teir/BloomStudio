import { NextRequest, NextResponse } from "next/server";
import { getFigmaImages } from "@/lib/figma-api";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Lazy-load asset export URLs from Figma Images API.
 * Called on-demand when the user opens the Assets tab.
 * Batches large ID sets to avoid URL length limits.
 *
 * POST /api/assets
 * Body: { fileKey, svgIds: string[], pngIds: string[] }
 */
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { fileKey, svgIds = [], pngIds = [] } = body as {
    fileKey?: string;
    svgIds?: string[];
    pngIds?: string[];
  };

  if (!fileKey || typeof fileKey !== "string") {
    return NextResponse.json({ error: "Missing fileKey" }, { status: 400 });
  }

  if (!Array.isArray(svgIds) || !Array.isArray(pngIds)) {
    return NextResponse.json({ error: "svgIds and pngIds must be arrays" }, { status: 400 });
  }

  const validFileKey: string = fileKey;
  const totalIds = svgIds.length + pngIds.length;
  if (totalIds === 0) {
    return NextResponse.json({ svgUrls: {}, pngUrls: {}, errors: [] });
  }
  if (totalIds > 2000) {
    return NextResponse.json({ error: "Too many asset IDs (max 2000)" }, { status: 400 });
  }

  const svgUrls: Record<string, string | null> = {};
  const pngUrls: Record<string, string | null> = {};
  const errors: string[] = [];

  async function fetchBatched(
    ids: string[],
    format: "svg" | "png",
    scale: number,
    target: Record<string, string | null>
  ) {
    if (ids.length === 0) return;

    const batchSize = 50;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      try {
        const data = await getFigmaImages(validFileKey, batch, format, scale);
        if (data.images) {
          Object.assign(target, data.images);
        } else if (data.err) {
          errors.push(`Figma API error (${format}): ${data.err}`);
        }
      } catch (err: any) {
        errors.push(`Asset fetch failed (${format}): ${err.message || err}`);
      }
      // Delay between batches to avoid rate limits
      if (i + batchSize < ids.length) {
        await delay(1000);
      }
    }
  }

  // Fetch SVG URLs (batched), then PNG URLs (batched)
  await fetchBatched(svgIds, "svg", 1, svgUrls);
  if (svgIds.length > 0 && pngIds.length > 0) {
    await delay(1000);
  }
  await fetchBatched(pngIds, "png", 2, pngUrls);

  return NextResponse.json({ svgUrls, pngUrls, errors });
}
