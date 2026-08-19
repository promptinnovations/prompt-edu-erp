"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  confirmSubstitutions, deleteSubstitution,
  upsertTimetablePeriod, deleteTimetablePeriod,
} from "../../../modules/substitution/service";

interface ConfirmRowInput { classId: string; sectionId: string; periodNo: number; subjectId: string | null; coveringStaffId: string | null }

export async function confirmSubstitutionsAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "substitution.manage");
    const date = String(formData.get("date") ?? "");
    const absentStaffId = String(formData.get("absentStaffId") ?? "");
    const rowsJson = String(formData.get("rowsJson") ?? "[]");
    let rows: ConfirmRowInput[];
    try {
      rows = JSON.parse(rowsJson);
    } catch {
      return { error: "Malformed submission — please try generating suggestions again." };
    }
    if (!Array.isArray(rows) || rows.length === 0) return { error: "Nothing to confirm." };
    await confirmSubstitutions(ctx.institutionId, ctx.session.authUserId, ctx.userId, { date, absentStaffId, rows });
    revalidatePath("/substitution");
    revalidatePath("/dashboard");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to confirm substitutions." };
  }
}

export async function deleteSubstitutionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "substitution.manage");
    const substitutionId = String(formData.get("substitutionId") ?? "");
    await deleteSubstitution(ctx.institutionId, ctx.session.authUserId, ctx.userId, substitutionId);
    revalidatePath("/substitution");
    revalidatePath("/dashboard");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete substitution." };
  }
}

export async function upsertTimetablePeriodAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "substitution.timetable.manage");
    const teacherStaffIdRaw = String(formData.get("teacherStaffId") ?? "").trim();
    const subjectIdRaw = String(formData.get("subjectId") ?? "").trim();
    await upsertTimetablePeriod(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      classId: String(formData.get("classId") ?? ""),
      sectionId: String(formData.get("sectionId") ?? ""),
      dayOfWeek: Number(formData.get("dayOfWeek") ?? 0),
      periodNo: Number(formData.get("periodNo") ?? 0),
      subjectId: subjectIdRaw || null,
      teacherStaffId: teacherStaffIdRaw || null,
    });
    revalidatePath("/substitution/timetable");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save timetable period." };
  }
}

export async function deleteTimetablePeriodAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "substitution.timetable.manage");
    const periodId = String(formData.get("periodId") ?? "");
    await deleteTimetablePeriod(ctx.institutionId, ctx.session.authUserId, ctx.userId, periodId);
    revalidatePath("/substitution/timetable");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete timetable period." };
  }
}
