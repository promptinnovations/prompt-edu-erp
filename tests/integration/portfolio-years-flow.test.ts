/**
 * §Portfolio-years — the years a student has a record in, and filtering
 * the Learner Record / Portfolio to one academic year.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createAcademicYear, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { createLearnerEntry } from "../../modules/learner-record/service";
import { listStudentYears, getYearRecordIds } from "../../modules/portfolio/year-service";
import { loadLearnerRecord } from "../../app/components/portal/learner-record-data";

let A: string, auth: string, uid: string, student: string, lastYear: string, thisYear: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  A = await seedDemoInstitution(db, "py-a");
  const admin = await seedDemoUser(db, A, "admin@py-a.example", "Admin", "institution_admin");
  auth = admin.authUserId; uid = admin.userId;
  const cur = (await getCurrentAcademicYear(A, auth))!;
  thisYear = cur.id;
  // The test database may hand dates back as Date objects or as strings.
  const raw = cur.start_date as unknown;
  const start = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
  const prevStart = `${Number(start.slice(0, 4)) - 1}${start.slice(4)}`;
  const dayBefore = new Date(Date.parse(`${start}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  lastYear = (await createAcademicYear(A, auth, uid, { name: "Last year", startDate: prevStart, endDate: dayBefore, isCurrent: false })).id;
  const c5 = await createClass(A, auth, uid, { name: "Grade 5", sortOrder: 1 });
  const c6 = await createClass(A, auth, uid, { name: "Grade 6", sortOrder: 2 });
  const s5 = await createSection(A, auth, uid, { classId: c5.id, name: "A" });
  const s6 = await createSection(A, auth, uid, { classId: c6.id, name: "B" });
  student = (await createStudent(A, auth, uid, { admissionNumber: "PY-1", fullName: "Yasmin" })).id;
  await enrollStudent(A, auth, uid, { studentId: student, classId: c5.id, sectionId: s5.id, academicYearId: lastYear });
  await enrollStudent(A, auth, uid, { studentId: student, classId: c6.id, sectionId: s6.id, academicYearId: thisYear });
  await createLearnerEntry(A, auth, uid, { studentId: student, section: "activity", title: "Old activity", entryDate: dayBefore }, "staff");
  await createLearnerEntry(A, auth, uid, { studentId: student, section: "activity", title: "New activity" }, "staff");
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("portfolio years", () => {
  it("lists the years the student was enrolled in, newest first, with the class", async () => {
    const years = await listStudentYears(A, auth, student);
    expect(years.map((y) => [y.id, y.class_label])).toEqual([[thisYear, "Grade 6 B"], [lastYear, "Grade 5 A"]]);
  });

  it("splits records by year and filters the Learner Record", async () => {
    const last = await getYearRecordIds(A, auth, student, lastYear);
    expect(last!.entries.size).toBe(1);
    const all = await loadLearnerRecord(A, auth, student, null);
    expect(all.entries.map((e) => e.title).sort()).toEqual(["New activity", "Old activity"]);
    expect(all.academicYear).toBe("All years");
    const one = await loadLearnerRecord(A, auth, student, lastYear);
    expect(one.entries.map((e) => e.title)).toEqual(["Old activity"]);
    expect(one.academicYear).toBe("Last year");
    expect(one.selectedYearId).toBe(lastYear);
    expect(await getYearRecordIds(A, auth, student, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
