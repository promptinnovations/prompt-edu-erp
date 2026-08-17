/**
 * PROMPT EDU ERP — ONE-TIME migration utility for the MBS bulk data load
 * (§137 follow-up "parent log in"). This sandbox environment has no
 * outbound network access to Supabase's Auth Admin API (only the Supabase
 * MCP's SQL tool is reachable), so student login provisioning — which
 * needs a real Supabase Auth signup, not a plain SQL insert — has to run
 * from inside the deployed app instead, which does have that access. This
 * route exists ONLY to trigger createStudentLoginAccount() for MBS's
 * still-loginless students in one pass; it is deleted immediately after
 * that one run (see the commit right after this one).
 *
 * Gated by a single-use random token (not a real secret rotation
 * mechanism) rather than the normal session-cookie auth, since this is
 * invoked directly, outside any browser session. Never add another route
 * like this for anything beyond a one-off migration.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "../../../../services/db/client";
import { createStudentLoginAccount } from "../../../../modules/portal/service";

const MIGRATION_TOKEN = "487e9f28c070d9565862a2a7950e12fcf7740c3eb2bacd74";
const MBS_INSTITUTION_ID = "545bb2e1-6e3d-483a-a5fa-f591da3de770";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== MIGRATION_TOKEN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDbClient();
  const { rows: adminRows } = await db.query<{ user_id: string; auth_user_id: string }>(
    `select u.id as user_id, u.auth_user_id
       from user_institution_memberships m
       join users u on u.id = m.user_id
       join user_roles ur on ur.user_id = u.id and ur.institution_id = m.institution_id
       join roles r on r.id = ur.role_id
      where m.institution_id = $1 and r.code = 'institution_admin' and u.auth_user_id is not null
      limit 1`,
    [MBS_INSTITUTION_ID]
  );
  if (!adminRows[0]) {
    return NextResponse.json({ error: "No institution_admin with a linked auth account found for MBS." }, { status: 500 });
  }
  const { user_id: userId, auth_user_id: authUserId } = adminRows[0];

  const { rows: candidates } = await db.query<{ id: string; full_name: string; phone: string | null }>(
    `select s.id, s.full_name, p.phone
       from students s
       join student_parents sp on sp.student_id = s.id and sp.relationship = 'Father'
       join parents p on p.id = sp.parent_id
      where s.institution_id = $1 and s.user_id is null and p.phone is not null
      order by s.full_name`,
    [MBS_INSTITUTION_ID]
  );

  let created = 0;
  let skipped = 0;
  const errors: { studentId: string; fullName: string; message: string }[] = [];

  for (const c of candidates) {
    if (!c.phone) { skipped++; continue; }
    try {
      await createStudentLoginAccount(MBS_INSTITUTION_ID, authUserId, userId, { studentId: c.id, parentPhone: c.phone });
      created++;
    } catch (err) {
      errors.push({ studentId: c.id, fullName: c.full_name, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ totalCandidates: candidates.length, created, skipped, errors });
}
