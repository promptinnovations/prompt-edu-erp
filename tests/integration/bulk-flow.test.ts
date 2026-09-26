/**
 * PROMPT EDU ERP — Bulk import/export flow (ARCHITECTURE.md §Q, Phase 14):
 * template generation, stage/validate (field/type/referential/duplicate
 * checks), confirm (true single-transaction atomicity across a batch —
 * the specific bug this phase's refactor fixes, see modules/bulk/service.ts
 * and the scopedClient params added to modules/{academic,students,staff,
 * library,achievements}/service.ts), raw CSV/XLSX export, permission
 * boundaries, and tenant isolation on migration 0016's import_batches.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { createClass, createSection, createSubject, listClasses, listSections, listSubjects, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, listStudents, enrollStudent, getCurrentEnrollment } from "../../modules/students/service";
import {
  listExamTypes, listExaminations, listDailyAssessments,
  createExamination, addExamClass, addExamSubject, getMarksGrid,
} from "../../modules/examination/service";
import {
  generateImportTemplate, stageImport, confirmImport, listRecentImportBatches,
  exportRows, exportDefinitions, listImportEntityTypes,
} from "../../modules/bulk/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string;

function xlsxToCsvLikeRows(header: string[], rows: string[][]): Buffer {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  return Buffer.from(lines.join("\n"), "utf-8");
}

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "bulk-school-a");
  institutionB = await seedDemoInstitution(db, "bulk-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@bulk-a.example", "Bulk Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const teacher = await seedDemoUser(db, institutionA, "teacher@bulk-a.example", "Bulk Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const grade6 = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 6", sortOrder: 6 });
  await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 7", sortOrder: 7 });
  await createSection(institutionA, adminAuth, adminUserId, { classId: grade6.id, name: "A" });
  await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "EXIST-1", fullName: "Existing Student" });
  await createSubject(institutionA, adminAuth, adminUserId, { name: "Botany" });
  const bulkYear = await getCurrentAcademicYear(institutionA, adminAuth);
  await enrollStudent(institutionA, adminAuth, adminUserId, {
    studentId: (await listStudents(institutionA, adminAuth)).find((s) => s.admission_number === "EXIST-1")!.id,
    classId: grade6.id, sectionId: (await listSections(institutionA, adminAuth)).find((s) => s.class_id === grade6.id)!.id,
    academicYearId: bulkYear!.id,
  });
  // "Sports Meet" / "District" are already seeded by seedDemoInstitution()
  // (database/scripts/seed.ts) -- reuse them rather than colliding with the
  // seed's own unique-name constraints.
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Import entity catalogue + templates (§Q.1, §Q.3)", () => {
  it("listImportEntityTypes() exposes the v1 target entities", () => {
    const types = listImportEntityTypes().map((t) => t.entityType).sort();
    expect(types).toEqual(
      ["achievements", "calendar_events", "classes", "daily_assessment_marks", "enrollments", "examinations", "library_books", "marks", "parents",
        "sections", "staff", "student_logins", "students", "subjects", "timetable_periods"].sort()
    );
  });

  it("generateImportTemplate() produces a real, non-empty XLSX per entity, from the same columns used to validate", async () => {
    for (const def of listImportEntityTypes()) {
      const buffer = await generateImportTemplate(def.entityType);
      expect(buffer.length).toBeGreaterThan(0);
    }
  });

  it("throws for an unknown entity type", async () => {
    await expect(generateImportTemplate("not_a_real_entity")).rejects.toThrow(/Unknown import entity type/);
  });
});

describe("Stage: field / referential / duplicate validation (§Q.1)", () => {
  it("classes: valid rows parse, missing name is invalid, existing name is a duplicate", async () => {
    const file = xlsxToCsvLikeRows(
      ["Name", "Sort order"],
      [["Grade 8", "8"], ["", "9"], ["Grade 6", "1"]] // valid, invalid (no name), duplicate (already exists)
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "classes", filename: "classes.csv", fileBuffer: file, format: "csv",
    });
    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(2); // blank name + "Grade 6" (already exists, §Q.1 referential/dup check against real DB rows)
    expect(result.duplicateRows).toBe(0); // "duplicate" status is reserved for WITHIN-FILE repeats, not existing-DB collisions
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("invalid");
    expect(result.rows[1].errors[0]).toMatch(/required/);
    expect(result.rows[2].status).toBe("invalid"); // "Grade 6" already exists -> flagged invalid at stage time, not "duplicate"
  });

  it("sections: referential check against real classes, and an in-file duplicate is flagged 'duplicate'", async () => {
    const file = xlsxToCsvLikeRows(
      ["Class name", "Section name", "Capacity"],
      [["Grade 7", "A", "30"], ["Grade 7", "A", "30"], ["Nonexistent Class", "B", ""]]
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "sections", filename: "sections.csv", fileBuffer: file, format: "csv",
    });
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("duplicate"); // same class+name as row 1, within this file
    expect(result.rows[2].status).toBe("invalid");
    expect(result.rows[2].errors[0]).toMatch(/was not found/);
  });

  it("students: Std/Div/Adm No/Student Name/Father/Mobile No required, admission number unique, date format validated, class/division referential checks, and a valid row actually enrolls + links a Father parent", async () => {
    const file = xlsxToCsvLikeRows(
      ["Std", "Div", "Adm No", "Student Name", "Father", "DOB (YYYY-MM-DD)", "Gender", "Mobile No"],
      [
        ["Grade 6", "A", "NEW-100", "Zainab Ali", "Karim Ali", "2013-01-15", "female", "9876543211"],
        ["Grade 6", "A", "EXIST-1", "Someone Else", "Some Father", "", "", "9876543212"], // duplicate of an existing DB row
        ["Grade 6", "A", "NEW-101", "Bad Date Kid", "Some Father", "not-a-date", "", "9876543213"],
        ["Nonexistent Class", "A", "NEW-102", "No Class Kid", "Some Father", "", "", "9876543214"],
        ["Grade 6", "Z", "NEW-103", "No Div Kid", "Some Father", "", "", "9876543215"],
      ]
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "students", filename: "students.csv", fileBuffer: file, format: "csv",
    });
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("invalid");
    expect(result.rows[1].errors[0]).toMatch(/already exists/);
    expect(result.rows[2].status).toBe("invalid");
    expect(result.rows[2].errors[0]).toMatch(/YYYY-MM-DD/);
    expect(result.rows[3].status).toBe("invalid");
    expect(result.rows[3].errors[0]).toMatch(/Class .* was not found/);
    expect(result.rows[4].status).toBe("invalid");
    expect(result.rows[4].errors[0]).toMatch(/Division .* was not found/);

    const confirmed = await confirmImport(institutionA, adminAuth, adminUserId, result.batchId);
    expect(confirmed.importedRows).toBe(1);

    const newStudent = (await listStudents(institutionA, adminAuth)).find((s) => s.admission_number === "NEW-100")!;
    expect(newStudent).toBeDefined();
    const classes = await listClasses(institutionA, adminAuth);
    const grade6 = classes.find((c) => c.name === "Grade 6")!;
    const sections = await listSections(institutionA, adminAuth, grade6.id);
    const sectionA = sections.find((s) => s.name === "A")!;
    // Actually enrolled (not just recorded) — same enrollStudent() the
    // "Enrollments" entity type below uses.
    const enrollment = await getCurrentEnrollment(institutionA, adminAuth, newStudent.id);
    expect(enrollment?.class_id).toBe(grade6.id);
    expect(enrollment?.section_id).toBe(sectionA.id);
  });

  it("achievements: multi-entity referential checks (student, category, level)", async () => {
    const file = xlsxToCsvLikeRows(
      ["Student admission number", "Category", "Level", "Title", "Position", "Points"],
      [
        ["EXIST-1", "Sports Meet", "District", "Chess champion", "1st", "15"],
        ["NOT-A-STUDENT", "Sports Meet", "District", "Chess champion", "", ""],
        ["EXIST-1", "Not A Category", "District", "Chess champion", "", ""],
      ]
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "achievements", filename: "ach.csv", fileBuffer: file, format: "csv",
    });
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("invalid");
    expect(result.rows[1].errors[0]).toMatch(/Student admission number/);
    expect(result.rows[2].status).toBe("invalid");
    expect(result.rows[2].errors[0]).toMatch(/Achievement category/);
  });

  it("staff: employmentStatus enum validated, dedupe on email and staff code", async () => {
    const file = xlsxToCsvLikeRows(
      ["Email", "Full name", "Staff code", "Designation", "Department", "Employment status (active/on_leave/resigned/terminated)"],
      [
        ["newstaff1@bulk-a.example", "New Staff", "STF-B01", "Teacher", "Academics", "active"],
        ["newstaff2@bulk-a.example", "Bad Status Staff", "STF-B02", "", "", "not_a_status"],
      ]
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "staff", filename: "staff.csv", fileBuffer: file, format: "csv",
    });
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("invalid");
    expect(result.rows[1].errors[0]).toMatch(/employmentStatus/);
  });

  it("accepts either the template's human-readable header labels or raw column keys", async () => {
    const byKey = xlsxToCsvLikeRows(["name", "sortOrder"], [["Grade 9", "9"]]);
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "classes", filename: "byKey.csv", fileBuffer: byKey, format: "csv",
    });
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[0].data).toMatchObject({ name: "Grade 9" });
  });
});

describe("Enrollments + Student logins bulk import (§137 follow-up — self-service, not mmp-only)", () => {
  it("enrollments: referential checks (student/class/section) + defaults to the current academic year + flags an already-enrolled student", async () => {
    await createClass(institutionA, adminAuth, adminUserId, { name: "Enroll Grade", sortOrder: 50 });
    const staged1 = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "sections", filename: "enroll-sections.csv", fileBuffer: xlsxToCsvLikeRows(["Class name", "Section name"], [["Enroll Grade", "A"]]), format: "csv",
    });
    await confirmImport(institutionA, adminAuth, adminUserId, staged1.batchId);
    await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ENR-1", fullName: "Enroll Test Student" });
    await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "ENR-2", fullName: "Already Enrolled Student" });

    const year = await getCurrentAcademicYear(institutionA, adminAuth);
    expect(year).not.toBeNull();
    const classes = await listClasses(institutionA, adminAuth);
    const cls = classes.find((c) => c.name === "Enroll Grade")!;
    const sections = await listSections(institutionA, adminAuth);
    const section = sections.find((s) => s.class_id === cls.id && s.name === "A")!;
    await enrollStudent(institutionA, adminAuth, adminUserId, {
      studentId: (await listStudents(institutionA, adminAuth)).find((s) => s.admission_number === "ENR-2")!.id,
      academicYearId: year!.id, classId: cls.id, sectionId: section.id,
    });

    const file = xlsxToCsvLikeRows(
      ["Student admission number", "Class name", "Section name", "Academic year"],
      [
        ["ENR-1", "Enroll Grade", "A", ""], // valid, defaults to current year
        ["NOT-A-STUDENT-999", "Enroll Grade", "A", ""], // invalid: student not found
        ["ENR-1", "Nonexistent Class", "A", ""], // invalid: class not found (same student, different row -> not a dedupe hit)
        ["ENR-2", "Enroll Grade", "A", ""], // invalid: already enrolled for the current year
      ]
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "enrollments", filename: "enrollments.csv", fileBuffer: file, format: "csv",
    });
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("invalid");
    expect(result.rows[1].errors[0]).toMatch(/was not found/);
    expect(result.rows[2].status).toBe("invalid");
    expect(result.rows[2].errors[0]).toMatch(/Class .* was not found/);
    expect(result.rows[3].status).toBe("invalid");
    expect(result.rows[3].errors[0]).toMatch(/already enrolled/);

    const confirmed = await confirmImport(institutionA, adminAuth, adminUserId, result.batchId);
    expect(confirmed.importedRows).toBe(1);
  });

  it("student_logins: creates a real login (username = full name, password = the file's value), rejects a student who already has one", async () => {
    await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "LOGIN-1", fullName: "Login Bulk Student" });
    const file = xlsxToCsvLikeRows(
      ["Student admission number", "Password"],
      [
        ["LOGIN-1", "9876543210"], // valid
        ["EXIST-1", "12"], // invalid: password too short
        ["NOT-A-STUDENT-999", "9876543210"], // invalid: student not found
      ]
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "student_logins", filename: "logins.csv", fileBuffer: file, format: "csv",
    });
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("invalid");
    expect(result.rows[1].errors[0]).toMatch(/4–30 characters/);
    expect(result.rows[2].status).toBe("invalid");
    expect(result.rows[2].errors[0]).toMatch(/was not found/);

    const confirmed = await confirmImport(institutionA, adminAuth, adminUserId, result.batchId);
    expect(confirmed.importedRows).toBe(1);

    const student = (await listStudents(institutionA, adminAuth)).find((s) => s.admission_number === "LOGIN-1")!;
    expect(student.login_id).toBe("Login Bulk Student");
    expect(student.user_id).not.toBeNull();

    // A second import row for the same (now-logged-in) student is rejected up front at stage time.
    const again = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "student_logins", filename: "logins-again.csv",
      fileBuffer: xlsxToCsvLikeRows(["Student admission number", "Password"], [["LOGIN-1", "1112223333"]]), format: "csv",
    });
    expect(again.rows[0].status).toBe("invalid");
    expect(again.rows[0].errors[0]).toMatch(/already has a login/);
  });
});

describe("Examinations bulk import (§'bulk upload - add exam' follow-up)", () => {
  it("referential checks (exam type) + defaults to the current academic year + flags a duplicate name under the same type/year", async () => {
    const examTypes = await listExamTypes(institutionA, adminAuth);
    const examType = examTypes.find((t) => t.code === "academic_main")!;

    const file = xlsxToCsvLikeRows(
      ["Exam type (must already exist under Settings \u2192 Grading)", "Examination name", "Academic year (leave blank for the current one)"],
      [
        [examType.name, "Bulk Term 1 Exam", ""], // valid, defaults to current year
        ["Not A Real Exam Type", "Bulk Bad Exam", ""], // invalid: exam type not found
        [examType.name, "", ""], // invalid: name required
      ]
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "examinations", filename: "examinations.csv", fileBuffer: file, format: "csv",
    });
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("invalid");
    expect(result.rows[1].errors[0]).toMatch(/Exam type .* was not found/);
    expect(result.rows[2].status).toBe("invalid");

    const confirmed = await confirmImport(institutionA, adminAuth, adminUserId, result.batchId);
    expect(confirmed.importedRows).toBe(1);

    const created = (await listExaminations(institutionA, adminAuth)).find((e) => e.name === "Bulk Term 1 Exam");
    expect(created).toBeTruthy();
    expect(created?.exam_type_id).toBe(examType.id);

    // Re-importing the exact same row is now a flagged duplicate, not a
    // second insert — examinations has no DB-level unique constraint of
    // its own to lean on, so this dedupe has to be enforced in parseRow().
    const again = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "examinations", filename: "examinations-again.csv",
      fileBuffer: xlsxToCsvLikeRows(
        ["Exam type (must already exist under Settings \u2192 Grading)", "Examination name", "Academic year (leave blank for the current one)"],
        [[examType.name, "Bulk Term 1 Exam", ""]]
      ),
      format: "csv",
    });
    expect(again.rows[0].status).toBe("invalid");
    expect(again.rows[0].errors[0]).toMatch(/already exists/);
  });
});

describe("Daily Assessment Marks bulk import (§504 'Add mark entry in bulk import/export')", () => {
  it("creates a new session from the first row, reuses it for a second student, resolves a backdated date's own month, and rejects a bad admission number", async () => {
    const file = xlsxToCsvLikeRows(
      ["Date (YYYY-MM-DD)", "Class", "Subject", "Portion (only used if this session doesn't already exist)",
       "Maximum mark (only used if this session doesn't already exist)", "Student admission number",
       "Marks obtained (leave blank if absent)", "Absent? (yes/no)"],
      [
        ["2021-02-10", "Grade 6", "Botany", "Cell, the unit of life", "10", "EXIST-1", "8", ""], // valid, creates the session
        ["2021-02-10", "Grade 6", "Botany", "ignored — session already exists", "999", "NOT-A-REAL-ADM", "5", ""], // invalid: bad admission number
        ["2021-02-10", "Grade 6", "Botany", "ignored", "10", "EXIST-1", "", "yes"], // valid, absent (dedupe key collides w/ row 1 — flagged duplicate)
      ]
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "daily_assessment_marks", filename: "daily-marks.csv", fileBuffer: file, format: "csv",
    });
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("invalid");
    expect(result.rows[1].errors[0]).toMatch(/admission number .* was not found/);
    expect(result.rows[2].status).toBe("duplicate");

    const confirmed = await confirmImport(institutionA, adminAuth, adminUserId, result.batchId);
    expect(confirmed.importedRows).toBe(1);

    const student = (await listStudents(institutionA, adminAuth)).find((s) => s.admission_number === "EXIST-1")!;
    const grade6 = (await listClasses(institutionA, adminAuth)).find((c) => c.name === "Grade 6")!;
    // The session landed in FEBRUARY 2021's register (the row's own date), not the
    // current month's — see getOrCreateDailyAssessmentSession()'s own comment.
    const created = await listExaminations(institutionA, adminAuth);
    const feb2021Register = created.find((e) => e.name === "Daily Assessment — February 2021");
    expect(feb2021Register).toBeTruthy();

    const sessions = await listDailyAssessments(institutionA, adminAuth, feb2021Register!.id, grade6.id);
    expect(sessions).toHaveLength(1); // exactly one session, not two — row 1 created it
    expect(sessions[0].portion).toBe("Cell, the unit of life");
    expect(sessions[0].status).toBe("completed");
    void student;
  });

  it("marks obtained above the row's own max marks is invalid", async () => {
    const file = xlsxToCsvLikeRows(
      ["Date (YYYY-MM-DD)", "Class", "Subject", "Portion (only used if this session doesn't already exist)",
       "Maximum mark (only used if this session doesn't already exist)", "Student admission number",
       "Marks obtained (leave blank if absent)", "Absent? (yes/no)"],
      [["2021-05-01", "Grade 6", "Botany", "Over-limit check", "10", "EXIST-1", "50", ""]]
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "daily_assessment_marks", filename: "daily-marks-overlimit.csv", fileBuffer: file, format: "csv",
    });
    expect(result.rows[0].status).toBe("invalid");
    expect(result.rows[0].errors[0]).toMatch(/can't exceed/);
  });
});

describe("Marks bulk import (§'mark entry also should be available for bulk upload')", () => {
  it("resolves (Examination name, Subject) to an exam_subject, writes through enterMarks(), respects the blank-means-don't-touch rule, and recomputes results", async () => {
    const examTypes = await listExamTypes(institutionA, adminAuth);
    const examType = examTypes.find((t) => !t.is_daily_assessment)!;
    const grade6 = (await listClasses(institutionA, adminAuth)).find((c) => c.name === "Grade 6")!;
    const bulkYear = await getCurrentAcademicYear(institutionA, adminAuth);
    const exam = await createExamination(institutionA, adminAuth, adminUserId, {
      examTypeId: examType.id, academicYearId: bulkYear!.id, name: "Bulk Marks Term Exam",
    });
    await addExamClass(institutionA, adminAuth, exam.id, grade6.id);
    const subjects = await listSubjects(institutionA, adminAuth);
    const botanySubject = subjects.find((s) => s.name === "Botany")!;
    const examSubject = await addExamSubject(institutionA, adminAuth, adminUserId, {
      examinationId: exam.id, subjectId: botanySubject.id, maxMarks: 100, passMarks: 35,
    });

    const student = (await listStudents(institutionA, adminAuth)).find((s) => s.admission_number === "EXIST-1")!;

    const file = xlsxToCsvLikeRows(
      ["Examination name", "Subject", "Student admission number",
       "Marks obtained (leave blank to leave this student's mark untouched)", "Absent? (yes/no)"],
      [
        ["Bulk Marks Term Exam", "Botany", "EXIST-1", "88", ""], // valid
        ["Bulk Marks Term Exam", "Chemistry", "EXIST-1", "50", ""], // invalid: subject not set up for this exam
        ["Bulk Marks Term Exam", "Botany", "NOT-A-REAL-ADM", "50", ""], // invalid: bad admission number
      ]
    );
    const result = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "marks", filename: "marks.csv", fileBuffer: file, format: "csv",
    });
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[1].status).toBe("invalid");
    expect(result.rows[1].errors[0]).toMatch(/isn't set up for examination/);
    expect(result.rows[2].status).toBe("invalid");
    expect(result.rows[2].errors[0]).toMatch(/admission number .* was not found/);

    const confirmed = await confirmImport(institutionA, adminAuth, adminUserId, result.batchId);
    expect(confirmed.importedRows).toBe(1);

    const grid = await getMarksGrid(institutionA, adminAuth, examSubject.id);
    const row = grid.find((r) => r.student_id === student.id)!;
    expect(row.marks_obtained).toBe("88.00");
    expect(row.is_absent).toBe(false);

    // A second import for the same student with a BLANK marks cell (and
    // not marked absent) goes through enterMarks() exactly like the manual
    // grid does -- for a still-draft mark, that means "not entered", so it
    // clears the draft row entirely (never forces it to zero) rather than
    // silently overwriting it with 0. See enterMarks()'s own doc comment
    // ("§1.2: a blank, Present cell is 'not entered yet' -- never a row").
    const blankFile = xlsxToCsvLikeRows(
      ["Examination name", "Subject", "Student admission number",
       "Marks obtained (leave blank to leave this student's mark untouched)", "Absent? (yes/no)"],
      [["Bulk Marks Term Exam", "Botany", "EXIST-1", "", ""]]
    );
    const blankStaged = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "marks", filename: "marks-blank.csv", fileBuffer: blankFile, format: "csv",
    });
    expect(blankStaged.rows[0].status).toBe("valid");
    await confirmImport(institutionA, adminAuth, adminUserId, blankStaged.batchId);
    const gridAfterBlank = await getMarksGrid(institutionA, adminAuth, examSubject.id);
    const rowAfterBlank = gridAfterBlank.find((r) => r.student_id === student.id)!;
    expect(rowAfterBlank.marks_obtained).toBeNull();
    expect(rowAfterBlank.mark_id).toBeNull();
  });

  it("marks obtained above the exam_subject's own max marks is invalid", async () => {
    const grid = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "marks",
      filename: "marks-overlimit.csv",
      fileBuffer: xlsxToCsvLikeRows(
        ["Examination name", "Subject", "Student admission number",
         "Marks obtained (leave blank to leave this student's mark untouched)", "Absent? (yes/no)"],
        [["Bulk Marks Term Exam", "Botany", "EXIST-1", "500", ""]]
      ),
      format: "csv",
    });
    expect(grid.rows[0].status).toBe("invalid");
    expect(grid.rows[0].errors[0]).toMatch(/can't exceed/);
  });
});

describe("Confirm: commits valid rows, transactional atomicity across the whole batch (§Q.1)", () => {
  it("confirmImport() inserts every valid row and updates the batch log", async () => {
    const file = xlsxToCsvLikeRows(["Name", "Sort order"], [["Grade 10", "10"]]);
    const staged = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "classes", filename: "confirm-classes.csv", fileBuffer: file, format: "csv",
    });
    expect(staged.validRows).toBe(1);

    const result = await confirmImport(institutionA, adminAuth, adminUserId, staged.batchId);
    expect(result.importedRows).toBe(1);

    const classes = await listClasses(institutionA, adminAuth);
    expect(classes.some((c) => c.name === "Grade 10")).toBe(true);

    const batches = await listRecentImportBatches(institutionA, adminAuth);
    const logged = batches.find((b) => b.id === staged.batchId)!;
    expect(logged.status).toBe("confirmed");
    expect(logged.imported_rows).toBe(1);
  });

  it("confirming an already-confirmed batch throws", async () => {
    const file = xlsxToCsvLikeRows(["Name", "Sort order"], [["Grade 11", "11"]]);
    const staged = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "classes", filename: "double-confirm.csv", fileBuffer: file, format: "csv",
    });
    await confirmImport(institutionA, adminAuth, adminUserId, staged.batchId);
    await expect(confirmImport(institutionA, adminAuth, adminUserId, staged.batchId)).rejects.toThrow(/already been confirmed/);
  });

  it("a mid-batch DB-level failure rolls back the ENTIRE batch, including rows that inserted successfully earlier in the same loop", async () => {
    // Row 1 targets "Grade 7" (stays intact); row 2 targets a class that we
    // delete out from under the batch AFTER staging but BEFORE confirming —
    // simulating data changing between preview and confirm. Row 1 must be
    // processed (and, absent atomicity, committed) before row 2 fails, so
    // this specifically exercises the scopedClient-based single-transaction
    // fix in modules/bulk/service.ts / the create*() functions it calls.
    const toDelete = await createClass(institutionA, adminAuth, adminUserId, { name: "Temporary Grade", sortOrder: 99 });

    const file = xlsxToCsvLikeRows(
      ["Class name", "Section name", "Capacity"],
      [["Grade 7", "RollbackTest", ""], ["Temporary Grade", "RollbackTest2", ""]]
    );
    const staged = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "sections", filename: "atomicity.csv", fileBuffer: file, format: "csv",
    });
    expect(staged.validRows).toBe(2);

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      await scoped.query("delete from classes where id = $1", [toDelete.id]);
    });

    await expect(confirmImport(institutionA, adminAuth, adminUserId, staged.batchId)).rejects.toThrow();

    const sections = await listSections(institutionA, adminAuth);
    expect(sections.some((s) => s.name === "RollbackTest")).toBe(false); // row 1 rolled back too, not left half-committed
    expect(sections.some((s) => s.name === "RollbackTest2")).toBe(false);

    const batches = await listRecentImportBatches(institutionA, adminAuth);
    const logged = batches.find((b) => b.id === staged.batchId)!;
    expect(logged.status).toBe("staged"); // the failed confirmImport()'s status update never committed either
  });

  it("confirming an unknown batch id throws", async () => {
    await expect(confirmImport(institutionA, adminAuth, adminUserId, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/not found/);
  });
});

describe("Export (§Q.2) — raw CSV/XLSX, same query layer as everywhere else", () => {
  it("exports students to CSV with the expected columns and rows", async () => {
    const def = exportDefinitions.students;
    const rows = await def.fetch(institutionA, adminAuth);
    expect(rows.some((r) => r.admission_number === "EXIST-1")).toBe(true);
    const buffer = await exportRows("csv", def.label, def.columns, rows);
    const text = buffer.toString("utf-8");
    expect(text.split("\n")[0]).toBe(def.columns.map((c) => c.label).join(","));
    expect(text).toContain("EXIST-1");
  });

  it("exports to XLSX as a real, non-empty workbook", async () => {
    const def = exportDefinitions.classes;
    const rows = await def.fetch(institutionA, adminAuth);
    const buffer = await exportRows("xlsx", def.label, def.columns, rows);
    expect(buffer.length).toBeGreaterThan(0);
  });
});

describe("Permission boundaries (§F.3)", () => {
  it("teacher lacks data.import/data.export; institution_admin has both", async () => {
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "data.import")).toThrow(/Forbidden/);
    expect(() => requirePermission(teacherPerms, "data.export")).toThrow(/Forbidden/);

    const adminPerms = await getPermissionsForUser(adminAuth, adminUserId, institutionA);
    expect(() => requirePermission(adminPerms, "data.import")).not.toThrow();
    expect(() => requirePermission(adminPerms, "data.export")).not.toThrow();
  });

  // §"mark entry also should be available for bulk upload" -- "usable by
  // an admin/management user only ... do NOT expose it to teachers": the
  // "marks" entity type is gated by the SAME single data.import check the
  // Import/Export page (app/(institution)/import/page.tsx) already applies
  // uniformly to every entity type in the dropdown (including
  // "Examinations" and "Daily Assessment Marks" above) -- not a per-entity
  // permission -- so a teacher lacking data.import is rejected before ever
  // reaching stageImport()/confirmImport() for "marks" specifically, same
  // as for any other entity type.
  it("a teacher (no data.import) is rejected for the 'marks' entity type the same way as any other", async () => {
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(listImportEntityTypes().some((e) => e.entityType === "marks")).toBe(true);
    expect(() => requirePermission(teacherPerms, "data.import")).toThrow(/Forbidden/);
  });
});

describe("Tenant isolation (§E, extended to migration 0016)", () => {
  it("Institution B never sees Institution A's import batches", async () => {
    const db = await getDbClient();
    const adminB = await seedDemoUser(db, institutionB, "admin@bulk-b.example", "Bulk B Admin");
    const batchesB = await listRecentImportBatches(institutionB, adminB.authUserId);
    expect(batchesB).toHaveLength(0);

    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const rows = await scoped.query("select id from import_batches where institution_id = $1", [institutionA]);
      expect(rows.rows).toHaveLength(0);
    });
  });

  it("a students import staged in Institution A cannot be confirmed against Institution B's context", async () => {
    const file = xlsxToCsvLikeRows(["Admission number", "Full name"], [["ISO-1", "Isolation Test"]]);
    const staged = await stageImport(institutionA, adminAuth, adminUserId, {
      entityType: "students", filename: "iso.csv", fileBuffer: file, format: "csv",
    });
    const db = await getDbClient();
    const adminB2 = await seedDemoUser(db, institutionB, "admin2@bulk-b.example", "Bulk B Admin 2");
    await expect(confirmImport(institutionB, adminB2.authUserId, adminB2.userId, staged.batchId)).rejects.toThrow(/not found/);

    // Institution A's own students list must be unaffected either way
    const studentsA = await listStudents(institutionA, adminAuth);
    expect(studentsA.some((s) => s.admission_number === "ISO-1")).toBe(false);
  });
});
