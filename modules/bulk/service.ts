/**
 * PROMPT EDU ERP — Bulk import/export engine.
 * ARCHITECTURE.md §Q (Bulk Import/Export Architecture), Phase 14 (§AA.2).
 *
 * §Q.1 "one schema, two entry points": every EntityImportDefinition's
 * `insertRow()` calls the SAME service function (`createStudent()`,
 * `createStaffMember()`, ...) the manual-entry UI calls — the Zod schema
 * inside each of those functions is the one and only validation source of
 * truth. A bulk import never inserts unvalidated rows (§Q.1 "validation
 * always runs server-side"): stageImport() runs parseRow() (field/type/
 * referential/duplicate checks) up front, and confirmImport() re-uses
 * insertRow(), which re-validates via the same Zod schema anyway — so a
 * row can never reach the database without passing validation twice.
 *
 * §Q.1 pipeline: stageImport() (parse+validate, persist a preview to
 * import_batches) -> confirmImport() (insert every 'valid' row inside ONE
 * withInstitutionContext call, which is already one transaction per
 * migration 0001's db client design — any row-level DB failure during
 * commit rolls back the whole batch, matching the spec's "never a
 * partially corrupted import").
 */
import ExcelJS from "exceljs";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { createClass, createSection, createSubject, listClasses, listSections, listSubjects } from "../academic/service";
import { createStudent, createParent, linkParentToStudent, listStudents } from "../students/service";
import { createStaffMember, listStaff } from "../staff/service";
import { createBook } from "../library/service";
import { submitAchievement, listAchievementCategories, listAchievementLevels } from "../achievements/service";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------
export interface ImportColumn { key: string; label: string; required: boolean }
export interface ParsedRow {
  rowNumber: number;
  status: "valid" | "invalid" | "duplicate";
  data: Record<string, unknown> | null;
  raw: Record<string, string>;
  errors: string[];
}

type ParseOutcome =
  | { status: "valid"; data: Record<string, unknown>; dedupeKey: string | null }
  | { status: "invalid"; errors: string[] };

interface EntityImportDefinition {
  entityType: string;
  label: string;
  columns: ImportColumn[];
  sampleRow: Record<string, string>;
  /** Prefetched once per stageImport() call — existing rows / lookup maps
   *  each row's parseRow() needs, so validating N rows is O(1) queries,
   *  not O(N) (§Q.1 "duplicate detection... referential checks" at scale). */
  prepareContext(institutionId: string, authUserId: string): Promise<Record<string, unknown>>;
  parseRow(raw: Record<string, string>, context: Record<string, unknown>): ParseOutcome;
  /** `scoped` is the ALREADY-OPEN transactional client confirmImport() is
   *  itself running inside of — every insertRow() implementation MUST pass
   *  it straight through to the underlying create-or-submit function (as that
   *  function's optional trailing scopedClient param) rather than letting
   *  that call open its own separate transaction, or a mid-batch failure
   *  would not roll back rows already committed earlier in the same batch
   *  (§Q.1 "any row-level failure during commit rolls back that batch"). */
  insertRow(institutionId: string, authUserId: string, userId: string, data: Record<string, unknown>, scoped: DbClient): Promise<void>;
}

/** Excel worksheet names may not contain any of : \\ / ? * [ ] and are
 *  capped at 31 characters -- several entity labels here ("Parents /
 *  guardians") and, in principle, any future report/entity name could
 *  contain one of those characters, so every addWorksheet() call in this
 *  file goes through this rather than a raw .slice(0, 31). */
function safeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
}

function normKey(s: string | undefined | null): string {
  return (s ?? "").trim().toLowerCase();
}
function req(raw: Record<string, string>, key: string, errors: string[]): string {
  const v = (raw[key] ?? "").trim();
  if (!v) errors.push(`"${key}" is required.`);
  return v;
}

