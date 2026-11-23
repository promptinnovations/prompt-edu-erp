/**
 * Tiny poll target for the dashboard's substitution watcher: the ids of the
 * signed-in teacher's unconfirmed substitutions (today + a week). One cheap
 * query, so the dashboard no longer has to re-render itself every minute.
 */
import { NextResponse } from "next/server";
import { requireRequestContext } from "../../../../services/request-context";
import { getMyStaffId, listSubstitutions } from "../../../../modules/substitution/service";

export async function GET() {
  let ctx;
  try { ctx = await requireRequestContext(); } catch { return NextResponse.json({ ids: [] }, { status: 401 }); }
  if (!ctx.institutionId) return NextResponse.json({ ids: [] });
  const staffId = await getMyStaffId(ctx.institutionId, ctx.session.authUserId, ctx.userId);
  if (!staffId) return NextResponse.json({ ids: [] });
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const rows = await listSubstitutions(ctx.institutionId, ctx.session.authUserId, { from: today, to: end, coveringStaffId: staffId });
  return NextResponse.json({ ids: rows.filter((r) => !r.acknowledgedAt).map((r) => r.id).sort() }, { headers: { "Cache-Control": "no-store" } });
}
