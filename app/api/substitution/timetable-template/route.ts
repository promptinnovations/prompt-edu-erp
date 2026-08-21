/**
 * PROMPT EDU ERP — configured timetable bulk-upload template download
 * (§356: admin chooses classes/working days/periods-per-day before
 * downloading, rather than a blank generic template).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import { generateConfiguredTimetableTemplate } from "../../../../modules/substitution/service";

export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireRequestContext();
  } catch {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }
  if (!ctx.institutionId) return NextResponse.json({ error: "No active institution." }, { status: 400 });

  try {
    requirePermission(ctx.permissions, "substitution.timetable.manage");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Forbidden." }, { status: 403 });
  }

  const url = new URL(request.url);
  const classIds = (url.searchParams.get("classIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const daysOfWeek = (url.searchParams.get("days") ?? "").split(",").map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 7);
  const periodsPerDay = Number(url.searchParams.get("periodsPerDay") ?? "0");

  if (classIds.length === 0) return NextResponse.json({ error: "Choose at least one class." }, { status: 400 });
  if (daysOfWeek.length === 0) return NextResponse.json({ error: "Choose at least one working day." }, { status: 400 });
  if (!Number.isInteger(periodsPerDay) || periodsPerDay < 1 || periodsPerDay > 20) {
    return NextResponse.json({ error: "Periods per day must be between 1 and 20." }, { status: 400 });
  }

  try {
    const buffer = await generateConfiguredTimetableTemplate(ctx.institutionId, ctx.session.authUserId, { classIds, daysOfWeek, periodsPerDay });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="timetable_template.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate template." }, { status: 400 });
  }
}
