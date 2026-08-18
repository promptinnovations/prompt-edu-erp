"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createInstitutionUser, updateUserRoles, setUserMembershipStatus, setUserPassword,
} from "../../../services/users/user-management-service";

export async function createUserAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "users.manage");
    await createInstitutionUser(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      email: String(formData.get("email") ?? ""),
      fullName: String(formData.get("fullName") ?? ""),
      password: String(formData.get("password") ?? ""),
      roleCodes: formData.getAll("roleCodes").map(String),
    });
    revalidatePath("/users");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create login." };
  }
}

export async function setUserPasswordAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "users.manage");
    const targetUserId = String(formData.get("userId") ?? "");
    const password = String(formData.get("password") ?? "");
    await setUserPassword(ctx.institutionId, ctx.session.authUserId, ctx.userId, targetUserId, { password });
    revalidatePath("/users");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to set password." };
  }
}

export async function updateUserRolesAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "roles.manage");
    const targetUserId = String(formData.get("userId") ?? "");
    await updateUserRoles(ctx.institutionId, ctx.session.authUserId, ctx.userId, targetUserId, {
      roleCodes: formData.getAll("roleCodes").map(String),
    });
    revalidatePath("/users");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update roles." };
  }
}

export async function setUserMembershipStatusAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "users.manage");
    const targetUserId = String(formData.get("userId") ?? "");
    const status = String(formData.get("status") ?? "active") as "active" | "inactive";
    await setUserMembershipStatus(ctx.institutionId, ctx.session.authUserId, ctx.userId, targetUserId, { status });
    revalidatePath("/users");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update membership status." };
  }
}
