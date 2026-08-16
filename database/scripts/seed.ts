/**
 * PROMPT EDU ERP — seed runner.
 *
 * Like migrations, seeding runs on the privileged/owner connection (not
 * through withInstitutionContext/app_user) since it is platform
 * administration, not tenant request traffic — see the note in
 * database/scripts/migrate.ts and database/migrations/0002_app_runtime_role.sql.
 *
 * Usage: npm run db:seed
 * Also exported as applyPlatformSeeds(db) / seedDemoInstitution(db) for reuse
 * in tests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DbClient } from "../../services/db/client";
import { getDbClient } from "../../services/db/client";

const SEEDS_DIR = join(process.cwd(), "database", "seeds");

export async function applyPlatformSeeds(db: DbClient) {
  const files = readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(SEEDS_DIR, file), "utf8");
    await db.execRaw(sql);
  }
  return files.length;
}

/**
 * Creates ONE example institution purely as tenant configuration data — exam
 * types, achievement categories, scoring rules all as rows, never as
 * application code (§K.4, §42 of the master spec). Returns the new
 * institution's id.
 */
export async function seedDemoInstitution(db: DbClient, code = "badrudhuja"): Promise<string> {
  // plan_id defaults to the oldest active subscription plan (the seeded
  // "Starter" plan today) — §W.2's LimitService has nothing to check
  // against otherwise. An institution can be moved to a different plan
  // later the same way any other configuration changes (a future Super
  // Admin action, not built as its own UI yet — see docs/SETUP.md).
  const { rows } = await db.query<{ id: string }>(
    `insert into institutions (code, name, type, default_locale, app_name, short_name, plan_id)
     values ($1, $2, 'madrasa', 'en', $3, $4, (select id from subscription_plans where is_active = true order by created_at asc limit 1))
     on conflict (code) do update set name = excluded.name
     returning id`,
    [code, `${code} Institute`, `${code} Portal`, code]
  );
  const institutionId = rows[0].id;

  await db.query(
    `insert into institution_settings (institution_id, key, value_jsonb)
     values ($1, 'enabled_ui_languages', '["en","ml"]'::jsonb)
     on conflict (institution_id, key) do update set value_jsonb = excluded.value_jsonb`,
    [institutionId]
  );

  const systemRoles: Array<[string, string]> = [
    ["institution_admin", "Institution Admin"],
    ["management", "Principal / Management"],
    ["teacher", "Teacher"],
    ["staff", "Staff"],
    ["librarian", "Librarian"],
    ["parent", "Parent"],
    ["student", "Student"],
  ];
  for (const [rcode, name] of systemRoles) {
    await db.query(
      `insert into roles (institution_id, code, name, is_system_role)
       values ($1, $2, $3, true) on conflict (institution_id, code) do nothing`,
      [institutionId, rcode, name]
    );
  }

  const { rows: moduleRows } = await db.query<{ id: string }>(
    `select id from modules where code in ('academic','students','examination','attendance','library','skills','achievements','staff','discipline','mentoring')`
  );
  for (const m of moduleRows) {
    await db.query(
      `insert into institution_modules (institution_id, module_id, is_enabled)
       values ($1, $2, true) on conflict (institution_id, module_id) do nothing`,
      [institutionId, m.id]
    );
  }

  // Default role -> permission grants (§F.4). Institution Admin gets every
  // non-platform permission ("full institution-scoped access"); other
  // system roles get a representative subset matching their real-world
  // responsibilities. None of this is hard-coded logic — it is seed DATA in
  // role_permissions, editable per institution afterward through the same
  // roles/permissions tables (§23 "future custom roles").
  await db.query(
    `insert into role_permissions (role_id, permission_id)
     select r.id, p.id from roles r, permissions p
      where r.institution_id = $1 and r.code = 'institution_admin' and p.module <> 'super_admin'
     on conflict do nothing`,
    [institutionId]
  );

  const roleGrants: Record<string, string[]> = {
    management: [
      "student.view_all", "marks.view", "marks.approve", "attendance.view", "attendance.edit",
      "achievements.verify", "achievements.approve", "skills.approve",
      "discipline.view", "portfolio.view_all", "reports.view", "reports.export", "audit.view",
      "staff.view", "staff.edit", "staff.portion.manage", "staff.observation.manage", "staff.assignment.manage",
      "mentoring.view_all", "data.import", "data.export", "announcements.publish", "announcements.view",
      "files.manage",
    ],
    teacher: [
      "student.view", "marks.view", "marks.enter", "marks.verify",
      "attendance.view", "attendance.enter", "attendance.leave.review_own_class", "skills.review",
      "achievements.submit", "portfolio.view_own", "discipline.record",
      "staff.view", "staff.portion.manage",
      "mentoring.view_own", "mentoring.create", "announcements.view",
    ],
    librarian: ["library.view", "library.issue", "library.return", "library.manage", "student.view", "announcements.view"],
    parent: ["student.view", "portfolio.view_own", "reports.view", "announcements.view", "attendance.leave.apply"],
    student: ["student.view", "portfolio.view_own", "skills.submit", "library.view", "achievements.submit", "announcements.view", "attendance.leave.apply"],
    staff: ["staff.view", "announcements.view"],
  };
  for (const [roleCode, permCodes] of Object.entries(roleGrants)) {
    await db.query(
      `insert into role_permissions (role_id, permission_id)
       select r.id, p.id from roles r, permissions p
        where r.institution_id = $1 and r.code = $2 and p.code = any($3::text[])
       on conflict do nothing`,
      [institutionId, roleCode, permCodes]
    );
  }

  // A current academic year — examinations/enrollments/attendance all key
  // off this (§D.3). Institution-specific data, not a platform default.
  await db.query(
    `insert into academic_years (institution_id, name, start_date, end_date, is_current)
     values ($1, '2026-2027', '2026-06-01', '2027-03-31', true)
     on conflict do nothing`,
    [institutionId]
  );

  // Default attendance statuses (§D.6, §36 "one status per institution must
  // be is_default=true") — institution CONFIGURATION, not a platform enum.
  // Any institution can rename/add/remove statuses through this same table.
  const attendanceStatuses: Array<[string, string, boolean, boolean]> = [
    ["present",   "Present",   true,  true],
    ["absent",    "Absent",    false, false],
    ["late",      "Late",      true,  false],
    ["half_day",  "Half Day",  true,  false],
    ["on_leave",  "On Leave",  false, false],
  ];
  for (const [code, label, countsAsPresent, isDefault] of attendanceStatuses) {
    await db.query(
      `insert into attendance_statuses (institution_id, code, label, counts_as_present, is_default)
       values ($1, $2, $3, $4, $5)
       on conflict (institution_id, code) do nothing`,
      [institutionId, code, label, countsAsPresent, isDefault]
    );
  }

  // Default classification rule (§N.4, §30 "never hard-code thresholds") —
  // institution CONFIGURATION. Any institution can set its own cut-offs, or
  // add rules based on a different metric (average/grade/consolidated_score)
  // through this same table.
  await db.query(
    `insert into classification_rules (institution_id, based_on, high_threshold, low_threshold)
     values ($1, 'percentage', 75, 40)
     on conflict (institution_id, based_on) do nothing`,
    [institutionId]
  );

  // Example exam types (Badrudhuja-style, §42/§K.4) — institution
  // CONFIGURATION, not a platform-wide enum. Any institution can define its
  // own exam type names instead.
  const examTypeNames: Array<[string, string]> = [
    ["kithab_main", "Kithab Main Exam"],
    ["kithab_model", "Kithab Model Exam"],
    ["academic_main", "Academic Main Exam"],
    ["academic_model", "Academic Model Exam"],
  ];
  for (const [code, name] of examTypeNames) {
    await db.query(
      `insert into exam_types (institution_id, code, name) values ($1, $2, $3) on conflict (institution_id, code) do nothing`,
      [institutionId, code, name]
    );
  }

  // A default grade scale — §30 "never hard-code thresholds". This is one
  // reasonable example (a common Indian 10-point-ish letter scale); any
  // institution can define a completely different scale through the same
  // grade_scales/grade_bands tables.
  const { rows: scaleRows } = await db.query<{ id: string }>(
    `insert into grade_scales (institution_id, name, is_default) values ($1, 'Standard Grading', true)
     on conflict (institution_id, name) do update set is_default = true returning id`,
    [institutionId]
  );
  const gradeScaleId = scaleRows[0].id;
  const bands: Array<[number, number, string, number]> = [
    [90, 100, "A+", 10],
    [80, 89.99, "A", 9],
    [70, 79.99, "B+", 8],
    [60, 69.99, "B", 7],
    [50, 59.99, "C+", 6],
    [40, 49.99, "C", 5],
    [35, 39.99, "D", 4],
    [0, 34.99, "F", 0],
  ];
  for (const [min, max, label, point] of bands) {
    await db.query(
      `insert into grade_bands (institution_id, grade_scale_id, min_percent, max_percent, grade_label, grade_point)
       values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing`,
      [institutionId, gradeScaleId, min, max, label, point]
    );
  }

  // Skill types + representative activities (§D.7, Phase 6) — institution
  // CONFIGURATION, not a platform-wide list. Any institution can rename or
  // replace these; a madrasa's "language" skill type reasonably centers on
  // Arabic, but nothing here assumes that — it is just this one seed's data.
  const skillTypes: Array<[string, string]> = [
    ["reading", "Reading"],
    ["writing", "Writing"],
    ["speaking", "Speaking"],
    ["language", "Language"],
  ];
  const skillTypeIds: Record<string, string> = {};
  for (const [code, name] of skillTypes) {
    const { rows } = await db.query<{ id: string }>(
      `insert into skill_types (institution_id, code, name) values ($1, $2, $3)
       on conflict (institution_id, code) do update set name = excluded.name
       returning id`,
      [institutionId, code, name]
    );
    skillTypeIds[code] = rows[0].id;
  }

  const skillActivities: Array<[string, string, string, boolean, boolean, boolean]> = [
    // [skillTypeCode, name, description, evidenceRequired, verificationRequired, approvalRequired]
    ["reading", "Weekly Reading Log", "Log of books/pages read each week", true, true, false],
    ["writing", "Essay Writing", "A written composition on an assigned or free topic", true, true, true],
    ["speaking", "Public Speaking / Elocution", "A recorded or in-person speaking assessment", false, true, false],
    ["language", "Arabic Language Proficiency", "Periodic Arabic language proficiency check", true, true, true],
  ];
  for (const [typeCode, name, description, evidenceRequired, verificationRequired, approvalRequired] of skillActivities) {
    await db.query(
      `insert into skill_activities
         (institution_id, skill_type_id, name, description, evidence_required, verification_required, approval_required)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict do nothing`,
      [institutionId, skillTypeIds[typeCode], name, description, evidenceRequired, verificationRequired, approvalRequired]
    );
  }

  // Achievement categories/levels (§D.7) — "Sahityotsav" is the example
  // given in the master spec (§42); every value here is institution
  // configuration, editable afterward through the same tables.
  const achievementCategories = ["Sahityotsav", "Sports Meet", "Quran Competition", "Academic Excellence"];
  for (const name of achievementCategories) {
    await db.query(
      `insert into achievement_categories (institution_id, name) values ($1, $2) on conflict (institution_id, name) do nothing`,
      [institutionId, name]
    );
  }

  const achievementLevels: Array<[string, number]> = [
    ["School", 1], ["Zone", 2], ["District", 3], ["State", 4], ["National", 5], ["International", 6],
  ];
  for (const [name, sortOrder] of achievementLevels) {
    await db.query(
      `insert into achievement_levels (institution_id, name, sort_order) values ($1, $2, $3) on conflict (institution_id, name) do nothing`,
      [institutionId, name, sortOrder]
    );
  }

  // Scoring rules (§K.4 "Badrudhuja configuration examples — tenant data,
  // not platform code"). activity_code matches skills/service.ts's
  // slugify(skill_activity.name), keeping the two config surfaces (skill
  // workflow config vs point-value config) independently editable per §254.
  // Flat point values here (no condition_jsonb thresholds) match what the
  // current submission form actually collects (free-text notes); the
  // evaluator itself fully supports min_/max_/bonus conditions — see
  // tests/integration/scoring-flow.test.ts for that exercised directly.
  const scoringRules: Array<[string, string, number, boolean, boolean]> = [
    ["reading", "weekly_reading_log", 3, true, false],
    ["writing", "essay_writing", 5, true, true],
    ["speaking", "public_speaking_elocution", 5, true, false],
    ["language", "arabic_language_proficiency", 10, true, true],
  ];
  for (const [module, activityCode, points, verificationRequired, approvalRequired] of scoringRules) {
    await db.query(
      `insert into scoring_rules
         (institution_id, module, activity_code, condition_jsonb, points, verification_required, approval_required)
       values ($1, $2, $3, '{}'::jsonb, $4, $5, $6)
       on conflict do nothing`,
      [institutionId, module, activityCode, points, verificationRequired, approvalRequired]
    );
  }

  // Consolidated performance profile (§K.5) — weights are institution
  // configuration; "character"/"activities" components from the master
  // spec's example weighting are omitted because those modules (mentoring/
  // discipline, clubs/events) aren't built yet (see docs/SETUP.md), not
  // because the engine can't support them — adding a component later is a
  // performance_components insert, not a code change.
  const { rows: profileRows } = await db.query<{ id: string }>(
    `insert into performance_profiles (institution_id, name, is_default)
     values ($1, 'Consolidated Student Score', true)
     on conflict (institution_id, name) do update set is_default = true
     returning id`,
    [institutionId]
  );
  const profileId = profileRows[0].id;
  const components: Array<[string, number]> = [
    ["academic", 60], ["attendance", 15], ["skills", 15], ["achievements", 10],
  ];
  for (const [componentModule, weight] of components) {
    await db.query(
      `insert into performance_components (institution_id, performance_profile_id, component_module, weight_percent)
       values ($1, $2, $3, $4)
       on conflict (institution_id, performance_profile_id, component_module) do update set weight_percent = excluded.weight_percent`,
      [institutionId, profileId, componentModule, weight]
    );
  }

  // Library config + a small starter catalogue (§D.11/§M) — institution
  // CONFIGURATION and seed DATA, not platform code. module_configs already
  // exists as a generic key/value table (§I) — library settings are just
  // one more row in it.
  const { rows: libraryModuleRows } = await db.query<{ id: string }>("select id from modules where code = 'library'");
  if (libraryModuleRows.length > 0) {
    await db.query(
      `insert into module_configs (institution_id, module_id, config_key, config_value_jsonb)
       values ($1, $2, 'settings', $3::jsonb)
       on conflict (institution_id, module_id, config_key) do update set config_value_jsonb = excluded.config_value_jsonb`,
      [institutionId, libraryModuleRows[0].id, JSON.stringify({ loanPeriodDays: 14, finePerDay: 1, graceDays: 2, requiresReadingReview: true })]
    );
  }

  // getOrInsert() — authors/publishers/books have no unique constraint on
  // name (schema allows genuinely duplicate titles/author names across
  // real catalogue entries), so a plain re-run of this function against an
  // institution that already exists would otherwise silently create a
  // second "Badiuzzaman Said Nursi", a second sample book, etc. every
  // time. book_categories/shelves DO have a unique(institution_id, name)
  // constraint (§K schema), which is what previously made a second run
  // hard-fail instead of quietly duplicating. Selecting first, for all
  // five, makes this whole block idempotent either way — safe to call
  // seedDemoInstitution() again for an institution that's already seeded
  // (e.g. bootstrapping a second real admin email against the same
  // institution — see docs/SETUP.md's SEED_ADMIN_EMAIL note).
  async function getOrInsert(table: string, whereCol: string, whereVal: string, insertSql: string, insertParams: unknown[]): Promise<string> {
    const { rows: existing } = await db.query<{ id: string }>(
      `select id from ${table} where institution_id = $1 and ${whereCol} = $2`,
      [institutionId, whereVal]
    );
    if (existing.length > 0) return existing[0].id;
    const { rows: inserted } = await db.query<{ id: string }>(insertSql, insertParams);
    return inserted[0].id;
  }

  const authorId = await getOrInsert(
    "authors", "name", "Badiuzzaman Said Nursi",
    `insert into authors (institution_id, name) values ($1, 'Badiuzzaman Said Nursi') returning id`,
    [institutionId]
  );
  const publisherId = await getOrInsert(
    "publishers", "name", "Institute Library Press",
    `insert into publishers (institution_id, name) values ($1, 'Institute Library Press') returning id`,
    [institutionId]
  );
  const categoryId = await getOrInsert(
    "book_categories", "name", "Islamic Studies",
    `insert into book_categories (institution_id, name) values ($1, 'Islamic Studies') returning id`,
    [institutionId]
  );
  const shelfId = await getOrInsert(
    "shelves", "name", "A1",
    `insert into shelves (institution_id, name, location) values ($1, 'A1', 'Ground floor, east wing') returning id`,
    [institutionId]
  );
  const bookId = await getOrInsert(
    "books", "title", "Risale-i Nur (Selections)",
    `insert into books (institution_id, title, author_id, publisher_id, category_id, shelf_id, language, status)
     values ($1, 'Risale-i Nur (Selections)', $2, $3, $4, $5, 'en', 'active') returning id`,
    [institutionId, authorId, publisherId, categoryId, shelfId]
  );
  for (let i = 1; i <= 2; i++) {
    await db.query(
      `insert into book_copies (institution_id, book_id, copy_code) values ($1, $2, $3) on conflict do nothing`,
      [institutionId, bookId, `RIN-${i}`]
    );
  }

  // Reading scoring rule — same flat-value pattern as the Phase 6 skill
  // activities (§K.4), reused by the library's reading-review approval
  // (modules/library/service.ts's reviewReadingRecord()).
  await db.query(
    `insert into scoring_rules (institution_id, module, activity_code, condition_jsonb, points, verification_required, approval_required)
     values ($1, 'reading', 'book_reading_review', '{}'::jsonb, 2, true, true)
     on conflict do nothing`,
    [institutionId]
  );

  // Discipline categories + character attributes (§D.8) — institution
  // configuration, same pattern as attendance_statuses/skill_types.
  const disciplineCategories: Array<[string, boolean]> = [
    ["Late to class", false],
    ["Uniform/dress code violation", false],
    ["Disruptive behaviour", false],
    ["Helped a classmate", true],
    ["Exemplary conduct", true],
  ];
  for (const [name, isPositive] of disciplineCategories) {
    await db.query(
      `insert into discipline_categories (institution_id, name, is_positive) values ($1, $2, $3)
       on conflict (institution_id, name) do nothing`,
      [institutionId, name, isPositive]
    );
  }

  const characterAttributes = ["Responsibility", "Respect", "Punctuality", "Teamwork", "Honesty"];
  for (const name of characterAttributes) {
    await db.query(
      `insert into character_attributes (institution_id, name) values ($1, $2) on conflict (institution_id, name) do nothing`,
      [institutionId, name]
    );
  }

  return institutionId;
}

