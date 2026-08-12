/**
 * PROMPT EDU ERP — per-institution deep link (§137 follow-up: "url should be
 * different for each institution ... short name can be added in the url",
 * e.g. https://prompt-edu-erp.vercel.app/kemhs). A real top-level route
 * always wins over this dynamic one for the same path (Next.js's static-
 * before-dynamic route precedence), so this only ever matches an actual
 * institution code — reinforced by super-admin-service.ts's
 * RESERVED_INSTITUTION_CODES, which stops a code from ever being set to a
 * real route name in the first place.
 *
 * Deliberately does NOT look the code up in the database — it just sets the
 * same `perp_active_institution_code` cookie
 * services/request-context.ts's setActiveInstitutionCode() already uses for
 * the "switch institution" UI action, then redirects to /login. Real
 * validation (does this code correspond to an institution this signed-in
 * user actually belongs to) happens exactly the same way it already does
 * for that cookie today, in resolveActiveInstitution() — no new lookup or
 * RLS surface needed. A bogus/mistyped code just means no institution gets
 * auto-selected, same as an already-stale cookie value would today.
 */
import { NextResponse } from "next/server";
import { setActiveInstitutionCode } from "../../services/request-context";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await setActiveInstitutionCode(code);
  return NextResponse.redirect(new URL("/login", request.url));
}
