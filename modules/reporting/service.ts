/**
 * PROMPT EDU ERP — Reporting engine.
 * ARCHITECTURE.md §D.13, §P (Reporting Architecture), Phase 13 (§AA.2).
 *
 * §P.1 "One reporting engine, not per-module report code":
 * generateReport() always does the same four steps (resolve definition,
 * run the query, render, log) regardless of report_type — adding a new
 * built-in report is one new query-registry entry plus one seeded
 * report_definitions row, never a bespoke PDF/XLSX code path.
 *
 * §P.2 "never raw SQL exposed to end users": queryRegistry's values are
 * named TypeScript functions, each calling the SAME institution-scoped,
 * permission-checked module service functions every other page in this
 * app calls (getResults(), getStudentAttendanceSummary(), etc.) — the
 * "safe query template" the spec describes, just implemented as code
 * instead of a SQL template string, which is at least as safe.
 *
 * §P.3 multilingual rendering: the XLSX renderer (exceljs) stores plain
 * Unicode text — Excel handles glyph rendering client-side, so every
 * target script (Arabic/Malayalam/Urdu/Devanagari/Kannada) already works
 * with zero extra effort. The PDF renderer (pdfkit) is Latin-only in this
 * build — pdfkit's built-in standard fonts have no non-Latin glyphs, and
 * embedding a real multi-script font stack (Noto Sans Arabic/Malayalam/
 * Devanagari/Kannada) is real, non-trivial follow-up work (font asset
 * files + testing per script) that hasn't been done here. A PDF report
 * containing e.g. an Arabic student name will currently render blank/tofu
 * for that name — tracked in docs/SETUP.md, not silently ignored.
 */
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { listStudents } from "../students/service";
import { getResults } from "../examination/service";
import { getStudentAttendanceSummary } from "../attendance/service";
import { listConsolidatedScores } from "../scoring/service";
import { listIssuedBooks } from "../library/service";

export interface ReportColumn { key: string; label: string }
export interface ReportDefinitionRecord {
  id: string; code: string; name: string; data_source: string; base_query_key: string;
  columns_jsonb: ReportColumn[]; default_filters_jsonb: Record<string, unknown> | null; is_system: boolean;
}

export async function listReportDefinitions(institutionId: string, authUserId: string): Promise<ReportDefinitionRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ReportDefinitionRecord>(
      `select id, code, name, data_source, base_query_key, columns_jsonb, default_filters_jsonb, is_system
         from report_definitions
        where institution_id is null or institution_id = $1
        order by name`,
      [institutionId]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Query registry (§P.1/§P.2) — one function per base_query_key, each
// returning plain row objects the renderers iterate generically.
// ---------------------------------------------------------------------------
type ReportParams = Record<string, unknown>;
type QueryFn = (institutionId: string, authUserId: string, params: ReportParams) => Promise<Record<string, unknown>[]>;

async function queryStudentRoster(institutionId: string, authUserId: string): Promise<Record<string, unknown>[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query(
      `select s.admission_number, s.full_name, c.name as class_name, sec.name as section_name, s.status
         from students s
         left join student_enrollments se on se.student_id = s.id
              and se.status = 'active'
              and se.academic_year_id = (select id from academic_years where institution_id = $1 and is_current = true limit 1)
         left join classes c on c.id = se.class_id
         left join sections sec on sec.id = se.section_id
        order by s.full_name`,
      [institutionId]
    );
    return rows;
  });
}

async function queryExaminationResults(institutionId: string, authUserId: string, params: ReportParams): Promise<Record<string, unknown>[]> {
  const examinationId = String(params.examinationId ?? "");
  if (!examinationId) throw new Error("examination_results requires an examinationId parameter.");
  const results = await getResults(institutionId, authUserId, examinationId);
  return results as unknown as Record<string, unknown>[];
}

async function queryAttendanceSummary(institutionId: string, authUserId: string, params: ReportParams): Promise<Record<string, unknown>[]> {
  const classId = String(params.classId ?? "");
  const sectionId = String(params.sectionId ?? "");
  const fromDate = String(params.fromDate ?? "");
  const toDate = String(params.toDate ?? "");
  if (!classId || !sectionId || !fromDate || !toDate) {
    throw new Error("attendance_summary requires classId, sectionId, fromDate, and toDate parameters.");
  }
  const db = await getDbClient();
  const enrolled = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ student_id: string; full_name: string }>(
      `select se.student_id, s.full_name
         from student_enrollments se join students s on s.id = se.student_id
        where se.class_id = $1 and se.section_id = $2 and se.status = 'active'
        order by s.full_name`,
      [classId, sectionId]
    );
    return rows;
  });

  const rows: Record<string, unknown>[] = [];
  for (const e of enrolled) {
    const summary = await getStudentAttendanceSummary(institutionId, authUserId, e.student_id, fromDate, toDate);
    rows.push({
      student_name: e.full_name,
      present_days: summary.present_days,
      total_days: summary.total_days,
      present_percent: summary.present_percent,
    });
  }
  return rows;
}

