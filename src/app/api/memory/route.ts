import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

// Helper function to get the memory file path
const getMemoryFilePath = () => {
  const homeDir = os.userInfo().homedir;
  const agentsDir = path.join(homeDir, ".agents", "memory");
  
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  return path.join(agentsDir, "sessions.json");
};

export async function POST(request: NextRequest) {
  try {
    const memoryFile = getMemoryFilePath();
    let sessions = [];

    if (fs.existsSync(memoryFile)) {
      const fileData = fs.readFileSync(memoryFile, "utf-8");
      try {
        sessions = JSON.parse(fileData).sessions || [];
      } catch (e) {
        sessions = [];
      }
    }

    const newSession = await request.json();

    sessions.push({
      ...newSession,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    });

    fs.writeFileSync(memoryFile, JSON.stringify({ sessions }, null, 2));

    return NextResponse.json({ success: true, message: "Session saved to memory" });
  } catch (error: any) {
    console.error("Memory saving error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save session" },
      { status: 500 }
    );
  }
}
