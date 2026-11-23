/**
 * PROMPT EDU ERP — phone alerts: remember / forget this phone's push
 * subscription for the SIGNED-IN user (never a client-supplied user id).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestContext } from "../../../../services/request-context";
import { getDbClient } from "../../../../services/db/client";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000).refine((u) => u.startsWith("https://"), "Push endpoints are https."),
  keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(10).max(100) }),
});

async function context() {
  try {
    const ctx = await requireRequestContext();
    return ctx.institutionId ? ctx : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId: ctx.institutionId!, authUserId: ctx.session.authUserId }, async (scoped) => {
    await scoped.query(
      `insert into push_subscriptions (institution_id, user_id, endpoint, p256dh, auth, user_agent)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
      [ctx.institutionId, ctx.userId, endpoint, keys.p256dh, keys.auth, (request.headers.get("user-agent") ?? "").slice(0, 300)]
    );
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Missing endpoint." }, { status: 400 });
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId: ctx.institutionId!, authUserId: ctx.session.authUserId }, async (scoped) => {
    await scoped.query("delete from push_subscriptions where user_id = $1 and endpoint = $2", [ctx.userId, body.endpoint]);
  });
  return NextResponse.json({ ok: true });
}
