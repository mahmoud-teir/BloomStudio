import { NextRequest, NextResponse } from "next/server";
import { getFigmaImages } from "@/lib/figma-api";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Lazy-load asset export URLs from Figma Images API.
 * Called on-demand when the user opens the Assets tab, avoiding
 * rate limits that occur when fetching during the main generate request.
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
  if (totalIds > 500) {
    return NextResponse.json({ error: "Too many asset IDs (max 500)" }, { status: 400 });
  }

  const svgUrls: Record<string, string | null> = {};
  const pngUrls: Record<string, string | null> = {};
  const errors: string[] = [];

  async function fetchWithRetry(
    ids: string[],
    format: "svg" | "png",
    scale: number,
    target: Record<string, string | null>
  ) {
    if (ids.length === 0) return;

    const maxRetries = 3;
    const backoffs = [3000, 8000, 15000]; // aligned with Figma's rate window

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const data = await getFigmaImages(validFileKey, ids, format, scale);
        if (data.images) {
          Object.assign(target, data.images);
        } else if (data.err) {
          errors.push(`Figma API error (${format}): ${data.err}`);
        }
        return; // success
      } catch (err: any) {
        const is429 =
          err.message?.includes("429") || err.response?.status === 429;
        if (is429 && attempt < maxRetries) {
          console.warn(
            `Rate limited (${format}), retry ${attempt + 1}/${maxRetries} in ${backoffs[attempt]}ms`
          );
          await delay(backoffs[attempt]);
          continue;
        }
        errors.push(
          `Asset fetch failed (${format}): ${err.message || err}`
        );
        return;
      }
    }
  }

  // Fetch SVG first, then PNG (sequential to minimize rate limit pressure)
  await fetchWithRetry(svgIds, "svg", 1, svgUrls);
  if (svgIds.length > 0 && pngIds.length > 0) {
    await delay(1000); // breathing room between requests
  }
  await fetchWithRetry(pngIds, "png", 2, pngUrls);

  return NextResponse.json({ svgUrls, pngUrls, errors });
}
