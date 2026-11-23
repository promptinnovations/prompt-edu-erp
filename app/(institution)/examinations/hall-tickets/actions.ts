"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import {
  saveHallTicketSettings, addExamTimetableEntry, addExamTimetableFromText, deleteExamTimetableEntry, copyExamTimetable,
} from "../../../../modules/examination/hall-ticket-service";

const PERMISSION = "examinations.halltickets.manage";
export interface HallState { error: string | null; message: string | null }
const ok = (message: string): HallState => ({ error: null, message });
const fail = (err: unknown, fallback: string): HallState => ({ error: err instanceof Error ? err.message : fallback, message: null });

async function admin() {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) throw new Error("No active institution.");
  requirePermission(ctx.permissions, PERMISSION);
  return { ctx, institutionId: ctx.institutionId, authUserId: ctx.session.authUserId, userId: ctx.userId };
}

export async function saveHallTicketSettingsAction(_prev: HallState, formData: FormData): Promise<HallState> {
  try {
    const a = await admin();
    await saveHallTicketSettings(a.institutionId, a.authUserId, a.userId, {
      ticketTitle: String(formData.get("ticketTitle") ?? ""),
      address: String(formData.get("address") ?? ""),
      email: String(formData.get("email") ?? ""),
      phones: String(formData.get("phones") ?? ""),
      instructions: String(formData.get("instructions") ?? ""),
      showSignature: formData.get("showSignature") === "on",
      includeSeating: formData.get("includeSeating") === "on",
    });
    revalidatePath("/examinations/hall-tickets");
    return ok("Saved.");
  } catch (err) { return fail(err, "Could not save the settings."); }
}

export async function addTimetableEntryAction(_prev: HallState, formData: FormData): Promise<HallState> {
  try {
    const a = await admin();
    const subjectId = String(formData.get("subjectId") ?? "");
    const endTime = String(formData.get("endTime") ?? "");
    await addExamTimetableEntry(a.institutionId, a.authUserId, a.userId, {
      examinationId: String(formData.get("examinationId") ?? ""),
      classId: String(formData.get("classId") ?? ""),
      subjectId: subjectId || null,
      subjectLabel: String(formData.get("subjectLabel") ?? ""),
      examDate: String(formData.get("examDate") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      endTime: endTime || null,
    });
    revalidatePath("/examinations/hall-tickets");
    return ok("Added.");
  } catch (err) { return fail(err, "Could not add the paper."); }
}

export async function addTimetableTextAction(_prev: HallState, formData: FormData): Promise<HallState> {
  try {
    const a = await admin();
    const res = await addExamTimetableFromText(a.institutionId, a.authUserId, a.userId, {
      examinationId: String(formData.get("examinationId") ?? ""),
      classId: String(formData.get("classId") ?? ""),
      text: String(formData.get("text") ?? ""),
    });
    revalidatePath("/examinations/hall-tickets");
    if (res.added === 0) return { error: res.errors.join(" "), message: null };
    return { error: res.errors.length ? `Some lines were skipped: ${res.errors.join(" ")}` : null, message: `Added ${res.added} paper${res.added === 1 ? "" : "s"}.` };
  } catch (err) { return fail(err, "Could not add the lines."); }
}

export async function deleteTimetableEntryAction(_prev: HallState, formData: FormData): Promise<HallState> {
  try {
    const a = await admin();
    await deleteExamTimetableEntry(a.institutionId, a.authUserId, a.userId, String(formData.get("entryId") ?? ""));
    revalidatePath("/examinations/hall-tickets");
    return ok("Removed.");
  } catch (err) { return fail(err, "Could not remove the paper."); }
}

export async function copyTimetableAction(_prev: HallState, formData: FormData): Promise<HallState> {
  try {
    const a = await admin();
    const n = await copyExamTimetable(a.institutionId, a.authUserId, a.userId, {
      examinationId: String(formData.get("examinationId") ?? ""),
      fromClassId: String(formData.get("classId") ?? ""),
      toClassIds: formData.getAll("toClassIds").map(String),
    });
    revalidatePath("/examinations/hall-tickets");
    return ok(`Copied (${n} papers).`);
  } catch (err) { return fail(err, "Could not copy the timetable."); }
}
