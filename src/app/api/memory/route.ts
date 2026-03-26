import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const project = await prisma.project.create({
      data: {
        name: data.componentName || "FigmaComponent",
        figmaUrl: data.url || "",
        fileKey: data.fileKey || "",
        componentName: data.componentName || "FigmaComponent",
        reactCode: data.reactCode,
        swiftUICode: data.swiftUICode,
        composeCode: data.composeCode,
        flutterCode: data.flutterCode,
        stats: data.stats ? JSON.stringify(data.stats) : null,
        designSystem: data.designSystem ? JSON.stringify(data.designSystem) : null,
        assets: data.assets ? JSON.stringify(data.assets) : null,
        assetStats: data.assetStats ? JSON.stringify(data.assetStats) : null,
      }
    });

    return NextResponse.json({ success: true, message: "Session saved to database", projectId: project.id });
  } catch (error: any) {
    console.error("Memory saving error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save session" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (id) {
      const project = await prisma.project.findUnique({ where: { id } });
      if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
      
      return NextResponse.json({
        id: project.id,
        url: project.figmaUrl,
        fileKey: project.fileKey,
        componentName: project.componentName,
        code: {
          react: project.reactCode,
          swiftui: project.swiftUICode,
          compose: project.composeCode,
          flutter: project.flutterCode,
        },
        stats: project.stats ? JSON.parse(project.stats) : null,
        designSystem: project.designSystem ? JSON.parse(project.designSystem) : null,
        assets: project.assets ? JSON.parse(project.assets) : null,
        assetStats: project.assetStats ? JSON.parse(project.assetStats) : null,
        createdAt: project.createdAt,
      });
    }

    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        figmaUrl: true,
        componentName: true,
        createdAt: true,
      }
    });

    return NextResponse.json({ projects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