/**
 * Creates a demo user, links them as institution_admin for the given
 * institution, and returns their auth_user_id (used as the dev-login value —
 * see services/auth/dev-auth-provider.ts, and app/(auth)/login).
 *
 * `claimable` controls what goes into `auth_user_id`:
 *   - false (default) — a random UUID stand-in, so DevAuthProvider's
 *     no-password local login works immediately with zero real accounts.
 *     This is what `npm run dev`'s local PGlite quickstart uses.
 *   - true — leaves `auth_user_id` NULL, so this becomes a genuinely
 *     claimable row per `linkOrResolveAuthenticatedUser()`'s "outcome 2"
 *     (services/tenant/tenant-service.ts): the first real person to sign
 *     up via SupabaseAuthProvider with this SAME email gets linked to it
 *     automatically. Use this only when seeding a FRESH real Postgres
 *     database you intend to actually use with real Supabase Auth (see
 *     docs/SETUP.md) — set via `SEED_CLAIMABLE=true`. Only applies on
 *     first INSERT; re-running seed against a database where this email
 *     already exists never touches its `auth_user_id` (the `on conflict`
 *     clause below only ever updates `full_name`), so this can't
 *     accidentally un-claim an account someone has already signed into
 *     for real.
 */
// Two overloads so every existing caller (~20 test files, none of which
// pass a 6th argument) keeps its current `authUserId: string` typing
// unchanged — only a caller that explicitly opts in with `claimable: true`
// sees the `authUserId: null` possibility reflected in its own types. The
// implementation signature below is the only place `process.env
// .SEED_CLAIMABLE` is read as a fallback (for `main()`'s CLI entrypoint,
// which doesn't pass this argument explicitly either).
export async function seedDemoUser(
  db: DbClient, institutionId: string, email: string, fullName: string, roleCode?: string
): Promise<{ userId: string; authUserId: string }>;
export async function seedDemoUser(
  db: DbClient, institutionId: string, email: string, fullName: string, roleCode: string | undefined, claimable: true
): Promise<{ userId: string; authUserId: null }>;
export async function seedDemoUser(
  db: DbClient,
  institutionId: string,
  email: string,
  fullName: string,
  roleCode = "institution_admin",
  claimable: boolean = process.env.SEED_CLAIMABLE === "true"
): Promise<{ userId: string; authUserId: string | null }> {
  const authUserId = claimable ? null : crypto.randomUUID();

  const { rows } = await db.query<{ id: string }>(
    `insert into users (auth_user_id, email, full_name, preferred_locale)
     values ($1, $2, $3, 'en')
     on conflict (email) do update set full_name = excluded.full_name
     returning id`,
    [authUserId, email, fullName]
  );
  const userId = rows[0].id;

  await db.query(
    `insert into user_institution_memberships (user_id, institution_id, status, is_primary)
     values ($1, $2, 'active', true)
     on conflict (user_id, institution_id) do nothing`,
    [userId, institutionId]
  );

  const { rows: roleRows } = await db.query<{ id: string }>(
    `select id from roles where institution_id = $1 and code = $2`,
    [institutionId, roleCode]
  );
  if (roleRows.length > 0) {
    await db.query(
      `insert into user_roles (user_id, institution_id, role_id)
       values ($1, $2, $3) on conflict do nothing`,
      [userId, institutionId, roleRows[0].id]
    );
  }

  return { userId, authUserId };
}

