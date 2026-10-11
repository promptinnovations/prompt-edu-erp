import {
  getStudentProfile, getCurrentEnrollment, listParentsForStudent,
  type StudentProfileRecord, type ParentLinkRow,
} from "../../../modules/students/service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { listAchievements, type AchievementRow } from "../../../modules/achievements/service";

import { getAcademicInsights } from "../../../modules/portal/student-insights";

export interface StudentProgressSubject {
  subject_name: string; obtained: string | null; max: string; absent: boolean;
}
export interface StudentProgressExam {
  examination_id: string; examination_name: string;
  total_marks: string; max_total_marks: string; percentage: string;
  grade_label: string | null; is_pass: boolean | null;
  subjects: StudentProgressSubject[];
}

/** Every PUBLISHED exam result for one student plus its subject-wise marks —
 *  the data behind the portal "Progress Card". Gate on published_at lives in
 *  listStudentResultHistory(); the per-exam matrix/results reads below are
 *  only made for exams that list returned. */
export async function getStudentProgress(
  institutionId: string, authUserId: string, studentId: string
): Promise<StudentProgressExam[]> {
  // §Perf: built from getAcademicInsights() — this one student's published
  // results and subject marks in a single transaction. It used to load the
  // WHOLE institution's mark matrix and results list for every exam, one
  // exam after another, just to keep this student's rows.
  const { exams } = await getAcademicInsights(institutionId, authUserId, studentId);
  return [...exams].reverse().map((e) => ({
    examination_id: e.examination_id,
    examination_name: e.name,
    total_marks: String(e.total),
    max_total_marks: String(e.max_total),
    percentage: String(e.percent),
    grade_label: e.grade_label,
    is_pass: e.is_pass,
    subjects: e.subjects.map((s) => ({
      subject_name: s.subject_name,
      obtained: s.obtained != null ? String(s.obtained) : null,
      max: String(s.max),
      absent: s.absent,
    })),
  }));
}


export interface PortalProfileBundle {
  profile: StudentProfileRecord | null;
  classLabel: string | null;
  rollNumber: number | null;
  guardian: ParentLinkRow | null;
  achievements: AchievementRow[];
  progress: StudentProgressExam[];
}

/** Everything the shared Student Details / Events & Competitions / Progress
 *  Card sections need, loaded once for either portal. Achievements are
 *  APPROVED only (a student/parent never sees pending or rejected ones). */
export async function loadPortalProfileBundle(
  institutionId: string, authUserId: string, studentId: string
): Promise<PortalProfileBundle> {
  const [profile, enrollment, parents, achievements, progress, classes] = await Promise.all([
    getStudentProfile(institutionId, authUserId, studentId),
    getCurrentEnrollment(institutionId, authUserId, studentId),
    listParentsForStudent(institutionId, authUserId, studentId).catch(() => [] as ParentLinkRow[]),
    listAchievements(institutionId, authUserId, "approved", undefined, studentId).catch(() => [] as AchievementRow[]),
    getStudentProgress(institutionId, authUserId, studentId),
    listClasses(institutionId, authUserId),
  ]);
  let classLabel: string | null = null;
  if (enrollment) {
    const cls = classes.find((c) => c.id === enrollment.class_id);
    const sections = await listSections(institutionId, authUserId, enrollment.class_id);
    const sec = sections.find((s) => s.id === enrollment.section_id);
    classLabel = `${cls?.name ?? "?"}${sec ? ` ${sec.name}` : ""}`;
  }
  return {
    profile, classLabel,
    rollNumber: enrollment?.roll_number ?? null,
    guardian: parents[0] ?? null,
    achievements, progress,
  };
}
