/**
 * PROMPT EDU ERP — raw data export (§Q.2): always through the same
 * institution-scoped, permission-checked query layer as every list screen
 * — an export can never return more than the exporting user is authorized
 * to view.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import { exportDefinitions, exportRows } from "../../../../modules/bulk/service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ entityType: string }> }) {
  const { entityType } = await params;
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }
  if (!ctx.institutionId) return NextResponse.json({ error: "No active institution." }, { status: 400 });

  try {
    requirePermission(ctx.permissions, "data.export");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Forbidden." }, { status: 403 });
  }

  const definition = exportDefinitions[entityType];
  if (!definition) return NextResponse.json({ error: `Unknown export entity type "${entityType}".` }, { status: 400 });

  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  try {
    const rows = await definition.fetch(ctx.institutionId, ctx.session.authUserId);
    const buffer = await exportRows(format, definition.label, definition.columns, rows);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${entityType}.${format}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to export data." }, { status: 400 });
  }
}
