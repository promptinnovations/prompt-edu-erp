"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { can, requirePermission } from "../../../services/permissions/permission-service";
import {
  createExamination, updateExamination, deleteExamination,
  addExamSubject, addExamClass, removeExamClass, removeExamSubject, saveExamScopePlan,
  enterMarksAndRecompute, deleteMarkAndRecompute, correctMark,
  createDailyAssessment, enterDailyAssessmentMarks, updateDailyAssessment, deleteDailyAssessment, getDailyAssessment,
  enterCeMarksAndRecompute, setCeComponents, setInstitutionCeDefaults,
  publishExamination, unpublishExamination, closeMarkEntry, reopenMarkEntry, finalizeExamination,
} from "../../../modules/examination/service";
import { assertMarkEntryScope, assertDailyAssessmentScope } from "../../../services/scope/teacher-scope-service";

export async function createExaminationAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    // §"fix it so that i can create a daily assessment of a past month for
    // entering marks" — the Daily Assessment branch of ExaminationForm.tsx
    // submits a "Register month" picker as forDate (type="month", so
    // "YYYY-MM"); createExamination() needs a real date to month-truncate,
    // so pad it to the 1st of that month. Ignored entirely for every other
    // exam type (createExamination() only reads forDate in the
    // is_daily_assessment branch).
    const forDateRaw = String(formData.get("forDate") ?? "").trim();
    const forDate = /^\d{4}-\d{2}$/.test(forDateRaw) ? `${forDateRaw}-01` : forDateRaw || undefined;
    const exam = await createExamination(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      examTypeId: String(formData.get("examTypeId") ?? ""),
      academicYearId: String(formData.get("academicYearId") ?? ""),
      name: String(formData.get("name") ?? ""),
      forDate,
    });
    revalidatePath("/examinations");
    return { error: null, examinationId: exam.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create examination." };
  }
}

export async function updateExaminationAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const name = formData.get("name");
    const academicYearId = formData.get("academicYearId");
    await updateExamination(ctx.institutionId, ctx.session.authUserId, ctx.userId, examinationId, {
      name: name ? String(name) : undefined,
      academicYearId: academicYearId ? String(academicYearId) : undefined,
    });
    revalidatePath("/examinations");
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update examination." };
  }
}

export async function deleteExaminationAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await deleteExamination(ctx.institutionId, ctx.session.authUserId, ctx.userId, examinationId);
    revalidatePath("/examinations");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete examination." };
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

/** Migration 0056 — "Section (HS, UP, LP etc.) > Grades > Divisions - for
 *  each grade an option for choosing relevant subject for the exam". The
 *  planner (ExamScopePlanner) posts the whole scope as one JSON `plan`
 *  field: [{ classId, sectionIds[], subjectIds[] }] for every grade in
 *  scope, plus default max/pass marks for newly-added subjects. Replaces
 *  the old separate "confirm scope" + "add subjects to the whole exam"
 *  forms, which applied every checked subject to every class. */
export async function saveExamScopePlanAction(_prevState: { error: string | null; saved?: string }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const grades = JSON.parse(String(formData.get("plan") ?? "[]")) as Array<{ classId: string; sectionIds: string[]; subjectIds: string[] }>;
    const maxRaw = String(formData.get("defaultMaxMarks") ?? "").trim();
    const passRaw = String(formData.get("defaultPassMarks") ?? "").trim();
    const out = await saveExamScopePlan(ctx.institutionId, ctx.session.authUserId, ctx.userId, examinationId, {
      grades,
      defaultMaxMarks: maxRaw ? Number(maxRaw) : 100,
      defaultPassMarks: passRaw ? Number(passRaw) : 35,
    });
    revalidatePath(`/examinations/${examinationId}`);
    revalidatePath("/examinations/status");
    revalidatePath("/results");
    return { error: null, saved: `${out.grades} grade(s), ${out.subjects} subject(s) saved.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save exam scope." };
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
    await assertMarkEntryScope(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, examSubjectId);
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
    await enterMarksAndRecompute(ctx.institutionId, ctx.session.authUserId, ctx.userId, examSubjectId, entries);
    // §CE: the same grid carries one column per CE component
    // (ce_<componentId>_<studentId> / ceabsent_<componentId>_<studentId>),
    // saved through the same blank/absent rules as the written mark.
    const ceComponentIds = formData.getAll("ceComponentId").map(String);
    if (ceComponentIds.length > 0) {
      const ceEntries = ceComponentIds.flatMap((componentId) => studentIds.map((studentId) => {
        const raw = formData.get(`ce_${componentId}_${studentId}`);
        const isAbsent = formData.get(`ceabsent_${componentId}_${studentId}`) === "on";
        return {
          studentId, componentId,
          marksObtained: isAbsent || raw === "" || raw === null ? null : Number(raw),
          isAbsent,
        };
      }));
      await enterCeMarksAndRecompute(ctx.institutionId, ctx.session.authUserId, ctx.userId, examSubjectId, ceEntries);
    }
    revalidatePath(`/examinations/${examinationId}/marks/${examSubjectId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save marks." };
  }
}

/** §8 overall pass threshold + §CE on/off/mode for one exam (admin-only,
 *  same settings.manage gate as every other exam-config action). */
export async function updateExamResultSettingsAction(_prevState: { error: string | null; saved?: boolean }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const rawPct = String(formData.get("overallPassPct") ?? "").trim();
    const ceMode = String(formData.get("ceMode") ?? "total");
    await updateExamination(ctx.institutionId, ctx.session.authUserId, ctx.userId, examinationId, {
      overallPassPct: rawPct === "" ? null : Number(rawPct),
      ceEnabled: formData.get("ceEnabled") === "on",
      ceMode: ceMode === "components" ? "components" : "total",
    });
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null, saved: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save result settings." };
  }
}

