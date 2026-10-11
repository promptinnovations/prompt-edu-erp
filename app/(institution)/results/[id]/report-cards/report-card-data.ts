import {
  getExamination, getExaminationMarksMatrix, getResults, getGradeBands, resolveGradeBand,
  isDailyAssessmentExamination, getDailyAssessmentStudentSubjectTotals, listDailyAssessmentReportCardRows,
} from "../../../../../modules/examination/service";
import { getStudent } from "../../../../../modules/students/service";
import { listAcademicYears } from "../../../../../modules/academic/service";
import { getStudentAttendanceSummary } from "../../../../../modules/attendance/service";
import { todayIST } from "../../../../../services/datetime/ist";
import { formatMarks } from "../../../../../services/format/marks";
import { getReportCardRemarks } from "../../../../../modules/report-card-remarks/service";

/** §Report-card-print-all + §Daily-assessment-report-card — the one place
 *  report-card CONTENT is assembled, shared by the single-student route
 *  ([studentId]/page.tsx) and the whole-class print route
 *  (print-all/page.tsx) so the two can never drift apart, and the one place
 *  that knows a Daily Assessment register builds its rows from a different
 *  source than an ordinary examination.
 *
 *  Ordinary exam: rows come from getExaminationMarksMatrix (TE = the written
 *  mark, CE columns when the exam has CE components) and the summary from
 *  the stored `results` row.
 *
 *  Daily Assessment register (migration 0048): there are no exam_subjects,
 *  no `marks` and no `results` row at all — the month's marks live in
 *  daily_assessment_marks. The card becomes the "cumulative report card of
 *  that child of that month": one row per subject where TE is everything
 *  they earned across that subject's completed sessions and Total TE the
 *  matching maximum, with the grade/descriptor resolved against the
 *  register's own grade scale exactly as an ordinary card does. CE never
 *  applies (a daily session has no CE components), so those columns stay
 *  hidden. */
export interface ReportCardSubjectRow {
  key: string;
  subject_name: string;
  /** Sub-line under the subject name (CE breakdown, or session count for a
   *  Daily Assessment register). */
  subject_note: string | null;
  te: string;
  total_te: string;
  ce: string;
  total_ce: string;
  grade_label: string | null;
  descriptor: string | null;
}

export interface ReportCardSummary {
  total_marks: string;
  max_total_marks: string;
  percentage: number;
  grade_label: string | null;
}

export interface ReportCardData {
  student_id: string;
  student_name: string;
  admission_number: string;
  class_name: string | null;
  section_name: string | null;
  roll_number: number | null;
  gender: string | null;
  date_of_birth: string | null;
  photo_file_id: string | null;
  rows: ReportCardSubjectRow[];
  hasCe: boolean;
  summary: ReportCardSummary | null;
  attendance: { present_days: number; total_days: number; present_percent: number } | null;
  /** §Report-card-remark — the class teacher's remark for this exam
   *  (migration 0065); printed in the remarks box. Absent = none yet. */
  remark?: string | null;
}

export interface ReportCardContext {
  examinationName: string;
  /** "<exam name>" or "<exam name> · <academic year>" — the year is only
   *  appended when the exam's own name doesn't already carry one. */
  examHeaderLine: string;
  isDailyAssessment: boolean;
}

/** Loads report cards for an examination. Pass `studentIds` for specific
 *  students, or `classId`/`sectionId` for a whole class/division (the
 *  print-all route). `allowedClassIds` applies the caller's teacher scope.
 *  Returns [] when nothing matches — callers decide between 404 and an
 *  empty-state message. */
