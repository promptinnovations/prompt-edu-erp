/**
 * PROMPT EDU ERP — §137 follow-up ("Madrasathul Muhammadiyya, Pappinippara ...
 * classes, students ... parent data ... their log in id (must be student
 * name, password- phone number of parent) ... should be able edit, delete,
 * search for institution admin"). Covers the new update/delete/search
 * surface on classes, sections, students, and parents, plus the
 * name+parent-phone student login (creation, name-collision handling,
 * pre-auth resolution, password reset, and tenant isolation).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import {
  createClass, createSection, getCurrentAcademicYear,
  updateClass, deleteClass, updateSection, deleteSection,
} from "../../modules/academic/service";
import {
  createStudent, enrollStudent, createParent, linkParentToStudent,
  updateStudent, deleteStudent, restoreStudent, listStudentsForAdmin,
  updateParent, unlinkParentFromStudent, deleteParentRecord, listParentsForStudent,
  transferStudentEnrollment, removeStudentFromClass, restoreEnrollment,
  assignRollNumbers, getCurrentEnrollment, listEnrollmentHistory,
} from "../../modules/students/service";
import {
  createStudentLoginAccount, resetStudentLoginPassword, resolveStudentLoginEmail,
} from "../../modules/portal/service";

let institutionA: string, institutionB: string;
let codeA: string;
let adminAuth: string, adminUserId: string;
let classId: string, sectionId: string, academicYearId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  codeA = "sa-flow-a";
  institutionA = await seedDemoInstitution(db, codeA);
  institutionB = await seedDemoInstitution(db, "sa-flow-b");

  const admin = await seedDemoUser(db, institutionA, "admin@sa-flow-a.example", "SA Flow Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "5", sortOrder: 5 });
  classId = cls.id;
  const sec = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = sec.id;
  const year = await getCurrentAcademicYear(institutionA, adminAuth); // seedDemoInstitution() already seeds one
  academicYearId = year!.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Classes/sections: edit, delete (§137 follow-up)", () => {
  it("updateClass() renames a class", async () => {
    const c = await createClass(institutionA, adminAuth, adminUserId, { name: "Temp Class", sortOrder: 99 });
    const updated = await updateClass(institutionA, adminAuth, adminUserId, c.id, { name: "Temp Class Renamed" });
    expect(updated?.name).toBe("Temp Class Renamed");
  });

  it("deleteClass() removes a class with no enrollments", async () => {
    const c = await createClass(institutionA, adminAuth, adminUserId, { name: "Deletable", sortOrder: 98 });
    await deleteClass(institutionA, adminAuth, adminUserId, c.id);
    // Deleting again is a silent no-op, not an error.
    await expect(deleteClass(institutionA, adminAuth, adminUserId, c.id)).resolves.toBeUndefined();
  });

  it("deleteClass() refuses a class with an actively enrolled student", async () => {
    const c = await createClass(institutionA, adminAuth, adminUserId, { name: "Guarded", sortOrder: 97 });
    const sec = await createSection(institutionA, adminAuth, adminUserId, { classId: c.id, name: "A" });
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "GUARD-1", fullName: "Guard Student" });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: s.id, academicYearId, classId: c.id, sectionId: sec.id });
    await expect(deleteClass(institutionA, adminAuth, adminUserId, c.id)).rejects.toThrow(/actively enrolled/);
  });

  it("updateSection()/deleteSection() work the same way at the section level", async () => {
    const sec = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "B" });
    const updated = await updateSection(institutionA, adminAuth, adminUserId, sec.id, { name: "B-Renamed" });
    expect(updated?.name).toBe("B-Renamed");
    await deleteSection(institutionA, adminAuth, adminUserId, sec.id);
  });
});

describe("Students: edit, soft-delete/restore, search (§137 follow-up)", () => {
  it("updateStudent() edits admission number, name, DOB, and gender", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "EDIT-1", fullName: "Original Name" });
    const updated = await updateStudent(institutionA, adminAuth, adminUserId, s.id, {
      fullName: "Edited Name", dateOfBirth: "2015-01-01", gender: "F",
    });
    expect(updated?.full_name).toBe("Edited Name");
    // PGlite's driver returns date columns as a Date object rather than the
    // "YYYY-MM-DD" string a real pg/Supabase connection returns — compare
    // the calendar date only, not the runtime type, so this test doesn't
    // depend on which driver happens to be under it.
    const dob = updated?.date_of_birth as unknown;
    expect(dob instanceof Date ? dob.toISOString().slice(0, 10) : String(dob).slice(0, 10)).toBe("2015-01-01");
    expect(updated?.gender).toBe("F");
    expect(updated?.admission_number).toBe("EDIT-1"); // untouched field survives coalesce()
  });

  it("deleteStudent() soft-deletes (status=withdrawn) and excludes from listStudentsForAdmin() by default", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "DEL-1", fullName: "Delete Me" });
    await deleteStudent(institutionA, adminAuth, adminUserId, s.id);

    const activeOnly = await listStudentsForAdmin(institutionA, adminAuth, { search: "Delete Me" });
    expect(activeOnly).toHaveLength(0);

    const withWithdrawn = await listStudentsForAdmin(institutionA, adminAuth, { search: "Delete Me", includeWithdrawn: true });
    expect(withWithdrawn).toHaveLength(1);
    expect(withWithdrawn[0].status).toBe("withdrawn");
  });

  it("restoreStudent() reverses a soft-delete", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RESTORE-1", fullName: "Restore Me" });
    await deleteStudent(institutionA, adminAuth, adminUserId, s.id);
    await restoreStudent(institutionA, adminAuth, adminUserId, s.id);
    const found = await listStudentsForAdmin(institutionA, adminAuth, { search: "Restore Me" });
    expect(found).toHaveLength(1);
    expect(found[0].status).toBe("active");
  });

  it("listStudentsForAdmin() searches by name, admission number, and class filter, and shows the enrolled class/section", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "SRCH-77", fullName: "Searchable Student" });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: s.id, academicYearId, classId, sectionId });

    const byName = await listStudentsForAdmin(institutionA, adminAuth, { search: "searchable" }); // case-insensitive
    expect(byName.map((r) => r.id)).toContain(s.id);

    const byAdmission = await listStudentsForAdmin(institutionA, adminAuth, { search: "SRCH-77" });
    expect(byAdmission.map((r) => r.id)).toContain(s.id);

    const byClass = await listStudentsForAdmin(institutionA, adminAuth, { classId });
    expect(byClass.map((r) => r.id)).toContain(s.id);
    const row = byClass.find((r) => r.id === s.id)!;
    expect(row.class_name).toBe("5");
    expect(row.section_name).toBe("A");

    const wrongClass = await createClass(institutionA, adminAuth, adminUserId, { name: "Not This One", sortOrder: 1 });
    const noMatch = await listStudentsForAdmin(institutionA, adminAuth, { classId: wrongClass.id, search: "Searchable" });
    expect(noMatch).toHaveLength(0);
  });
});

describe("Parents: edit, remove-from-student, full delete (§137 follow-up)", () => {
  it("updateParent() edits contact fields", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PAR-1", fullName: "Has A Parent" });
    const p = await createParent(institutionA, adminAuth, adminUserId, { fullName: "Parent Original", phone: "9000000001" });
    await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: s.id, parentId: p.id, relationship: "Father", isPrimaryContact: true });

    const updated = await updateParent(institutionA, adminAuth, adminUserId, p.id, { phone: "9000000099" });
    expect(updated?.phone).toBe("9000000099");
    expect(updated?.full_name).toBe("Parent Original");
  });

  it("unlinkParentFromStudent() removes the link but leaves the parent record (siblings unaffected)", async () => {
    const child1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "SIB-1", fullName: "Sibling One" });
    const child2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "SIB-2", fullName: "Sibling Two" });
    const p = await createParent(institutionA, adminAuth, adminUserId, { fullName: "Shared Parent", phone: "9000000002" });
    await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: child1.id, parentId: p.id, isPrimaryContact: true });
    await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: child2.id, parentId: p.id, isPrimaryContact: true });

    await unlinkParentFromStudent(institutionA, adminAuth, adminUserId, child1.id, p.id);

    expect(await listParentsForStudent(institutionA, adminAuth, child1.id)).toHaveLength(0);
    expect(await listParentsForStudent(institutionA, adminAuth, child2.id)).toHaveLength(1); // untouched
  });

  it("deleteParentRecord() hard-deletes the parent and cascades every link", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "PAR-DEL-1", fullName: "Parent Deletion Target" });
    const p = await createParent(institutionA, adminAuth, adminUserId, { fullName: "Doomed Parent", phone: "9000000003" });
    await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: s.id, parentId: p.id, isPrimaryContact: true });

    await deleteParentRecord(institutionA, adminAuth, adminUserId, p.id);
    expect(await listParentsForStudent(institutionA, adminAuth, s.id)).toHaveLength(0);
  });
});

describe("Student login: name + parent-phone (§137 follow-up)", () => {
  it("createStudentLoginAccount() sets a login_id (the student's name) and links user_id", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "LOGIN-1", fullName: "Ahmed Zayan A" });
    const result = await createStudentLoginAccount(institutionA, adminAuth, adminUserId, { studentId: s.id, parentPhone: "9539515808" });
    expect(result.loginId).toBe("Ahmed Zayan A");

    const rows = await listStudentsForAdmin(institutionA, adminAuth, { search: "LOGIN-1" });
    expect(rows[0].login_id).toBe("Ahmed Zayan A");
    expect(rows[0].user_id).toBe(result.userId);
  });

  it("a second student with the SAME name gets a suffixed login_id, not a collision", async () => {
    const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "DUPNAME-1", fullName: "Fathima" });
    const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "DUPNAME-2", fullName: "Fathima" });
    const r1 = await createStudentLoginAccount(institutionA, adminAuth, adminUserId, { studentId: s1.id, parentPhone: "9000000010" });
    const r2 = await createStudentLoginAccount(institutionA, adminAuth, adminUserId, { studentId: s2.id, parentPhone: "9000000011" });
    expect(r1.loginId).toBe("Fathima");
    expect(r2.loginId).toBe("Fathima 2");
  });

  it("provisioning a login for an already-linked student throws", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "LOGIN-DUP", fullName: "Already Linked" });
    await createStudentLoginAccount(institutionA, adminAuth, adminUserId, { studentId: s.id, parentPhone: "9000000020" });
    await expect(
      createStudentLoginAccount(institutionA, adminAuth, adminUserId, { studentId: s.id, parentPhone: "9000000021" })
    ).rejects.toThrow(/already has a portal login/);
  });

  it("resolveStudentLoginEmail() resolves the exact institution+login_id pair, case-insensitively, pre-auth", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RESOLVE-1", fullName: "Resolve Me" });
    await createStudentLoginAccount(institutionA, adminAuth, adminUserId, { studentId: s.id, parentPhone: "9000000030" });

    const resolved = await resolveStudentLoginEmail(codeA, "resolve me"); // case-insensitive
    expect(resolved).not.toBeNull();

    expect(await resolveStudentLoginEmail(codeA, "Nonexistent Student")).toBeNull();
    expect(await resolveStudentLoginEmail("sa-flow-b", "Resolve Me")).toBeNull(); // wrong institution
  });

  it("resetStudentLoginPassword() succeeds for a provisioned login, actually persists the new phone (§137 follow-up: admin-on-behalf-of-colleague update, see migration 0025), and throws for one that has none", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RESET-1", fullName: "Reset Me" });
    const created = await createStudentLoginAccount(institutionA, adminAuth, adminUserId, { studentId: s.id, parentPhone: "9000000040" });
    await expect(resetStudentLoginPassword(institutionA, adminAuth, adminUserId, s.id, "9000000041")).resolves.toBeUndefined();

    const db = await getDbClient();
    const { rows } = await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, (scoped) =>
      scoped.query<{ phone: string | null }>("select phone from users where id = $1", [created.userId])
    );
    expect(rows[0].phone).toBe("9000000041"); // the RESET value, not the original "9000000040"

    const noLogin = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RESET-2", fullName: "No Login Yet" });
    await expect(resetStudentLoginPassword(institutionA, adminAuth, adminUserId, noLogin.id, "9000000042")).rejects.toThrow(/doesn't have a portal login/);
  });
});

describe("Class move/remove/restore + roll numbers (§137 follow-up: MBS request)", () => {
  it("transferStudentEnrollment() closes the old enrollment (status=transferred) and opens a new active one", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "MOVE-1", fullName: "Move Me" });
    const otherClass = await createClass(institutionA, adminAuth, adminUserId, { name: "6", sortOrder: 6 });
    const otherSection = await createSection(institutionA, adminAuth, adminUserId, { classId: otherClass.id, name: "A" });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: s.id, academicYearId, classId, sectionId });

    const moved = await transferStudentEnrollment(institutionA, adminAuth, adminUserId, {
      studentId: s.id, newClassId: otherClass.id, newSectionId: otherSection.id,
    });
    expect(moved.class_id).toBe(otherClass.id);

    const current = await getCurrentEnrollment(institutionA, adminAuth, s.id);
    expect(current?.class_id).toBe(otherClass.id);

    const history = await listEnrollmentHistory(institutionA, adminAuth, s.id);
    expect(history).toHaveLength(2);
    expect(history.find((h) => h.class_id === classId)?.status).toBe("transferred");
    expect(history.find((h) => h.class_id === otherClass.id)?.status).toBe("active");
  });

  it("transferStudentEnrollment() throws for a student with no active enrollment", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "MOVE-2", fullName: "Never Enrolled" });
    await expect(
      transferStudentEnrollment(institutionA, adminAuth, adminUserId, { studentId: s.id, newClassId: classId, newSectionId: sectionId })
    ).rejects.toThrow(/no active class enrollment/);
  });

  it("removeStudentFromClass() unenrolls without withdrawing the student, and the record is restorable", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "REMOVE-1", fullName: "Remove Me" });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: s.id, academicYearId, classId, sectionId });

    await removeStudentFromClass(institutionA, adminAuth, adminUserId, s.id, "Test removal");
    expect(await getCurrentEnrollment(institutionA, adminAuth, s.id)).toBeNull();

    // Not active anywhere, but not hard-deleted — still listed as a student, class column blank.
    const rows = await listStudentsForAdmin(institutionA, adminAuth, { search: "Remove Me" });
    expect(rows).toHaveLength(1);
    expect(rows[0].class_name).toBeNull();
    expect(rows[0].status).toBe("active"); // still an active STUDENT, just not enrolled anywhere

    const history = await listEnrollmentHistory(institutionA, adminAuth, s.id);
    expect(history[0].status).toBe("removed");
    expect(history[0].exit_reason).toBe("Test removal");

    // Restore brings it back as active.
    await restoreEnrollment(institutionA, adminAuth, adminUserId, history[0].id);
    expect((await getCurrentEnrollment(institutionA, adminAuth, s.id))?.class_id).toBe(classId);
  });

  it("removeStudentFromClass() throws for a student with no active enrollment", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "REMOVE-2", fullName: "Nothing To Remove" });
    await expect(removeStudentFromClass(institutionA, adminAuth, adminUserId, s.id)).rejects.toThrow(/no active class enrollment/);
  });

  it("restoreEnrollment() refuses when the student already has a different active enrollment for that year", async () => {
    const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "RESTORE-CLASH", fullName: "Clash Student" });
    const otherClass = await createClass(institutionA, adminAuth, adminUserId, { name: "7", sortOrder: 7 });
    const otherSection = await createSection(institutionA, adminAuth, adminUserId, { classId: otherClass.id, name: "A" });
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: s.id, academicYearId, classId, sectionId });
    await removeStudentFromClass(institutionA, adminAuth, adminUserId, s.id);
    await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: s.id, academicYearId, classId: otherClass.id, sectionId: otherSection.id });

    const removed = (await listEnrollmentHistory(institutionA, adminAuth, s.id)).find((h) => h.status === "removed")!;
    await expect(restoreEnrollment(institutionA, adminAuth, adminUserId, removed.id)).rejects.toThrow(/already has an active class enrollment/);
  });

  it("assignRollNumbers() ranks males alphabetically first, then females alphabetically", async () => {
    const rollClass = await createClass(institutionA, adminAuth, adminUserId, { name: "Roll Test Class", sortOrder: 50 });
    const rollSection = await createSection(institutionA, adminAuth, adminUserId, { classId: rollClass.id, name: "A" });

    const rows: { name: string; gender: string }[] = [
      { name: "Zainab", gender: "F" }, { name: "Amina", gender: "F" },
      { name: "Zayd", gender: "M" }, { name: "Ahmad", gender: "M" },
    ];
    for (const r of rows) {
      const s = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: `ROLL-${r.name}`, fullName: r.name, gender: r.gender });
      await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: s.id, academicYearId, classId: rollClass.id, sectionId: rollSection.id });
    }

    const count = await assignRollNumbers(institutionA, adminAuth, adminUserId, rollClass.id, rollSection.id, academicYearId);
    expect(count).toBe(4);

    const listed = await listStudentsForAdmin(institutionA, adminAuth, { classId: rollClass.id });
    const byName = new Map(listed.map((s) => [s.full_name, s.roll_number]));
    expect(byName.get("Ahmad")).toBe(1);
    expect(byName.get("Zayd")).toBe(2);
    expect(byName.get("Amina")).toBe(3);
    expect(byName.get("Zainab")).toBe(4);
  });
});

describe("Tenant isolation on the new admin surface (§E)", () => {
  it("listStudentsForAdmin() never returns another institution's students", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@sa-flow-b.example", "SA Flow B Admin", "institution_admin");
    await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ISO-1", fullName: "Isolated Student" });
    const rowsInB = await listStudentsForAdmin(institutionB, adminB.authUserId, { search: "Isolated" });
    expect(rowsInB).toHaveLength(0);
  });
});
