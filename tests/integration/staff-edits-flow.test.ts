/**
 * PROMPT EDU ERP — staff admin edits: correcting a staff member's e-mail
 * (also their login) and changing / removing a teacher assignment.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import {
  createStaffMember, updateStaffMember, createStaffLoginAccount, listStaff,
  createTeacherAssignment, listTeacherAssignments, changeTeacherAssignmentTeacher, deleteTeacherAssignment,
} from "../../modules/staff/service";

let inst: string;
let adminAuth: string, adminUserId: string;
let staffA: string, staffAUser: string, staffBUser: string;
let assignmentId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  inst = await seedDemoInstitution(db, "staff-edits");
  const admin = await seedDemoUser(db, inst, "admin@edits.example", "Edits Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const a = await createStaffMember(inst, adminAuth, adminUserId, { email: "abdul@gmai.com", fullName: "Abdul", staffCode: "34", roleCode: "teacher", employmentStatus: "active" });
  const b = await createStaffMember(inst, adminAuth, adminUserId, { email: "zain@gmail.com", fullName: "Zain", staffCode: "182", roleCode: "teacher", employmentStatus: "active" });
  staffA = a.id; staffAUser = a.user_id; staffBUser = b.user_id;
  await createStaffLoginAccount(inst, adminAuth, adminUserId, { staffId: staffA, password: "9847012345" });
  const year = await getCurrentAcademicYear(inst, adminAuth);
  const classId = (await createClass(inst, adminAuth, adminUserId, { name: "7", sortOrder: 7 })).id;
  const sectionId = (await createSection(inst, adminAuth, adminUserId, { classId, name: "A" })).id;
  const subjectId = (await createSubject(inst, adminAuth, adminUserId, { name: "Mathematics" })).id;
  assignmentId = (await createTeacherAssignment(inst, adminAuth, adminUserId, {
    userId: staffAUser, classId, sectionId, subjectId, academicYearId: year!.id, roleType: "subject_teacher",
  })).id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("staff e-mail correction", () => {
  it("changes the e-mail (and login) of a staff member with a login", async () => {
    await updateStaffMember(inst, adminAuth, adminUserId, staffA, { email: " Abdul@Gmail.com " });
    const s = (await listStaff(inst, adminAuth)).find((x) => x.id === staffA)!;
    expect(s.email).toBe("abdul@gmail.com");
    expect(s.has_login).toBe(true);
  });

  it("refuses an e-mail another account already uses", async () => {
    await expect(updateStaffMember(inst, adminAuth, adminUserId, staffA, { email: "zain@gmail.com" })).rejects.toThrow(/already used/);
    const s = (await listStaff(inst, adminAuth)).find((x) => x.id === staffA)!;
    expect(s.email).toBe("abdul@gmail.com");
  });
});

describe("teacher assignment change / remove", () => {
  it("moves an assignment to another teacher", async () => {
    await changeTeacherAssignmentTeacher(inst, adminAuth, adminUserId, assignmentId, staffBUser);
    const list = await listTeacherAssignments(inst, adminAuth);
    expect(list.find((a) => a.id === assignmentId)?.user_id).toBe(staffBUser);
  });

  it("removes an assignment", async () => {
    await deleteTeacherAssignment(inst, adminAuth, adminUserId, assignmentId);
    expect((await listTeacherAssignments(inst, adminAuth)).some((a) => a.id === assignmentId)).toBe(false);
    await expect(deleteTeacherAssignment(inst, adminAuth, adminUserId, assignmentId)).rejects.toThrow(/not found/);
  });
});
