"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createExamination, addExamSubject, addExamClass, removeExamClass, removeExamSubject,
  enterMarks, submitMarks, verifyMarks, approveMarks, lockMarks, computeResults,
  createDailyAssessment, enterDailyAssessmentMarks,
} from "../../../modules/examination/service";

export async function createExaminationAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const exam = await createExamination(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      examTypeId: String(formData.get("examTypeId") ?? ""),
      academicYearId: String(formData.get("academicYearId") ?? ""),
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/examinations");
    return { error: null, examinationId: exam.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create examination." };
  }
}

export async function addExamSubjectAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await addExamSubject(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      examinationId,
      subjectId: String(formData.get("subjectId") ?? ""),
      maxMarks: Number(formData.get("maxMarks") ?? 100),
      passMarks: Number(formData.get("passMarks") ?? 35),
    });
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add exam subject." };
  }
}

export async function addExamClassAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const sectionAndClass = String(formData.get("sectionAndClass") ?? "");
    const [classId, sectionId] = sectionAndClass.split("|");
    await addExamClass(ctx.institutionId, ctx.session.authUserId, examinationId, classId, sectionId || null);
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to link class." };
  }
}

/** §418 "confirm scope of exam, section, grade, division — make user
 *  friendly": one checkbox-grid submit instead of adding class/divisions
 *  one at a time — every checked `sectionAndClass` value (same
 *  "classId|sectionId" encoding addExamClassAction already uses) is linked
 *  in one Save. */
export async function bulkSetExamScopeAction(_prevState: { error: string | null; added?: number }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const selections = formData.getAll("sectionAndClass").map(String);
    let added = 0;
    for (const sel of selections) {
      const [classId, sectionId] = sel.split("|");
      if (!classId) continue;
      await addExamClass(ctx.institutionId, ctx.session.authUserId, examinationId, classId, sectionId || null);
      added++;
    }
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null, added };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to confirm exam scope." };
  }
}

export async function removeExamClassAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await removeExamClass(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("examClassId") ?? ""));
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove class." };
  }
}

/** §418 companion to bulkSetExamScopeAction — same "select several, Save
 *  once" pattern for subjects: every checked subjectId gets its own
 *  max/pass marks inputs (name-suffixed `max_<subjectId>`/`pass_<subjectId>`,
 *  same convention markStaffAttendanceAction already uses for per-row
 *  fields), added in one submit instead of one row at a time. */
export async function bulkAddExamSubjectsAction(_prevState: { error: string | null; added?: number }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const subjectIds = formData.getAll("subjectId").map(String);
    let added = 0;
    for (const subjectId of subjectIds) {
      const maxRaw = formData.get(`max_${subjectId}`);
      const passRaw = formData.get(`pass_${subjectId}`);
      await addExamSubject(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
        examinationId,
        subjectId,
        maxMarks: maxRaw ? Number(maxRaw) : 100,
        passMarks: passRaw ? Number(passRaw) : 35,
      });
      added++;
    }
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null, added };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add exam subjects." };
  }
}

export async function removeExamSubjectAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await removeExamSubject(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("examSubjectId") ?? ""));
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove subject." };
  }
}

export async function saveMarksAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examSubjectId = String(formData.get("examSubjectId") ?? "");
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "marks.enter");
    const studentIds = formData.getAll("studentId").map(String);
    const entries = studentIds.map((studentId) => {
      const raw = formData.get(`marks_${studentId}`);
      const isAbsent = formData.get(`absent_${studentId}`) === "on";
      return {
        studentId,
        marksObtained: isAbsent || raw === "" || raw === null ? null : Number(raw),
        isAbsent,
      };
    });
    await enterMarks(ctx.institutionId, ctx.session.authUserId, ctx.userId, examSubjectId, entries);
    revalidatePath(`/examinations/${examinationId}/marks/${examSubjectId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save marks." };
  }
}

async function transitionAction(
  permission: string, fn: (institutionId: string, authUserId: string, examSubjectId: string, userId: string) => Promise<number>,
  formData: FormData
) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examSubjectId = String(formData.get("examSubjectId") ?? "");
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, permission);
    const count = await fn(ctx.institutionId, ctx.session.authUserId, examSubjectId, ctx.userId);
    revalidatePath(`/examinations/${examinationId}/marks/${examSubjectId}`);
    return { error: null, count };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Action failed." };
  }
}

export async function submitMarksAction(_prevState: { error: string | null }, formData: FormData) {
  return transitionAction("marks.enter", submitMarks, formData);
}
export async function verifyMarksAction(_prevState: { error: string | null }, formData: FormData) {
  return transitionAction("marks.verify", verifyMarks, formData);
}
export async function approveMarksAction(_prevState: { error: string | null }, formData: FormData) {
  return transitionAction("marks.approve", approveMarks, formData);
}
export async function lockMarksAction(_prevState: { error: string | null }, formData: FormData) {
  return transitionAction("marks.lock", lockMarks, formData);
}

export async function computeResultsAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "marks.approve");
    await computeResults(ctx.institutionId, ctx.session.authUserId, examinationId);
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to compute results." };
  }
}

// ---------------------------------------------------------------------------
// Daily Assessment (§Daily Assessment) -- day-to-day teaching actions, so
// these are gated on "marks.enter" (the same permission the standard
// per-subject marks entry form above uses) rather than "settings.manage"
// (admin-only, used for the monthly register's own creation via
// createExaminationAction above). A teacher without an institution-wide
// grant is further scoped to their own assigned classes/subjects, exactly
// like the marks entry page already does -- see
// app/(institution)/examinations/[id]/daily/[assessmentId]/page.tsx.
// ---------------------------------------------------------------------------

export async function createDailyAssessmentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "marks.enter");
    await createDailyAssessment(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      examinationId,
      classId: String(formData.get("classId") ?? ""),
      subjectId: String(formData.get("subjectId") ?? ""),
      assessmentDate: String(formData.get("assessmentDate") ?? ""),
      portion: String(formData.get("portion") ?? ""),
      maxMarks: Number(formData.get("maxMarks") ?? 20),
    });
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add the day's assessment." };
  }
}

export async function saveDailyAssessmentMarksAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const dailyAssessmentId = String(formData.get("dailyAssessmentId") ?? "");
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "marks.enter");
    const studentIds = formData.getAll("studentId").map(String);
    const entries = studentIds.map((studentId) => {
      const raw = formData.get(`marks_${studentId}`);
      const isAbsent = formData.get(`absent_${studentId}`) === "on";
      return {
        studentId,
        marksObtained: isAbsent || raw === "" || raw === null ? null : Number(raw),
        isAbsent,
      };
    });
    await enterDailyAssessmentMarks(ctx.institutionId, ctx.session.authUserId, ctx.userId, dailyAssessmentId, entries);
    revalidatePath(`/examinations/${examinationId}/daily/${dailyAssessmentId}`);
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save marks." };
  }
}
