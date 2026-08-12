"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createExamination, addExamSubject, addExamClass,
  enterMarks, submitMarks, verifyMarks, approveMarks, lockMarks, computeResults,
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