/** §CE components for one exam subject. Form fields: repeated
 *  `ceName`/`ceMax` pairs (Total mode sends a single `ceMax`). */
export async function setCeComponentsAction(_prevState: { error: string | null; saved?: boolean }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  const examSubjectId = String(formData.get("examSubjectId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    const names = formData.getAll("ceName").map(String);
    const maxes = formData.getAll("ceMax").map(String);
    const components = maxes
      .map((m, i) => ({ name: (names[i] ?? "CE").trim() || "CE", maxMarks: Number(m) }))
      .filter((c) => c.maxMarks > 0);
    await setCeComponents(ctx.institutionId, ctx.session.authUserId, ctx.userId, examSubjectId, components);
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null, saved: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save CE components." };
  }
}

/** §"admin will switch mark entry Open > Closed > Published > Archived" —
 *  gated on the same admin/principal-level composite (marks.approve or
 *  settings.manage) used everywhere else in the app this round for "sees/
 *  controls results beyond their own class" (see results/consolidated,
 *  results/report-cards, analytics). Used for close/reopen mark entry,
 *  publish/unpublish, and archive. A teacher (marks.enter only) never
 *  reaches any of these. */
function requireCanManageMarkEntryStatus(ctx: { isSuperAdmin: boolean; permissions: Set<string> }) {
  if (ctx.isSuperAdmin || can(ctx.permissions, "marks.approve") || can(ctx.permissions, "settings.manage")) return;
  throw new Error("Only the principal/management or an institution admin can manage mark entry status.");
}

export async function publishExaminationAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requireCanManageMarkEntryStatus(ctx);
    await publishExamination(ctx.institutionId, ctx.session.authUserId, ctx.userId, examinationId);
    revalidatePath(`/examinations/${examinationId}`);
    revalidatePath("/examinations");
    revalidatePath("/results");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to publish results." };
  }
}

export async function unpublishExaminationAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requireCanManageMarkEntryStatus(ctx);
    await unpublishExamination(ctx.institutionId, ctx.session.authUserId, ctx.userId, examinationId);
    revalidatePath(`/examinations/${examinationId}`);
    revalidatePath("/examinations");
    revalidatePath("/results");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to unpublish results." };
  }
}

/** §"admin will switch mark entry Open > Closed > Published > Archived" —
 *  Closed stops teachers writing marks; admin corrections stay available. */
export async function closeMarkEntryAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requireCanManageMarkEntryStatus(ctx);
    await closeMarkEntry(ctx.institutionId, ctx.session.authUserId, ctx.userId, examinationId);
    revalidatePath(`/examinations/${examinationId}`);
    revalidatePath("/examinations");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to close mark entry." };
  }
}

export async function reopenMarkEntryAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requireCanManageMarkEntryStatus(ctx);
    await reopenMarkEntry(ctx.institutionId, ctx.session.authUserId, ctx.userId, examinationId);
    revalidatePath(`/examinations/${examinationId}`);
    revalidatePath("/examinations");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reopen mark entry." };
  }
}

/** "Archive" in the Open/Closed/Published/Archived status — reuses the
 *  pre-existing one-way finalizeExamination() freeze. */
export async function archiveExaminationAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requireCanManageMarkEntryStatus(ctx);
    await finalizeExamination(ctx.institutionId, ctx.session.authUserId, ctx.userId, examinationId);
    revalidatePath(`/examinations/${examinationId}`);
    revalidatePath("/examinations");
    revalidatePath("/results");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to archive this examination." };
  }
}

