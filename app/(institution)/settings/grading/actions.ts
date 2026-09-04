"use server";

/**
 * §137 follow-up ("the same system should work with other institution as
 * well, data will be different, sometimes configurations also will be
 * different") — server actions for the four points-bearing configuration
 * families that were previously seed-script-only (grading, scoring rules,
 * achievement categories/levels, skill types/activities). All gated the
 * same way /academic's actions.ts is: "settings.manage", re-checked
 * server-side regardless of what the page rendered client-side.
 */
import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import {
  createGradeScale, updateGradeScale, deleteGradeScale, setDefaultGradeScale,
  createGradeBand, updateGradeBand, deleteGradeBand,
  createExamType, updateExamType, deleteExamType,
} from "../../../../modules/examination/service";
import { updateInstitutionPassPct, updateInstitutionTrackOrder } from "../../../../services/institution/institution-service";
import { createScoringRule, updateScoringRule, deleteScoringRule } from "../../../../modules/scoring/service";
import {
  createAchievementCategory, updateAchievementCategory, deleteAchievementCategory,
  createAchievementLevel, updateAchievementLevel, deleteAchievementLevel,
} from "../../../../modules/achievements/service";
import {
  createSkillType, updateSkillType, deleteSkillType,
  createSkillActivity, updateSkillActivity, deleteSkillActivity,
} from "../../../../modules/skills/service";

export interface GradingActionState { error: string | null }
const OK: GradingActionState = { error: null };
const PATH = "/settings/grading";

function num(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

// ---------------------------------------------------------------------------
// Grade scales / bands
// ---------------------------------------------------------------------------
export async function createGradeScaleAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createGradeScale(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      name: String(formData.get("name") ?? ""),
      isDefault: formData.get("isDefault") === "on",
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create grade scale." };
  }
}

export async function updateGradeScaleAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateGradeScale(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("gradeScaleId") ?? ""), {
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update grade scale." };
  }
}

export async function deleteGradeScaleAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteGradeScale(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("gradeScaleId") ?? ""));
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete grade scale." };
  }
}

export async function setDefaultGradeScaleAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await setDefaultGradeScale(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("gradeScaleId") ?? ""));
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to set default grade scale." };
  }
}

export async function createGradeBandAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const color = String(formData.get("color") ?? "").trim();
    await createGradeBand(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      gradeScaleId: String(formData.get("gradeScaleId") ?? ""),
      minPercent: num(formData, "minPercent") ?? 0,
      maxPercent: num(formData, "maxPercent") ?? 0,
      gradeLabel: String(formData.get("gradeLabel") ?? ""),
      gradePoint: num(formData, "gradePoint") ?? null,
      color: color || null,
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add grade band." };
  }
}

/** Result Analysis & Reporting spec — tenant-wide default PassPct, edited
 *  here alongside grade scales/bands since it's the other half of "how
 *  this institution grades an exam" even though it lives on institutions,
 *  not grade_scales. */
export async function updatePassPctAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateInstitutionPassPct(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      passPct: num(formData, "passPct") ?? 35,
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update pass percentage." };
  }
}

/** Education Type follow-up — "which should come first will be decided by
 *  institute admin" (verbatim ask). Only shown/used when this institution
 *  is in 'both' mode (see page.tsx). */
export async function updateTrackOrderAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const first = String(formData.get("firstTrack") ?? "academic") as "academic" | "islamic";
    const second = first === "academic" ? "islamic" : "academic";
    await updateInstitutionTrackOrder(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      trackOrder: [first, second],
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update track order." };
  }
}

export async function updateGradeBandAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const colorRaw = formData.get("color");
    await updateGradeBand(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("gradeBandId") ?? ""), {
      minPercent: num(formData, "minPercent"),
      maxPercent: num(formData, "maxPercent"),
      gradeLabel: String(formData.get("gradeLabel") ?? "") || undefined,
      gradePoint: num(formData, "gradePoint") ?? null,
      color: colorRaw !== null && String(colorRaw).trim() !== "" ? String(colorRaw).trim() : null,
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update grade band." };
  }
}

export async function deleteGradeBandAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteGradeBand(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("gradeBandId") ?? ""));
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete grade band." };
  }
}

