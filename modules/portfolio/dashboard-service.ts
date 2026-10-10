/**
 * PROMPT EDU ERP — Student Portfolio Dashboard data layer.
 *
 * §Portfolio-dashboard follow-up ("the student and parent portal should be
 * like this [reference: a rich Student Portfolio dashboard] — do
 * everything needed for that"). Per the explicit AskUserQuestion answers:
 *   - "Student + Parent + staff view" — ONE shared presentational
 *     component (app/components/portfolio/StudentPortfolioDashboard.tsx)
 *     reused by all three surfaces.
 *   - "Skip the banner for now" — no decorative building-photo/verse
 *     banner from the reference image.
 *   - "New dedicated portfolio-summary record" — the Teacher's Overall
 *     Remark / Strengths / Areas for Improvement / Future Goals block
 *     reads modules/portfolio-summary/service.ts, not mentoring_records.
 *
 * This file is deliberately split into two layers:
 *   1. `buildPortfolioDashboardData()` — a PURE function, no DB access.
 *      Takes already-fetched records and shapes them into the component's
 *      props. The staff Student Profile page (app/(institution)/students/
 *      [id]/page.tsx) already fetches most of this in its own big
 *      Promise.all for its OTHER tabs — it calls this directly with a few
 *      extra small fetches, rather than re-fetching everything through the
 *      loader below.
 *   2. `loadPortfolioDashboardData()` — the async loader used by the
 *      student and parent portals, which don't already have this data on
 *      hand. It fans out every fetch itself (sibling top-level awaits —
 *      see getStudentAcademicPerformanceByTerm's own comment on why this
 *      module never nests one withInstitutionContext call inside
 *      another's callback) and then calls the pure shaper.
 *
 * `sections` (a `ParentPortalSections`) gates both what the loader bothers
 * fetching AND what the component renders — for staff/student call sites
 * (who have no institution-configurable restriction) pass
 * `ALL_PORTFOLIO_SECTIONS`; for the parent portal pass whatever
 * `getParentPortalSections()` returns for that institution.
 */
import type { ParentPortalSections } from "../../services/institution/institution-service";
import type { StudentProfileRecord, EnrollmentRecord } from "../students/service";
import type { AttendanceSummary } from "../attendance/service";
import type { StudentAcademicPerformanceByTerm } from "../examination/service";
import type { AchievementRow } from "../achievements/service";
import type { SkillSubmissionRow, SkillTypeRecord, SkillActivityRecord } from "../skills/service";
import type { CharacterAssessmentRow, CharacterRatingLabelRecord, DisciplineRecordRow } from "../discipline/service";
import type { PortfolioSummaryRecord } from "../portfolio-summary/service";
import type { LatestResultSummary } from "./service";

import { getStudentProfile, getCurrentEnrollment } from "../students/service";
import { listClasses, listSections, getCurrentAcademicYear } from "../academic/service";
import { getStudentAttendanceSummary } from "../attendance/service";
import { getStudentAcademicPerformanceByTerm } from "../examination/service";
import { listAchievements } from "../achievements/service";
import { listSkillSubmissions, listSkillTypes, listSkillActivities } from "../skills/service";
import { listCharacterAssessments, listCharacterRatingLabels, listDisciplineRecords } from "../discipline/service";
import { getPortfolioSummary } from "../portfolio-summary/service";
import { getStudent360 } from "./service";

export const ALL_PORTFOLIO_SECTIONS: ParentPortalSections = {
  results: true, attendance: true, discipline: true, achievements: true,
  library: true, skills: true, portfolio: true, character: true, mentoring: true,
};

export interface PortfolioCoCurricularItem {
  id: string; activityName: string; typeName: string | null; submittedAt: string | null;
}
export interface PortfolioAchievementItem {
  id: string; title: string; categoryName: string; levelName: string;
  position: string | null; points: string | null; certificateFileId: string | null;
}
export interface PortfolioBehaviourItem {
  id: string; attributeName: string; rating: number; ratingLabel: string; period: string; notes: string | null;
}

export interface PortfolioDashboardData {
  student: {
    id: string; fullName: string; admissionNumber: string; rollNumber: number | null;
    classLabel: string | null; dateOfBirth: string | null; age: number | null;
    bloodGroup: string | null; phone: string | null; photoFileId: string | null;
  };
  academicYear: { id: string; name: string } | null;
  stats: {
    overallGradeLabel: string | null;
    overallPercentage: number | null;
    attendancePercent: number;
    achievementsCount: number;
    coCurricularCount: number;
    behaviourRatingLabel: string | null;
  };
  academicPerformance: StudentAcademicPerformanceByTerm;
  attendance: { present: number; absent: number; late: number; totalDays: number; percent: number };
  behaviour: PortfolioBehaviourItem[];
  coCurricular: PortfolioCoCurricularItem[];
  achievements: PortfolioAchievementItem[];
  /** null = not fetched (gated off by `sections.discipline` for this caller). */
  discipline: DisciplineRecordRow[] | null;
  portfolioSummary: PortfolioSummaryRecord | null;
  sections: ParentPortalSections;
}

