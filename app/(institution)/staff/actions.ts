"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission, can } from "../../../services/permissions/permission-service";
import {
  createStaffMember, markStaffAttendance,
  createPortionPlan, recordPortionCompletion,
  recordTeacherObservation, createTeacherAssignment,
  createStaffLoginAccount, resetStaffLoginPassword,
  updateStaffMember, updateStaffProfile, updateStaffPhoto, getStaffProfile,
  createObservationCriterion, updateObservationCriterion, deleteObservationCriterion,
  recordTeacherObservationWithRubric,
} from "../../../modules/staff/service";
import { assignSectionHead, removeSectionHeadAssignment } from "../../../services/scope/section-head-scope-service";
import { uploadFile } from "../../../services/storage/file-service";
import type { RequestContext } from "../../../types/context";

/** §Staff-profile-self-service follow-up ("Individual Staff users can view
 *  and edit their own profile/details") -- the "personal" surface (bio
 *  fields via updateStaffProfileAction + photo) is editable either by
 *  someone holding the institution-wide `staff.edit` permission (admin/HR,
 *  unchanged) OR by the staff member editing their OWN record, identified
 *  server-side via staff.user_id === the caller's own user id (never
 *  trusted from the client). The "official" record (staff code,
 *  designation, department, employment status -- see updateStaffAction)
 *  deliberately stays `staff.edit`-only: those are HR-owned fields, not
 *  something a self-edit should be able to change. */
async function assertStaffSelfOrEditAccess(ctx: RequestContext, staffId: string): Promise<void> {
  if (can(ctx.permissions, "staff.edit")) return;
  if (!ctx.institutionId) throw new Error("No active institution.");
  const profile = await getStaffProfile(ctx.institutionId, ctx.session.authUserId, staffId);
  if (profile && profile.user_id === ctx.userId) return;
  throw new Error("You don't have permission to edit this staff profile.");
}

export async function createStaffAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.create");
    await createStaffMember(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      email: String(formData.get("email") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      staffCode: String(formData.get("staffCode") ?? ""),
      designation: String(formData.get("designation") ?? "") || null,
      department: String(formData.get("department") ?? "") || null,
      joiningDate: String(formData.get("joiningDate") ?? "") || null,
      employmentStatus: "active",
      roleCode: String(formData.get("roleCode") ?? "") || undefined,
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add staff member." };
  }
}

export async function createStaffLoginAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.create");
    await createStaffLoginAccount(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      staffId: String(formData.get("staffId") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create login." };
  }
}

export async function resetStaffLoginPasswordAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.create");
    await resetStaffLoginPassword(
      ctx.institutionId, ctx.session.authUserId, ctx.userId,
      String(formData.get("staffId") ?? ""), String(formData.get("password") ?? "")
    );
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reset password." };
  }
}

export async function markStaffAttendanceAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "attendance.enter");
    const date = String(formData.get("date") ?? "");
    const staffIds = formData.getAll("staffId").map(String);
    const entries = staffIds
      .map((staffId) => ({ staffId, statusId: String(formData.get(`status_${staffId}`) ?? "") }))
      .filter((e) => e.statusId);
    const result = await markStaffAttendance(ctx.institutionId, ctx.session.authUserId, ctx.userId, { date, entries });
    revalidatePath("/staff");
    return { error: null, marked: result.marked };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save staff attendance." };
  }
}

// applyForStaffLeaveAction/approveStaffLeaveAction/rejectStaffLeaveAction
// (§Page-4 follow-up) were retired here — staff now apply for their own
// leave via applyForOwnLeaveAction (app/(institution)/attendance/actions.ts)
// and the principal reviews it with the same generic approveLeaveAction/
// rejectLeaveAction every other leave type uses, both on the Attendance
// page. The underlying applyForStaffLeave()/reviewStaffLeave() service
// functions (modules/staff/service.ts) are unchanged and still covered by
// staff-flow.test.ts — only this page's UI wiring moved.

export async function createPortionPlanAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.portion.manage");
    await createPortionPlan(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      academicYearId: String(formData.get("academicYearId") ?? ""),
      classId: String(formData.get("classId") ?? ""),
      subjectId: String(formData.get("subjectId") ?? ""),
      teacherId: String(formData.get("teacherId") ?? ""),
      chapterName: String(formData.get("chapterName") ?? ""),
      plannedDate: String(formData.get("plannedDate") ?? "") || null,
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create portion plan." };
  }
}

export async function recordPortionCompletionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.portion.manage");
    await recordPortionCompletion(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      portionPlanId: String(formData.get("portionPlanId") ?? ""),
      completedDate: String(formData.get("completedDate") ?? ""),
      completionPercent: Number(formData.get("completionPercent") ?? 0),
      notes: String(formData.get("notes") ?? "") || null,
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record portion completion." };
  }
}

