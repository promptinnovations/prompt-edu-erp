/** Sends a test phone alert to the signed-in user's own phones. */
import { NextResponse } from "next/server";
import { requireRequestContext } from "../../../../services/request-context";
import { notifyUser } from "../../../../services/notification/notification-service";

export async function POST() {
  let ctx;
  try { ctx = await requireRequestContext(); } catch { return NextResponse.json({ error: "Unauthenticated." }, { status: 401 }); }
  if (!ctx.institutionId) return NextResponse.json({ error: "No active institution." }, { status: 400 });
  await notifyUser(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
    type: "test", title: "Test alert", body: "Phone alerts are working. Substitutions will appear like this.",
    channels: ["push"], url: "/dashboard",
  });
  return NextResponse.json({ ok: true });
}
