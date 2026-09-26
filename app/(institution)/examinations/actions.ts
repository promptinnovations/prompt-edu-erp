"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createExamination, updateExamination, deleteExamination,
  addExamSubject, addExamClass, removeExamClass, removeExamSubject,
  enterMarksAndRecompute, deleteMarkAndRecompute, correctMark, submitMarks, verifyMarks, approveMarks, lockMarks,
  createDailyAssessment, enterDailyAssessmentMarks, updateDailyAssessment, deleteDailyAssessment, getDailyAssessment,
  enterCeMarksAndRecompute, setCeComponents, finalizeExamination, setInstitutionCeDefaults,
} from "../../../modules/examination/service";
import { assertMarkEntryScope, assertDailyAssessmentScope } from "../../../services/scope/teacher-scope-service";

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

/** §1.6 explicit, irreversible "Finalize results" — freezes every result
 *  row of the exam. Gated on marks.lock (whoever can lock marks can lock
 *  the results built from them) plus settings.manage. */
export async function finalizeExaminationAction(_prevState: { error: string | null; frozen?: number }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  try {
    requirePermission(ctx.permissions, "settings.manage");
    requirePermission(ctx.permissions, "marks.lock");
    const { frozen } = await finalizeExamination(ctx.institutionId, ctx.session.authUserId, ctx.userId, examinationId);
    revalidatePath(`/examinations/${examinationId}`);
    revalidatePath("/examinations");
    revalidatePath("/results");
    return { error: null, frozen };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to finalize results." };
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

/** Edits an already approved/locked mark, via correctMark() — deliberately
 *  gated on "marks.lock" (not "marks.enter"), matching that function's own
 *  doc comment: a correction bypasses the normal draft-only edit path, so
 *  only whoever can lock marks in the first place may reopen one. */
export async function correctMarkAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const examinationId = String(formData.get("examinationId") ?? "");
  const examSubjectId = String(formData.get("examSubjectId") ?? "");
  try {
    requirePermission(ctx.permissions, "marks.lock");
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
    await assertMarkEntryScope(ctx.institutionId, ctx.session.authUserId, ctx.userId, ctx.permissions, examSubjectId);
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
