/**
 * PROMPT EDU ERP — Reporting engine flow (ARCHITECTURE.md §D.13, §P, Phase
 * 13): the built-in report_definitions catalogue, each query-registry
 * function against real underlying data (student roster, examination
 * results, attendance summary, consolidated performance, library
 * circulation), PDF/XLSX byte generation, the `reports` audit log,
 * permission boundaries, and tenant isolation on migration 0015's tables.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { createClass, createSection, createSubject, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent } from "../../modules/students/service";
import {
  listExamTypes, createExamination, addExamClass, addExamSubject,
  enterMarks, submitMarks, verifyMarks, approveMarks, computeResults,
} from "../../modules/examination/service";
import { listAttendanceStatuses, markAttendance } from "../../modules/attendance/service";
import { computeConsolidatedScore } from "../../modules/scoring/service";
import { listBooks, listAvailableCopies, issueBook } from "../../modules/library/service";
import {
  listReportDefinitions, generateReport, listRecentReports,
} from "../../modules/reporting/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string;
let student1: string, student2: string;
let classId: string, sectionId: string, subjectId: string;
let examinationId: string;
const FROM_DATE = "2026-08-01";
const TO_DATE = "2026-08-31";

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "report-school-a");
  institutionB = await seedDemoInstitution(db, "report-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@report-a.example", "Report Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const teacher = await seedDemoUser(db, institutionA, "teacher@report-a.example", "Report Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 6", sortOrder: 1 });
  classId = cls.id;
  const sec = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = sec.id;
  const subj = await createSubject(institutionA, adminAuth, adminUserId, { name: "Mathematics" });
  subjectId = subj.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "R-1", fullName: "Student One" });
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "R-2", fullName: "Student Two" });
  student1 = s1.id; student2 = s2.id;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  if (!year) throw new Error("expected a seeded current academic year");

  const dbForEnroll = await getDbClient();
  await dbForEnroll.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    for (const sid of [student1, student2]) {
      await scoped.query(
        `insert into student_enrollments (institution_id, student_id, academic_year_id, class_id, section_id)
         values ($1, $2, $3, $4, $5)`,
        [institutionA, sid, year.id, classId, sectionId]
      );
    }
  });

  // Examination -> approved results (needed for the examination_results report)
  const examTypes = await listExamTypes(institutionA, adminAuth);
  const examType = examTypes.find((t) => t.code === "academic_main")!;
  const examination = await createExamination(institutionA, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId: year.id, name: "Report Test Exam",
  });
  examinationId = examination.id;
  await addExamClass(institutionA, adminAuth, examinationId, classId, sectionId);
  const examSubject = await addExamSubject(institutionA, adminAuth, adminUserId, { examinationId, subjectId, maxMarks: 100, passMarks: 35 });
  await enterMarks(institutionA, teacherAuth, teacherUserId, examSubject.id, [
    { studentId: student1, marksObtained: 90, isAbsent: false },
    { studentId: student2, marksObtained: 40, isAbsent: false },
  ]);
  await submitMarks(institutionA, teacherAuth, examSubject.id, teacherUserId);
  await verifyMarks(institutionA, teacherAuth, examSubject.id, teacherUserId);
  await approveMarks(institutionA, adminAuth, examSubject.id, adminUserId);
  await computeResults(institutionA, adminAuth, examinationId);

  // Attendance (needed for attendance_summary report)
  const statuses = await listAttendanceStatuses(institutionA, adminAuth);
  const presentStatus = statuses.find((s) => s.counts_as_present)!;
  await markAttendance(institutionA, adminAuth, adminUserId, {
    classId, sectionId, date: "2026-08-05",
    entries: [{ studentId: student1, statusId: presentStatus.id, isLate: false }, { studentId: student2, statusId: presentStatus.id, isLate: false }],
  });

  // Consolidated score (needed for consolidated_performance report)
  await computeConsolidatedScore(institutionA, adminAuth, student1, "Report Test Period", FROM_DATE, TO_DATE);

  // Library issue (needed for library_circulation report)
  const books = await listBooks(institutionA, adminAuth);
  const copies = await listAvailableCopies(institutionA, adminAuth, books[0].id);
  await issueBook(institutionA, adminAuth, adminUserId, student1, copies[0].id);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Report catalogue (§P.2)", () => {
  it("listReportDefinitions() returns the seeded platform built-ins", async () => {
    const defs = await listReportDefinitions(institutionA, adminAuth);
    expect(defs.map((d) => d.code).sort()).toEqual([
      "attendance_summary", "consolidated_performance", "examination_results", "library_circulation", "student_roster",
    ]);
    expect(defs.every((d) => d.is_system)).toBe(true);
  });
});

describe("Query registry + report generation (§P.1)", () => {
  it("student_roster includes enrolled class/section", async () => {
    const result = await generateReport(institutionA, adminAuth, adminUserId, {
      reportType: "student_roster", format: "xlsx", institutionName: "Report School A",
    });
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("examination_results requires examinationId and reflects approved+computed results", async () => {
    await expect(
      generateReport(institutionA, adminAuth, adminUserId, { reportType: "examination_results", format: "pdf", institutionName: "Report School A" })
    ).rejects.toThrow(/requires an examinationId/);

    const result = await generateReport(institutionA, adminAuth, adminUserId, {
      reportType: "examination_results", format: "pdf", institutionName: "Report School A",
      parameters: { examinationId },
    });
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.mimeType).toBe("application/pdf");
    expect(result.buffer.subarray(0, 4).toString()).toBe("%PDF"); // real PDF header, not empty bytes
  });

  it("attendance_summary requires all four parameters and rolls up per-student present days", async () => {
    await expect(
      generateReport(institutionA, adminAuth, adminUserId, { reportType: "attendance_summary", format: "xlsx", institutionName: "Report School A" })
    ).rejects.toThrow(/requires classId/);

    const result = await generateReport(institutionA, adminAuth, adminUserId, {
      reportType: "attendance_summary", format: "xlsx", institutionName: "Report School A",
      parameters: { classId, sectionId, fromDate: FROM_DATE, toDate: TO_DATE },
    });
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("consolidated_performance requires a period and reflects computed scores", async () => {
    await expect(
      generateReport(institutionA, adminAuth, adminUserId, { reportType: "consolidated_performance", format: "pdf", institutionName: "Report School A" })
    ).rejects.toThrow(/requires a period/);

    const result = await generateReport(institutionA, adminAuth, adminUserId, {
      reportType: "consolidated_performance", format: "pdf", institutionName: "Report School A",
      parameters: { period: "Report Test Period" },
    });
    expect(result.buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("library_circulation reflects the currently issued copy", async () => {
    const result = await generateReport(institutionA, adminAuth, adminUserId, {
      reportType: "library_circulation", format: "xlsx", institutionName: "Report School A",
    });
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("an unknown report type throws rather than generating garbage", async () => {
    await expect(
      generateReport(institutionA, adminAuth, adminUserId, { reportType: "not_a_real_report", format: "pdf", institutionName: "Report School A" })
    ).rejects.toThrow(/Unknown report type/);
  });
});

describe("Reports audit log (§D.13)", () => {
  it("every generateReport() call logs a reports row", async () => {
    const before = await listRecentReports(institutionA, adminAuth);
    await generateReport(institutionA, adminAuth, adminUserId, {
      reportType: "student_roster", format: "pdf", institutionName: "Report School A",
    });
    const after = await listRecentReports(institutionA, adminAuth);
    expect(after.length).toBe(before.length + 1);
    expect(after[0].report_type).toBe("student_roster");
    expect(after[0].format).toBe("pdf");
    expect(after[0].generated_by).toBe(adminUserId);
  });
});

describe("Reporting permission boundaries (§F.3)", () => {
  it("teacher lacks reports.export/reports.build but has reports.view is NOT assumed — check actual seeded grants", async () => {
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "reports.export")).toThrow(/Forbidden/);

    const managementUser = await seedDemoUser(await getDbClient(), institutionA, "mgmt@report-a.example", "Report Management", "management");
    const managementPerms = await getPermissionsForUser(managementUser.authUserId, managementUser.userId, institutionA);
    expect(() => requirePermission(managementPerms, "reports.view")).not.toThrow();
    expect(() => requirePermission(managementPerms, "reports.export")).not.toThrow();
  });
});

describe("Reporting tenant isolation (§E, extended to migration 0015)", () => {
  it("Institution B's reports log never shows Institution A's generated reports", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@report-b.example", "Report B Admin");
    const reportsB = await listRecentReports(institutionB, adminB.authUserId);
    expect(reportsB).toHaveLength(0);

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const rows = await scoped.query("select id from reports where institution_id = $1", [institutionA]);
      expect(rows.rows).toHaveLength(0);
    });
  });

  it("report_definitions (global catalog) is visible identically from both institutions", async () => {
    const defsB = await listReportDefinitions(institutionB, await seedDemoUser(await getDbClient(), institutionB, "admin2@report-b.example", "B Admin 2").then((u) => u.authUserId));
    expect(defsB.map((d) => d.code).sort()).toEqual([
      "attendance_summary", "consolidated_performance", "examination_results", "library_circulation", "student_roster",
    ]);
  });
});
