/**
 * PROMPT EDU ERP — Teacher timetable + substitution acknowledgement
 * (migration 0074): a covering teacher signs a substitution, the sign shows
 * to the authority, only the covering teacher can sign, re-assigning clears
 * the sign, and timetable.view_all is held by the right roles only.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { createClass, createSection, createSubject } from "../../modules/academic/service";
import { createStaffMember } from "../../modules/staff/service";
import {
  upsertTimetablePeriod, listTimetable, confirmSubstitutions, listSubstitutions,
  acknowledgeSubstitution, getMyStaffId, listTeacherClasses,
} from "../../modules/substitution/service";

const DAY = "2099-01-05"; // a Monday
let inst: string;
let adminAuth: string, adminUserId: string;
let principalAuth: string, principalUserId: string;
let headAuth: string, headUserId: string;
let teacherAuth: string, teacherUserId: string;
let absentStaffId: string, coverStaffId: string, coverUserId: string, otherStaffId: string, otherUserId: string;
let classA: string, secA: string, classB: string, secB: string, mathId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  inst = await seedDemoInstitution(db, "tt-ack-school");

  const admin = await seedDemoUser(db, inst, "admin@tt.example", "TT Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const principal = await seedDemoUser(db, inst, "principal@tt.example", "Principal", "management");
  principalAuth = principal.authUserId; principalUserId = principal.userId;
  const head = await seedDemoUser(db, inst, "head@tt.example", "Section Head", "section_head");
  headAuth = head.authUserId; headUserId = head.userId;
  const teacher = await seedDemoUser(db, inst, "teacher@tt.example", "A Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const c1 = await createClass(inst, adminAuth, adminUserId, { name: "Grade 7", sortOrder: 1 });
  classA = c1.id; secA = (await createSection(inst, adminAuth, adminUserId, { classId: classA, name: "A" })).id;
  const c2 = await createClass(inst, adminAuth, adminUserId, { name: "Grade 8", sortOrder: 2 });
  classB = c2.id; secB = (await createSection(inst, adminAuth, adminUserId, { classId: classB, name: "A" })).id;
  mathId = (await createSubject(inst, adminAuth, adminUserId, { name: "Mathematics" })).id;

  const mk = (n: number, name: string) => createStaffMember(inst, adminAuth, adminUserId, {
    email: `s${n}@tt.example`, fullName: name, staffCode: `TT-00${n}`, designation: "Teacher", department: null, employmentStatus: "active",
  });
  const absent = await mk(1, "Absent Teacher");
  const cover = await mk(2, "Covering Teacher");
  const other = await mk(3, "Other Teacher");
  absentStaffId = absent.id; coverStaffId = cover.id; coverUserId = cover.user_id;
  otherStaffId = other.id; otherUserId = other.user_id;

  // Absent teacher: Grade 7A period 1 Monday. Covering teacher: Grade 8A period 2 Monday (free in period 1).
  await upsertTimetablePeriod(inst, adminAuth, adminUserId, { classId: classA, sectionId: secA, dayOfWeek: 1, periodNo: 1, subjectId: mathId, teacherStaffId: absentStaffId });
  await upsertTimetablePeriod(inst, adminAuth, adminUserId, { classId: classB, sectionId: secB, dayOfWeek: 1, periodNo: 2, subjectId: mathId, teacherStaffId: coverStaffId });
  await confirmSubstitutions(inst, adminAuth, adminUserId, {
    date: DAY, absentStaffId,
    rows: [{ classId: classA, sectionId: secA, periodNo: 1, subjectId: mathId, coveringStaffId: coverStaffId }],
  });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("substitution acknowledgement", () => {
  it("a new substitution starts unacknowledged", async () => {
    const [s] = await listSubstitutions(inst, adminAuth, { from: DAY, to: DAY });
    expect(s.coveringStaffId).toBe(coverStaffId);
    expect(s.acknowledgedAt).toBeNull();
  });

  it("only the covering teacher can acknowledge it", async () => {
    const [s] = await listSubstitutions(inst, adminAuth, { from: DAY, to: DAY });
    await expect(acknowledgeSubstitution(inst, adminAuth, otherUserId, s.id)).rejects.toThrow(/Only the teacher assigned/);
    await expect(acknowledgeSubstitution(inst, adminAuth, adminUserId, s.id)).rejects.toThrow(/Only the teacher assigned/);
    const [still] = await listSubstitutions(inst, adminAuth, { from: DAY, to: DAY });
    expect(still.acknowledgedAt).toBeNull();
  });

  it("the covering teacher's tap is stamped and visible to the authority; a second tap keeps the first time", async () => {
    const [s] = await listSubstitutions(inst, adminAuth, { from: DAY, to: DAY });
    await acknowledgeSubstitution(inst, adminAuth, coverUserId, s.id);
    const [after] = await listSubstitutions(inst, principalAuth, { from: DAY, to: DAY });
    expect(after.acknowledgedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    await acknowledgeSubstitution(inst, adminAuth, coverUserId, s.id);
    const [again] = await listSubstitutions(inst, principalAuth, { from: DAY, to: DAY });
    expect(again.acknowledgedAt).toBe(after.acknowledgedAt);
  });

  it("re-confirming with the SAME covering teacher keeps the sign; changing the teacher clears it", async () => {
    const row = { classId: classA, sectionId: secA, periodNo: 1, subjectId: mathId };
    await confirmSubstitutions(inst, adminAuth, adminUserId, { date: DAY, absentStaffId, rows: [{ ...row, coveringStaffId: coverStaffId }] });
    expect((await listSubstitutions(inst, adminAuth, { from: DAY, to: DAY }))[0].acknowledgedAt).not.toBeNull();

    await confirmSubstitutions(inst, adminAuth, adminUserId, { date: DAY, absentStaffId, rows: [{ ...row, coveringStaffId: otherStaffId }] });
    const [moved] = await listSubstitutions(inst, adminAuth, { from: DAY, to: DAY });
    expect(moved.coveringStaffId).toBe(otherStaffId);
    expect(moved.acknowledgedAt).toBeNull();
  });
});

describe("a teacher sees only their own timetable", () => {
  it("listTimetable({teacherStaffId}) returns just that teacher's periods", async () => {
    const mine = await listTimetable(inst, adminAuth, { teacherStaffId: coverStaffId });
    expect(mine).toHaveLength(1);
    expect(mine[0].className).toBe("Grade 8");
  });

  it("getMyStaffId() finds the signed-in user's staff record, or null", async () => {
    expect(await getMyStaffId(inst, adminAuth, coverUserId)).toBe(coverStaffId);
    expect(await getMyStaffId(inst, adminAuth, teacherUserId)).toBeNull();
  });

  it("listTeacherClasses() = classes they are timetabled in, plus their assigned classes", async () => {
    const mine = await listTeacherClasses(inst, adminAuth, coverUserId, coverStaffId);
    expect(mine.map((c) => c.label)).toEqual(["Grade 8 A"]);
  });
});

describe("timetable.view_all", () => {
  it("is held by institution admin, management and section head — not by a teacher", async () => {
    for (const [auth, uid] of [[adminAuth, adminUserId], [principalAuth, principalUserId], [headAuth, headUserId]] as const) {
      const perms = await getPermissionsForUser(auth, uid, inst);
      expect(() => requirePermission(perms, "timetable.view_all")).not.toThrow();
    }
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, inst);
    expect(() => requirePermission(teacherPerms, "timetable.view_all")).toThrow(/Forbidden/);
  });
});
