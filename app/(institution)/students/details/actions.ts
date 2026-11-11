"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { saveStudentDetails } from "../../../../modules/student-details/service";

export interface SaveDetailsState { error: string | null; message: string | null }

/** §Student-details — saves one student's filled-in details. Who may edit
 *  which student is enforced by saveStudentDetails() itself (class teacher
 *  of that class/division, or an admin with student.edit), so a crafted
 *  POST can't reach another class. */
export async function saveStudentDetailsAction(_prev: SaveDetailsState, formData: FormData): Promise<SaveDetailsState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution.", message: null };
  const unrestricted = ctx.isSuperAdmin || can(ctx.permissions, "student.edit");
  const field = (name: string) => String(formData.get(name) ?? "");
  const studentId = field("studentId");
  try {
    const { changed } = await saveStudentDetails(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      studentId,
      dateOfBirth: field("dateOfBirth"),
      gender: field("gender") as "male" | "female" | "",
      address: field("address"),
      fatherName: field("fatherName"),
      fatherPhone: field("fatherPhone"),
      motherName: field("motherName"),
      motherPhone: field("motherPhone"),
    }, { unrestricted });
    revalidatePath("/students/details");
    revalidatePath(`/students/${studentId}`);
    return changed.length === 0
      ? { error: null, message: "Nothing new to save." }
      : { error: null, message: "Saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save details.", message: null };
  }
}
