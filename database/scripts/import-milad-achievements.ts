/**
 * One-off import of Milad Festival results (Results.xlsx) as approved
 * achievements for Madrasathul Muhammadiyya, Pappinippara (code "mmp").
 *
 * Input is database/scripts/data/milad-festival-results.json — sheet rows
 * already resolved to admission numbers (see docs in that file's review
 * sheet). Goes through the same service functions the admin UI uses
 * (submit -> verify -> approve), so portfolio events + audit trail are
 * written and the results appear in the student & parent portals.
 * Idempotent: skips a (student, title) that already exists.
 *
 * Usage: tsx database/scripts/import-milad-achievements.ts [--dry-run]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDbClient } from "../../services/db/client";
import { listStudents } from "../../modules/students/service";
import {
  listAchievementCategories, listAchievementLevels, createAchievementCategory, createAchievementLevel,
  listAchievements, submitAchievement, verifyAchievement, approveAchievement,
} from "../../modules/achievements/service";

interface Row { category: string; item: string; place: string; sheetName: string; house: string; grade: string; adm: string }
const POS: Record<string, string> = { I: "1st", II: "2nd", III: "3rd" };

async function main() {
  const dry = process.argv.includes("--dry-run");
  const rows: Row[] = JSON.parse(readFileSync(join(__dirname, "data/milad-festival-results.json"), "utf-8"));
  const db = await getDbClient();
  const { rows: inst } = await db.query<{ id: string; name: string }>("select id, name from institutions where lower(code) = 'mmp'");
  if (!inst[0]) throw new Error('No institution with code "mmp".');
  const institutionId = inst[0].id;
  const { rows: adm } = await db.query<{ user_id: string; auth_user_id: string }>(
    `select u.id as user_id, u.auth_user_id from user_institution_memberships m
       join users u on u.id = m.user_id
       join user_roles ur on ur.user_id = u.id and ur.institution_id = m.institution_id
       join roles r on r.id = ur.role_id
      where m.institution_id = $1 and r.code = 'institution_admin' and u.auth_user_id is not null limit 1`, [institutionId]);
  if (!adm[0]) throw new Error("No institution_admin with auth account for mmp.");
  const { user_id: userId, auth_user_id: authUserId } = adm[0];
  console.log(`${inst[0].name} — ${rows.length} results${dry ? " (DRY RUN)" : ""}`);

  const students = await listStudents(institutionId, authUserId);
  const byAdm = new Map(students.map((s) => [s.admission_number, s]));

  let cat = (await listAchievementCategories(institutionId, authUserId)).find((c) => c.name === "Milad Festival");
  let lvl = (await listAchievementLevels(institutionId, authUserId)).find((l) => l.name === "School");
  if (!dry) {
    cat ??= await createAchievementCategory(institutionId, authUserId, userId, { name: "Milad Festival" });
    lvl ??= await createAchievementLevel(institutionId, authUserId, userId, { name: "School", sortOrder: 1 });
  }

  let created = 0, skipped = 0, missing = 0;
  for (const r of rows) {
    const st = byAdm.get(r.adm);
    if (!st) { console.warn(`! admission ${r.adm} not found (${r.sheetName})`); missing++; continue; }
    const grade = r.grade && !/^no/i.test(r.grade) ? `, Grade ${r.grade}` : "";
    const title = `${r.item} (${r.category}) — House ${r.house}${grade}`;
    const existing = await listAchievements(institutionId, authUserId, undefined, undefined, st.id);
    if (existing.some((a) => a.title === title)) { skipped++; continue; }
    console.log(`${dry ? "[dry] " : ""}${st.full_name}: ${POS[r.place]} — ${title}`);
    if (dry) { created++; continue; }
    const a = await submitAchievement(institutionId, authUserId, userId, {
      studentId: st.id, categoryId: cat!.id, levelId: lvl!.id, title, position: POS[r.place] ?? r.place, points: null,
    });
    await verifyAchievement(institutionId, authUserId, userId, a.id);
    await approveAchievement(institutionId, authUserId, userId, a.id);
    created++;
  }
  console.log(`Done. created=${created} skipped=${skipped} missing=${missing}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
