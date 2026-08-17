/**
 * PROMPT EDU ERP — ONE-TIME follow-up fix for the MBS login provisioning
 * run (see the now-deleted app/api/internal/mbs-provision-logins/route.ts,
 * git history has its full doc comment). That run's own bulk-SQL data
 * load had already set students.login_id to each student's plain full
 * name up front (so the "current class enrollment" and roster views had
 * something sensible to show before any login existed) — but
 * createStudentLoginAccount()'s generateUniqueLoginId() then saw that
 * SAME plain name as already "taken" (by the very row it was about to
 * update) and suffixed every single one of the 327 logins with " 2",
 * e.g. "AFREEN HANEEFA 2" instead of "AFREEN HANEEFA". Functionally the
 * logins still worked (the suffixed name was used consistently for both
 * the login_id and the synthetic email), but it's confusing for a parent
 * to be told to type a name with a stray "2" on it.
 *
 * Deletes each of those 327 Supabase Auth accounts + clears user_id/
 * login_id, then re-provisions cleanly (this time nulling login_id
 * first so generateUniqueLoginId() has nothing stale to collide with).
 * Deleted immediately after its one run, same as its predecessor.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "../../../../services/db/client";
import { getAuthService } from "../../../../services/auth/auth-service";
import { createStudentLoginAccount } from "../../../../modules/portal/service";

const MIGRATION_TOKEN = "6b1f4c2e9a7d3805fbe6712c48a9d0e3f5b8271ac9d40e7c";
const MBS_INSTITUTION_ID = "545bb2e1-6e3d-483a-a5fa-f591da3de770";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== MIGRATION_TOKEN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDbClient();

  // Phase 1: tear down any previously-created (wrongly-suffixed) logins.
  // IMPORTANT: only target rows whose login_id still carries the " 2" bug
  // suffix — NOT every row with a user_id, since re-running this route
  // after Phase 2 has already fixed some students would otherwise delete
  // those freshly-corrected (unsuffixed) accounts too.
  const { rows: toDelete } = await db.query<{ id: string; user_id: string; auth_user_id: string | null }>(
    `select s.id, s.user_id, u.auth_user_id
       from students s join users u on u.id = s.user_id
      where s.institution_id = $1 and s.login_id like '% 2'
      limit 40`,
    [MBS_INSTITUTION_ID]
  );

  const authService = await getAuthService();
  let deleted = 0;
  for (const row of toDelete) {
    if (row.auth_user_id) await authService.adminDeleteUser(row.auth_user_id);
    await db.query("delete from users where id = $1", [row.user_id]);
    await db.query("update students set user_id = null, login_id = null where id = $1", [row.id]);
    deleted++;
  }
  if (deleted > 0) {
    return NextResponse.json({ phase: "delete", deleted, remaining: "call again" });
  }

  // Phase 2: re-provision cleanly now that login_id is null everywhere.
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
  const errors: { studentId: string; fullName: string; message: string }[] = [];
  for (const c of candidates) {
    if (!c.phone) continue;
    try {
      await createStudentLoginAccount(MBS_INSTITUTION_ID, authUserId, userId, { studentId: c.id, parentPhone: c.phone });
      created++;
    } catch (err) {
      errors.push({ studentId: c.id, fullName: c.full_name, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ phase: "recreate", totalCandidates: candidates.length, created, errors });
}