// ---------------------------------------------------------------------------
// Exam types
// ---------------------------------------------------------------------------
export async function createExamTypeAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createExamType(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      category: String(formData.get("category") ?? "") || null,
      periodicity: String(formData.get("periodicity") ?? "") || null,
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create exam type." };
  }
}

export async function updateExamTypeAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateExamType(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("examTypeId") ?? ""), {
      name: String(formData.get("name") ?? "") || undefined,
      category: String(formData.get("category") ?? "") || null,
      periodicity: String(formData.get("periodicity") ?? "") || null,
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update exam type." };
  }
}

export async function deleteExamTypeAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteExamType(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("examTypeId") ?? ""));
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete exam type." };
  }
}

// ---------------------------------------------------------------------------
// Scoring rules
// ---------------------------------------------------------------------------
export async function createScoringRuleAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createScoringRule(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      module: String(formData.get("module") ?? ""),
      activityCode: String(formData.get("activityCode") ?? ""),
      conditionJsonb: {},
      points: num(formData, "points") ?? 0,
      maxPoints: num(formData, "maxPoints") ?? null,
      verificationRequired: formData.get("verificationRequired") === "on",
      approvalRequired: formData.get("approvalRequired") === "on",
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create scoring rule." };
  }
}

export async function updateScoringRuleAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateScoringRule(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("scoringRuleId") ?? ""), {
      points: num(formData, "points"),
      maxPoints: num(formData, "maxPoints") ?? null,
      isActive: formData.get("isActive") === "on",
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update scoring rule." };
  }
}

export async function deleteScoringRuleAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteScoringRule(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("scoringRuleId") ?? ""));
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete scoring rule." };
  }
}

// ---------------------------------------------------------------------------
// Achievement categories / levels
// ---------------------------------------------------------------------------
export async function createAchievementCategoryAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createAchievementCategory(ctx.institutionId, ctx.session.authUserId, ctx.userId, { name: String(formData.get("name") ?? "") });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create category." };
  }
}

export async function updateAchievementCategoryAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateAchievementCategory(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("categoryId") ?? ""), {
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update category." };
  }
}

export async function deleteAchievementCategoryAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteAchievementCategory(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("categoryId") ?? ""));
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete category." };
  }
}

export async function createAchievementLevelAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createAchievementLevel(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      name: String(formData.get("name") ?? ""),
      sortOrder: num(formData, "sortOrder") ?? 0,
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create level." };
  }
}

export async function updateAchievementLevelAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateAchievementLevel(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("levelId") ?? ""), {
      name: String(formData.get("name") ?? "") || undefined,
      sortOrder: num(formData, "sortOrder"),
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update level." };
  }
}

export async function deleteAchievementLevelAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteAchievementLevel(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("levelId") ?? ""));
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete level." };
  }
}

// ---------------------------------------------------------------------------
// Skill types / activities
// ---------------------------------------------------------------------------
export async function createSkillTypeAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createSkillType(ctx.institutionId, ctx.session.authUserId, ctx.userId, { name: String(formData.get("name") ?? "") });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create skill type." };
  }
}

export async function updateSkillTypeAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateSkillType(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("skillTypeId") ?? ""), {
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update skill type." };
  }
}

export async function deleteSkillTypeAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteSkillType(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("skillTypeId") ?? ""));
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete skill type." };
  }
}

export async function createSkillActivityAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await createSkillActivity(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      skillTypeId: String(formData.get("skillTypeId") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      evidenceRequired: formData.get("evidenceRequired") === "on",
      verificationRequired: formData.get("verificationRequired") === "on",
      approvalRequired: formData.get("approvalRequired") === "on",
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create activity." };
  }
}

export async function updateSkillActivityAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await updateSkillActivity(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("skillActivityId") ?? ""), {
      name: String(formData.get("name") ?? "") || undefined,
      isActive: formData.get("isActive") === "on",
    });
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update activity." };
  }
}

export async function deleteSkillActivityAction(_prev: GradingActionState, formData: FormData): Promise<GradingActionState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteSkillActivity(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("skillActivityId") ?? ""));
    revalidatePath(PATH);
    return OK;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete activity." };
  }
}