/**
 * Grants the platform-level super_admin role (institution_id=null on the
 * ROLE itself, per seed 0001) to a user. user_roles.institution_id is
 * NOT NULL by schema (§D.2) even for a platform role, so an "anchor"
 * institution is required to satisfy that FK — resolveUserByAuthId()
 * (services/tenant/tenant-service.ts) correctly ignores which institution
 * was used as the anchor, since it filters on the ROLE's own
 * institution_id being null, not on user_roles.institution_id. Used by
 * this script's CLI entrypoint and by tests/integration/super-admin-flow.test.ts.
 */
// Same two-overload shape as seedDemoUser() above, and for the same reason.
export async function seedSuperAdminUser(
  db: DbClient, anchorInstitutionId: string, email: string, fullName: string
): Promise<{ userId: string; authUserId: string }>;
export async function seedSuperAdminUser(
  db: DbClient, anchorInstitutionId: string, email: string, fullName: string, claimable: true
): Promise<{ userId: string; authUserId: null }>;
export async function seedSuperAdminUser(
  db: DbClient,
  anchorInstitutionId: string,
  email: string,
  fullName: string,
  claimable: boolean = process.env.SEED_CLAIMABLE === "true"
): Promise<{ userId: string; authUserId: string | null }> {
  const authUserId = claimable ? null : crypto.randomUUID();

  const { rows } = await db.query<{ id: string }>(
    `insert into users (auth_user_id, email, full_name, preferred_locale)
     values ($1, $2, $3, 'en')
     on conflict (email) do update set full_name = excluded.full_name
     returning id`,
    [authUserId, email, fullName]
  );
  const userId = rows[0].id;

  // Deliberately NO user_institution_memberships row here — a "pure" Super
  // Admin (§B.4) has no institution of their own; anchorInstitutionId only
  // satisfies user_roles' NOT NULL FK (see doc comment above), it does not
  // make this user a member of that institution. Call seedDemoUser()
  // separately afterward if a given test also needs this same person to
  // hold an ordinary institution-scoped role somewhere.
  const { rows: roleRows } = await db.query<{ id: string }>(
    `select id from roles where institution_id is null and code = 'super_admin'`
  );
  if (roleRows.length === 0) throw new Error("seedSuperAdminUser: platform super_admin role not found — run applyPlatformSeeds() first.");

  await db.query(
    `insert into user_roles (user_id, institution_id, role_id) values ($1, $2, $3) on conflict do nothing`,
    [userId, anchorInstitutionId, roleRows[0].id]
  );

  return { userId, authUserId };
}