export interface PortfolioDashboardInput {
  student: StudentProfileRecord;
  enrollment: EnrollmentRecord | null;
  classLabel: string | null;
  academicYear: { id: string; name: string } | null;
  latestResult: LatestResultSummary | null;
  attendanceSummary: AttendanceSummary;
  academicPerformance: StudentAcademicPerformanceByTerm;
  achievements: AchievementRow[];
  skillSubmissions: SkillSubmissionRow[];
  skillTypes: SkillTypeRecord[];
  skillActivities: SkillActivityRecord[];
  characterAssessments: CharacterAssessmentRow[];
  characterRatingLabels: CharacterRatingLabelRecord[];
  disciplineRecords: DisciplineRecordRow[] | null;
  portfolioSummary: PortfolioSummaryRecord | null;
  sections: ParentPortalSections;
}

function computeAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

/** `rating` is usually a whole 1-5 int (a single assessment) but may be a
 *  fractional average (the overall behaviour stat) — picks the
 *  institution's configured label for the nearest integer rating rather
 *  than requiring an exact match. */
function nearestRatingLabel(rating: number, labels: CharacterRatingLabelRecord[]): string | null {
  if (labels.length === 0) return null;
  let best = labels[0];
  let bestDiff = Math.abs(best.rating - rating);
  for (const l of labels) {
    const diff = Math.abs(l.rating - rating);
    if (diff < bestDiff) { best = l; bestDiff = diff; }
  }
  return best.label;
}

/** Pure — shapes already-fetched records into the dashboard component's
 *  props. No DB access, safe to call from a request handler that already
 *  has these records on hand (the staff Student Profile page) without any
 *  risk of double-fetching or nested-transaction issues. */
export function buildPortfolioDashboardData(input: PortfolioDashboardInput): PortfolioDashboardData {
  const {
    student, enrollment, classLabel, academicYear, latestResult, attendanceSummary,
    academicPerformance, achievements, skillSubmissions, skillTypes, skillActivities,
    characterAssessments, characterRatingLabels, disciplineRecords, portfolioSummary, sections,
  } = input;

  const activityById = new Map(skillActivities.map((a) => [a.id, a]));
  const typeNameById = new Map(skillTypes.map((t) => [t.id, t.name]));
  const coCurricular: PortfolioCoCurricularItem[] = skillSubmissions.map((s) => {
    const activity = activityById.get(s.skill_activity_id);
    const typeName = activity ? typeNameById.get(activity.skill_type_id) ?? null : null;
    return { id: s.id, activityName: s.activity_name, typeName, submittedAt: s.submitted_at };
  });

  const achievementItems: PortfolioAchievementItem[] = achievements.map((a) => ({
    id: a.id, title: a.title, categoryName: a.category_name, levelName: a.level_name,
    position: a.position, points: a.points, certificateFileId: a.certificate_file_id,
  }));

  const ratingLabelByValue = new Map(characterRatingLabels.map((l) => [l.rating, l.label]));
  const behaviour: PortfolioBehaviourItem[] = characterAssessments.map((c) => ({
    id: c.id, attributeName: c.attribute_name, rating: c.rating,
    ratingLabel: ratingLabelByValue.get(c.rating) ?? nearestRatingLabel(c.rating, characterRatingLabels) ?? `${c.rating}/5`,
    period: c.period, notes: c.notes,
  }));

  // Overall "Behaviour" stat card: average across the most recent
  // assessment period only (characterAssessments is ordered created_at
  // desc, so the first row's period is the latest one entered).
  let behaviourRatingLabel: string | null = null;
  if (characterAssessments.length > 0) {
    const latestPeriod = characterAssessments[0].period;
    const inPeriod = characterAssessments.filter((c) => c.period === latestPeriod);
    const avg = inPeriod.reduce((sum, c) => sum + c.rating, 0) / inPeriod.length;
    behaviourRatingLabel = nearestRatingLabel(avg, characterRatingLabels);
  }

  const rawPercentage = latestResult ? Number(latestResult.percentage) : null;
  const overallPercentage = rawPercentage !== null && !Number.isNaN(rawPercentage)
    ? Math.round(rawPercentage * 10) / 10
    : null;

  return {
    student: {
      id: student.id, fullName: student.full_name, admissionNumber: student.admission_number,
      rollNumber: enrollment?.roll_number ?? null, classLabel,
      dateOfBirth: student.date_of_birth, age: computeAge(student.date_of_birth),
      bloodGroup: student.blood_group, phone: student.contact_phone, photoFileId: student.photo_file_id ?? null,
    },
    academicYear,
    stats: {
      overallGradeLabel: latestResult?.grade_label ?? null,
      overallPercentage,
      attendancePercent: attendanceSummary.present_percent,
      achievementsCount: achievementItems.length,
      coCurricularCount: coCurricular.length,
      behaviourRatingLabel,
    },
    academicPerformance,
    attendance: {
      present: attendanceSummary.present_days, absent: attendanceSummary.absent_days,
      late: attendanceSummary.late_days, totalDays: attendanceSummary.total_days,
      percent: attendanceSummary.present_percent,
    },
    behaviour, coCurricular, achievements: achievementItems,
    discipline: disciplineRecords, portfolioSummary, sections,
  };
}

