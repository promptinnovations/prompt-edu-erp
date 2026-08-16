/**
 * PROMPT EDU ERP — one-off bulk import for Madrasathul Muhammadiyya,
 * Pappinippara (§137 follow-up): 11 classes (1–10, 12, section A) and 101
 * students, each with one parent/guardian and a name+phone student login.
 *
 * Goes entirely through the same modules/*.ts service functions the admin
 * UI itself calls (createClass/createSection/createStudent/createParent/
 * linkParentToStudent/enrollStudent/createStudentLoginAccount) — no direct
 * SQL — so this exercises (and is bound by) the exact same validation, RLS,
 * and audit trail a human admin doing this by hand through the UI would
 * get. Idempotent: re-running skips any class/section/student that already
 * exists (matched by name / admission number) rather than erroring or
 * duplicating.
 *
 * Usage: tsx database/scripts/import-mmp-students.ts <path-to-json>
 * Expects DATABASE_URL (+ Supabase admin creds for real student logins) to
 * already be in the environment — see this repo's .env.local.
 */
import { readFileSync } from "node:fs";
import { getDbClient } from "../../services/db/client";
import { createClass, createSection, listClasses, listSections, getCurrentAcademicYear, createAcademicYear } from "../../modules/academic/service";
import { createStudent, createParent, linkParentToStudent, enrollStudent, listStudents } from "../../modules/students/service";
import { createStudentLoginAccount } from "../../modules/portal/service";

interface ImportRow {
  className: string;
  section: string;
  admissionNumber: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  parentName: string;
  parentPhone: string;
}

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) throw new Error("Usage: tsx import-mmp-students.ts <path-to-json>");
  const rows: ImportRow[] = JSON.parse(readFileSync(jsonPath, "utf-8"));

  const db = await getDbClient();
  const { rows: instRows } = await db.query<{ id: string; code: string; name: string }>(
    "select id, code, name from institutions where lower(code) = 'mmp'"
  );
  if (!instRows[0]) throw new Error('No institution found with code "mmp".');
  const institutionId = instRows[0].id;
  console.log(`Institution: ${instRows[0].name} (${instRows[0].code}, ${institutionId})`);

  const { rows: adminRows } = await db.query<{ user_id: string; auth_user_id: string }>(
    `select u.id as user_id, u.auth_user_id
       from user_institution_memberships m
       join users u on u.id = m.user_id
       join user_roles ur on ur.user_id = u.id and ur.institution_id = m.institution_id
       join roles r on r.id = ur.role_id
      where m.institution_id = $1 and r.code = 'institution_admin' and u.auth_user_id is not null
      limit 1`,
    [institutionId]
  );
  if (!adminRows[0]) throw new Error("No institution_admin with a linked auth account found for mmp — cannot act as anyone.");
  const authUserId = adminRows[0].auth_user_id;
  const userId = adminRows[0].user_id;
  console.log(`Acting as institution admin user ${userId}`);

  // 1. Academic year — MMP has none yet; create one and mark it current.
  let year = await getCurrentAcademicYear(institutionId, authUserId);
  if (!year) {
    year = await createAcademicYear(institutionId, authUserId, userId, {
      name: "2026-2027", startDate: "2026-06-01", endDate: "2027-03-31", isCurrent: true,
    });
    console.log(`Created academic year ${year.name}`);
  } else {
    console.log(`Using existing current academic year ${year.name}`);
  }
  const academicYearId = year.id;

  // 2. Classes + sections — reuse by name, create what's missing.
  const classNames = [...new Set(rows.map((r) => r.className))].sort((a, b) => Number(a) - Number(b));
  let existingClasses = await listClasses(institutionId, authUserId);
  const classByName = new Map(existingClasses.map((c) => [c.name, c]));
  for (const name of classNames) {
    if (!classByName.has(name)) {
      const created = await createClass(institutionId, authUserId, userId, { name, sortOrder: Number(name) || 0 });
      classByName.set(name, created);
      console.log(`Created class "${name}"`);
    }
  }
  existingClasses = [...classByName.values()];

  const existingSections = await listSections(institutionId, authUserId);
  const sectionKey = (classId: string, name: string) => `${classId}::${name}`;
  const sectionByKey = new Map(existingSections.map((s) => [sectionKey(s.class_id, s.name), s]));
  const sectionIdFor = new Map<string, string>(); // "className::section" -> sectionId
  for (const row of rows) {
    const cls = classByName.get(row.className)!;
    const key = `${row.className}::${row.section}`;
    if (sectionIdFor.has(key)) continue;
    let sec = sectionByKey.get(sectionKey(cls.id, row.section));
    if (!sec) {
      sec = await createSection(institutionId, authUserId, userId, { classId: cls.id, name: row.section });
      sectionByKey.set(sectionKey(cls.id, row.section), sec);
      console.log(`Created section "${row.className} — ${row.section}"`);
    }
    sectionIdFor.set(key, sec.id);
  }

  // 3. Students + parent + enrollment + login — skip any admission number
  // that already exists (idempotent re-run).
  const existingStudents = await listStudents(institutionId, authUserId);
  const existingAdmissionNumbers = new Set(existingStudents.map((s) => s.admission_number));

  let created = 0, skipped = 0, loginsCreated = 0, loginErrors = 0;
  for (const row of rows) {
    if (existingAdmissionNumbers.has(row.admissionNumber)) {
      skipped++;
      continue;
    }
    const student = await createStudent(institutionId, authUserId, userId, {
      admissionNumber: row.admissionNumber,
      fullName: row.fullName,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender,
    });

    const cls = classByName.get(row.className)!;
    const sectionId = sectionIdFor.get(`${row.className}::${row.section}`)!;
    await enrollStudent(institutionId, authUserId, userId, {
      studentId: student.id, academicYearId, classId: cls.id, sectionId,
    });

    const parent = await createParent(institutionId, authUserId, userId, {
      fullName: row.parentName, phone: row.parentPhone,
    });
    await linkParentToStudent(institutionId, authUserId, userId, {
      studentId: student.id, parentId: parent.id, relationship: "Father", isPrimaryContact: true,
    });

    try {
      const login = await createStudentLoginAccount(institutionId, authUserId, userId, {
        studentId: student.id, parentPhone: row.parentPhone,
      });
      loginsCreated++;
      if (loginsCreated % 20 === 0) console.log(`  ... ${loginsCreated} logins created so far`);
      void login;
    } catch (err) {
      loginErrors++;
      console.error(`  Login failed for ${row.fullName} (${row.admissionNumber}): ${err instanceof Error ? err.message : err}`);
    }

    created++;
  }

  console.log(`\nDone. Students created: ${created}, skipped (already existed): ${skipped}, logins created: ${loginsCreated}, login errors: ${loginErrors}.`);
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