async function main() {
  const db = await getDbClient();
  const count = await applyPlatformSeeds(db);
  console.log(`Platform seed complete. ${count} file(s) applied.`);
  const claimable = process.env.SEED_CLAIMABLE === "true";
  // Overridable so a real deployment can bootstrap its actual admin's own
  // email in one pass, instead of being stuck with the demo placeholder
  // and having to rename the account afterward.
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@badrudhuja.example";
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL || "root@prompt-innovations.example";
  if (process.env.SEED_DEMO_INSTITUTION === "true") {
    const id = await seedDemoInstitution(db, "badrudhuja");
    console.log(`Demo institution seeded (institution_id=${id}).`);
    const { authUserId, userId } = await seedDemoUser(
      db,
      id,
      adminEmail,
      "Badrudhuja Admin",
      "institution_admin"
    );
    console.log(`Demo user seeded: userId=${userId} authUserId=${authUserId}`);
    console.log(
      claimable
        ? `Real Supabase Auth: visit /login and "Create account" with "${adminEmail}" to claim this account.`
        : `Dev login: use email "${adminEmail}" at /login`
    );

    if (process.env.SEED_SUPER_ADMIN === "true") {
      const superAdmin = await seedSuperAdminUser(db, id, superAdminEmail, "Platform Root");
      console.log(`Super Admin seeded: userId=${superAdmin.userId} authUserId=${superAdmin.authUserId}`);
      console.log(
        claimable
          ? `Real Supabase Auth: visit /login and "Create account" with "${superAdminEmail}" to claim this account, lands on /super-admin.`
          : `Dev login: use email "${superAdminEmail}" at /login, lands on /super-admin`
      );
    }
  }
  await db.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
