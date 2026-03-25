import { NextRequest, NextResponse } from "next/server";
import { getFigmaFile, getFigmaImages } from "@/lib/figma-api";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fileKey = searchParams.get("fileKey");
  const nodeId = searchParams.get("nodeId");
  const endpoint = searchParams.get("endpoint") || "file";

  if (!fileKey) {
    return NextResponse.json({ error: "Missing fileKey parameter" }, { status: 400 });
  }

  try {
    // ── File tree ──
    if (endpoint === "file") {
      const data = await getFigmaFile(fileKey, nodeId || undefined);
      return NextResponse.json(data);
    }

    // ── Batch image export ──
    if (endpoint === "images") {
      const ids = searchParams.get("ids");
      const format = (searchParams.get("format") || "svg") as "svg" | "png" | "jpg";
      const scale = parseFloat(searchParams.get("scale") || "1");

      if (!ids) {
        return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
      }

      // Figma API has a limit of ~100 IDs per request, so we batch
      const allIds = ids.split(",").filter(Boolean);
      const batchSize = 50;
      const allImages: Record<string, string | null> = {};

      for (let i = 0; i < allIds.length; i += batchSize) {
        const batch = allIds.slice(i, i + batchSize);
        const data = await getFigmaImages(fileKey, batch, format, scale);
        if (data.images) {
          Object.assign(allImages, data.images);
        }
      }

      return NextResponse.json({ images: allImages });
    }

    return NextResponse.json({ error: "Unknown endpoint" }, { status: 400 });
  } catch (error: any) {
    console.error("Figma API proxy error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch from Figma API" },
      { status: 500 }
    );
  }
}
