/**
 * PROMPT EDU ERP — Dashboard follow-up ("instead of [plain bars] use the
 * type of graph in [a labelled multi-colour line chart] ... line should
 * show different sections differently ... children absent for more than 3
 * consecutive days also should be shown").
 *
 * Exercises the two new modules/attendance/service.ts functions that back
 * the redesigned Dashboard widget for Section Head/Principal/Management:
 *   - getInstitutionAttendanceTrendByStage() — per-STAGE daily trend,
 *     scope-filterable the same way as getInstitutionAttendanceTrend(),
 *     classes with no stage set grouped under "Unspecified" rather than
 *     dropped.
 *   - getConsecutiveAbsentees() — students whose MOST RECENT run of marked
 *     attendance is entirely absent and at least `minDays` long (an
 *     ONGOING streak, not a past dip they've since recovered from).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, enrollStudent } from "../../modules/students/service";
import {
  listAttendanceStatuses, markAttendance,
  getInstitutionAttendanceTrendByStage, getConsecutiveAbsentees,
} from "../../modules/attendance/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let kgClassId: string, hsClassId: string, unspecifiedClassId: string;
let kgSectionId: string, hsSectionId: string, unspecifiedSectionId: string;
let presentStatusId: string, absentStatusId: string;

let kgStudent: string;
let hsStreakStudent: string; // present day1, absent day2-5 (ongoing 4-day streak)
let hsRecoveredStudent: string; // absent day1-3, present day4-5 (past streak, recovered)
let hsShortAbsenceStudent: string; // absent day4-5 only (2-day streak, below minDays)
let unspecifiedStudent: string;

// 5 real consecutive days ending "today" — current_date-relative filters in
// both queries have no UPPER bound, only a lower one, so these just need to
// be recent enough to fall inside the 15-day trend / 45-day streak windows.
const today = new Date();
function dayOffset(n: number) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const DAY1 = dayOffset(4);
const DAY2 = dayOffset(3);
const DAY3 = dayOffset(2);
const DAY4 = dayOffset(1);
const DAY5 = dayOffset(0);

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "atd-trend-school-a");
  institutionB = await seedDemoInstitution(db, "atd-trend-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@atd-trend-a.example", "ATD Trend Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const kgClass = await createClass(institutionA, adminAuth, adminUserId, { name: "LKG", sortOrder: 1, stage: "KG" });
  kgClassId = kgClass.id;
  const hsClass = await createClass(institutionA, adminAuth, adminUserId, { name: "Class 9", sortOrder: 2, stage: "HS" });
  hsClassId = hsClass.id;
  const unspecifiedClass = await createClass(institutionA, adminAuth, adminUserId, { name: "Class 10", sortOrder: 3 });
  unspecifiedClassId = unspecifiedClass.id;

  const kgSection = await createSection(institutionA, adminAuth, adminUserId, { classId: kgClassId, name: "A" });
  kgSectionId = kgSection.id;
  const hsSection = await createSection(institutionA, adminAuth, adminUserId, { classId: hsClassId, name: "A" });
  hsSectionId = hsSection.id;
  const unspecifiedSection = await createSection(institutionA, adminAuth, adminUserId, { classId: unspecifiedClassId, name: "A" });
  unspecifiedSectionId = unspecifiedSection.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ATD-KG-1", fullName: "KG Student" });
  kgStudent = s1.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: kgStudent, academicYearId: year.id, classId: kgClassId, sectionId: kgSectionId });

  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ATD-HS-1", fullName: "HS Streak Student" });
  hsStreakStudent = s2.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: hsStreakStudent, academicYearId: year.id, classId: hsClassId, sectionId: hsSectionId });

  const s3 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ATD-HS-2", fullName: "HS Recovered Student" });
  hsRecoveredStudent = s3.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: hsRecoveredStudent, academicYearId: year.id, classId: hsClassId, sectionId: hsSectionId });

  const s4 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ATD-HS-3", fullName: "HS Short Absence Student" });
  hsShortAbsenceStudent = s4.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: hsShortAbsenceStudent, academicYearId: year.id, classId: hsClassId, sectionId: hsSectionId });

  const s5 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ATD-U-1", fullName: "Unspecified Stage Student" });
  unspecifiedStudent = s5.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: unspecifiedStudent, academicYearId: year.id, classId: unspecifiedClassId, sectionId: unspecifiedSectionId });

  const statuses = await listAttendanceStatuses(institutionA, adminAuth);
  presentStatusId = statuses.find((s) => s.code === "present")!.id;
  absentStatusId = statuses.find((s) => s.code === "absent")!.id;

  // KG: present every day.
  for (const d of [DAY1, DAY2, DAY3, DAY4, DAY5]) {
    await markAttendance(institutionA, adminAuth, adminUserId, {
      classId: kgClassId, sectionId: kgSectionId, date: d,
      entries: [{ studentId: kgStudent, statusId: presentStatusId, isLate: false }],
    });
  }

  // HS: streak student present day1, absent day2-5 (ongoing 4-day streak).
  // Recovered student absent day1-3, present day4-5 (past streak, recovered).
  // Short-absence student present day1-3, absent day4-5 (2-day streak, < minDays).
  const hsEntries: Record<string, { streak: string; recovered: string; short: string }> = {
    [DAY1]: { streak: "present", recovered: "absent", short: "present" },
    [DAY2]: { streak: "absent", recovered: "absent", short: "present" },
    [DAY3]: { streak: "absent", recovered: "absent", short: "present" },
    [DAY4]: { streak: "absent", recovered: "present", short: "absent" },
    [DAY5]: { streak: "absent", recovered: "present", short: "absent" },
  };
  for (const d of [DAY1, DAY2, DAY3, DAY4, DAY5]) {
    const e = hsEntries[d];
    await markAttendance(institutionA, adminAuth, adminUserId, {
      classId: hsClassId, sectionId: hsSectionId, date: d,
      entries: [
        { studentId: hsStreakStudent, statusId: e.streak === "present" ? presentStatusId : absentStatusId, isLate: false },
        { studentId: hsRecoveredStudent, statusId: e.recovered === "present" ? presentStatusId : absentStatusId, isLate: false },
        { studentId: hsShortAbsenceStudent, statusId: e.short === "present" ? presentStatusId : absentStatusId, isLate: false },
      ],
    });
  }

  // Unspecified-stage class: present on the last day only.
  await markAttendance(institutionA, adminAuth, adminUserId, {
    classId: unspecifiedClassId, sectionId: unspecifiedSectionId, date: DAY5,
    entries: [{ studentId: unspecifiedStudent, statusId: presentStatusId, isLate: false }],
  });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("getInstitutionAttendanceTrendByStage()", () => {
  it("breaks the trend out per stage instead of collapsing into one line", async () => {
    const points = await getInstitutionAttendanceTrendByStage(institutionA, adminAuth, 15);
    const stages = new Set(points.map((p) => p.stage));
    expect(stages.has("KG")).toBe(true);
    expect(stages.has("HS")).toBe(true);
  });

  it("KG stage is 100% present on every marked day", async () => {
    const points = await getInstitutionAttendanceTrendByStage(institutionA, adminAuth, 15);
    const kgDay5 = points.find((p) => p.stage === "KG" && p.date === DAY5);
    expect(kgDay5).toBeTruthy();
    expect(kgDay5!.presentPercent).toBe(100);
    expect(kgDay5!.totalMarked).toBe(1);
  });

  it("HS stage blends all three HS students correctly on the last day (1 present out of 3 => 33.33%)", async () => {
    const points = await getInstitutionAttendanceTrendByStage(institutionA, adminAuth, 15);
    const hsDay5 = points.find((p) => p.stage === "HS" && p.date === DAY5);
    expect(hsDay5).toBeTruthy();
    expect(hsDay5!.totalMarked).toBe(3);
    expect(hsDay5!.presentPercent).toBe(33.33);
  });

  it("a class with no stage set is grouped under 'Unspecified', not dropped", async () => {
    const points = await getInstitutionAttendanceTrendByStage(institutionA, adminAuth, 15);
    const unspecifiedDay5 = points.find((p) => p.stage === "Unspecified" && p.date === DAY5);
    expect(unspecifiedDay5).toBeTruthy();
    expect(unspecifiedDay5!.presentPercent).toBe(100);
  });

  it("scope={stages:['KG']} filters out every other stage's points", async () => {
    const points = await getInstitutionAttendanceTrendByStage(institutionA, adminAuth, 15, { stages: ["KG"] });
    expect(points.every((p) => p.stage === "KG")).toBe(true);
    expect(points.length).toBeGreaterThan(0);
  });

  it("tenant isolation: Institution B has no attendance data at all", async () => {
    const points = await getInstitutionAttendanceTrendByStage(institutionB, adminAuth, 15);
    expect(points).toEqual([]);
  });
});

describe("getConsecutiveAbsentees()", () => {
  it("flags the ongoing 4-day streak student, with the right streak length and date range", async () => {
    const rows = await getConsecutiveAbsentees(institutionA, adminAuth);
    const row = rows.find((r) => r.studentId === hsStreakStudent);
    expect(row).toBeTruthy();
    expect(row!.streakLength).toBe(4);
    expect(row!.streakStart).toBe(DAY2);
    expect(row!.streakEnd).toBe(DAY5);
  });

  it("does NOT flag the recovered student — their most recent record is present, not an ongoing streak", async () => {
    const rows = await getConsecutiveAbsentees(institutionA, adminAuth);
    expect(rows.some((r) => r.studentId === hsRecoveredStudent)).toBe(false);
  });

  it("does NOT flag the short-absence student — 2 days is below the default minDays=3", async () => {
    const rows = await getConsecutiveAbsentees(institutionA, adminAuth);
    expect(rows.some((r) => r.studentId === hsShortAbsenceStudent)).toBe(false);
  });

  it("does NOT flag the KG student, who was never absent", async () => {
    const rows = await getConsecutiveAbsentees(institutionA, adminAuth);
    expect(rows.some((r) => r.studentId === kgStudent)).toBe(false);
  });

  it("a stricter minDays excludes even the 4-day streak student", async () => {
    const rows = await getConsecutiveAbsentees(institutionA, adminAuth, undefined, 5);
    expect(rows.some((r) => r.studentId === hsStreakStudent)).toBe(false);
  });

  it("scope={stages:['KG']} excludes the HS streak student entirely", async () => {
    const rows = await getConsecutiveAbsentees(institutionA, adminAuth, { stages: ["KG"] });
    expect(rows.some((r) => r.studentId === hsStreakStudent)).toBe(false);
  });

  it("tenant isolation: Institution B has no consecutive absentees", async () => {
    const rows = await getConsecutiveAbsentees(institutionB, adminAuth);
    expect(rows).toEqual([]);
  });
});