// ---------------------------------------------------------------------------
// Entity import definitions (§Q.3 v1 targets — subset built this phase;
// marks/attendance import is a documented follow-up, see docs/SETUP.md,
// since both need an extra selection parameter — an exam subject, or a
// class/section/date — beyond the generic "one file, one entity type"
// shape every other entity here fits, and both already have dedicated
// grid-entry UIs covering day-to-day use)
// ---------------------------------------------------------------------------

const classesDefinition: EntityImportDefinition = {
  entityType: "classes",
  label: "Classes",
  columns: [
    { key: "name", label: "Name", required: true },
    { key: "sortOrder", label: "Sort order", required: false },
  ],
  sampleRow: { name: "Grade 6", sortOrder: "6" },
  async prepareContext(institutionId, authUserId) {
    const existing = await listClasses(institutionId, authUserId);
    return { existingNames: new Set(existing.map((c) => normKey(c.name))) };
  },
  parseRow(raw, context) {
    const errors: string[] = [];
    const name = req(raw, "name", errors);
    if (errors.length > 0) return { status: "invalid", errors };
    const key = normKey(name);
    const existingNames = context.existingNames as Set<string>;
    if (existingNames.has(key)) return { status: "invalid", errors: [`Class "${name}" already exists.`] };
    const sortOrderRaw = (raw.sortOrder ?? "").trim();
    const sortOrder = sortOrderRaw ? Number(sortOrderRaw) : 0;
    if (sortOrderRaw && Number.isNaN(sortOrder)) return { status: "invalid", errors: [`"sortOrder" must be a number.`] };
    return { status: "valid", data: { name, sortOrder }, dedupeKey: key };
  },
  async insertRow(institutionId, authUserId, userId, data, scoped) {
    await createClass(institutionId, authUserId, userId, { name: data.name as string, sortOrder: data.sortOrder as number }, scoped);
  },
};

const sectionsDefinition: EntityImportDefinition = {
  entityType: "sections",
  label: "Sections",
  columns: [
    { key: "className", label: "Class name", required: true },
    { key: "name", label: "Section name", required: true },
    { key: "capacity", label: "Capacity", required: false },
  ],
  sampleRow: { className: "Grade 6", name: "A", capacity: "30" },
  async prepareContext(institutionId, authUserId) {
    const [classes, sections] = await Promise.all([listClasses(institutionId, authUserId), listSections(institutionId, authUserId)]);
    return {
      classesByName: new Map(classes.map((c) => [normKey(c.name), c.id])),
      existingKeys: new Set(sections.map((s) => `${s.class_id}:${normKey(s.name)}`)),
    };
  },
  parseRow(raw, context) {
    const errors: string[] = [];
    const className = req(raw, "className", errors);
    const name = req(raw, "name", errors);
    if (errors.length > 0) return { status: "invalid", errors };
    const classesByName = context.classesByName as Map<string, string>;
    const classId = classesByName.get(normKey(className));
    if (!classId) return { status: "invalid", errors: [`Class "${className}" was not found in this institution.`] };
    const key = `${classId}:${normKey(name)}`;
    const existingKeys = context.existingKeys as Set<string>;
    if (existingKeys.has(key)) return { status: "invalid", errors: [`Section "${name}" already exists in class "${className}".`] };
    const capacityRaw = (raw.capacity ?? "").trim();
    const capacity = capacityRaw ? Number(capacityRaw) : null;
    if (capacityRaw && Number.isNaN(capacity)) return { status: "invalid", errors: [`"capacity" must be a number.`] };
    return { status: "valid", data: { classId, name, capacity }, dedupeKey: key };
  },
  async insertRow(institutionId, authUserId, userId, data, scoped) {
    await createSection(institutionId, authUserId, userId, {
      classId: data.classId as string, name: data.name as string, capacity: (data.capacity as number | null) ?? null,
    }, scoped);
  },
};

