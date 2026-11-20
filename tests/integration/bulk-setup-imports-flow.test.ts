/**
 * PROMPT EDU ERP — §ICS-staff bulk school setup: the "Staff" import without
 * e-mail and with a role, plus the new "Staff roles", "Subjects per class"
 * and "Teacher assignments" imports, and cellToText() (Excel dates and
 * hyperlinked e-mails read as what the person sees).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, listClassSubjects, getCurrentAcademicYear } from "../../modules/academic/service";
import { listStaff, listTeacherAssignments } from "../../modules/staff/service";
import { stageImport, confirmImport, cellToText } from "../../modules/bulk/service";

let inst: string;
let adminAuth: string, adminUserId: string;
let classId: string;

function csv(header: string[], rows: string[][]): Buffer {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return Buffer.from([header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n"), "utf-8");
}
async function run(entityType: string, header: string[], rows: string[][]) {
  const staged = await stageImport(inst, adminAuth, adminUserId, { entityType, filename: `${entityType}.csv`, fileBuffer: csv(header, rows), format: "csv" });
  return staged;
}

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  inst = await seedDemoInstitution(db, "setup-school");
  const admin = await seedDemoUser(db, inst, "admin@setup.example", "Setup Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  classId = (await createClass(inst, adminAuth, adminUserId, { name: "5", sortOrder: 5 })).id;
  await createSection(inst, adminAuth, adminUserId, { classId, name: "A" });
  await createSection(inst, adminAuth, adminUserId, { classId, name: "B" });
  await createSubject(inst, adminAuth, adminUserId, { name: "Mathematics" });
  await createSubject(inst, adminAuth, adminUserId, { name: "QURAN & HIFZ" });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("cellToText", () => {
  it("reads dates, hyperlinks, rich text and formulas as shown", () => {
    expect(cellToText(new Date(Date.UTC(2017, 1, 22)))).toBe("2017-02-22");
    expect(cellToText({ text: "a@b.com", hyperlink: "mailto:a@b.com" })).toBe("a@b.com");
    expect(cellToText({ richText: [{ text: "Fat" }, { text: "hima" }] })).toBe("Fathima");
    expect(cellToText({ formula: "A1", result: 42 })).toBe("42");
    expect(cellToText(9847012345)).toBe("9847012345");
    expect(cellToText(null)).toBe("");
  });
});

describe("staff import", () => {
  it("accepts staff without e-mail, tidies e-mails and status, grants the role", async () => {
    const staged = await run("staff",
      ["Full name", "Email", "Staff code", "Designation", "Department", "Employment status", "Role"],
      [
        ["Muallim One", "", "M-1", "Mu-allim", "MS", "Active", ""],
        ["Teacher Two", "Teacher Two 12@Gmail. com", "T-2", "Teaching Staff", "Academics", "active", "teacher"],
        ["Head Master", "hm@setup.example", "HM-1", "HM", "HM", "active", "management"],
        ["Sneaky", "admin2@setup.example", "X-1", "", "", "active", "institution_admin"],
      ]);
    expect(staged.rows.map((r) => r.status)).toEqual(["valid", "valid", "valid", "invalid"]);
    expect(staged.rows[1].data).toMatchObject({ email: "teachertwo12@gmail.com", roleCode: "teacher" });
    const done = await confirmImport(inst, adminAuth, adminUserId, staged.batchId);
    expect(done.importedRows).toBe(3);
    const staff = await listStaff(inst, adminAuth);
    expect(staff.find((s) => s.staff_code === "M-1")?.email).toBeNull();
    const db = await getDbClient();
    const roles = await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) => {
      const { rows } = await scoped.query<{ staff_code: string; code: string }>(
        `select st.staff_code, r.code from staff st join user_roles ur on ur.user_id = st.user_id join roles r on r.id = ur.role_id
          where st.institution_id = $1 order by st.staff_code`, [inst]);
      return rows;
    });
    expect(roles).toEqual([
      { staff_code: "HM-1", code: "management" }, { staff_code: "M-1", code: "teacher" }, { staff_code: "T-2", code: "teacher" },
    ]);
  });

  it("staff roles: grants a role once, refuses unknown staff and admin", async () => {
    const staged = await run("staff_roles", ["Staff code", "Role"], [
      ["HM-1", "section head"], ["HM-1", "management"], ["NOPE", "teacher"], ["T-2", "institution_admin"],
    ]);
    expect(staged.rows.map((r) => r.status)).toEqual(["valid", "invalid", "invalid", "invalid"]);
    expect((await confirmImport(inst, adminAuth, adminUserId, staged.batchId)).importedRows).toBe(1);
  });
});

describe("staff logins", () => {
  it("creates a login per staff member, refuses no-email and existing logins", async () => {
    const staged = await run("staff_logins", ["Staff code", "Password"], [
      ["T-2", "9847012345"], ["M-1", "9847000000"], ["NOPE", "123456"], ["HM-1", "12"],
    ]);
    expect(staged.rows.map((r) => r.status)).toEqual(["valid", "invalid", "invalid", "invalid"]);
    expect(staged.rows[1].errors[0]).toMatch(/no e-mail/);
    expect((await confirmImport(inst, adminAuth, adminUserId, staged.batchId)).importedRows).toBe(1);
    const staff = await listStaff(inst, adminAuth);
    expect(staff.find((s) => s.staff_code === "T-2")?.has_login).toBe(true);
    const again = await run("staff_logins", ["Staff code", "Password"], [["T-2", "9847012345"]]);
    expect(again.rows[0].errors[0]).toMatch(/already has a login/);
  });
});

describe("subjects per class + teacher assignments", () => {
  it("adds subjects to a class, once", async () => {
    const staged = await run("class_subjects", ["Class", "Subject"], [
      ["5", "Mathematics"], ["5", "QURAN & HIFZ"], ["5", "Mathematics"], ["5", "Chemistry"], ["9", "Mathematics"],
    ]);
    expect(staged.rows.map((r) => r.status)).toEqual(["valid", "valid", "duplicate", "invalid", "invalid"]);
    await confirmImport(inst, adminAuth, adminUserId, staged.batchId);
    expect((await listClassSubjects(inst, adminAuth, classId)).map((l) => l.subject_name).sort()).toEqual(["Mathematics", "QURAN & HIFZ"]);
  });

  it("assigns class and subject teachers with every check", async () => {
    const staged = await run("teacher_assignments", ["Staff code", "Class", "Division", "Subject", "Role"], [
      ["T-2", "5", "A", "", "Class teacher"],
      ["T-2", "5", "A", "Mathematics", "Subject teacher"],
      ["T-2", "5", "B", "Mathematics", "subject teacher"],
      ["M-1", "5", "A", "QURAN & HIFZ", "subject teacher"],
      ["M-1", "5", "", "", "subject teacher"],          // whole class, no subject
      ["T-2", "5", "C", "Mathematics", "subject teacher"], // no division C
      ["T-2", "5", "A", "Hindi", "subject teacher"],       // no such subject
      ["T-2", "5", "A", "Mathematics", "class teacher"],   // class teacher with a subject
      ["ZZ", "5", "A", "", "class teacher"],               // unknown staff
      ["T-2", "5", "A", "", "teacher"],                    // unclear role
    ]);
    expect(staged.rows.map((r) => r.status)).toEqual([
      "valid", "valid", "valid", "valid", "valid", "invalid", "invalid", "invalid", "invalid", "invalid",
    ]);
    expect((await confirmImport(inst, adminAuth, adminUserId, staged.batchId)).importedRows).toBe(5);
    const year = await getCurrentAcademicYear(inst, adminAuth);
    const list = await listTeacherAssignments(inst, adminAuth, { academicYearId: year!.id });
    expect(list).toHaveLength(5);
    expect(list.filter((a) => a.role_type === "class_teacher")).toHaveLength(1);

    // Re-running the same file adds nothing.
    const again = await run("teacher_assignments", ["Staff code", "Class", "Division", "Subject", "Role"], [["T-2", "5", "A", "", "Class teacher"]]);
    expect(again.rows[0].errors[0]).toMatch(/already exists/);
  });
});
