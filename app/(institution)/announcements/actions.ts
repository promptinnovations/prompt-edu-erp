"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { publishAnnouncement } from "../../../modules/announcements/service";
import type { AnnouncementAudience } from "../../../modules/announcements/service";

export async function publishAnnouncementAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "announcements.publish");
    const audienceType = String(formData.get("audienceType") ?? "all");
    const audience: AnnouncementAudience =
      audienceType === "role"
        ? { type: "role", roleCodes: formData.getAll("roleCodes").map(String) }
        : { type: "all" };
    if (audience.type === "role" && audience.roleCodes.length === 0) {
      return { error: "Select at least one role for a role-targeted announcement." };
    }
    await publishAnnouncement(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
      audience,
    });
    revalidatePath("/announcements");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to publish announcement." };
  }
}
