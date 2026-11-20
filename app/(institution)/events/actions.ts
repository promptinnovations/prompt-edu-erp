"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireRequestContext } from "../../../services/request-context";
import { can, requirePermission } from "../../../services/permissions/permission-service";
import {
  createHouse, updateHouse, deleteHouse, autoAssignHouses, assignStudentHouses,
  createEvent, updateEvent, deleteEvent, setEventStatus, createItem, updateItem, deleteItem,
  setItemJudges, enrolEntry, withdrawEntry, setEntryStatus, saveScores, EventsError, EVENT_STATUSES,
  type EventStatus,
} from "../../../modules/events/service";
import type { ActionResult } from "./ActionForm";

type Ctx = Awaited<ReturnType<typeof requireRequestContext>>;

/** Shared wrapper: context + permission + friendly errors + revalidation. */
async function run(perm: string | string[], fn: (ctx: Ctx, institutionId: string, authUserId: string) => Promise<string | null | void>): Promise<ActionResult> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    const perms = Array.isArray(perm) ? perm : [perm];
    if (!ctx.isSuperAdmin && !perms.some((p) => can(ctx.permissions, p))) requirePermission(ctx.permissions, perms[0]);
    const ok = await fn(ctx, ctx.institutionId, ctx.session.authUserId);
    revalidatePath("/events", "layout");
    return { error: null, ok: ok ?? "Saved." };
  } catch (e) {
    if (e instanceof EventsError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form." };
    if (e instanceof Error && /Forbidden/.test(e.message)) return { error: "You don't have permission to do this." };
    if (e instanceof Error && /duplicate key|unique/i.test(e.message)) return { error: "That already exists." };
    console.error("[events action]", e);
    return { error: "Something went wrong — please try again." };
  }
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const optNum = (fd: FormData, k: string) => (str(fd, k) === "" ? null : Number(str(fd, k)));

// ── Houses ──
export async function saveHouseAction(_p: ActionResult, fd: FormData) {
  return run("events.manage", async (ctx, i, a) => {
    const input = { name: str(fd, "name"), color: str(fd, "color") || "#0f766e", sortOrder: optNum(fd, "sortOrder") ?? undefined };
    const id = opt(fd, "houseId");
    if (id) await updateHouse(i, a, ctx.userId, id, input);
    else await createHouse(i, a, ctx.userId, input);
    return id ? "House updated." : "House added.";
  });
}

export async function deleteHouseAction(_p: ActionResult, fd: FormData) {
  return run("events.manage", async (ctx, i, a) => { await deleteHouse(i, a, ctx.userId, str(fd, "houseId")); return "House removed."; });
}

export async function autoAssignHousesAction(_p: ActionResult, _fd: FormData) {
  return run("events.manage", async (ctx, i, a) => {
    const n = await autoAssignHouses(i, a, ctx.userId);
    return n === 0 ? "Every student already has a house." : `${n} student${n === 1 ? "" : "s"} placed in houses.`;
  });
}

/** The per-class house table: fields `house:<studentId>` (blank = no house). */
export async function assignHousesAction(_p: ActionResult, fd: FormData) {
  return run("events.manage", async (ctx, i, a) => {
    const list: Array<{ studentId: string; houseId: string | null }> = [];
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("house:")) continue;
      const before = String(fd.get(`was:${k.slice(6)}`) ?? "");
      if (String(v) === before) continue; // unchanged
      list.push({ studentId: k.slice(6), houseId: String(v) || null });
    }
    const n = await assignStudentHouses(i, a, ctx.userId, list);
    return n ? `${n} change${n === 1 ? "" : "s"} saved.` : "Nothing changed.";
  });
}

// ── Events ──
function eventInput(fd: FormData) {
  return {
    name: str(fd, "name"),
    kind: (str(fd, "kind") || "arts") as "arts",
    description: opt(fd, "description"),
    startDate: opt(fd, "startDate"),
    endDate: opt(fd, "endDate"),
    maxItemsPerStudent: optNum(fd, "maxItemsPerStudent"),
    gradeAMin: optNum(fd, "gradeAMin") ?? undefined,
    gradeBMin: optNum(fd, "gradeBMin") ?? undefined,
    gradeCMin: optNum(fd, "gradeCMin") ?? undefined,
  };
}

export async function createEventAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  let newId: string | null = null;
  const r = await run("events.manage", async (ctx, i, a) => { newId = (await createEvent(i, a, ctx.userId, eventInput(fd))).id; });
  if (newId) redirect(`/events/${newId}`);
  return r;
}

export async function updateEventAction(_p: ActionResult, fd: FormData) {
  return run("events.manage", async (ctx, i, a) => { await updateEvent(i, a, ctx.userId, str(fd, "eventId"), eventInput(fd)); return "Event updated."; });
}

export async function setEventStatusAction(_p: ActionResult, fd: FormData) {
  return run("events.manage", async (ctx, i, a) => {
    const status = str(fd, "status") as EventStatus;
    if (!EVENT_STATUSES.includes(status)) throw new EventsError("Unknown status.");
    await setEventStatus(i, a, ctx.userId, str(fd, "eventId"), status);
    return status === "published" ? "Results published to the portals." : "Status changed.";
  });
}

