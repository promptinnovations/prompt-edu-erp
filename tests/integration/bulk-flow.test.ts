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
import { createClass, listClasses, listSections, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, listStudents, enrollStudent } from "../../modules/students/service";
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

  await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 6", sortOrder: 6 });
  await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 7", sortOrder: 7 });
  await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "EXIST-1", fullName: "Existing Student" });
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
      ["achievements", "classes", "enrollments", "library_books", "parents", "sections", "staff",
        "student_logins", "students", "subjects"].sort()
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

  it("students: admission number required + unique, date format validated", async () => {
    const file = xlsxToCsvLikeRows(
      ["Admission number", "Full name", "Date of birth (YYYY-MM-DD)", "Gender"],
      [
        ["NEW-100", "Zainab Ali", "2013-01-15", "female"],
        ["EXIST-1", "Someone Else", "", ""], // duplicate of an existing DB row
        ["NEW-101", "Bad Date Kid", "not-a-date", ""],
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
