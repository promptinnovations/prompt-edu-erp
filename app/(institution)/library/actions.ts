"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createBook, issueBook, returnBook, submitReadingReview, reviewReadingRecord,
  createAuthor, createPublisher, createBookCategory, createShelf, cancelHold,
} from "../../../modules/library/service";
import { sanitizeRichText } from "../../../services/content/rich-text";

// A blank string from an unselected <select> and a blank string from an
// empty text input are indistinguishable via FormData — normalize both to
// undefined so `createBook()`'s z.string().uuid().nullable().optional()
// fields don't reject "" as an invalid UUID.
function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : undefined;
}

export async function createBookAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  const institutionId = ctx.institutionId;
  const authUserId = ctx.session.authUserId;
  try {
    requirePermission(ctx.permissions, "library.manage");

    // Each of author/publisher/category/shelf: use the selected existing
    // id, or — if the "add new" text field was filled instead — create
    // that config row first and use its fresh id. A filled "new" field
    // always wins over a stray dropdown selection (matches AddBookForm.tsx's
    // own field ordering: the dropdown is disabled client-side once typing
    // starts, but this server-side precedence is what actually matters).
    const newAuthorName = nonEmpty(formData.get("newAuthorName"));
    const authorId = newAuthorName
      ? (await createAuthor(institutionId, authUserId, newAuthorName)).id
      : nonEmpty(formData.get("authorId")) ?? null;

    const newPublisherName = nonEmpty(formData.get("newPublisherName"));
    const publisherId = newPublisherName
      ? (await createPublisher(institutionId, authUserId, newPublisherName)).id
      : nonEmpty(formData.get("publisherId")) ?? null;

    const newCategoryName = nonEmpty(formData.get("newCategoryName"));
    const categoryId = newCategoryName
      ? (await createBookCategory(institutionId, authUserId, newCategoryName)).id
      : nonEmpty(formData.get("categoryId")) ?? null;

    const newShelfName = nonEmpty(formData.get("newShelfName"));
    const shelfId = newShelfName
      ? (await createShelf(institutionId, authUserId, newShelfName, nonEmpty(formData.get("newShelfLocation")) ?? null)).id
      : nonEmpty(formData.get("shelfId")) ?? null;

    await createBook(institutionId, authUserId, ctx.userId, {
      title: String(formData.get("title") ?? ""),
      subtitle: nonEmpty(formData.get("subtitle")) ?? null,
      isbn: nonEmpty(formData.get("isbn")) ?? null,
      authorId,
      publisherId,
      categoryId,
      shelfId,
      language: nonEmpty(formData.get("language")) ?? null,
      copyCount: Number(formData.get("copyCount") ?? 1),
    });
    revalidatePath("/library");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add book." };
  }
}

export async function issueBookAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "library.issue");
    await issueBook(
      ctx.institutionId, ctx.session.authUserId, ctx.userId,
      String(formData.get("studentId") ?? ""), String(formData.get("bookCopyId") ?? "")
    );
    revalidatePath("/library");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to issue book." };
  }
}

export async function returnBookAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "library.return");
    const result = await returnBook(ctx.institutionId, ctx.session.authUserId, ctx.userId, {
      bookIssueId: String(formData.get("bookIssueId") ?? ""),
      conditionOnReturn: (String(formData.get("conditionOnReturn") ?? "good")) as "good" | "damaged" | "lost",
    });
    revalidatePath("/library");
    return { error: null, fineAmount: result.fineAmount };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to return book." };
  }
}

export async function submitReadingReviewAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "library.view");
    await submitReadingReview(
      ctx.institutionId, ctx.session.authUserId, String(formData.get("readingRecordId") ?? ""),
      sanitizeRichText(String(formData.get("reviewText") ?? ""))
    );
    revalidatePath("/library");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to submit review." };
  }
}

async function reviewAction(decision: "approved" | "rejected", formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "library.manage");
    await reviewReadingRecord(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("readingRecordId") ?? ""), decision);
    revalidatePath("/library");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to review." };
  }
}
export async function approveReadingRecordAction(_prevState: { error: string | null }, formData: FormData) {
  return reviewAction("approved", formData);
}
export async function rejectReadingRecordAction(_prevState: { error: string | null }, formData: FormData) {
  return reviewAction("rejected", formData);
}

/** §Page-8 follow-up — librarian-side cancel, no ownerStudentId check (may
 *  cancel any student's hold, e.g. one they were told about in person). */
export async function cancelHoldAdminAction(_prevState: { error: string | null }, formData: FormData) {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "library.manage");
    await cancelHold(ctx.institutionId, ctx.session.authUserId, ctx.userId, String(formData.get("holdId") ?? ""));
    revalidatePath("/library");
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to cancel hold." };
  }
}
