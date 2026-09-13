"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import {
  createExamRoom, updateExamRoom, deleteExamRoom, generateSeatingPlan, deleteSeatingPlan,
} from "../../../../modules/examination/seating-service";

const SEATING_PERMISSION = "examinations.seating.manage";

/** Shared parser for the room fields, used by both the master-room form and
 *  each ad-hoc room row on the generate form — one place that decides what
 *  "" means for the optional gender restriction. */
function readRoomFields(source: { name: unknown; benchCount: unknown; seatsPerBench: unknown; genderRestriction: unknown }): {
  name: string; benchCount: number; seatsPerBench: number; genderRestriction: "male" | "female" | null;
} {
  const genderRestriction = String(source.genderRestriction ?? "");
  return {
    name: String(source.name ?? ""),
    benchCount: Number(source.benchCount ?? 0),
    seatsPerBench: Number(source.seatsPerBench ?? 0),
    genderRestriction: genderRestriction === "male" || genderRestriction === "female" ? genderRestriction : null,
  };
}

export async function createExamRoomAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, SEATING_PERMISSION);
    await createExamRoom(ctx.institutionId, ctx.session.authUserId, ctx.userId, readRoomFields({
      name: formData.get("name"),
      benchCount: formData.get("benchCount"),
      seatsPerBench: formData.get("seatsPerBench"),
      genderRestriction: formData.get("genderRestriction"),
    }));
    revalidatePath("/examinations/seating");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add the room." };
  }
}

/** savedAt lets the inline edit row close itself on success (a plain
 *  `error: null` is indistinguishable from the untouched initial state). */
export interface UpdateExamRoomState { error: string | null; savedAt: number | null }

export async function updateExamRoomAction(
  _prevState: UpdateExamRoomState, formData: FormData
): Promise<UpdateExamRoomState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution.", savedAt: null };
  try {
    requirePermission(ctx.permissions, SEATING_PERMISSION);
    await updateExamRoom(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("roomId") ?? ""), {
      ...readRoomFields({
        name: formData.get("name"),
        benchCount: formData.get("benchCount"),
        seatsPerBench: formData.get("seatsPerBench"),
        genderRestriction: formData.get("genderRestriction"),
      }),
      isActive: formData.get("isActive") !== "false",
    });
    revalidatePath("/examinations/seating");
    return { error: null, savedAt: Date.now() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update the room.", savedAt: null };
  }
}

export async function deleteExamRoomAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, SEATING_PERMISSION);
    await deleteExamRoom(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("roomId") ?? ""));
    revalidatePath("/examinations/seating");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete the room." };
  }
}

export interface GenerateSeatingState {
  error: string | null;
  summary: string | null;
  warnings: string[];
}

/** Ad-hoc rooms arrive as three parallel repeated fields (adHocName /
 *  adHocBenchCount / adHocSeatsPerBench / adHocGenderRestriction) — the
 *  standard way a variable-length row list survives a plain FormData POST,
 *  same shape bulkSetExamScopeAction() uses for its repeated checkbox
 *  values. Rows whose name is blank are ignored, so an empty "add a room"
 *  row left on screen never blocks generation. */
export async function generateSeatingPlanAction(
  _prevState: GenerateSeatingState, formData: FormData
): Promise<GenerateSeatingState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution.", summary: null, warnings: [] };
  try {
    requirePermission(ctx.permissions, SEATING_PERMISSION);
    const examinationId = String(formData.get("examinationId") ?? "");

    const names = formData.getAll("adHocName").map(String);
    const benchCounts = formData.getAll("adHocBenchCount").map(String);
    const seatsPerBench = formData.getAll("adHocSeatsPerBench").map(String);
    const restrictions = formData.getAll("adHocGenderRestriction").map(String);
    const adHocRooms = names
      .map((name, i) => readRoomFields({
        name,
        benchCount: benchCounts[i],
        seatsPerBench: seatsPerBench[i],
        genderRestriction: restrictions[i],
      }))
      .filter((room) => room.name.trim() !== "");

    const result = await generateSeatingPlan(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      examinationId,
      roomIds: formData.getAll("roomId").map(String),
      adHocRooms,
    });

    const warnings: string[] = [];
    if (result.mixedRoomNames.length > 0) {
      warnings.push(
        `Capacity was tight, so the best-effort rule allowed mixed seating in: ${result.mixedRoomNames.join(", ")}.`
      );
    }
    if (result.unknownGenderCount > 0) {
      warnings.push(
        `${result.unknownGenderCount} student(s) have no gender recorded — they were seated last, and the boys/girls rule could not be applied to them.`
      );
    }

    revalidatePath("/examinations/seating");
    return {
      error: null,
      summary: `Seated ${result.studentCount} student(s) across ${result.roomCount} room(s) (${result.seatCount} seats available).`,
      warnings,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to generate the seating plan.",
      summary: null,
      warnings: [],
    };
  }
}

export async function deleteSeatingPlanAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, SEATING_PERMISSION);
    await deleteSeatingPlan(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("examinationId") ?? ""));
    revalidatePath("/examinations/seating");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete the seating plan." };
  }
}
