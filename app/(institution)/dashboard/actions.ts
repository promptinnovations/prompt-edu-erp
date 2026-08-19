"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { skipOnboardingItem, unskipOnboardingItem } from "../../../services/onboarding/onboarding-service";
import { addTodo, toggleTodo, deleteTodo } from "../../../services/todo/todo-service";

export async function skipOnboardingItemAction(formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return;
  const itemCode = String(formData.get("itemCode") ?? "");
  if (!itemCode) return;
  await skipOnboardingItem(ctx.institutionId, ctx.session.authUserId, ctx.userId, itemCode);
  revalidatePath("/dashboard");
}

export async function unskipOnboardingItemAction(formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return;
  const itemCode = String(formData.get("itemCode") ?? "");
  if (!itemCode) return;
  await unskipOnboardingItem(ctx.institutionId, ctx.session.authUserId, itemCode);
  revalidatePath("/dashboard");
}

export async function addTodoAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    const text = String(formData.get("text") ?? "").trim();
    if (!text) return { error: "Enter something to add." };
    const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
    await addTodo(ctx.institutionId, ctx.session.authUserId, ctx.userId, { text, dueDate: dueDateRaw || null });
    revalidatePath("/dashboard");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add task." };
  }
}

export async function toggleTodoAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    const todoId = String(formData.get("todoId") ?? "");
    await toggleTodo(ctx.institutionId, ctx.session.authUserId, ctx.userId, todoId);
    revalidatePath("/dashboard");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update task." };
  }
}

export async function deleteTodoAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    const todoId = String(formData.get("todoId") ?? "");
    await deleteTodo(ctx.institutionId, ctx.session.authUserId, ctx.userId, todoId);
    revalidatePath("/dashboard");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove task." };
  }
}