/** Institution-wide §CE defaults applied to newly created exams. */
export async function setInstitutionCeDefaultsAction(_prevState: { error: string | null; saved?: boolean }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "settings.manage");
    await setInstitutionCeDefaults(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      enabled: formData.get("ceEnabled") === "on",
      mode: formData.get("ceMode") === "components" ? "components" : "total",
    });
    revalidatePath("/settings/grading");
    return { error: null, saved: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save CE defaults." };
  }
}

export async function deleteMarkAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  const examSubjectId = String(formData.get("examSubjectId") ?? "");
  try {
    requirePermission(ctx.permissions, "marks.enter");
    await assertMarkEntryScope(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, examSubjectId);
    await deleteMarkAndRecompute(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("markId") ?? ""));
    revalidatePath(`/examinations/${examinationId}/marks/${examSubjectId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove mark." };
  }
}

/** Edits a mark of any status, via correctMark() — §"1 for admin" gated on
 *  the same admin/principal composite as close/reopen/publish/archive
 *  (NOT "marks.enter": a correction deliberately bypasses the normal
 *  draft-only edit path in enterMarks(), and stays available to admin/
 *  principal even while mark entry is Closed for teachers). */
export async function correctMarkAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  const examSubjectId = String(formData.get("examSubjectId") ?? "");
  try {
    requireCanManageMarkEntryStatus(ctx);
    await assertMarkEntryScope(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, examSubjectId);
    const raw = formData.get("newValue");
    const isAbsent = formData.get("isAbsent") === "on";
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return { error: "A reason is required for a correction." };
    const newValue = isAbsent || raw === "" || raw === null ? null : Number(raw);
    await correctMark(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("markId") ?? ""), newValue, reason);
    revalidatePath(`/examinations/${examinationId}/marks/${examSubjectId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to correct mark." };
  }
}

// §"stop principal's approval and lock part" — the old submit/verify/
// approve/lock per-subject transition actions (and their transitionAction()
// helper) lived here; removed from the UI/action layer along with the
// Submit/Verify/Approve/Lock buttons in MarksGridForm.tsx. The underlying
// submitMarks/verifyMarks/approveMarks/lockMarks service functions are kept
// (older tests still exercise them directly) but are no longer reachable
// from any UI action.

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
    const classId = String(formData.get("classId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    await assertDailyAssessmentScope(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, classId, subjectId);
    await createDailyAssessment(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      examinationId,
      classId,
      subjectId,
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

export async function updateDailyAssessmentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const dailyAssessmentId = String(formData.get("dailyAssessmentId") ?? "");
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "marks.enter");
    const existing = await getDailyAssessment(ctx.institutionId, ctx.session.authUserId, dailyAssessmentId);
    if (!existing) return { error: "Daily assessment entry not found." };
    await assertDailyAssessmentScope(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, existing.class_id, existing.subject_id);
    const classId = String(formData.get("classId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    if ((classId && classId !== existing.class_id) || (subjectId && subjectId !== existing.subject_id)) {
      await assertDailyAssessmentScope(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, classId || existing.class_id, subjectId || existing.subject_id);
    }
    const assessmentDate = String(formData.get("assessmentDate") ?? "");
    const portion = String(formData.get("portion") ?? "");
    const maxMarksRaw = formData.get("maxMarks");
    await updateDailyAssessment(ctx.institutionId, ctx.session.authUserId, ctx.userId, dailyAssessmentId, {
      classId: classId || undefined,
      subjectId: subjectId || undefined,
      assessmentDate: assessmentDate || undefined,
      portion: portion || undefined,
      maxMarks: maxMarksRaw ? Number(maxMarksRaw) : undefined,
    });
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update this entry." };
  }
}

export async function deleteDailyAssessmentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const dailyAssessmentId = String(formData.get("dailyAssessmentId") ?? "");
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "marks.enter");
    const existing = await getDailyAssessment(ctx.institutionId, ctx.session.authUserId, dailyAssessmentId);
    if (!existing) return { error: "Daily assessment entry not found." };
    await assertDailyAssessmentScope(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, existing.class_id, existing.subject_id);
    await deleteDailyAssessment(ctx.institutionId, ctx.session.authUserId, ctx.userId, dailyAssessmentId);
    revalidatePath(`/examinations/${examinationId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete this entry." };
  }
}

export async function saveDailyAssessmentMarksAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const dailyAssessmentId = String(formData.get("dailyAssessmentId") ?? "");
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "marks.enter");
    const existing = await getDailyAssessment(ctx.institutionId, ctx.session.authUserId, dailyAssessmentId);
    if (!existing) return { error: "Daily assessment entry not found." };
    await assertDailyAssessmentScope(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, existing.class_id, existing.subject_id);
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