const subjectsDefinition: EntityImportDefinition = {
  entityType: "subjects",
  label: "Subjects",
  columns: [
    { key: "name", label: "Name", required: true },
    { key: "code", label: "Code", required: false },
  ],
  sampleRow: { name: "Mathematics", code: "MATH" },
  async prepareContext(institutionId, authUserId) {
    const existing = await listSubjects(institutionId, authUserId);
    return { existingNames: new Set(existing.map((s) => normKey(s.name))) };
  },
  parseRow(raw, context) {
    const errors: string[] = [];
    const name = req(raw, "name", errors);
    if (errors.length > 0) return { status: "invalid", errors };
    const key = normKey(name);
    const existingNames = context.existingNames as Set<string>;
    if (existingNames.has(key)) return { status: "invalid", errors: [`Subject "${name}" already exists.`] };
    const code = (raw.code ?? "").trim() || null;
    return { status: "valid", data: { name, code }, dedupeKey: key };
  },
  async insertRow(institutionId, authUserId, userId, data, scoped) {
    await createSubject(institutionId, authUserId, userId, { name: data.name as string, code: data.code as string | null }, scoped);
  },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const studentsDefinition: EntityImportDefinition = {
  entityType: "students",
  label: "Students",
  columns: [
    { key: "admissionNumber", label: "Admission number", required: true },
    { key: "fullName", label: "Full name", required: true },
    { key: "dateOfBirth", label: "Date of birth (YYYY-MM-DD)", required: false },
    { key: "gender", label: "Gender", required: false },
  ],
  sampleRow: { admissionNumber: "2026-001", fullName: "Ahmed Ali", dateOfBirth: "2012-05-14", gender: "male" },
  async prepareContext(institutionId, authUserId) {
    const existing = await listStudents(institutionId, authUserId);
    return { existingAdmissionNumbers: new Set(existing.map((s) => normKey(s.admission_number))) };
  },
  parseRow(raw, context) {
    const errors: string[] = [];
    const admissionNumber = req(raw, "admissionNumber", errors);
    const fullName = req(raw, "fullName", errors); // Unicode-safe — any script (§S.3)
    const dateOfBirth = (raw.dateOfBirth ?? "").trim() || null;
    if (dateOfBirth && !DATE_RE.test(dateOfBirth)) errors.push(`"dateOfBirth" must be YYYY-MM-DD.`);
    if (errors.length > 0) return { status: "invalid", errors };
    const key = normKey(admissionNumber);
    const existingAdmissionNumbers = context.existingAdmissionNumbers as Set<string>;
    if (existingAdmissionNumbers.has(key)) return { status: "invalid", errors: [`Admission number "${admissionNumber}" already exists.`] };
    const gender = (raw.gender ?? "").trim() || null;
    return { status: "valid", data: { admissionNumber, fullName, dateOfBirth, gender }, dedupeKey: key };
  },
  async insertRow(institutionId, authUserId, userId, data, scoped) {
    await createStudent(institutionId, authUserId, userId, {
      admissionNumber: data.admissionNumber as string, fullName: data.fullName as string,
      dateOfBirth: data.dateOfBirth as string | null, gender: data.gender as string | null,
    }, scoped);
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parentsDefinition: EntityImportDefinition = {
  entityType: "parents",
  label: "Parents / guardians",
  columns: [
    { key: "fullName", label: "Full name", required: true },
    { key: "phone", label: "Phone", required: false },
    { key: "email", label: "Email", required: false },
    { key: "occupation", label: "Occupation", required: false },
    { key: "studentAdmissionNumber", label: "Link to student (admission number)", required: false },
    { key: "relationship", label: "Relationship", required: false },
  ],
  sampleRow: { fullName: "Fathima Beevi", phone: "9876543210", email: "", occupation: "", studentAdmissionNumber: "2026-001", relationship: "Mother" },
  async prepareContext(institutionId, authUserId) {
    const students = await listStudents(institutionId, authUserId);
    return { studentsByAdmission: new Map(students.map((s) => [normKey(s.admission_number), s.id])) };
  },
  parseRow(raw, context) {
    const errors: string[] = [];
    const fullName = req(raw, "fullName", errors);
    const email = (raw.email ?? "").trim() || null;
    if (email && !EMAIL_RE.test(email)) errors.push(`"email" is not a valid email address.`);
    const studentAdmissionNumber = (raw.studentAdmissionNumber ?? "").trim() || null;
    let studentId: string | null = null;
    if (studentAdmissionNumber) {
      const studentsByAdmission = context.studentsByAdmission as Map<string, string>;
      studentId = studentsByAdmission.get(normKey(studentAdmissionNumber)) ?? null;
      if (!studentId) errors.push(`Student admission number "${studentAdmissionNumber}" was not found.`);
    }
    if (errors.length > 0) return { status: "invalid", errors };
    return {
      status: "valid",
      dedupeKey: email ? normKey(email) : null,
      data: {
        fullName, phone: (raw.phone ?? "").trim() || null, email, occupation: (raw.occupation ?? "").trim() || null,
        studentId, relationship: (raw.relationship ?? "").trim() || null,
      },
    };
  },
  async insertRow(institutionId, authUserId, userId, data, scoped) {
    const parent = await createParent(institutionId, authUserId, userId, {
      fullName: data.fullName as string, phone: data.phone as string | null,
      email: data.email as string | null, occupation: data.occupation as string | null,
    }, scoped);
    if (data.studentId) {
      await linkParentToStudent(institutionId, authUserId, userId, {
        studentId: data.studentId as string, parentId: parent.id,
        relationship: data.relationship as string | null, isPrimaryContact: false,
      }, scoped);
    }
  },
};

const EMPLOYMENT_STATUSES = new Set(["active", "on_leave", "resigned", "terminated"]);

const staffDefinition: EntityImportDefinition = {
  entityType: "staff",
  label: "Staff",
  columns: [
    { key: "email", label: "Email", required: true },
    { key: "fullName", label: "Full name", required: true },
    { key: "staffCode", label: "Staff code", required: true },
    { key: "designation", label: "Designation", required: false },
    { key: "department", label: "Department", required: false },
    { key: "employmentStatus", label: "Employment status (active/on_leave/resigned/terminated)", required: false },
  ],
  sampleRow: { email: "teacher2@example.com", fullName: "Yusuf Khan", staffCode: "STF-002", designation: "Teacher", department: "Academics", employmentStatus: "active" },
  async prepareContext(institutionId, authUserId) {
    const existing = await listStaff(institutionId, authUserId);
    return {
      existingEmails: new Set(existing.map((s) => normKey(s.email))),
      existingStaffCodes: new Set(existing.map((s) => normKey(s.staff_code))),
    };
  },
  parseRow(raw, context) {
    const errors: string[] = [];
    const email = req(raw, "email", errors);
    const fullName = req(raw, "fullName", errors);
    const staffCode = req(raw, "staffCode", errors);
    if (email && !EMAIL_RE.test(email)) errors.push(`"email" is not a valid email address.`);
    const employmentStatusRaw = (raw.employmentStatus ?? "").trim() || "active";
    if (!EMPLOYMENT_STATUSES.has(employmentStatusRaw)) errors.push(`"employmentStatus" must be one of active/on_leave/resigned/terminated.`);
    if (errors.length > 0) return { status: "invalid", errors };
    const existingEmails = context.existingEmails as Set<string>;
    const existingStaffCodes = context.existingStaffCodes as Set<string>;
    if (existingEmails.has(normKey(email))) return { status: "invalid", errors: [`Staff email "${email}" already exists.`] };
    if (existingStaffCodes.has(normKey(staffCode))) return { status: "invalid", errors: [`Staff code "${staffCode}" already exists.`] };
    return {
      status: "valid", dedupeKey: normKey(email),
      data: {
        email, fullName, staffCode,
        designation: (raw.designation ?? "").trim() || null,
        department: (raw.department ?? "").trim() || null,
        employmentStatus: employmentStatusRaw,
      },
    };
  },
  async insertRow(institutionId, authUserId, userId, data, scoped) {
    await createStaffMember(institutionId, authUserId, userId, {
      email: data.email as string, fullName: data.fullName as string, staffCode: data.staffCode as string,
      designation: data.designation as string | null, department: data.department as string | null,
      employmentStatus: data.employmentStatus as "active" | "on_leave" | "resigned" | "terminated",
    }, scoped);
  },
};

const libraryBooksDefinition: EntityImportDefinition = {
  entityType: "library_books",
  label: "Library books",
  columns: [
    { key: "title", label: "Title", required: true },
    { key: "copyCount", label: "Number of copies", required: false },
  ],
  sampleRow: { title: "Risale-i Nur", copyCount: "2" },
  // No dedupe: a real library catalogue can legitimately have more than one
  // title row (e.g. a new edition) with the same display title — see
  // docs/SETUP.md.
  async prepareContext() {
    return {};
  },
  parseRow(raw) {
    const errors: string[] = [];
    const title = req(raw, "title", errors);
    const copyCountRaw = (raw.copyCount ?? "").trim();
    const copyCount = copyCountRaw ? Number(copyCountRaw) : 1;
    if (copyCountRaw && (Number.isNaN(copyCount) || copyCount < 0)) errors.push(`"copyCount" must be a non-negative number.`);
    if (errors.length > 0) return { status: "invalid", errors };
    return { status: "valid", dedupeKey: null, data: { title, copyCount } };
  },
  async insertRow(institutionId, authUserId, userId, data, scoped) {
    await createBook(institutionId, authUserId, userId, { title: data.title as string, copyCount: data.copyCount as number }, scoped);
  },
};

const achievementsDefinition: EntityImportDefinition = {
  entityType: "achievements",
  label: "Achievements",
  columns: [
    { key: "studentAdmissionNumber", label: "Student admission number", required: true },
    { key: "categoryName", label: "Category", required: true },
    { key: "levelName", label: "Level", required: true },
    { key: "title", label: "Title", required: true },
    { key: "position", label: "Position", required: false },
    { key: "points", label: "Points", required: false },
  ],
  sampleRow: { studentAdmissionNumber: "2026-001", categoryName: "Sports", levelName: "District", title: "Football tournament runner-up", position: "2nd", points: "10" },
  async prepareContext(institutionId, authUserId) {
    const [students, categories, levels] = await Promise.all([
      listStudents(institutionId, authUserId),
      listAchievementCategories(institutionId, authUserId),
      listAchievementLevels(institutionId, authUserId),
    ]);
    return {
      studentsByAdmission: new Map(students.map((s) => [normKey(s.admission_number), s.id])),
      categoriesByName: new Map(categories.map((c) => [normKey(c.name), c.id])),
      levelsByName: new Map(levels.map((l) => [normKey(l.name), l.id])),
    };
  },
  parseRow(raw, context) {
    const errors: string[] = [];
    const studentAdmissionNumber = req(raw, "studentAdmissionNumber", errors);
    const categoryName = req(raw, "categoryName", errors);
    const levelName = req(raw, "levelName", errors);
    const title = req(raw, "title", errors);
    if (errors.length > 0) return { status: "invalid", errors };
    const studentsByAdmission = context.studentsByAdmission as Map<string, string>;
    const categoriesByName = context.categoriesByName as Map<string, string>;
    const levelsByName = context.levelsByName as Map<string, string>;
    const studentId = studentsByAdmission.get(normKey(studentAdmissionNumber));
    if (!studentId) errors.push(`Student admission number "${studentAdmissionNumber}" was not found.`);
    const categoryId = categoriesByName.get(normKey(categoryName));
    if (!categoryId) errors.push(`Achievement category "${categoryName}" was not found.`);
    const levelId = levelsByName.get(normKey(levelName));
    if (!levelId) errors.push(`Achievement level "${levelName}" was not found.`);
    if (errors.length > 0) return { status: "invalid", errors };
    const pointsRaw = (raw.points ?? "").trim();
    const points = pointsRaw ? Number(pointsRaw) : null;
    if (pointsRaw && Number.isNaN(points)) return { status: "invalid", errors: [`"points" must be a number.`] };
    return {
      status: "valid", dedupeKey: null,
      data: { studentId, categoryId, levelId, title, position: (raw.position ?? "").trim() || null, points },
    };
  },
  async insertRow(institutionId, authUserId, userId, data, scoped) {
    await submitAchievement(institutionId, authUserId, userId, {
      studentId: data.studentId as string, categoryId: data.categoryId as string, levelId: data.levelId as string,
      title: data.title as string, position: data.position as string | null, points: data.points as number | null,
    }, scoped);
  },
};

const registry: Record<string, EntityImportDefinition> = {
  classes: classesDefinition,
  sections: sectionsDefinition,
  subjects: subjectsDefinition,
  students: studentsDefinition,
  parents: parentsDefinition,
  staff: staffDefinition,
  library_books: libraryBooksDefinition,
  achievements: achievementsDefinition,
};

export function listImportEntityTypes(): { entityType: string; label: string; columns: ImportColumn[] }[] {
  return Object.values(registry).map((d) => ({ entityType: d.entityType, label: d.label, columns: d.columns }));
}

// ---------------------------------------------------------------------------
// Template generation (§Q.1 "Download Template... generated from the same
// field/validation schema used for manual entry")
// ---------------------------------------------------------------------------
export async function generateImportTemplate(entityType: string): Promise<Buffer> {
  const definition = registry[entityType];
  if (!definition) throw new Error(`Unknown import entity type "${entityType}".`);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(safeSheetName(definition.label));
  sheet.addRow(definition.columns.map((c) => c.label));
  sheet.addRow(definition.columns.map((c) => definition.sampleRow[c.key] ?? ""));
  sheet.columns.forEach((col) => { col.width = 24; });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// Parsing uploaded files (XLSX via exceljs; CSV via a small RFC4180-ish parser)
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows;
}

async function parseUploadedFile(fileBuffer: Buffer, format: "xlsx" | "csv"): Promise<string[][]> {
  if (format === "csv") {
    return parseCsv(fileBuffer.toString("utf-8"));
  }
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled Buffer type predates @types/node's newer generic
  // Buffer<TArrayBuffer> shape (maxByteLength/resizable/...), so a real
  // Node Buffer structurally fails its declared parameter type even
  // though it's exactly what the library expects at runtime.
  await workbook.xlsx.load(fileBuffer as never);
  const sheet = workbook.worksheets[0];
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = (row.values as unknown[]).slice(1); // exceljs row.values is 1-indexed with a leading empty slot
    rows.push(values.map((v) => (v === null || v === undefined ? "" : String(v))));
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Stage (parse + validate + preview) — §Q.1
// ---------------------------------------------------------------------------
export interface StageResult {
  batchId: string; entityType: string; totalRows: number; validRows: number; invalidRows: number; duplicateRows: number;
  rows: ParsedRow[];
}

export async function stageImport(
  institutionId: string, authUserId: string, userId: string,
  input: { entityType: string; filename: string; fileBuffer: Buffer; format: "xlsx" | "csv" }
): Promise<StageResult> {
  const definition = registry[input.entityType];
  if (!definition) throw new Error(`Unknown import entity type "${input.entityType}".`);

  const table = await parseUploadedFile(input.fileBuffer, input.format);
  if (table.length === 0) throw new Error("The uploaded file has no rows.");
  const header = table[0].map((h) => h.trim());
  const dataRows = table.slice(1);

  // Map header labels (or raw keys) back to column keys, tolerant of either
  // the exact template header labels or the raw column keys.
  const labelToKey = new Map<string, string>();
  for (const col of definition.columns) {
    labelToKey.set(normKey(col.label), col.key);
    labelToKey.set(normKey(col.key), col.key);
  }
  const columnOrder = header.map((h) => labelToKey.get(normKey(h)) ?? null);

  const context = await definition.prepareContext(institutionId, authUserId);
  const seenKeys = new Set<string>();
  const rows: ParsedRow[] = [];
  let validCount = 0, invalidCount = 0, duplicateCount = 0;

  dataRows.forEach((rawRow, idx) => {
    const rowNumber = idx + 2; // account for header row, 1-indexed for humans
    const raw: Record<string, string> = {};
    columnOrder.forEach((key, colIdx) => {
      if (key) raw[key] = (rawRow[colIdx] ?? "").trim();
    });
    if (Object.values(raw).every((v) => v === "")) return; // skip fully blank rows

    const outcome = definition.parseRow(raw, context);
    if (outcome.status === "invalid") {
      invalidCount++;
      rows.push({ rowNumber, status: "invalid", data: null, raw, errors: outcome.errors });
      return;
    }
    if (outcome.dedupeKey && seenKeys.has(outcome.dedupeKey)) {
      duplicateCount++;
      rows.push({ rowNumber, status: "duplicate", data: null, raw, errors: [`Duplicate of another row earlier in this file.`] });
      return;
    }
    if (outcome.dedupeKey) seenKeys.add(outcome.dedupeKey);
    validCount++;
    rows.push({ rowNumber, status: "valid", data: outcome.data, raw, errors: [] });
  });

  const db = await getDbClient();
  const { rows: batchRows } = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    return scoped.query<{ id: string }>(
      `insert into import_batches (institution_id, entity_type, filename, status, total_rows, valid_rows, invalid_rows, duplicate_rows, rows_jsonb, staged_by)
       values ($1, $2, $3, 'staged', $4, $5, $6, $7, $8, $9) returning id`,
      [institutionId, input.entityType, input.filename, rows.length, validCount, invalidCount, duplicateCount, JSON.stringify(rows), userId]
    );
  });

  return { batchId: batchRows[0].id, entityType: input.entityType, totalRows: rows.length, validRows: validCount, invalidRows: invalidCount, duplicateRows: duplicateCount, rows };
}

// ---------------------------------------------------------------------------
// Confirm (commit valid rows) — §Q.1
// ---------------------------------------------------------------------------
export interface ConfirmResult { batchId: string; importedRows: number; skippedRows: number }

export async function confirmImport(institutionId: string, authUserId: string, userId: string, batchId: string): Promise<ConfirmResult> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: batchRows } = await scoped.query<{ id: string; entity_type: string; status: string; rows_jsonb: ParsedRow[] }>(
      "select id, entity_type, status, rows_jsonb from import_batches where id = $1", [batchId]
    );
    const batch = batchRows[0];
    if (!batch) throw new Error("Import batch not found.");
    if (batch.status !== "staged") throw new Error(`This batch has already been ${batch.status}.`);

    const definition = registry[batch.entity_type];
    if (!definition) throw new Error(`Unknown import entity type "${batch.entity_type}".`);

    const validRows = batch.rows_jsonb.filter((r) => r.status === "valid" && r.data);
    let imported = 0;
    // Every insertRow() is passed `scoped` — the SAME already-open
    // transactional client this whole confirmImport() call is running
    // inside of (via the withInstitutionContext() call this function body
    // is itself the callback for) — and each underlying create*/submit*
    // function (createStudent(), createStaffMember(), ...) accepts that as
    // an optional trailing param specifically so it runs its INSERT
    // against this same connection/transaction instead of opening a new
    // one (see the scopedClient comment on e.g. createClass() in
    // modules/academic/service.ts). That makes this genuinely ONE
    // transaction for the whole batch: if any row throws, the exception
    // propagates out of this async function, the db client's own
    // try/catch (services/db/client.ts) turns that into a `rollback`, and
    // every row inserted earlier in this same loop is undone — never a
    // partially committed batch (§Q.1). Sequential (not Promise.all) so
    // rows commit/fail in file order, matching the row numbers shown in
    // the staged preview.
    for (const row of validRows) {
      await definition.insertRow(institutionId, authUserId, userId, row.data as Record<string, unknown>, scoped);
      imported++;
    }

    await scoped.query(
      `update import_batches set status = 'confirmed', imported_rows = $2, confirmed_at = now() where id = $1`,
      [batchId, imported]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "import", module: "bulk", entityType: batch.entity_type,
      entityId: batchId, after: { importedRows: imported },
    });

    return { batchId, importedRows: imported, skippedRows: batch.rows_jsonb.length - imported };
  });
}

