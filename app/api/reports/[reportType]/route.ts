/**
 * PROMPT EDU ERP — report download route handler (§P). Streams the
 * generated PDF/XLSX buffer as an HTTP download; Server Actions can't
 * cleanly return binary responses, so report generation is exposed here
 * as a normal GET, driven by ReportGeneratorForm's plain <form method="get">
 * (§ same reasoning as any other file-download endpoint in a Next.js app).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import { getInstitution } from "../../../../services/institution/institution-service";
import { generateReport } from "../../../../modules/reporting/service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ reportType: string }> }) {
  const { reportType } = await params;
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }
  if (!ctx.institutionId) {
    return NextResponse.json({ error: "No active institution." }, { status: 400 });
  }

  try {
    requirePermission(ctx.permissions, "reports.export");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Forbidden." }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  const parameters: Record<string, unknown> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key === "format") continue;
    parameters[key] = value;
  }

  const institution = await getInstitution(ctx.institutionId, ctx.session.authUserId);

  try {
    const report = await generateReport(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      reportType,
      format,
      parameters,
      institutionName: institution?.appName || institution?.name || "PROMPT EDU ERP",
    });

    return new NextResponse(new Uint8Array(report.buffer), {
      status: 200,
      headers: {
        "Content-Type": report.mimeType,
        "Content-Disposition": `attachment; filename="${report.filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate report." }, { status: 400 });
  }
}