const EMPTY_ATTENDANCE: AttendanceSummary = {
  student_id: "", total_days: 0, present_days: 0, absent_days: 0, late_days: 0, present_percent: 0,
};

/** Loader for the student/parent portals, which don't already have this
 *  data fetched. `sections` both gates what gets fetched (defense in
 *  depth — an institution that's turned a section off never even reads
 *  that data for this call) and flows through to the returned bundle so
 *  the presentational component knows what to render. Returns null if the
 *  student id doesn't resolve to a real student (RLS-safe — see
 *  getStudentProfile's own §E.3 comment). */
export async function loadPortfolioDashboardData(
  institutionId: string, authUserId: string, studentId: string,
  sections: ParentPortalSections,
  academicYearId?: string
): Promise<PortfolioDashboardData | null> {
  const student = await getStudentProfile(institutionId, authUserId, studentId);
  if (!student) return null;

  const enrollment = await getCurrentEnrollment(institutionId, authUserId, studentId);
  const currentAcademicYear = await getCurrentAcademicYear(institutionId, authUserId);
  const academicYear = currentAcademicYear ? { id: currentAcademicYear.id, name: currentAcademicYear.name } : null;
  const resolvedYearId = academicYearId ?? currentAcademicYear?.id ?? null;

  let classLabel: string | null = null;
  if (enrollment) {
    const classes = await listClasses(institutionId, authUserId);
    const sectionsList = await listSections(institutionId, authUserId, enrollment.class_id);
    const cls = classes.find((c) => c.id === enrollment.class_id);
    const sec = sectionsList.find((s) => s.id === enrollment.section_id);
    classLabel = `${cls?.name ?? "?"}${sec ? ` ${sec.name}` : ""}`;
  }

  // onlyPublishedResults=true: portal callers must never see a result
  // before staff has published it (see getStudent360's own comment on this
  // param) — unlike the staff Student Profile page, which passes false.
  const student360 = sections.results
    ? await getStudent360(institutionId, authUserId, studentId, 10, undefined, true)
    : null;

  const attendanceSummary = sections.attendance && currentAcademicYear
    ? await getStudentAttendanceSummary(institutionId, authUserId, studentId, currentAcademicYear.start_date, currentAcademicYear.end_date)
    : { ...EMPTY_ATTENDANCE, student_id: studentId };

  const academicPerformance = sections.results && resolvedYearId
    ? await getStudentAcademicPerformanceByTerm(institutionId, authUserId, studentId, resolvedYearId)
    : { columns: [], rows: [] };

  const achievements = sections.achievements
    ? await listAchievements(institutionId, authUserId, "approved", undefined, studentId)
    : [];

  const skillSubmissions = sections.skills
    ? await listSkillSubmissions(institutionId, authUserId, "approved", undefined, studentId)
    : [];
  const skillTypes = sections.skills ? await listSkillTypes(institutionId, authUserId) : [];
  const skillActivities = sections.skills ? await listSkillActivities(institutionId, authUserId) : [];

  const characterAssessments = sections.character
    ? await listCharacterAssessments(institutionId, authUserId, studentId)
    : [];
  const characterRatingLabels = sections.character
    ? await listCharacterRatingLabels(institutionId, authUserId)
    : [];

  const disciplineRecords = sections.discipline
    ? await listDisciplineRecords(institutionId, authUserId, studentId)
    : null;

  const portfolioSummary = sections.portfolio && resolvedYearId
    ? await getPortfolioSummary(institutionId, authUserId, studentId, resolvedYearId)
    : null;

  return buildPortfolioDashboardData({
    student, enrollment, classLabel, academicYear,
    latestResult: student360?.latestResult ?? null,
    attendanceSummary, academicPerformance,
    achievements, skillSubmissions, skillTypes, skillActivities,
    characterAssessments, characterRatingLabels, disciplineRecords, portfolioSummary, sections,
  });
}
