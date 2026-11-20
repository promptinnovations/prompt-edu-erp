import { loadPortalProfileBundle, type PortalProfileBundle } from "./progress-data";
import { listSkillSubmissions, type SkillSubmissionRow } from "../../../modules/skills/service";
import { listCharacterAssessments, listCharacterRatingLabels, type CharacterAssessmentRow } from "../../../modules/discipline/service";
import { listMentoringRecordsForPortal, type MentoringRecordRow } from "../../../modules/mentoring/service";
import { listReadingRecords, type ReadingRecordRow } from "../../../modules/library/service";
import { getStudentAttendanceSummary, type AttendanceSummary } from "../../../modules/attendance/service";
import { listAcademicYears } from "../../../modules/academic/service";
import { getInstitution, institutionReportName } from "../../../services/institution/institution-service";
import { todayIST } from "../../../services/datetime/ist";
import { listLearnerEntries, type LearnerEntry } from "../../../modules/learner-record/service";
import { listStudentYears, getYearRecordIds, inYear, type StudentYear } from "../../../modules/portfolio/year-service";
import { listStudentEventResults, type StudentEventResult } from "../../../modules/events/service";

/** Achievement categories whose name matches this are shown under
 *  "Service, leadership & activities" (IB CAS-style) instead of the
 *  general awards list. Institutions opt in simply by naming a category
 *  e.g. "Community Service", "Leadership", "Clubs & Activities". */
export const ACTIVITY_CATEGORY_RE = /service|volunteer|leader|club|activit|cas\b|scout|ncc|nss|house/i;

export interface SubjectStrength { subject: string; average: number; exams: number }
export interface CharacterMatrix {
  periods: string[];
  rows: Array<{ attribute: string; byPeriod: Record<string, { rating: number; label: string }> }>;
}
export interface LearnerRecord {
  bundle: PortalProfileBundle;
  institutionName: string;
  logoCode: string | null;
  academicYear: string | null;
  attendance: AttendanceSummary | null;
  strengths: SubjectStrength[];
  skills: SkillSubmissionRow[];
  character: CharacterMatrix;
  mentoring: MentoringRecordRow[];
  reading: ReadingRecordRow[];
  entries: LearnerEntry[];
  /** §Portfolio-years: the years the student has a record in (newest
   *  first) and the one shown — null = every year. */
  years: StudentYear[];
  selectedYearId: string | null;
  /** Published Events & Activities results (migration 0070). */
  events: StudentEventResult[];
}

export async function loadLearnerRecord(
  institutionId: string, authUserId: string, studentId: string, yearId?: string | null
): Promise<LearnerRecord> {
  const [studentYears, yearIds] = await Promise.all([
    listStudentYears(institutionId, authUserId, studentId),
    yearId ? getYearRecordIds(institutionId, authUserId, studentId, yearId) : Promise.resolve(null),
  ]);
  const [bundleAll, institution, years, skillsAll, assessmentsAll, labels, mentoringAll, readingAll, entriesAll, eventsAll] = await Promise.all([
    loadPortalProfileBundle(institutionId, authUserId, studentId),
    getInstitution(institutionId, authUserId),
    listAcademicYears(institutionId, authUserId),
    listSkillSubmissions(institutionId, authUserId, "approved", undefined, studentId).catch(() => [] as SkillSubmissionRow[]),
    listCharacterAssessments(institutionId, authUserId, studentId).catch(() => [] as CharacterAssessmentRow[]),
    listCharacterRatingLabels(institutionId, authUserId).catch(() => []),
    listMentoringRecordsForPortal(institutionId, authUserId, studentId).catch(() => [] as MentoringRecordRow[]),
    listReadingRecords(institutionId, authUserId, undefined, undefined, studentId).catch(() => [] as ReadingRecordRow[]),
    listLearnerEntries(institutionId, authUserId, studentId),
    listStudentEventResults(institutionId, authUserId, studentId).catch(() => [] as StudentEventResult[]),
  ]);

  // One year selected → only that year's records (and that year's attendance).
  const bundle = yearIds
    ? { ...bundleAll, achievements: inYear(bundleAll.achievements, yearIds.achievements), progress: bundleAll.progress.filter((e) => yearIds.exams.has(e.examination_id)) }
    : bundleAll;
  const skills = inYear(skillsAll, yearIds?.skills);
  const assessments = inYear(assessmentsAll, yearIds?.character);
  const mentoring = inYear(mentoringAll, yearIds?.mentoring);
  const reading = inYear(readingAll, yearIds?.reading);
  const entries = inYear(entriesAll, yearIds?.entries);
  const events = yearIds ? eventsAll.filter((e) => e.academic_year_id === yearIds.year.id) : eventsAll;

  const today = todayIST();
  const current = (yearIds ? years.find((y) => y.id === yearIds.year.id) : null)
    ?? years.find((y) => y.start_date <= today && today <= y.end_date) ?? years[0] ?? null;
  const attendance = current
    ? await getStudentAttendanceSummary(
        institutionId, authUserId, studentId, current.start_date, current.end_date < today ? current.end_date : today
      ).catch(() => null)
    : null;

  // Subject strengths = average % across every published exam.
  const bySubject = new Map<string, { sum: number; n: number }>();
  for (const ex of bundle.progress) {
    for (const s of ex.subjects) {
      if (s.absent || s.obtained == null || Number(s.max) <= 0) continue;
      const cur = bySubject.get(s.subject_name) ?? { sum: 0, n: 0 };
      cur.sum += (Number(s.obtained) / Number(s.max)) * 100;
      cur.n += 1;
      bySubject.set(s.subject_name, cur);
    }
  }
  const strengths = [...bySubject.entries()]
    .map(([subject, v]) => ({ subject, average: v.sum / v.n, exams: v.n }))
    .sort((a, b) => b.average - a.average);

  const labelBy = new Map(labels.map((l) => [l.rating, l.label]));
  const periods = [...new Set(assessments.map((a) => a.period))].sort();
  const attrs = new Map<string, CharacterMatrix["rows"][number]>();
  for (const a of assessments) {
    const row = attrs.get(a.attribute_name) ?? { attribute: a.attribute_name, byPeriod: {} };
    row.byPeriod[a.period] = { rating: a.rating, label: labelBy.get(a.rating) ?? String(a.rating) };
    attrs.set(a.attribute_name, row);
  }

  return {
    bundle,
    institutionName: institutionReportName(institution),
    logoCode: institution?.logoFileId ? institution.code : null,
    academicYear: yearIds ? yearIds.year.name : studentYears.length > 1 ? "All years" : current?.name ?? null,
    attendance, strengths, skills,
    character: { periods, rows: [...attrs.values()] },
    mentoring, reading, entries,
    years: studentYears,
    selectedYearId: yearIds?.year.id ?? null,
    events,
  };
}