export async function loadReportCards(
  institutionId: string,
  authUserId: string,
  examinationId: string,
  opts: { studentIds?: string[]; classId?: string | null; sectionId?: string | null; allowedClassIds?: string[] | null }
): Promise<{ context: ReportCardContext; cards: ReportCardData[] } | null> {
  const examination = await getExamination(institutionId, authUserId, examinationId);
  if (!examination) return null;

  const [academicYears, isDaily] = await Promise.all([
    listAcademicYears(institutionId, authUserId),
    isDailyAssessmentExamination(institutionId, authUserId, examinationId),
  ]);
  const academicYear = academicYears.find((y) => y.id === examination.academic_year_id) ?? null;
  // "if there is year in the exam name dont add year again" — a 4-digit run
  // anywhere in the exam's own name counts as it already carrying the year.
  const examNameHasYear = /\d{4}/.test(examination.name);
  const context: ReportCardContext = {
    examinationName: examination.name,
    examHeaderLine: academicYear && !examNameHasYear ? `${examination.name} · ${academicYear.name}` : examination.name,
    isDailyAssessment: isDaily,
  };

  const gradeBands = examination.grade_scale_id
    ? await getGradeBands(institutionId, authUserId, examination.grade_scale_id)
    : [];

  const attendanceFor = async (studentId: string) =>
    academicYear
      ? getStudentAttendanceSummary(
          institutionId, authUserId, studentId,
          academicYear.start_date,
          academicYear.end_date < todayIST() ? academicYear.end_date : todayIST()
        )
      : null;

  const wanted = opts.studentIds ? new Set(opts.studentIds) : null;

  const withRemarks = async (cards: ReportCardData[]): Promise<ReportCardData[]> => {
    if (cards.length === 0) return cards;
    const remarks = await getReportCardRemarks(institutionId, authUserId, examinationId, cards.map((c) => c.student_id));
    return cards.map((c) => ({ ...c, remark: remarks.get(c.student_id) ?? null }));
  };

  if (isDaily) {
    const roster = await listDailyAssessmentReportCardRows(
      institutionId, authUserId, examinationId,
      opts.classId ? [opts.classId] : (opts.allowedClassIds ?? null)
    );
    const picked = roster.filter((r) => {
      if (wanted && !wanted.has(r.student_id)) return false;
      if (opts.sectionId && r.section_name == null) return false;
      return true;
    });
    const cards: ReportCardData[] = [];
    for (const r of picked) {
      const [subjectTotals, student, attendance] = await Promise.all([
        getDailyAssessmentStudentSubjectTotals(institutionId, authUserId, examinationId, r.student_id),
        getStudent(institutionId, authUserId, r.student_id),
        attendanceFor(r.student_id),
      ]);
      const rows: ReportCardSubjectRow[] = subjectTotals.map((t) => {
        const pct = t.max > 0 ? (t.obtained / t.max) * 100 : null;
        const band = pct != null ? resolveGradeBand(gradeBands, pct) : null;
        return {
          key: t.subject_id,
          subject_name: t.subject_name,
          subject_note: `${t.sessions} session${t.sessions === 1 ? "" : "s"}`,
          te: formatMarks(String(t.obtained)),
          total_te: formatMarks(String(t.max)),
          ce: "—", total_ce: "—",
          grade_label: band?.grade_label ?? null,
          descriptor: band?.description || null,
        };
      });
      const obtained = subjectTotals.reduce((a, t) => a + t.obtained, 0);
      const max = subjectTotals.reduce((a, t) => a + t.max, 0);
      const pct = max > 0 ? Math.round((obtained / max) * 1000) / 10 : 0;
      cards.push({
        student_id: r.student_id, student_name: r.student_name, admission_number: r.admission_number,
        class_name: r.class_name, section_name: r.section_name, roll_number: r.roll_number,
        gender: student?.gender ?? r.gender, date_of_birth: student?.date_of_birth ?? null,
        photo_file_id: student?.photo_file_id ?? null,
        rows, hasCe: false,
        summary: max > 0
          ? { total_marks: String(obtained), max_total_marks: String(max), percentage: pct, grade_label: resolveGradeBand(gradeBands, pct)?.grade_label ?? null }
          : null,
        attendance,
      });
    }
    return { context, cards: await withRemarks(cards) };
  }

  const [matrix, results] = await Promise.all([
    getExaminationMarksMatrix(institutionId, authUserId, examinationId, opts.classId || null),
    getResults(institutionId, authUserId, examinationId, opts.allowedClassIds ?? null),
  ]);
  const resultByStudent = new Map(results.map((r) => [r.student_id, r]));

  const byStudent = new Map<string, typeof matrix>();
  for (const r of matrix) {
    if (wanted && !wanted.has(r.student_id)) continue;
    if (opts.sectionId && r.section_name == null) continue;
    if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, []);
    byStudent.get(r.student_id)!.push(r);
  }

  const cards: ReportCardData[] = [];
  for (const [studentId, studentRows] of byStudent) {
    const first = studentRows[0];
    const [student, attendance] = await Promise.all([
      getStudent(institutionId, authUserId, studentId),
      attendanceFor(studentId),
    ]);
    const hasCe = studentRows.some((r) => r.ce_components.length > 0);
    const rows: ReportCardSubjectRow[] = studentRows.map((r) => {
      // Per-subject display applies the same unit rules as
      // computeStudentResult(): absent units drop out of numerator and
      // denominator.
      const units = [
        { max: Number(r.max_marks), obtained: r.marks_obtained, absent: r.is_absent },
        ...r.ce_components.map((c) => ({ max: Number(c.max_marks), obtained: c.marks_obtained, absent: c.is_absent })),
      ];
      const sat = units.filter((u) => !u.absent && u.obtained != null);
      const satObtained = sat.reduce((a, u) => a + Number(u.obtained), 0);
      const satMax = units.filter((u) => !u.absent).reduce((a, u) => a + u.max, 0);
      const subjectPct = sat.length > 0 && satMax > 0 ? (satObtained / satMax) * 100 : null;
      const band = subjectPct != null ? resolveGradeBand(gradeBands, subjectPct) : null;
      const ceMax = r.ce_components.reduce((a, c) => a + Number(c.max_marks), 0);
      const ceSat = r.ce_components.filter((c) => !c.is_absent && c.marks_obtained != null);
      const ceText = r.ce_components.length === 0
        ? "—"
        : r.ce_components.every((c) => c.is_absent)
          ? "Absent"
          : ceSat.length === 0
            ? "—"
            : formatMarks(String(ceSat.reduce((a, c) => a + Number(c.marks_obtained), 0)));
      return {
        key: r.exam_subject_id,
        subject_name: r.subject_name,
        subject_note: r.ce_components.length > 1
          ? `CE: ${r.ce_components.map((c) => `${c.name} ${c.is_absent ? "AB" : c.marks_obtained ? formatMarks(c.marks_obtained) : "—"}/${formatMarks(c.max_marks)}`).join(" · ")}`
          : null,
        te: r.is_absent ? "Absent" : r.marks_obtained ? formatMarks(r.marks_obtained) : "—",
        total_te: formatMarks(r.max_marks),
        ce: ceText,
        total_ce: formatMarks(String(ceMax)),
        grade_label: band?.grade_label ?? null,
        descriptor: band?.description || null,
      };
    });
    const overall = resultByStudent.get(studentId);
    cards.push({
      student_id: studentId, student_name: first.student_name, admission_number: first.admission_number,
      class_name: first.class_name, section_name: first.section_name, roll_number: first.roll_number,
      gender: student?.gender ?? first.gender, date_of_birth: student?.date_of_birth ?? null,
      photo_file_id: student?.photo_file_id ?? null,
      rows, hasCe,
      summary: overall
        ? {
            total_marks: overall.total_marks, max_total_marks: overall.max_total_marks,
            percentage: Number(overall.percentage), grade_label: overall.grade_label,
          }
        : null,
      attendance,
    });
  }
  return { context, cards: await withRemarks(cards) };
}
