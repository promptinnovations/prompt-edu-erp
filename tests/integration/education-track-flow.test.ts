/**
 * PROMPT EDU ERP — Education Type (Academic / Islamic / Both) follow-up.
 * Covers the full track feature end to end for a 'both'-mode institution:
 * institution-level education_mode/track_order read+write, subject track
 * tagging (create + retag), the Student Portfolio exam-report's track
 * field, and getTrackWiseSummary()'s per-track pass/average computation —
 * deliberately computed from marks/exam_subjects/subjects directly rather
 * than the shared `results` table, since that table only ever holds one
 * combined-across-both-tracks total per student (see getTrackWiseSummary's
 * own doc comment in modules/analytics/service.ts).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, updateSubjectTrack, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject,
  enterMarks, submitMarks, verifyMarks, approveMarks, computeResults,
  getStudentExamReport,
} from "../../modules/examination/service";
import { getTrackWiseSummary } from "../../modules/analytics/service";
import { getInstitution, updateInstitutionTrackOrder } from "../../services/institution/institution-service";

let institutionA: string;
let adminAuth: string, adminUserId: string;
let gradeClassId: string, sectionId: string;
let mathId: string, arabicId: string, quranId: string;
let student1: string, student2: string;
let examinationId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "et-school-a");
  // seedDemoInstitution() doesn't go through createInstitution()'s
  // educationMode field (§408) — it inserts the row directly and the
  // column defaults to 'academic', same as every institution created
  // before this feature existed. Flip it to 'both' here, the same way the
  // production backfill (migration 0041) did for real 'both' institutions.
  await db.query("update institutions set education_mode = 'both' where id = $1", [institutionA]);

  const admin = await seedDemoUser(db, institutionA, "admin@et-a.example", "ET Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "ET Grade 5", sortOrder: 1 });
  gradeClassId = cls.id;
  const sec = await createSection(institutionA, adminAuth, adminUserId, { classId: gradeClassId, name: "A" });
  sectionId = sec.id;

  const math = await createSubject(institutionA, adminAuth, adminUserId, { name: "ET Mathematics", track: "academic" });
  mathId = math.id;
  // Arabic created untagged on purpose, then retagged below — exercises
  // updateSubjectTrack() as the "sort a subject into a track afterward"
  // path (§409), not just tagging at creation time.
  const arabic = await createSubject(institutionA, adminAuth, adminUserId, { name: "ET Arabic" });
  arabicId = arabic.id;
  const quran = await createSubject(institutionA, adminAuth, adminUserId, { name: "ET Quran", track: "islamic" });
  quranId = quran.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ET-1", fullName: "ET Student One" });
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ET-2", fullName: "ET Student Two" });
  student1 = s1.id; student2 = s2.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  const dbForEnroll = await getDbClient();
  await dbForEnroll.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    for (const sid of [student1, student2]) {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id)
         values ($1, $2, $3, $4, $5)`,
        [institutionA, sid, year.id, gradeClassId, sectionId]
      );
    }
  });

  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main") ?? examTypes[0];
  const examination = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId: year.id, name: "ET Term Exam",
  });
  examinationId = examination.id;
  await addExamClass(institutionA, adminAuth, examinationId, gradeClassId, null);

  const mathSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId: mathId, maxMarks: 100, passMarks: 35 });
  const arabicSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId: arabicId, maxMarks: 100, passMarks: 35 });
  const quranSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId: quranId, maxMarks: 100, passMarks: 35 });

  // Retag Arabic to 'islamic' AFTER the exam_subject was already created —
  // getTrackWiseSummary() reads subjects.track live at report time, not a
  // snapshot, so this should still be picked up correctly.
  await updateSubjectTrack(institutionA, adminAuth, adminUserId, arabicId, { track: "islamic" });

  // student1: Math 90 (academic pass), Arabic 80 + Quran 80 (islamic pass, avg 80)
  // student2: Math 20 (academic fail), Arabic 90 + Quran 10 (islamic: avg 50, but Quran fails pass_marks 35 -> overall islamic fail)
  const marksBySubject: Record<string, { studentId: string; marksObtained: number; isAbsent: boolean }[]> = {
    [mathSubject.id]: [
      { studentId: student1, marksObtained: 90, isAbsent: false },
      { studentId: student2, marksObtained: 20, isAbsent: false },
    ],
    [arabicSubject.id]: [
      { studentId: student1, marksObtained: 80, isAbsent: false },
      { studentId: student2, marksObtained: 90, isAbsent: false },
    ],
    [quranSubject.id]: [
      { studentId: student1, marksObtained: 80, isAbsent: false },
      { studentId: student2, marksObtained: 10, isAbsent: false },
    ],
  };
  for (const [examSubjectId, marks] of Object.entries(marksBySubject)) {
    await enterMarks(institutionA, adminAuth, adminUserId, examSubjectId, marks);
    await submitMarks(institutionA, adminAuth, examSubjectId, adminUserId);
    await verifyMarks(institutionA, adminAuth, examSubjectId, adminUserId);
    await approveMarks(institutionA, adminAuth, examSubjectId, adminUserId);
  }
  await computeResults(institutionA, adminAuth, examinationId);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Education Type — institution-level read/write (§407/§408)", () => {
  it("getInstitution() returns education_mode and the default track_order", async () => {
    const institution = await getInstitution(institutionA, adminAuth);
    expect(institution?.educationMode).toBe("both");
    expect(institution?.trackOrder).toEqual(["academic", "islamic"]);
  });

  it("updateInstitutionTrackOrder() persists an admin's chosen order (§ 'which should come first will be decided by institute admin')", async () => {
    await updateInstitutionTrackOrder(institutionA, adminAuth, adminUserId, { trackOrder: ["islamic", "academic"] });
    const institution = await getInstitution(institutionA, adminAuth);
    expect(institution?.trackOrder).toEqual(["islamic", "academic"]);
    // restore for subsequent tests/readability
    await updateInstitutionTrackOrder(institutionA, adminAuth, adminUserId, { trackOrder: ["academic", "islamic"] });
  });
});

describe("Subjects — track tagging (§409)", () => {
  it("createSubject() persists the track given at creation", async () => {
    const record = await createSubject(institutionA, adminAuth, adminUserId, { name: "ET Fiqh", track: "islamic" });
    expect(record.track).toBe("islamic");
  });

  it("updateSubjectTrack() retags an existing subject", async () => {
    const record = await createSubject(institutionA, adminAuth, adminUserId, { name: "ET Social Science" });
    expect(record.track).toBeNull();
    await updateSubjectTrack(institutionA, adminAuth, adminUserId, record.id, { track: "academic" });
    const db = await getDbClient();
    const { rows } = await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, (scoped) =>
      scoped.query<{ track: string | null }>("select track from subjects where id = $1", [record.id])
    );
    expect(rows[0].track).toBe("academic");
  });
});

describe("Student Portfolio — exam report carries track (§410)", () => {
  it("getStudentExamReport() includes each subject's track", async () => {
    const report = await getStudentExamReport(institutionA, adminAuth, student1, examinationId);
    expect(report).not.toBeNull();
    const bySubjectId = new Map(report!.subjects.map((s) => [s.subject_id, s.track]));
    expect(bySubjectId.get(mathId)).toBe("academic");
    expect(bySubjectId.get(arabicId)).toBe("islamic"); // retagged before marks entry
    expect(bySubjectId.get(quranId)).toBe("islamic");
  });
});

describe("Result Analysis — track-separated summary (§411, verbatim ask: 'they should be analyzed seperately')", () => {
  it("getTrackWiseSummary() computes independent pass/average per track, never mixing the two", async () => {
    const summaries = await getTrackWiseSummary(institutionA, adminAuth, examinationId);
    expect(summaries).toHaveLength(2);

    const academic = summaries.find((s) => s.track === "academic")!;
    const islamic = summaries.find((s) => s.track === "islamic")!;

    // Academic track = Math only. student1: 90% (pass), student2: 20% (fail).
    expect(academic.total_students).toBe(2);
    expect(academic.average_percent).toBeCloseTo(55, 1);
    expect(academic.pass_count).toBe(1);
    expect(academic.fail_count).toBe(1);
    expect(academic.pass_percent).toBeCloseTo(50, 1);

    // Islamic track = Arabic + Quran. student1: 80+80=160/200=80% (both subjects pass -> overall pass).
    // student2: 90+10=100/200=50% overall pct, but Quran (10 < pass_marks 35) fails subject-level -> overall fail.
    expect(islamic.total_students).toBe(2);
    expect(islamic.average_percent).toBeCloseTo(65, 1);
    expect(islamic.pass_count).toBe(1);
    expect(islamic.fail_count).toBe(1);
  });

  it("returns an empty array for an 'academic'-only institution with no tracked subjects", async () => {
    const db = await getDbClient();
    const otherInstitution = await seedDemoInstitution(db, "et-school-b"); // stays at the 'academic' default, no subjects tagged
    const otherAdmin = await seedDemoUser(db, otherInstitution, "admin@et-b.example", "ET B Admin", "institution_admin");
    const examTypes = await listExamTypes(otherInstitution, otherAdmin.authUserId);
    const year = await getCurrentAcademicYear(otherInstitution, otherAdmin.authUserId);
    const examination = await createExamination(otherInstitution, otherAdmin.authUserId, otherAdmin.userId, {
      examTypeId: examTypes[0].id, academicYearId: year!.id, name: "ET B Term Exam",
    });
    const summaries = await getTrackWiseSummary(otherInstitution, otherAdmin.authUserId, examination.id);
    expect(summaries).toEqual([]);
  });
});
