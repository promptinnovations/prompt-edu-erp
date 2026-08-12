/**
 * PROMPT EDU ERP — import template download (§Q.1 "Download Template...
 * generated from the same field/validation schema used for manual entry").
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import { generateImportTemplate } from "../../../../modules/bulk/service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ entityType: string }> }) {
  const { entityType } = await params;
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }
  if (!ctx.institutionId) return NextResponse.json({ error: "No active institution." }, { status: 400 });

  try {
    requirePermission(ctx.permissions, "data.import");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Forbidden." }, { status: 403 });
  }

  try {
    const buffer = await generateImportTemplate(entityType);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${entityType}_template.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate template." }, { status: 400 });
  }
}