export async function recordTeacherObservationAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.observation.manage");
    await recordTeacherObservation(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      teacherId: String(formData.get("teacherId") ?? ""),
      date: String(formData.get("date") ?? ""),
      overallNotes: String(formData.get("overallNotes") ?? "") || null,
      followUpNotes: String(formData.get("followUpNotes") ?? "") || null,
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record observation." };
  }
}

export async function createTeacherAssignmentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.assignment.manage");
    await createTeacherAssignment(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      userId: String(formData.get("userId") ?? ""),
      classId: String(formData.get("classId") ?? ""),
      sectionId: String(formData.get("sectionId") ?? "") || null,
      subjectId: String(formData.get("subjectId") ?? "") || null,
      academicYearId: String(formData.get("academicYearId") ?? ""),
      roleType: (String(formData.get("roleType") ?? "subject_teacher")) as "class_teacher" | "subject_teacher",
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create teacher assignment." };
  }
}

/** §Attendance-follow-up-3 "section wise for section heads" — reuses
 *  staff.assignment.manage (same "who oversees what" category of admin
 *  action as Teacher assignments right above it, rather than a new
 *  permission code — the assigned user still needs the section_head ROLE
 *  itself, granted separately via Users & Roles, for this assignment to
 *  actually unlock anything; this action just records WHICH section(s). */
export async function assignSectionHeadAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.assignment.manage");
    await assignSectionHead(
      ctx.institutionId, ctx.session.authUserId,
      String(formData.get("userId") ?? ""), String(formData.get("stage") ?? "")
    );
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to assign Section Head." };
  }
}

export async function removeSectionHeadAssignmentAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.assignment.manage");
    await removeSectionHeadAssignment(ctx.institutionId, ctx.session.authUserId, String(formData.get("assignmentId") ?? ""));
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove assignment." };
  }
}

// ---------------------------------------------------------------------------
// §Teacher-Profile feature
// ---------------------------------------------------------------------------

/** Same upload-then-link shape as uploadStudentPhotoAction (app/(institution)/
 *  students/actions.ts) — upload the bytes via FileService, then point
 *  staff.photo_file_id at the resulting file id. */
export async function uploadStaffPhotoAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const staffId = String(formData.get("staffId") ?? "");
  try {
    await assertStaffSelfOrEditAccess(ctx, staffId);
    const photo = formData.get("photo");
    if (!(photo instanceof File) || photo.size === 0) return { error: "Choose an image file to upload." };

    const bytes = Buffer.from(await photo.arrayBuffer());
    const uploaded = await uploadFile(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      entityType: "staff", entityId: staffId, fileName: photo.name, mimeType: photo.type, isPublic: false, bytes,
    });
    await updateStaffPhoto(ctx.institutionId, ctx.session.authUserId, ctx.userId, staffId, uploaded.id);
    revalidatePath(`/staff/${staffId}`);
    revalidatePath("/staff/directory");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to upload photo." };
  }
}

export async function removeStaffPhotoAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const staffId = String(formData.get("staffId") ?? "");
  try {
    await assertStaffSelfOrEditAccess(ctx, staffId);
    await updateStaffPhoto(ctx.institutionId, ctx.session.authUserId, ctx.userId, staffId, null);
    revalidatePath(`/staff/${staffId}`);
    revalidatePath("/staff/directory");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove photo." };
  }
}

/** Edits a staff member's core fields (name, staff code, designation,
 *  department, employment status) -- mirrors updateStudentAction()'s "Edit
 *  details" pattern for the student directory, now available for staff
 *  too. See EditStaffForm.tsx and updateStaffMember() in
 *  modules/staff/service.ts (which also updates users.full_name, since
 *  staff has no full_name column of its own). */
