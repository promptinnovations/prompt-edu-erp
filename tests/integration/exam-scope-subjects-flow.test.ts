/**
 * PROMPT EDU ERP — per-grade exam subjects (migration 0056). MMP report:
 * "all subjects of the institution is shown for every classes ... for each
 * grade an option for choosing relevant subject for the exam ... only
 * selected subjects required to enter marks. once entered and saved, dont
 * wait for locking, directly show in results".
 *
 * Covers: the Section > Grade > Division planner reads the institution's own
 * stages/grades/divisions/class_subjects (two tenants with different
 * vocabularies); saving creates exam_subjects/exam_subject_classes only for
 * ticked (subject, grade) pairs; a subject not taught at a grade is never
 * offered and is refused server-side; marks grid / Mark Entry Status /
 * consolidated matrix / results only use the grade's own subjects; saved
 * (draft) marks show in getResults() immediately, flagged provisional; the
 * planner refuses to orphan entered marks; finalize still works as its own
 * later action. Regular examinations only — Daily Assessment untouched.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject, assignSubjectToClass, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination, getExamScopePlan, saveExamScopePlan, listExamSubjects, listExamSubjectGrades,
  getMarksGrid, getMarkEntryStatus, getExaminationMarksMatrix, enterMarksAndRecompute, getResults,
  submitMarks, verifyMarks, approveMarks, lockMarks, finalizeExamination, getExamSubjectClassIds,
} from "../../modules/examination/service";

let inst: string, adminAuth: string, adminUserId: string, yearId: string, examTypeId: string;
let lp1: string, lp1A: string, lp1B: string, up5: string, up5A: string;
let malayalam: string, maths: string, science: string, hindi: string;
const lp1Students: string[] = [];
const up5Students: string[] = [];

async function enrol(studentId: string, classId: string, sectionId: string) {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, (scoped) =>
    scoped.query(
      `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id) values ($1, $2, $3, $4, $5)`,
      [inst, studentId, yearId, classId, sectionId]
    )
  );
}

async function linkCount(examinationId: string) {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) => {
    const { rows } = await scoped.query<{ subject_id: string; class_id: string }>(
      `select es.subject_id, esc.class_id from exam_subject_classes esc join exam_subjects es on es.id = esc.exam_subject_id
        where esc.examination_id = $1`, [examinationId]
    );
    return rows;
  });
}

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  inst = await seedDemoInstitution(db, "scope-a");
  const admin = await seedDemoUser(db, inst, "admin@scope-a.example", "Scope Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  yearId = (await getCurrentAcademicYear(inst, adminAuth))!.id;
  examTypeId = (await listExamTypes(inst, adminAuth)).find((t) => !t.is_daily_assessment)!.id;

  lp1 = (await createClass(inst, adminAuth, adminUserId, { name: "SC 1", sortOrder: 1, stage: "LP" })).id;
  up5 = (await createClass(inst, adminAuth, adminUserId, { name: "SC 5", sortOrder: 5, stage: "UP" })).id;
  lp1A = (await createSection(inst, adminAuth, adminUserId, { classId: lp1, name: "A" })).id;
  lp1B = (await createSection(inst, adminAuth, adminUserId, { classId: lp1, name: "B" })).id;
  up5A = (await createSection(inst, adminAuth, adminUserId, { classId: up5, name: "A" })).id;

  malayalam = (await createSubject(inst, adminAuth, adminUserId, { name: "SC Malayalam" })).id;
  maths = (await createSubject(inst, adminAuth, adminUserId, { name: "SC Maths" })).id;
  science = (await createSubject(inst, adminAuth, adminUserId, { name: "SC Science" })).id;
  hindi = (await createSubject(inst, adminAuth, adminUserId, { name: "SC Hindi" })).id;
  // Grade 1 is taught Malayalam + Maths; Grade 5 is taught Maths + Science + Hindi.
  for (const s of [malayalam, maths]) await assignSubjectToClass(inst, adminAuth, adminUserId, { classId: lp1, subjectId: s, isCore: true });
  for (const s of [maths, science, hindi]) await assignSubjectToClass(inst, adminAuth, adminUserId, { classId: up5, subjectId: s, isCore: true });

  for (let i = 0; i < 2; i++) {
    const s = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: `SC1-${i}`, fullName: `SC One ${i}` })).id;
    await enrol(s, lp1, i === 0 ? lp1A : lp1B);
    lp1Students.push(s);
  }
  for (let i = 0; i < 2; i++) {
    const s = (await createStudent(inst, adminAuth, adminUserId, { admissionNumber: `SC5-${i}`, fullName: `SC Five ${i}` })).id;
    await enrol(s, up5, up5A);
    up5Students.push(s);
  }
});

afterAll(() => { __resetDbClientForTests(); });

describe("scope planner reads the institution's own Section > Grade > Division > subjects", () => {
  it("groups grades by the institution's stages and offers only each grade's class_subjects", async () => {
    const exam = await createExamination(inst, adminAuth, adminUserId, { examTypeId, academicYearId: yearId, name: "SC Plan read" });
    const plan = await getExamScopePlan(inst, adminAuth, exam.id);
    const labels = plan.sections.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(["LP", "UP"]));
    const g1 = plan.sections.flatMap((s) => s.grades).find((g) => g.classId === lp1)!;
    expect(g1.divisions.map((d) => d.name)).toEqual(["A", "B"]);
    expect(g1.subjectOptions.map((o) => o.subjectId).sort()).toEqual([malayalam, maths].sort());
    expect(g1.inScope).toBe(false);
    const g5 = plan.sections.flatMap((s) => s.grades).find((g) => g.classId === up5)!;
    expect(g5.subjectOptions.map((o) => o.subjectId)).not.toContain(malayalam);
  });
});

describe("saving the plan creates exam_subjects only for ticked (subject, grade) pairs", () => {
  let examId: string;
  beforeAll(async () => {
    examId = (await createExamination(inst, adminAuth, adminUserId, { examTypeId, academicYearId: yearId, name: "SC Half Yearly" })).id;
    await saveExamScopePlan(inst, adminAuth, adminUserId, examId, {
      grades: [
        { classId: lp1, sectionIds: [lp1A, lp1B], subjectIds: [malayalam, maths] },
        // Grade 5 sits only Maths + Science this exam (Hindi deliberately not selected).
        { classId: up5, sectionIds: [up5A], subjectIds: [maths, science] },
      ],
    });
  });

  it("creates one exam_subject per selected subject and links it only to the grades that ticked it", async () => {
    const es = await listExamSubjects(inst, adminAuth, examId);
    expect(es.map((e) => e.subject_id).sort()).toEqual([malayalam, maths, science].sort()); // no Hindi
    const links = await linkCount(examId);
    expect(links).toHaveLength(4); // Mal-1, Maths-1, Maths-5, Sci-5 (not 3 subjects x 2 grades)
    const grades = await listExamSubjectGrades(inst, adminAuth, examId);
    const byId = new Map(es.map((e) => [e.subject_id, e.id]));
    expect(grades[byId.get(malayalam)!]).toEqual(["SC 1"]);
    expect(grades[byId.get(science)!]).toEqual(["SC 5"]);
    expect(grades[byId.get(maths)!].sort()).toEqual(["SC 1", "SC 5"]);
    expect((await getExamSubjectClassIds(inst, adminAuth, byId.get(science)!))).toEqual([up5]);
  });

  it("a subject not taught at a grade is refused server-side (and never offered)", async () => {
    await expect(saveExamScopePlan(inst, adminAuth, adminUserId, examId, {
      grades: [{ classId: lp1, sectionIds: [lp1A], subjectIds: [science] }],
    })).rejects.toThrow(/isn't taught at this grade/);
    // Rolled back — original plan intact.
    expect(await linkCount(examId)).toHaveLength(4);
  });

  it("marks grid / Mark Entry Status / consolidated matrix only use each grade's own subjects", async () => {
    const byId = new Map((await listExamSubjects(inst, adminAuth, examId)).map((e) => [e.subject_id, e.id]));
    const sciGrid = await getMarksGrid(inst, adminAuth, byId.get(science)!);
    expect(sciGrid.map((r) => r.student_id).sort()).toEqual([...up5Students].sort());
    const malGrid = await getMarksGrid(inst, adminAuth, byId.get(malayalam)!);
    expect(malGrid.map((r) => r.student_id).sort()).toEqual([...lp1Students].sort());

    const status = await getMarkEntryStatus(inst, adminAuth, examId);
    expect(status.filter((r) => r.class_id === lp1).map((r) => r.subject_id).sort()).toEqual([malayalam, maths].sort());
    expect(status.filter((r) => r.class_id === up5).map((r) => r.subject_id).sort()).toEqual([maths, science].sort());

    const matrix = await getExaminationMarksMatrix(inst, adminAuth, examId);
    const lp1Cells = matrix.filter((m) => m.student_id === lp1Students[0]);
    expect(lp1Cells.map((c) => c.subject_name).sort()).toEqual(["SC Malayalam", "SC Maths"]);
  });

  it("saved (draft, never submitted/verified/locked) marks show in Results immediately, over the grade's own subjects", async () => {
    const byId = new Map((await listExamSubjects(inst, adminAuth, examId)).map((e) => [e.subject_id, e.id]));
    await enterMarksAndRecompute(inst, adminAuth, adminUserId, byId.get(malayalam)!, [
      { studentId: lp1Students[0], marksObtained: 80, isAbsent: false },
    ]);
    let results = await getResults(inst, adminAuth, examId);
    let r = results.find((x) => x.student_id === lp1Students[0])!;
    expect(r).toBeDefined();
    expect(r.is_provisional).toBe(true);
    expect(r.subjects_expected).toBe(2); // Malayalam + Maths — not every subject of the exam
    expect(Number(r.total_marks)).toBe(80);

    await enterMarksAndRecompute(inst, adminAuth, adminUserId, byId.get(maths)!, [
      { studentId: lp1Students[0], marksObtained: 60, isAbsent: false },
    ]);
    results = await getResults(inst, adminAuth, examId);
    r = results.find((x) => x.student_id === lp1Students[0])!;
    expect(Number(r.max_total_marks)).toBe(200); // Science (not set for Grade 1) never in the denominator
    expect(Number(r.percentage)).toBe(70);
    expect(r.subjects_entered).toBe(2);
    expect(r.is_provisional).toBe(true); // still draft — shown anyway, verification is later/optional
  });

  it("refuses to untick a subject or drop a division that already has marks (no silent deletes)", async () => {
    await expect(saveExamScopePlan(inst, adminAuth, adminUserId, examId, {
      grades: [
        { classId: lp1, sectionIds: [lp1A, lp1B], subjectIds: [maths] },
        { classId: up5, sectionIds: [up5A], subjectIds: [maths, science] },
      ],
    })).rejects.toThrow(/Marks have already been entered for: SC Malayalam for Grade SC 1/);
    await expect(saveExamScopePlan(inst, adminAuth, adminUserId, examId, {
      grades: [
        { classId: lp1, sectionIds: [lp1B], subjectIds: [malayalam, maths] },
        { classId: up5, sectionIds: [up5A], subjectIds: [maths, science] },
      ],
    })).rejects.toThrow(/division A/);
    // Planner shows the entered subjects as locked.
    const g1 = (await getExamScopePlan(inst, adminAuth, examId)).sections.flatMap((s) => s.grades).find((g) => g.classId === lp1)!;
    expect(g1.lockedSubjectIds.sort()).toEqual([malayalam, maths].sort());
  });

  it("adding a subject later for one grade doesn't touch the other grade", async () => {
    await saveExamScopePlan(inst, adminAuth, adminUserId, examId, {
      grades: [
        { classId: lp1, sectionIds: [lp1A, lp1B], subjectIds: [malayalam, maths] },
        { classId: up5, sectionIds: [up5A], subjectIds: [maths, science, hindi] },
      ],
    });
    const links = await linkCount(examId);
    expect(links.filter((l) => l.class_id === lp1).map((l) => l.subject_id).sort()).toEqual([malayalam, maths].sort());
    expect(links.filter((l) => l.class_id === up5)).toHaveLength(3);
  });

  it("finalize is still a separate, later action and still works once marks are approved", async () => {
    const es = await listExamSubjects(inst, adminAuth, examId);
    const byId = new Map(es.map((e) => [e.subject_id, e.id]));
    // Complete everyone on their own grade's subjects.
    await enterMarksAndRecompute(inst, adminAuth, adminUserId, byId.get(malayalam)!, [{ studentId: lp1Students[1], marksObtained: 50, isAbsent: false }]);
    await enterMarksAndRecompute(inst, adminAuth, adminUserId, byId.get(maths)!, [
      { studentId: lp1Students[1], marksObtained: 50, isAbsent: false },
      ...up5Students.map((studentId) => ({ studentId, marksObtained: 70, isAbsent: false })),
    ]);
    for (const sid of [science, hindi]) {
      await enterMarksAndRecompute(inst, adminAuth, adminUserId, byId.get(sid)!, up5Students.map((studentId) => ({ studentId, marksObtained: 40, isAbsent: false })));
    }
    // Before any approval the results are all listed (provisional) — finalize refuses.
    expect((await getResults(inst, adminAuth, examId)).length).toBe(4);
    await expect(finalizeExamination(inst, adminAuth, adminUserId, examId)).rejects.toThrow(/provisional/);
    for (const e of es) {
      await submitMarks(inst, adminAuth, e.id, adminUserId);
      await verifyMarks(inst, adminAuth, e.id, adminUserId);
      await approveMarks(inst, adminAuth, e.id, adminUserId);
      await lockMarks(inst, adminAuth, e.id, adminUserId);
    }
    const { frozen } = await finalizeExamination(inst, adminAuth, adminUserId, examId);
    expect(frozen).toBe(4);
    const up = (await getResults(inst, adminAuth, examId)).find((x) => x.student_id === up5Students[0])!;
    expect(Number(up.max_total_marks)).toBe(300); // Maths + Science + Hindi only
    expect(up.is_frozen).toBe(true);
    await expect(saveExamScopePlan(inst, adminAuth, adminUserId, examId, { grades: [] })).rejects.toThrow(/finalized/);
  });
});

describe("tenant-agnostic: an institution with no stages and no class_subjects", () => {
  it("groups under 'No section', offers every subject (flagged unconfigured), and saves per grade", async () => {
    const db = await getDbClient();
    const instB = await seedDemoInstitution(db, "scope-b");
    const adminB = await seedDemoUser(db, instB, "admin@scope-b.example", "Scope B", "institution_admin");
    const a = adminB.authUserId, u = adminB.userId;
    const cls = (await createClass(instB, a, u, { name: "Kithab 3", sortOrder: 3 })).id;
    const s1 = (await createSubject(instB, a, u, { name: "Fiqh" })).id;
    await createSubject(instB, a, u, { name: "Tajweed" });
    const year = (await getCurrentAcademicYear(instB, a))!.id;
    const et = (await listExamTypes(instB, a)).find((t) => !t.is_daily_assessment)!.id;
    const exam = await createExamination(instB, a, u, { examTypeId: et, academicYearId: year, name: "B exam" });
    const plan = await getExamScopePlan(instB, a, exam.id);
    expect(plan.sections.map((s) => s.label)).toEqual(["No section"]);
    const g = plan.sections[0].grades[0];
    expect(g.subjectsConfigured).toBe(false);
    expect(g.hasDivisions).toBe(false);
    expect(g.subjectOptions).toHaveLength(2);
    await saveExamScopePlan(instB, a, u, exam.id, { grades: [{ classId: cls, sectionIds: [], subjectIds: [s1] }] });
    expect((await listExamSubjects(instB, a, exam.id)).map((e) => e.subject_id)).toEqual([s1]);
    // Institution A can't see B's plan rows.
    await expect(getExamScopePlan(inst, adminAuth, exam.id)).rejects.toThrow(/not found/);
  });
});
