/**
 * TEMPORARY, ONE-TIME migration endpoint — §137 follow-up bulk data load
 * for Madrasathul Muhammadiyya, Pappinippara. Not linked from any UI, gated
 * by a long random bearer token hardcoded below (not an env var, since this
 * whole route is meant to exist for minutes, not as standing
 * infrastructure), and hardcoded to institution code "mmp" only — it can't
 * be redirected at any other institution's data. Delete this file (and
 * database/scripts/data/mmp-students.json) once the import has run
 * successfully once; see database/scripts/import-mmp-students.ts for the
 * reusable, non-network-gated equivalent for future institutions.
 *
 * Runs the EXACT SAME service-layer functions
 * (modules/academic/service.ts, modules/students/service.ts,
 * modules/portal/service.ts) the admin UI itself calls — no raw SQL, same
 * RLS/validation/audit trail a human admin doing this by hand would get.
 * Idempotent: safe to call more than once, existing admission numbers are
 * skipped rather than duplicated.
 */
import { NextResponse } from "next/server";
import { getDbClient } from "../../../../services/db/client";
import {
  createClass, createSection, listClasses, listSections,
  getCurrentAcademicYear, createAcademicYear,
} from "../../../../modules/academic/service";
import {
  createStudent, createParent, linkParentToStudent, enrollStudent, listStudents,
} from "../../../../modules/students/service";
import { createStudentLoginAccount } from "../../../../modules/portal/service";
import mmpStudents from "../../../../database/scripts/data/mmp-students.json";

export const runtime = "nodejs";

const IMPORT_TOKEN = "8d2865620f7d30cb60ee30db1d587da2ba9b0d53f5a7901ad85f2daa3b156df1";

interface ImportRow {
  className: string; section: string; admissionNumber: string; fullName: string;
  dateOfBirth: string; gender: string; parentName: string; parentPhone: string;
}

async function runImport(request: Request) {
  const auth = request.headers.get("authorization");
  const tokenParam = new URL(request.url).searchParams.get("token");
  if (auth !== `Bearer ${IMPORT_TOKEN}` && tokenParam !== IMPORT_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = mmpStudents as ImportRow[];
  const db = await getDbClient();
  const log: string[] = [];

  try {
    const { rows: instRows } = await db.query<{ id: string; code: string; name: string }>(
      "select id, code, name from institutions where lower(code) = 'mmp'"
    );
    if (!instRows[0]) throw new Error('No institution found with code "mmp".');
    const institutionId = instRows[0].id;
    log.push(`Institution: ${instRows[0].name} (${institutionId})`);

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
    if (!adminRows[0]) throw new Error("No institution_admin with a linked auth account found for mmp.");
    const authUserId = adminRows[0].auth_user_id;
    const userId = adminRows[0].user_id;
    log.push(`Acting as institution admin user ${userId}`);

    let year = await getCurrentAcademicYear(institutionId, authUserId);
    if (!year) {
      year = await createAcademicYear(institutionId, authUserId, userId, {
        name: "2026-2027", startDate: "2026-06-01", endDate: "2027-03-31", isCurrent: true,
      });
      log.push(`Created academic year ${year.name}`);
    }
    const academicYearId = year.id;

    const classNames = [...new Set(rows.map((r) => r.className))].sort((a, b) => Number(a) - Number(b));
    let existingClasses = await listClasses(institutionId, authUserId);
    const classByName = new Map(existingClasses.map((c) => [c.name, c]));
    for (const name of classNames) {
      if (!classByName.has(name)) {
        const created = await createClass(institutionId, authUserId, userId, { name, sortOrder: Number(name) || 0 });
        classByName.set(name, created);
        log.push(`Created class "${name}"`);
      }
    }
    existingClasses = [...classByName.values()];

    const existingSections = await listSections(institutionId, authUserId);
    const sectionKey = (classId: string, name: string) => `${classId}::${name}`;
    const sectionByKey = new Map(existingSections.map((s) => [sectionKey(s.class_id, s.name), s]));
    const sectionIdFor = new Map<string, string>();
    for (const row of rows) {
      const cls = classByName.get(row.className)!;
      const key = `${row.className}::${row.section}`;
      if (sectionIdFor.has(key)) continue;
      let sec = sectionByKey.get(sectionKey(cls.id, row.section));
      if (!sec) {
        sec = await createSection(institutionId, authUserId, userId, { classId: cls.id, name: row.section });
        sectionByKey.set(sectionKey(cls.id, row.section), sec);
        log.push(`Created section "${row.className} — ${row.section}"`);
      }
      sectionIdFor.set(key, sec.id);
    }

    const existingStudents = await listStudents(institutionId, authUserId);
    const existingAdmissionNumbers = new Set(existingStudents.map((s) => s.admission_number));

    let created = 0, skipped = 0, loginsCreated = 0;
    const loginErrors: string[] = [];
    for (const row of rows) {
      if (existingAdmissionNumbers.has(row.admissionNumber)) { skipped++; continue; }

      const student = await createStudent(institutionId, authUserId, userId, {
        admissionNumber: row.admissionNumber, fullName: row.fullName,
        dateOfBirth: row.dateOfBirth, gender: row.gender,
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
        await createStudentLoginAccount(institutionId, authUserId, userId, {
          studentId: student.id, parentPhone: row.parentPhone,
        });
        loginsCreated++;
      } catch (err) {
        loginErrors.push(`${row.fullName} (${row.admissionNumber}): ${err instanceof Error ? err.message : String(err)}`);
      }
      created++;
    }

    log.push(`Done. Students created: ${created}, skipped: ${skipped}, logins created: ${loginsCreated}, login errors: ${loginErrors.length}.`);
    return NextResponse.json({ ok: true, log, loginErrors });
  } catch (err) {
    return NextResponse.json({ ok: false, log, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return runImport(request);
}

// GET too (query-string token) — some HTTP-fetch tools can't send a custom
// method/header, and this whole route is deleted right after the one real
// run either way (see this file's own header comment).
export async function GET(request: Request) {
  return runImport(request);
}