export async function updateStaffAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const staffId = String(formData.get("staffId") ?? "");
  try {
    requirePermission(ctx.permissions, "staff.edit");
    await updateStaffMember(ctx.institutionId, ctx.session.authUserId, ctx.userId, staffId, {
      fullName: String(formData.get("fullName") ?? "") || undefined,
      staffCode: String(formData.get("staffCode") ?? "") || undefined,
      designation: String(formData.get("designation") ?? "") || null,
      department: String(formData.get("department") ?? "") || null,
      employmentStatus: (String(formData.get("employmentStatus") ?? "") || undefined) as
        "active" | "on_leave" | "resigned" | "terminated" | undefined,
    });
    revalidatePath("/staff");
    revalidatePath(`/staff/${staffId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update staff details." };
  }
}

export async function updateStaffProfileAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const staffId = String(formData.get("staffId") ?? "");
  const field = (name: string) => String(formData.get(name) ?? "") || null;
  try {
    await assertStaffSelfOrEditAccess(ctx, staffId);
    await updateStaffProfile(ctx.institutionId, ctx.session.authUserId, ctx.userId, staffId, {
      dateOfBirth: field("dateOfBirth"),
      gender: field("gender"),
      bloodGroup: field("bloodGroup"),
      contactPhone: field("contactPhone"),
      address: field("address"),
      emergencyContactName: field("emergencyContactName"),
      emergencyContactPhone: field("emergencyContactPhone"),
      otherRoles: field("otherRoles"),
      previousExperience: field("previousExperience"),
      documentsSubmitted: field("documentsSubmitted"),
      qualifications: field("qualifications"),
      certifications: field("certifications"),
      specialisations: field("specialisations"),
      languages: field("languages"),
      skills: field("skills"),
      subjectCoordinatorOf: field("subjectCoordinatorOf"),
      clubHouseIncharge: field("clubHouseIncharge"),
      examEventDuties: field("examEventDuties"),
      otherResponsibilities: field("otherResponsibilities"),
      trainingsWorkshops: field("trainingsWorkshops"),
      pdCertificates: field("pdCertificates"),
      trainingHistory: field("trainingHistory"),
      awardsRecognitions: field("awardsRecognitions"),
      publicationsResearch: field("publicationsResearch"),
      innovations: field("innovations"),
      otherAchievements: field("otherAchievements"),
    });
    revalidatePath(`/staff/${staffId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save profile details." };
  }
}

/** Rubric-driven Term-wise Performance Observation. Branches on which of
 *  the two observation permissions the caller actually holds (§Teacher-
 *  Profile AskUserQuestion #2) — unrestricted staff.observation.manage
 *  holders pass straight through; a staff.observation.manage_section-only
 *  holder (Section Head) is passed scopedToOwnSection so the service layer
 *  re-verifies the teacher falls within their own assigned stage(s). */
export async function recordTeacherObservationWithRubricAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    const hasUnrestricted = can(ctx.permissions, "staff.observation.manage");
    const hasScoped = can(ctx.permissions, "staff.observation.manage_section");
    if (!hasUnrestricted && !hasScoped) {
      return { error: "You don't have permission to record observations." };
    }
    const teacherId = String(formData.get("teacherId") ?? "");
    const criteriaIds = formData.getAll("criteriaId").map(String);
    const items = criteriaIds
      .map((criteriaId) => ({ criteriaId, score: Number(formData.get(`score_${criteriaId}`) ?? 0) }))
      .filter((it) => it.score >= 1 && it.score <= 5);

    await recordTeacherObservationWithRubric(
      ctx.institutionId, ctx.session.authUserId, ctx.userId,
      {
        teacherId,
        date: String(formData.get("date") ?? ""),
        term: String(formData.get("term") ?? "") || null,
        classDiv: String(formData.get("classDiv") ?? "") || null,
        content: String(formData.get("content") ?? "") || null,
        items,
        overallNotes: String(formData.get("overallNotes") ?? "") || null,
        followUpNotes: String(formData.get("followUpNotes") ?? "") || null,
      },
      { scopedToOwnSection: !hasUnrestricted && hasScoped }
    );
    revalidatePath(`/staff/${teacherId}`);
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to record observation." };
  }
}

const levelFromForm = (formData: FormData, score: number) => ({
  score,
  descriptor: String(formData.get(`level_${score}_descriptor`) ?? ""),
  explanation: String(formData.get(`level_${score}_explanation`) ?? ""),
});

/** Rubric CRUD (§Teacher-Profile AskUserQuestion #1, "Editable by admin") —
 *  gated on the UNRESTRICTED staff.observation.manage permission only,
 *  deliberately excluding staff.observation.manage_section: a Section Head
 *  may record observations against the rubric but shouldn't be able to
 *  redefine it for the whole institution. */
export async function createObservationCriterionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.observation.manage");
    await createObservationCriterion(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      domain: String(formData.get("domain") ?? ""),
      criteriaText: String(formData.get("criteriaText") ?? ""),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      levels: [1, 2, 3, 4, 5].map((s) => levelFromForm(formData, s)),
    });
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add criterion." };
  }
}

export async function updateObservationCriterionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.observation.manage");
    await updateObservationCriterion(
      ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("criterionId") ?? ""),
      {
        domain: String(formData.get("domain") ?? ""),
        criteriaText: String(formData.get("criteriaText") ?? ""),
        sortOrder: Number(formData.get("sortOrder") ?? 0),
        levels: [1, 2, 3, 4, 5].map((s) => levelFromForm(formData, s)),
      }
    );
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save criterion." };
  }
}

export async function deleteObservationCriterionAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "staff.observation.manage");
    await deleteObservationCriterion(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("criterionId") ?? ""));
    revalidatePath("/staff");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete criterion." };
  }
}
