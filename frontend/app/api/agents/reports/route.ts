import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_FILE_PATTERN =
  /^C-(API|UI)-(local|production)-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/;

function isLocalRequest(request: NextRequest): boolean {
  if (process.env.VERCEL) {
    return false;
  }
  const host = request.headers.get("host") || "";
  return (
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host.startsWith("[::1]:")
  );
}

export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) {
    return NextResponse.json(
      {
        detail:
          "Report downloads are local-only. Open the app from http://localhost:3002 to use them.",
      },
      { status: 403 },
    );
  }

  const fileName = request.nextUrl.searchParams.get("file") || "";
  if (!REPORT_FILE_PATTERN.test(fileName)) {
    return NextResponse.json({ detail: "Unknown testing report." }, { status: 400 });
  }

  const repoRoot = resolve(process.cwd(), "..");
  const reportPath = resolve(repoRoot, "allReports", fileName);

  try {
    const report = await readFile(reportPath, "utf8");
    return new NextResponse(report, {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json({ detail: "Testing report was not found." }, { status: 404 });
  }
}