export async function deleteEventAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  let done = false;
  const r = await run("events.manage", async (ctx, i, a) => { await deleteEvent(i, a, ctx.userId, str(fd, "eventId")); done = true; });
  if (done) redirect("/events");
  return r;
}

// ── Items ──
function itemInput(fd: FormData) {
  const criteria = str(fd, "criteria").split(/[,\n]/).map((c) => c.trim()).filter(Boolean);
  const classes = fd.getAll("eligibleClassIds").map(String).filter(Boolean);
  const gender = str(fd, "gender");
  const participation = (str(fd, "participation") || "individual") as "individual" | "group";
  return {
    name: str(fd, "name"),
    category: opt(fd, "category"),
    participation,
    teamSizeMax: participation === "group" ? optNum(fd, "teamSizeMax") : null,
    eligibleClassIds: classes.length ? classes : null,
    gender: (gender === "male" || gender === "female" ? gender : null) as "male" | "female" | null,
    maxEntriesPerHouse: optNum(fd, "maxEntriesPerHouse"),
    criteria: criteria.length ? criteria : undefined,
    maxMarkPerCriterion: optNum(fd, "maxMarkPerCriterion") ?? undefined,
    pointsFirst: optNum(fd, "pointsFirst") ?? undefined,
    pointsSecond: optNum(fd, "pointsSecond") ?? undefined,
    pointsThird: optNum(fd, "pointsThird") ?? undefined,
    pointsGradeA: optNum(fd, "pointsGradeA") ?? undefined,
    pointsGradeB: optNum(fd, "pointsGradeB") ?? undefined,
    pointsGradeC: optNum(fd, "pointsGradeC") ?? undefined,
  };
}

export async function saveItemAction(_p: ActionResult, fd: FormData) {
  return run("events.manage", async (ctx, i, a) => {
    const id = opt(fd, "itemId");
    if (id) await updateItem(i, a, ctx.userId, id, itemInput(fd));
    else await createItem(i, a, ctx.userId, str(fd, "eventId"), itemInput(fd));
    return id ? "Item updated." : "Item added.";
  });
}

export async function deleteItemAction(_p: ActionResult, fd: FormData): Promise<ActionResult> {
  let done = false;
  const eventId = str(fd, "eventId");
  const r = await run("events.manage", async (ctx, i, a) => { await deleteItem(i, a, ctx.userId, str(fd, "itemId")); done = true; });
  if (done) redirect(`/events/${eventId}`);
  return r;
}

export async function setJudgesAction(_p: ActionResult, fd: FormData) {
  return run("events.manage", async (ctx, i, a) => {
    const ids = fd.getAll("judgeUserIds").map(String).filter(Boolean);
    await setItemJudges(i, a, ctx.userId, str(fd, "itemId"), ids);
    return ids.length ? `${ids.length} judge${ids.length === 1 ? "" : "s"} assigned.` : "Judges cleared.";
  });
}

// ── Entries ──
export async function enrolAction(_p: ActionResult, fd: FormData) {
  return run("events.manage", async (ctx, i, a) => {
    const ids = fd.getAll("studentIds").map(String).filter(Boolean);
    const r = await enrolEntry(i, a, ctx.userId, { itemId: str(fd, "itemId"), studentIds: ids, teamName: opt(fd, "teamName"), mode: "staff" });
    return `Entered — entry no. ${r.entry_no}.`;
  });
}

export async function withdrawEntryAction(_p: ActionResult, fd: FormData) {
  return run("events.manage", async (ctx, i, a) => { await withdrawEntry(i, a, ctx.userId, str(fd, "entryId"), "staff"); return "Entry withdrawn."; });
}

export async function setEntryStatusAction(_p: ActionResult, fd: FormData) {
  return run("events.manage", async (ctx, i, a) => {
    const s = str(fd, "status");
    if (!["enrolled", "absent", "withdrawn"].includes(s)) throw new EventsError("Unknown status.");
    await setEntryStatus(i, a, ctx.userId, str(fd, "entryId"), s as "enrolled");
    return "Updated.";
  });
}

// ── Judging ── fields `m:<entryId>:<criterion index>`
export async function saveScoresAction(_p: ActionResult, fd: FormData) {
  return run(["events.judge", "events.manage"], async (ctx, i, a) => {
    const criteria = fd.getAll("criteria").map(String);
    const marks: Record<string, Record<string, number | null>> = {};
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("m:")) continue;
      const [, entryId, idx] = k.split(":");
      const c = criteria[Number(idx)];
      if (!c) continue;
      const raw = String(v).trim();
      (marks[entryId] ??= {})[c] = raw === "" ? null : Number(raw);
    }
    const n = await saveScores(i, a, ctx.userId, str(fd, "itemId"), marks, { canManage: ctx.isSuperAdmin || can(ctx.permissions, "events.manage") });
    return `${n} mark${n === 1 ? "" : "s"} saved.`;
  });
}
