import {
  getStudentProfile, getCurrentEnrollment, listParentsForStudent,
  type StudentProfileRecord, type ParentLinkRow,
} from "../../../modules/students/service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { listAchievements, type AchievementRow } from "../../../modules/achievements/service";

import {
  listStudentResultHistory, getExaminationMarksMatrix, getResults,
} from "../../../modules/examination/service";

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
  const history = await listStudentResultHistory(institutionId, authUserId, studentId);
  const out: StudentProgressExam[] = [];
  for (const h of history) {
    const [matrix, results] = await Promise.all([
      getExaminationMarksMatrix(institutionId, authUserId, h.examination_id),
      getResults(institutionId, authUserId, h.examination_id),
    ]);
    const r = results.find((x) => x.student_id === studentId);
    out.push({
      examination_id: h.examination_id,
      examination_name: h.examination_name,
      total_marks: r?.total_marks ?? "0",
      max_total_marks: r?.max_total_marks ?? "0",
      percentage: r?.percentage ?? h.percentage,
      grade_label: r?.grade_label ?? h.grade_label,
      is_pass: r?.is_pass ?? null,
      subjects: matrix
        .filter((m) => m.student_id === studentId)
        .map((m) => ({ subject_name: m.subject_name, obtained: m.marks_obtained, max: m.max_marks, absent: m.is_absent })),
    });
  }
  return out;
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