export interface ImportBatchLogRow {
  id: string; entity_type: string; filename: string; status: string;
  total_rows: number; valid_rows: number; invalid_rows: number; duplicate_rows: number; imported_rows: number;
  staged_by: string | null; created_at: string; confirmed_at: string | null;
}

export async function listRecentImportBatches(institutionId: string, authUserId: string, limit = 20): Promise<ImportBatchLogRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ImportBatchLogRow>(
      `select id, entity_type, filename, status, total_rows, valid_rows, invalid_rows, duplicate_rows, imported_rows, staged_by, created_at, confirmed_at
         from import_batches order by created_at desc limit $1`,
      [limit]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Export (§Q.2) — raw CSV/XLSX dump of a list screen's current data, always
// through the same institution-scoped, permission-checked query layer as
// everywhere else; never more than the exporting user is authorized to view.
// ---------------------------------------------------------------------------
export interface ExportColumn { key: string; label: string }

export async function exportRows(
  format: "csv" | "xlsx", sheetTitle: string, columns: ExportColumn[], rows: Record<string, unknown>[]
): Promise<Buffer> {
  if (format === "csv") {
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.map((c) => escape(c.label)).join(",")];
    for (const row of rows) lines.push(columns.map((c) => escape(row[c.key])).join(","));
    return Buffer.from(lines.join("\n"), "utf-8");
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(safeSheetName(sheetTitle));
  const headerRow = sheet.addRow(columns.map((c) => c.label));
  headerRow.font = { bold: true };
  for (const row of rows) sheet.addRow(columns.map((c) => row[c.key] ?? ""));
  sheet.columns.forEach((col) => { col.width = 22; });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Entity-specific column sets for the raw export endpoints (§Q.2) — kept
 *  here (rather than in each module) since this is export-formatting
 *  concern, not core module logic. */
export const exportDefinitions: Record<string, { label: string; columns: ExportColumn[]; fetch: (institutionId: string, authUserId: string) => Promise<Record<string, unknown>[]> }> = {
  students: {
    label: "Students",
    columns: [
      { key: "admission_number", label: "Admission number" }, { key: "full_name", label: "Full name" },
      { key: "date_of_birth", label: "Date of birth" }, { key: "gender", label: "Gender" }, { key: "status", label: "Status" },
    ],
    fetch: (institutionId, authUserId) => listStudents(institutionId, authUserId) as unknown as Promise<Record<string, unknown>[]>,
  },
  classes: {
    label: "Classes",
    columns: [{ key: "name", label: "Name" }, { key: "sort_order", label: "Sort order" }],
    fetch: (institutionId, authUserId) => listClasses(institutionId, authUserId) as unknown as Promise<Record<string, unknown>[]>,
  },
  subjects: {
    label: "Subjects",
    columns: [{ key: "name", label: "Name" }, { key: "code", label: "Code" }],
    fetch: (institutionId, authUserId) => listSubjects(institutionId, authUserId) as unknown as Promise<Record<string, unknown>[]>,
  },
  staff: {
    label: "Staff",
    columns: [
      { key: "full_name", label: "Full name" }, { key: "email", label: "Email" }, { key: "staff_code", label: "Staff code" },
      { key: "designation", label: "Designation" }, { key: "department", label: "Department" }, { key: "employment_status", label: "Status" },
    ],
    fetch: (institutionId, authUserId) => listStaff(institutionId, authUserId) as unknown as Promise<Record<string, unknown>[]>,
  },
};
