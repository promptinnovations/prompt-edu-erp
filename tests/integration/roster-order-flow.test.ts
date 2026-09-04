/**
 * PROMPT EDU ERP — Users & Roles / roster-order follow-up. User's own
 * words: "Staff and Students list should be separated, student list always
 * must follow class & roll number order... section (KG, LP, UP, HS, HSS,
 * GRADUATION, POST GRADUATION) GRADE (1,2,3,4,5 ETC.) class (A,B,C,D ETC.)
 * order MUST BE FOLLOWED EVERYWHERE" + "ROLL NUMBER ORDER: FIRST MALE
 * (ALPHABETIC), FOLLOWED BY GIRL ALPHABETIC ORDER".
 *
 * Covers: the shared services/academic/roster-order.ts comparator (unit
 * level), listClasses()'s canonical section->GRADE order, listStudents()/
 * listStudentsForAdmin()'s canonical roster order across divisions, and
 * the new Users & Roles split (listStaffUsers() excludes student/parent
 * logins; listStudentUsersWithParent() returns students in roster order
 * with each one's own parent login attached).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import {
  stageRank, gradeSortKey, genderRank, compareClasses, sortRoster, sortClasses,
} from "../../services/academic/roster-order";
import { createClass, createSection, getCurrentAcademicYear, listClasses } from "../../modules/academic/service";
import { createStudent, enrollStudent, listStudents, listStudentsForAdmin } from "../../modules/students/service";
import { createStudentLoginAccount, provisionParentPortalAccount } from "../../modules/portal/service";
import { createParent, linkParentToStudent } from "../../modules/students/service";
import { listStaffUsers, listStudentUsersWithParent } from "../../services/users/user-management-service";

describe("roster-order.ts — pure comparator", () => {
  it("stageRank resolves the fixed KG..POST GRADUATION bucket order, case-insensitively; unknown stages are -1", () => {
    expect(stageRank("KG")).toBe(0);
    expect(stageRank("lp")).toBe(1);
    expect(stageRank("Up")).toBe(2);
    expect(stageRank("HS")).toBe(3);
    expect(stageRank("hss")).toBe(4);
    expect(stageRank("GRADUATION")).toBe(5);
    expect(stageRank("Post Graduation")).toBe(6);
    expect(stageRank("Made Up Stage")).toBe(-1);
  });

  it("gradeSortKey extracts the leading number; names with no number sort after every numbered grade", () => {
    expect(gradeSortKey("10")[0]).toBe(10);
    expect(gradeSortKey("2")[0]).toBe(2);
    expect(gradeSortKey("Grade 5")[0]).toBe(5);
    expect(gradeSortKey("LKG")[0]).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("genderRank: male=0, female=1, everything else=2, tolerant of casing/spelling", () => {
    expect(genderRank("MALE")).toBe(0);
    expect(genderRank("m")).toBe(0);
    expect(genderRank("Female")).toBe(1);
    expect(genderRank("f")).toBe(1);
    expect(genderRank(null)).toBe(2);
    expect(genderRank("other")).toBe(2);
  });

  it("compareClasses / sortClasses: known stages in fixed order, then custom stages alphabetically, then no-stage last; GRADE numeric within a stage", () => {
    const classes = [
      { stage: "HS", class_name: "9" },
      { stage: "LP", class_name: "2" },
      { stage: "LP", class_name: "10" },
      { stage: "KG", class_name: "LKG" },
      { stage: "KG", class_name: "UKG" },
      { stage: "POST GRADUATION", class_name: "1" },
      { stage: "GRADUATION", class_name: "2" },
      { stage: null, class_name: "Orphan" },
      { stage: "Custom", class_name: "1" },
    ];
    const sorted = sortClasses(classes).map((c) => `${c.stage ?? "none"}/${c.class_name}`);
    expect(sorted).toEqual([
      "KG/LKG", "KG/UKG", "LP/2", "LP/10", "HS/9", "GRADUATION/2", "POST GRADUATION/1", "Custom/1", "none/Orphan",
    ]);
  });

  it("compareStudentRoster / sortRoster: division, then roll number, then male-alphabetical-then-female-alphabetical for anyone without one yet", () => {
    const students = [
      { stage: "LP", class_name: "1", section_name: "B", roll_number: null, gender: "female", full_name: "Zoya" },
      { stage: "LP", class_name: "1", section_name: "A", roll_number: 2, gender: "male", full_name: "Ali" },
      { stage: "LP", class_name: "1", section_name: "A", roll_number: null, gender: "male", full_name: "Bilal" },
      { stage: "LP", class_name: "1", section_name: "A", roll_number: null, gender: "female", full_name: "Amina" },
      { stage: "LP", class_name: "1", section_name: "A", roll_number: 1, gender: "male", full_name: "Zaid" },
    ];
    const sorted = sortRoster(students).map((s) => `${s.section_name}#${s.roll_number ?? "-"} ${s.full_name}`);
    expect(sorted).toEqual(["A#1 Zaid", "A#2 Ali", "A#- Bilal", "A#- Amina", "B#- Zoya"]);
  });

  it("compareClasses is a pure function (does not mutate its inputs)", () => {
    const a = { stage: "LP", class_name: "1" };
    const b = { stage: "UP", class_name: "1" };
    expect(compareClasses(a, b)).toBeLessThan(0);
    expect(a).toEqual({ stage: "LP", class_name: "1" });
  });
});

let institutionId: string;
let adminAuth: string, adminUserId: string;
let academicYearId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionId = await seedDemoInstitution(db, "roster-order-flow");
  const admin = await seedDemoUser(db, institutionId, "admin@roster-order-flow.example", "Roster Order Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const year = await getCurrentAcademicYear(institutionId, adminAuth);
  academicYearId = year!.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("listClasses() — canonical section -> GRADE order", () => {
  it("orders classes by stage bucket then numeric grade, regardless of insertion order or sort_order", async () => {
    // Deliberately inserted out of canonical order, with sort_order values
    // that would sort them WRONG if listClasses() still used sort_order.
    await createClass(institutionId, adminAuth, adminUserId, { name: "9", sortOrder: 1, stage: "HS" });
    await createClass(institutionId, adminAuth, adminUserId, { name: "UKG", sortOrder: 2, stage: "KG" });
    await createClass(institutionId, adminAuth, adminUserId, { name: "2", sortOrder: 3, stage: "LP" });
    await createClass(institutionId, adminAuth, adminUserId, { name: "LKG", sortOrder: 4, stage: "KG" });

    const classes = await listClasses(institutionId, adminAuth);
    const names = classes.map((c) => c.name);
    const lkgIdx = names.indexOf("LKG");
    const ukgIdx = names.indexOf("UKG");
    const grade2Idx = names.indexOf("2");
    const grade9Idx = names.indexOf("9");
    // KG (LKG/UKG) before LP (2) before HS (9), despite sort_order saying
    // the opposite (9 has the lowest sort_order of the four).
    expect(lkgIdx).toBeLessThan(grade2Idx);
    expect(ukgIdx).toBeLessThan(grade2Idx);
    expect(grade2Idx).toBeLessThan(grade9Idx);
  });
});

describe("listStudents() / listStudentsForAdmin() — canonical roster order across divisions", () => {
  it("orders students by class (section->GRADE->division) then roll number, then male-then-female-alphabetical for the rest", async () => {
    const cls = await createClass(institutionId, adminAuth, adminUserId, { name: "Roster Test Grade", sortOrder: 50, stage: "UP" });
    const secA = await createSection(institutionId, adminAuth, adminUserId, { classId: cls.id, name: "A" });
    const secB = await createSection(institutionId, adminAuth, adminUserId, { classId: cls.id, name: "B" });

    const zoya = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "RT-Z", fullName: "Zoya Roster", gender: "female" });
    await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: zoya.id, academicYearId, classId: cls.id, sectionId: secB.id });

    const ali = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "RT-ALI", fullName: "Ali Roster", gender: "male" });
    await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: ali.id, academicYearId, classId: cls.id, sectionId: secA.id });

    const bilal = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "RT-BIL", fullName: "Bilal Roster", gender: "male" });
    await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: bilal.id, academicYearId, classId: cls.id, sectionId: secA.id });

    const amina = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "RT-AM", fullName: "Amina Roster", gender: "female" });
    await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: amina.id, academicYearId, classId: cls.id, sectionId: secA.id });

    const rows = await listStudentsForAdmin(institutionId, adminAuth, { classId: cls.id });
    const names = rows.map((r) => r.full_name);
    // Division A (Ali, Bilal, Amina -- no roll numbers, so male-alpha then
    // female-alpha) entirely before division B (Zoya).
    expect(names.indexOf("Ali Roster")).toBeLessThan(names.indexOf("Bilal Roster"));
    expect(names.indexOf("Bilal Roster")).toBeLessThan(names.indexOf("Amina Roster"));
    expect(names.indexOf("Amina Roster")).toBeLessThan(names.indexOf("Zoya Roster"));

    // listStudents() (the plain two-arg institution-wide list every
    // discipline/achievements/skills/library/scoring dropdown calls) must
    // follow the exact same order for these four.
    const allRows = await listStudents(institutionId, adminAuth);
    const allNames = allRows.filter((r) => ["Ali Roster", "Bilal Roster", "Amina Roster", "Zoya Roster"].includes(r.full_name)).map((r) => r.full_name);
    expect(allNames).toEqual(["Ali Roster", "Bilal Roster", "Amina Roster", "Zoya Roster"]);
  });
});

describe("Users & Roles split — listStaffUsers() / listStudentUsersWithParent()", () => {
  it("listStaffUsers() excludes every student/parent-role login", async () => {
    const staff = await listStaffUsers(institutionId, adminAuth);
    const codes = new Set(staff.flatMap((u) => u.roleCodes));
    expect(codes.has("student")).toBe(false);
    expect(codes.has("parent")).toBe(false);
    // The admin created in beforeAll IS staff and must still show up.
    expect(staff.some((u) => u.userId === adminUserId)).toBe(true);
  });

  it("listStudentUsersWithParent() returns student logins in roster order, each with its own parent login attached", async () => {
    const cls = await createClass(institutionId, adminAuth, adminUserId, { name: "Login Test Grade", sortOrder: 60, stage: "HS" });
    const sec = await createSection(institutionId, adminAuth, adminUserId, { classId: cls.id, name: "A" });

    const s1 = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "LT-1", fullName: "Login Zed", gender: "male" });
    await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: s1.id, academicYearId, classId: cls.id, sectionId: sec.id });
    const s2 = await createStudent(institutionId, adminAuth, adminUserId, { admissionNumber: "LT-2", fullName: "Login Amir", gender: "male" });
    await enrollStudent(institutionId, adminAuth, adminUserId, { studentId: s2.id, academicYearId, classId: cls.id, sectionId: sec.id });

    const login1 = await createStudentLoginAccount(institutionId, adminAuth, adminUserId, { studentId: s1.id, parentPhone: "9000000001" });
    const login2 = await createStudentLoginAccount(institutionId, adminAuth, adminUserId, { studentId: s2.id, parentPhone: "9000000002" });

    const parent = await createParent(institutionId, adminAuth, adminUserId, { fullName: "Login Zed's Parent", phone: "9000000001" });
    await linkParentToStudent(institutionId, adminAuth, adminUserId, { studentId: s1.id, parentId: parent.id, isPrimaryContact: true });
    await provisionParentPortalAccount(institutionId, adminAuth, adminUserId, { parentId: parent.id, email: "login-zed-parent@roster-order-flow.example", fullName: "Login Zed's Parent" });

    const students = await listStudentUsersWithParent(institutionId, adminAuth);
    const mine = students.filter((s) => s.userId === login1.userId || s.userId === login2.userId);
    expect(mine).toHaveLength(2);

    // No roll numbers assigned -- male-alphabetical order: Amir before Zed.
    const idxAmir = students.findIndex((s) => s.userId === login2.userId);
    const idxZed = students.findIndex((s) => s.userId === login1.userId);
    expect(idxAmir).toBeLessThan(idxZed);

    const zedRow = students.find((s) => s.userId === login1.userId)!;
    expect(zedRow.className).toBe("Login Test Grade");
    expect(zedRow.sectionName).toBe("A");
    expect(zedRow.parent).not.toBeNull();
    expect(zedRow.parent!.fullName).toBe("Login Zed's Parent");
    // provisionParentPortalAccount() doesn't set a password itself (unlike
    // createStudentLoginAccount()) -- confirms listStudentUsersWithParent()
    // surfaces whatever the parent's real users.phone value is, not a
    // hardcoded guess.
    expect(zedRow.parent!.currentPassword).toBeNull();

    const amirRow = students.find((s) => s.userId === login2.userId)!;
    expect(amirRow.parent).toBeNull(); // no parent linked for this one
  });
});
