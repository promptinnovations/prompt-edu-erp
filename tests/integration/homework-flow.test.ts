/**
 * PROMPT EDU ERP — Homework + syllabus progress (migration 0072): a
 * teacher sets homework only for what they teach, management for any
 * class; students see their class's (and division's) homework and tick it
 * done; the teacher's tick list; syllabus progress from portion plans;
 * tenant isolation.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, can } from "../../services/permissions/permission-service";
import { createClass, createSection, createSubject, assignSubjectToClass, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { createStaffMember, createTeacherAssignment, createPortionPlan, recordPortionCompletion } from "../../modules/staff/service";
import {
  listHomeworkTargets, createHomework, listHomeworkForStaff, getHomeworkDetail, setHomeworkDone, saveHomeworkTicks,
  listStudentHomework, getSyllabusProgress, deleteHomework,
} from "../../modules/homework/service";

let A: string, B: string;
let adminAuth: string, adminId: string, teacherAuth: string, teacherId: string;
let cls: string, otherCls: string, secA: string, secB: string, maths: string, english: string;
let kidA: string, kidB: string;
const today = new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  A = await seedDemoInstitution(db, "hw-a");
  B = await seedDemoInstitution(db, "hw-b");
  const admin = await seedDemoUser(db, A, "admin@hw-a.example", "HW Admin", "institution_admin");
  adminAuth = admin.authUserId; adminId = admin.userId;
  const t = await seedDemoUser(db, A, "teacher@hw-a.example", "HW Teacher", "teacher");
  teacherAuth = t.authUserId; teacherId = t.userId;

  const year = (await getCurrentAcademicYear(A, adminAuth))!;
  cls = (await createClass(A, adminAuth, adminId, { name: "Grade 8", sortOrder: 1 })).id;
  otherCls = (await createClass(A, adminAuth, adminId, { name: "Grade 9", sortOrder: 2 })).id;
  secA = (await createSection(A, adminAuth, adminId, { classId: cls, name: "A" })).id;
  secB = (await createSection(A, adminAuth, adminId, { classId: cls, name: "B" })).id;
  maths = (await createSubject(A, adminAuth, adminId, { name: "Maths" })).id;
  english = (await createSubject(A, adminAuth, adminId, { name: "English" })).id;
  for (const sub of [maths, english]) await assignSubjectToClass(A, adminAuth, adminId, { classId: cls, subjectId: sub, isCore: true });
  await createTeacherAssignment(A, adminAuth, adminId, { userId: teacherId, classId: cls, sectionId: secA, subjectId: maths, academicYearId: year.id, roleType: "subject_teacher" });
  kidA = (await createStudent(A, adminAuth, adminId, { admissionNumber: "HW-1", fullName: "Asha" })).id;
  kidB = (await createStudent(A, adminAuth, adminId, { admissionNumber: "HW-2", fullName: "Bilal" })).id;
  await enrollStudent(A, adminAuth, adminId, { studentId: kidA, classId: cls, sectionId: secA, academicYearId: year.id });
  await enrollStudent(A, adminAuth, adminId, { studentId: kidB, classId: cls, sectionId: secB, academicYearId: year.id });

  const staff = await createStaffMember(A, adminAuth, adminId, { email: "planner@hw-a.example", fullName: "HW Planner", staffCode: "T1", employmentStatus: "active" });
  const p1 = await createPortionPlan(A, adminAuth, adminId, { academicYearId: year.id, classId: cls, subjectId: maths, teacherId: staff.id, chapterName: "Fractions", plannedDate: "2026-06-10" });
  await createPortionPlan(A, adminAuth, adminId, { academicYearId: year.id, classId: cls, subjectId: maths, teacherId: staff.id, chapterName: "Decimals", plannedDate: "2026-07-10" });
  await recordPortionCompletion(A, adminAuth, adminId, { portionPlanId: p1.id, completedDate: "2026-06-20", completionPercent: 100 });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("homework", () => {
  it("grants homework.set to teachers, homework.view to students and parents", async () => {
    const tp = await getPermissionsForUser(teacherAuth, teacherId, A);
    expect(can(tp, "homework.set")).toBe(true);
    const sp = await seedDemoUser(await getDbClient(), A, "kid@hw-a.example", "Kid", "student");
    const kp = await getPermissionsForUser(sp.authUserId, sp.userId, A);
    expect(can(kp, "homework.view")).toBe(true);
    expect(can(kp, "homework.set")).toBe(false);
  });

  it("a teacher can set homework only for what they teach", async () => {
    const targets = await listHomeworkTargets(A, teacherAuth, teacherId, false);
    expect(targets).toEqual([{ class_id: cls, class_name: "Grade 8", section_id: secA, section_name: "A", subject_id: maths, subject_name: "Maths" }]);
    await expect(createHomework(A, teacherAuth, teacherId, { classId: cls, sectionId: secA, subjectId: english, title: "Essay", dueDate: inDays(2) }, { broad: false })).rejects.toThrow(/only for the classes/);
    await expect(createHomework(A, teacherAuth, teacherId, { classId: cls, sectionId: null, subjectId: maths, title: "All divisions", dueDate: inDays(2) }, { broad: false })).rejects.toThrow(/only for the classes/);
    await expect(createHomework(A, teacherAuth, teacherId, { classId: otherCls, subjectId: maths, title: "Other class", dueDate: inDays(2) }, { broad: false })).rejects.toThrow(/only for the classes/);
    const hw = await createHomework(A, teacherAuth, teacherId, { classId: cls, sectionId: secA, subjectId: maths, title: "Exercise 4.2", dueDate: inDays(2) }, { broad: false });
    expect(hw.id).toBeTruthy();
    expect((await listHomeworkTargets(A, adminAuth, adminId, true)).length).toBe(2);
  });

  it("students see their division's homework (and all-division homework) and tick it done", async () => {
    await createHomework(A, adminAuth, adminId, { classId: cls, subjectId: english, title: "Read chapter 3", dueDate: today }, { broad: true });
    const a = await listStudentHomework(A, adminAuth, kidA);
    const b = await listStudentHomework(A, adminAuth, kidB);
    expect(a.map((h) => h.title).sort()).toEqual(["Exercise 4.2", "Read chapter 3"]);
    expect(b.map((h) => h.title)).toEqual(["Read chapter 3"]);

    const ex = a.find((h) => h.title === "Exercise 4.2")!;
    await expect(setHomeworkDone(A, adminAuth, adminId, ex.id, [kidB], true)).rejects.toThrow(/isn't for/);
    await setHomeworkDone(A, adminAuth, adminId, ex.id, [kidA], true);
    expect((await listStudentHomework(A, adminAuth, kidA)).find((h) => h.id === ex.id)!.done).toBe(true);

    const staffList = await listHomeworkForStaff(A, teacherAuth, teacherId, { broad: false });
    expect(staffList.map((h) => [h.title, h.done_count, h.student_count])).toEqual([["Exercise 4.2", 1, 1]]);
    expect((await listHomeworkForStaff(A, adminAuth, adminId, { broad: true })).length).toBe(2);

    const all = a.find((h) => h.title === "Read chapter 3")!;
    await saveHomeworkTicks(A, adminAuth, adminId, all.id, [kidB]);
    const d = await getHomeworkDetail(A, adminAuth, all.id);
    expect(d!.students.map((x) => [x.full_name, x.done])).toEqual([["Asha", false], ["Bilal", true]]);
    await expect(deleteHomework(A, teacherAuth, teacherId, all.id, { broad: false })).rejects.toThrow(/only homework you set/);
  });

  it("shows syllabus progress from the portion plans", async () => {
    const s = await getSyllabusProgress(A, adminAuth, kidA);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ subject_name: "Maths", average: 50, done: 1 });
    expect(s[0].chapters.map((c) => [c.chapter_name, c.percent])).toEqual([["Fractions", 100], ["Decimals", null]]);
  });

  it("keeps institutions apart", async () => {
    const other = await seedDemoUser(await getDbClient(), B, "admin@hw-b.example", "B", "institution_admin");
    expect(await listHomeworkForStaff(B, other.authUserId, other.userId, { broad: true })).toHaveLength(0);
    expect(await listStudentHomework(B, other.authUserId, kidA)).toHaveLength(0);
  });
});
