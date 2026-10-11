/**
 * §Student-portal-visual-redesign — modules/portal/student-insights.ts.
 * Each loader is exercised against real seeded rows so every SQL path
 * runs, and the portal visibility rules are asserted: unpublished exams
 * are invisible, only approved achievements and only POSITIVE behaviour
 * records appear, and subject percentages follow the report card's
 * TE + CE rule.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import { listAttendanceStatuses } from "../../modules/attendance/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject, enterMarks, enterCeMarks,
  computeResults, publishExamination, closeMarkEntry, createGradeScale, createGradeBand,
} from "../../modules/examination/service";
import {
  getAcademicInsights, getAttendanceInsights, getGrowthInsights, getActivityInsights,
  getReadingInsights, getDashboardInsights,
} from "../../modules/portal/student-insights";
import { todayIST, daysAgoIST } from "../../services/datetime/ist";

let inst: string;
let adminAuth: string, adminUserId: string;
let studentId: string;
let classId: string;
let publishedExamId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  inst = await seedDemoInstitution(db, "insights-a");
  const admin = await seedDemoUser(db, inst, "admin@insights-a.example", "Insights Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const year = await getCurrentAcademicYear(inst, adminAuth);
  if (!year) throw new Error("expected a current academic year");
  classId = (await createClass(inst, adminAuth, adminUserId, { name: "IN Grade 6", sortOrder: 1 })).id;
  const sectionId = (await createSection(inst, adminAuth, adminUserId, { classId, name: "A" })).id;
  const math = await createSubject(inst, adminAuth, adminUserId, { name: "Mathematics" });
  const eng = await createSubject(inst, adminAuth, adminUserId, { name: "English" });
  studentId = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: "IN-1", fullName: "Insight Student" })).id;

  const scale = await createGradeScale(inst, adminAuth, adminUserId, { name: "Insights scale", isDefault: true });
  await createGradeBand(inst, adminAuth, adminUserId, { gradeScaleId: scale.id, minPercent: 80, maxPercent: 100, gradeLabel: "A", color: "#16a34a" });
  await createGradeBand(inst, adminAuth, adminUserId, { gradeScaleId: scale.id, minPercent: 0, maxPercent: 79.99, gradeLabel: "B", color: "#2563eb" });

  const examType = (await listExamTypes(inst, adminAuth)).find((t) => t.code === "academic_main");
  if (!examType) throw new Error("expected seeded exam type academic_main");

  await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) => {
    await scoped.query(
      "insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id, roll_number) values ($1,$2,$3,$4,$5,7)",
      [inst, studentId, year.id, classId, sectionId]
    );
  });

  // Published exam: Maths 70/80 TE + 18/20 CE = 88% (A); English 30/50 = 60% (B).
  const exam = await createExamination(inst, adminAuth, adminUserId, { examTypeId: examType.id, academicYearId: year.id, name: "Term 1", gradeScaleId: scale.id });
  publishedExamId = exam.id;
  await addExamClass(inst, adminAuth, exam.id, classId, sectionId);
  const esMath = await addExamSubject(inst, adminAuth, adminUserId, { examinationId: exam.id, subjectId: math.id, maxMarks: 80, passMarks: 28 });
  const esEng = await addExamSubject(inst, adminAuth, adminUserId, { examinationId: exam.id, subjectId: eng.id, maxMarks: 50, passMarks: 18 });
  const ceId = await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      "insert into exam_ce_components (institution_id, exam_subject_id, name, max_marks) values ($1,$2,'Project',20) returning id",
      [inst, esMath.id]
    );
    return rows[0].id;
  });
  await enterMarks(inst, adminAuth, adminUserId, esMath.id, [{ studentId, marksObtained: 70, isAbsent: false }]);
  await enterMarks(inst, adminAuth, adminUserId, esEng.id, [{ studentId, marksObtained: 30, isAbsent: false }]);
  await enterCeMarks(inst, adminAuth, adminUserId, esMath.id, [{ studentId, componentId: ceId, marksObtained: 18, isAbsent: false }]);
  await computeResults(inst, adminAuth, exam.id);
  await closeMarkEntry(inst, adminAuth, adminUserId, exam.id);
  await publishExamination(inst, adminAuth, adminUserId, exam.id);

  // Unpublished exam — must never reach the portal.
  const hidden = await createExamination(inst, adminAuth, adminUserId, { examTypeId: examType.id, academicYearId: year.id, name: "Hidden test", gradeScaleId: scale.id });
  await addExamClass(inst, adminAuth, hidden.id, classId, sectionId);
  const esHidden = await addExamSubject(inst, adminAuth, adminUserId, { examinationId: hidden.id, subjectId: math.id, maxMarks: 10, passMarks: 4 });
  await enterMarks(inst, adminAuth, adminUserId, esHidden.id, [{ studentId, marksObtained: 1, isAbsent: false }]);
  await computeResults(inst, adminAuth, hidden.id);

  const statuses = await listAttendanceStatuses(inst, adminAuth);
  const present = statuses.find((s) => s.counts_as_present)!;
  const absent = statuses.find((s) => !s.counts_as_present)!;
  await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) => {
    const day = (n: number) => daysAgoIST(n);
    for (const [n, status, late] of [[1, present.id, false], [2, present.id, true], [3, absent.id, false]] as const) {
      await scoped.query(
        "insert into attendance_records (institution_id, student_id, class_id, section_id, date, status_id, is_late) values ($1,$2,$3,$4,$5,$6,$7)",
        [inst, studentId, classId, sectionId, day(n), status, late]
      );
    }
    // Growth: two character periods, one positive and one negative record.
    const { rows: attr } = await scoped.query<{ id: string }>(
      "insert into character_attributes (institution_id, name) values ($1,'Kindness') returning id", [inst]
    );
    await scoped.query("insert into character_assessments (institution_id, student_id, attribute_id, period, rating, created_at) values ($1,$2,$3,'Term 1',3, now() - interval '30 days')", [inst, studentId, attr[0].id]);
    await scoped.query("insert into character_assessments (institution_id, student_id, attribute_id, period, rating) values ($1,$2,$3,'Term 2',5)", [inst, studentId, attr[0].id]);
    const { rows: pos } = await scoped.query<{ id: string }>("insert into discipline_categories (institution_id, name, is_positive) values ($1,'Helping others',true) returning id", [inst]);
    const { rows: neg } = await scoped.query<{ id: string }>("insert into discipline_categories (institution_id, name, is_positive) values ($1,'Late homework',false) returning id", [inst]);
    await scoped.query("insert into discipline_records (institution_id, student_id, category_id, date) values ($1,$2,$3,$4)", [inst, studentId, pos[0].id, todayIST()]);
    await scoped.query("insert into discipline_records (institution_id, student_id, category_id, date) values ($1,$2,$3,$4)", [inst, studentId, neg[0].id, todayIST()]);
    // Achievements: one approved, one pending.
    const { rows: cat } = await scoped.query<{ id: string }>("insert into achievement_categories (institution_id, name) values ($1,'Insights arts') returning id", [inst]);
    const { rows: lvl } = await scoped.query<{ id: string }>("insert into achievement_levels (institution_id, name) values ($1,'Insights level') returning id", [inst]);
    await scoped.query("insert into achievements (institution_id, student_id, category_id, level_id, title, \"position\", status) values ($1,$2,$3,$4,'Painting','1st','approved')", [inst, studentId, cat[0].id, lvl[0].id]);
    await scoped.query("insert into achievements (institution_id, student_id, category_id, level_id, title, status) values ($1,$2,$3,$4,'Essay','pending')", [inst, studentId, cat[0].id, lvl[0].id]);
    // Upcoming calendar event.
    await scoped.query("insert into calendar_events (institution_id, title, event_type, start_date) values ($1,'Sports day','other', current_date + 5)", [inst]);
  });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("student insights", () => {
  it("academics: only published exams, TE + CE subject percentages and grades", async () => {
    const a = await getAcademicInsights(inst, adminAuth, studentId);
    expect(a.exams.map((e) => e.name)).toEqual(["Term 1"]);
    const term = a.exams[0];
    expect(term.examination_id).toBe(publishedExamId);
    const maths = term.subjects.find((s) => s.subject_name === "Mathematics")!;
    expect(maths.percent).toBe(88);
    expect(maths.grade_label).toBe("A");
    expect(maths.grade_color).toBe("#16a34a");
    const english = term.subjects.find((s) => s.subject_name === "English")!;
    expect(english.percent).toBe(60);
    expect(english.grade_label).toBe("B");
    expect(a.bands.map((b) => b.grade_label)).toEqual(["A", "B"]);
  });

  it("attendance: day-by-day statuses for the year", async () => {
    const a = await getAttendanceInsights(inst, adminAuth, studentId);
    expect(a.days.map((d) => d.status)).toEqual(["absent", "late", "present"]);
  });

  it("growth: periods in recorded order, positive recognitions only", async () => {
    const g = await getGrowthInsights(inst, adminAuth, studentId);
    expect(g.periods.map((p) => p.period)).toEqual(["Term 1", "Term 2"]);
    expect(g.attributes).toEqual(["Kindness"]);
    expect(g.recognitions.map((r) => r.category)).toEqual(["Helping others"]);
  });

  it("activities: approved achievements only", async () => {
    const a = await getActivityInsights(inst, adminAuth, studentId);
    expect(a.achievements.map((x) => x.title)).toEqual(["Painting"]);
  });

  it("reading: runs with no books", async () => {
    const r = await getReadingInsights(inst, adminAuth, studentId);
    expect(r.books).toEqual([]);
    expect(r.likesReceived).toBe(0);
  });

  it("dashboard: headline numbers and what's next", async () => {
    const d = await getDashboardInsights(inst, adminAuth, studentId);
    expect(d.classLabel).toBe("IN Grade 6 A");
    expect(d.rollNumber).toBe(7);
    expect(d.recentExams.map((e) => e.name)).toEqual(["Term 1"]);
    expect(d.attendance).toEqual({ present: 2, total: 3, percent: 66.7 });
    expect(d.achievements).toEqual({ total: 1, podium: 1 });
    expect(d.todo.awaitingApproval).toBe(1);
    expect(d.upcoming.some((u) => u.title === "Sports day")).toBe(true);
  });
});
