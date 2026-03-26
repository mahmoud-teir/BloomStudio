import { NextRequest, NextResponse } from "next/server";
import { getFigmaImages } from "@/lib/figma-api";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Lazy-load asset export URLs from Figma Images API.
 * Called on-demand when the user opens the Assets tab.
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

  const totalIds = svgIds.length + pngIds.length;
  if (totalIds === 0) {
    return NextResponse.json({ svgUrls: {}, pngUrls: {}, errors: [] });
  }
  if (totalIds > 500) {
    return NextResponse.json({ error: "Too many asset IDs (max 500)" }, { status: 400 });
  }

  const svgUrls: Record<string, string | null> = {};
  const pngUrls: Record<string, string | null> = {};
  const errors: string[] = [];

  // Fetch SVG URLs (getFigmaImages already has retry with backoff)
  if (svgIds.length > 0) {
    try {
      const data = await getFigmaImages(fileKey, svgIds, "svg", 1);
      if (data.images) {
        Object.assign(svgUrls, data.images);
      } else if (data.err) {
        errors.push(`Figma API error (svg): ${data.err}`);
      }
    } catch (err: any) {
      errors.push(`Asset fetch failed (svg): ${err.message || err}`);
    }
  }

  // Delay between SVG and PNG to avoid rate limits
  if (svgIds.length > 0 && pngIds.length > 0) {
    await delay(1000);
  }

  // Fetch PNG URLs
  if (pngIds.length > 0) {
    try {
      const data = await getFigmaImages(fileKey, pngIds, "png", 2);
      if (data.images) {
        Object.assign(pngUrls, data.images);
      } else if (data.err) {
        errors.push(`Figma API error (png): ${data.err}`);
      }
    } catch (err: any) {
      errors.push(`Asset fetch failed (png): ${err.message || err}`);
    }
  }

  return NextResponse.json({ svgUrls, pngUrls, errors });
}
