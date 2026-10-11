"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../../../../services/request-context";
import { can } from "../../../../../../services/permissions/permission-service";
import { saveReportCardRemarks } from "../../../../../../modules/report-card-remarks/service";

export interface SaveRemarksState { error: string | null; message: string | null }

/** §Report-card-remark — saves every remark on the class form in one go.
 *  Who may write which student is enforced by saveReportCardRemarks()
 *  itself (class teacher of that class/division, or an admin), so a
 *  crafted POST can't reach another class. */
export async function saveReportCardRemarksAction(_prev: SaveRemarksState, formData: FormData): Promise<SaveRemarksState> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution.", message: null };
  const examinationId = String(formData.get("examinationId") ?? "");
  const studentIds = formData.getAll("studentId").map(String).filter(Boolean);
  const unrestricted = ctx.isSuperAdmin || can(ctx.permissions, "marks.approve") || can(ctx.permissions, "settings.manage");
  try {
    const { saved, cleared } = await saveReportCardRemarks(
      ctx.institutionId, ctx.session.authUserId, ctx.userId,
      { examinationId, entries: studentIds.map((studentId) => ({ studentId, remark: String(formData.get(`remark_${studentId}`) ?? "") })) },
      { unrestricted }
    );
    revalidatePath(`/results/${examinationId}/report-cards`, "layout");
    const parts = [`${saved} remark${saved === 1 ? "" : "s"} saved`];
    if (cleared > 0) parts.push(`${cleared} cleared`);
    return { error: null, message: `${parts.join(", ")}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save remarks.", message: null };
  }
}