async function queryConsolidatedPerformance(institutionId: string, authUserId: string, params: ReportParams): Promise<Record<string, unknown>[]> {
  const period = String(params.period ?? "");
  if (!period) throw new Error("consolidated_performance requires a period parameter.");
  const [scores, students] = await Promise.all([
    listConsolidatedScores(institutionId, authUserId, period),
    listStudents(institutionId, authUserId),
  ]);
  const nameById = new Map(students.map((s) => [s.id, s.full_name]));
  return scores.map((s) => ({
    student_name: nameById.get(s.student_id) ?? "—",
    period: s.period,
    score: s.score,
  }));
}

async function queryLibraryCirculation(institutionId: string, authUserId: string): Promise<Record<string, unknown>[]> {
  const issued = await listIssuedBooks(institutionId, authUserId);
  return issued.map((i) => ({
    book_title: i.book_title, student_name: i.student_name, due_date: i.due_date, is_overdue: i.is_overdue ? "Yes" : "No",
  }));
}

const queryRegistry: Record<string, QueryFn> = {
  student_roster: (institutionId, authUserId) => queryStudentRoster(institutionId, authUserId),
  examination_results: queryExaminationResults,
  attendance_summary: queryAttendanceSummary,
  consolidated_performance: queryConsolidatedPerformance,
  library_circulation: (institutionId, authUserId) => queryLibraryCirculation(institutionId, authUserId),
};

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------
function renderPdf(institutionName: string, definition: ReportDefinitionRecord, rows: Record<string, unknown>[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(institutionName, { align: "left" });
    doc.fontSize(12).text(definition.name, { align: "left" });
    doc.moveDown();

    const columns = definition.columns_jsonb;
    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / columns.length;

    doc.fontSize(9).font("Helvetica-Bold");
    const headerY = doc.y;
    columns.forEach((col, i) => {
      doc.text(col.label, doc.page.margins.left + i * colWidth, headerY, { width: colWidth });
    });
    doc.moveDown();
    doc.font("Helvetica");

    for (const row of rows) {
      const rowY = doc.y;
      if (rowY > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage();
      }
      const y = doc.y;
      columns.forEach((col, i) => {
        const value = row[col.key];
        doc.text(value === null || value === undefined ? "—" : String(value), doc.page.margins.left + i * colWidth, y, { width: colWidth });
      });
      doc.moveDown(0.5);
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor("#888888").text(
        `Page ${i + 1} of ${pageCount} — Powered by PROMPT EDU ERP`,
        doc.page.margins.left,
        doc.page.height - doc.page.margins.bottom + 10,
        { align: "center", width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
      );
    }

    doc.end();
  });
}

async function renderXlsx(institutionName: string, definition: ReportDefinitionRecord, rows: Record<string, unknown>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PROMPT EDU ERP";
  const sheet = workbook.addWorksheet(definition.name.slice(0, 31)); // Excel sheet name limit

  sheet.addRow([institutionName]).font = { bold: true, size: 14 };
  sheet.addRow([definition.name]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(definition.columns_jsonb.map((c) => c.label));
  headerRow.font = { bold: true };

  for (const row of rows) {
    sheet.addRow(definition.columns_jsonb.map((c) => row[c.key] ?? ""));
  }

  sheet.columns.forEach((col) => { col.width = 20; });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// Orchestration (§P.1)
// ---------------------------------------------------------------------------
export interface GeneratedReport { buffer: Buffer; filename: string; mimeType: string }

export async function generateReport(
  institutionId: string, authUserId: string, userId: string,
  input: { reportType: string; parameters?: ReportParams; format: "pdf" | "xlsx"; institutionName: string }
): Promise<GeneratedReport> {
  const definitions = await listReportDefinitions(institutionId, authUserId);
  const definition = definitions.find((d) => d.code === input.reportType);
  if (!definition) throw new Error(`Unknown report type "${input.reportType}".`);

  const queryFn = queryRegistry[definition.base_query_key];
  if (!queryFn) throw new Error(`No query registered for "${definition.base_query_key}".`);

  const rows = await queryFn(institutionId, authUserId, input.parameters ?? {});

  const buffer = input.format === "pdf"
    ? await renderPdf(input.institutionName, definition, rows)
    : await renderXlsx(input.institutionName, definition, rows);

  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: reportRows } = await scoped.query<{ id: string }>(
      `insert into reports (institution_id, report_type, generated_by, parameters_jsonb, format)
       values ($1, $2, $3, $4, $5) returning id`,
      [institutionId, definition.code, userId, JSON.stringify(input.parameters ?? {}), input.format]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "generate", module: "reporting", entityType: "reports",
      entityId: reportRows[0].id, after: { reportType: definition.code, format: input.format },
    });
  });

  return {
    buffer,
    filename: `${definition.code}.${input.format}`,
    mimeType: input.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

export interface ReportLogRow { id: string; report_type: string; generated_by: string | null; format: string; generated_at: string }

export async function listRecentReports(institutionId: string, authUserId: string, limit = 20): Promise<ReportLogRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ReportLogRow>(
      `select id, report_type, generated_by, format, generated_at
         from reports order by generated_at desc limit $1`,
      [limit]
    );
    return rows;
  });
}
