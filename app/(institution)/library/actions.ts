"use server";

import { revalidatePath } from "next/cache";
import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import {
  createBook, issueBook, returnBook, submitReadingReview, reviewReadingRecord,
  createAuthor, createPublisher, createBookCategory, createShelf, cancelHold,
  updateBook, addBookCopies, setCopyStatus, withdrawBook, setLibraryConfig,
} from "../../../modules/library/service";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
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
      edition: nonEmpty(formData.get("edition")) ?? null,
      publicationYear: nonEmpty(formData.get("publicationYear")) ? Number(formData.get("publicationYear")) : null,
      originalLanguage: nonEmpty(formData.get("originalLanguage")) ?? null,
      description: nonEmpty(formData.get("description")) ?? null,
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

// ---------------------------------------------------------------------------
// §Library-gaps — book edit page (/library/books/[id]) and library settings.
// ---------------------------------------------------------------------------
type FormResult = { error: string | null; ok?: string | null };

async function manage(fn: (institutionId: string, authUserId: string, userId: string) => Promise<string>, path = "/library"): Promise<FormResult> {
  const ctx = await requireRequestContext();
  if (!ctx.institutionId) return { error: "No active institution." };
  try {
    requirePermission(ctx.permissions, "library.manage");
    const ok = await fn(ctx.institutionId, ctx.session.authUserId, ctx.userId);
    revalidatePath(path, "layout");
    return { error: null, ok };
  } catch (err) {
    if (err instanceof ZodError) return { error: err.issues[0]?.message ?? "Check the form." };
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function updateBookAction(_p: FormResult, formData: FormData): Promise<FormResult> {
  return manage(async (institutionId, authUserId, userId) => {
    const bookId = String(formData.get("bookId") ?? "");
    const pick = async (newKey: string, idKey: string, create: (name: string) => Promise<{ id: string }>) => {
      const fresh = nonEmpty(formData.get(newKey));
      return fresh ? (await create(fresh)).id : nonEmpty(formData.get(idKey)) ?? null;
    };
    await updateBook(institutionId, authUserId, userId, bookId, {
      title: String(formData.get("title") ?? "").trim(),
      subtitle: nonEmpty(formData.get("subtitle")) ?? null,
      isbn: nonEmpty(formData.get("isbn")) ?? null,
      authorId: await pick("newAuthorName", "authorId", (n) => createAuthor(institutionId, authUserId, n)),
      publisherId: await pick("newPublisherName", "publisherId", (n) => createPublisher(institutionId, authUserId, n)),
      categoryId: await pick("newCategoryName", "categoryId", (n) => createBookCategory(institutionId, authUserId, n)),
      shelfId: await pick("newShelfName", "shelfId", (n) => createShelf(institutionId, authUserId, n, null)),
      language: nonEmpty(formData.get("language")) ?? null,
      edition: nonEmpty(formData.get("edition")) ?? null,
      publicationYear: nonEmpty(formData.get("publicationYear")) ? Number(formData.get("publicationYear")) : null,
      originalLanguage: nonEmpty(formData.get("originalLanguage")) ?? null,
      description: nonEmpty(formData.get("description")) ?? null,
    });
    return "Book details saved.";
  });
}

export async function addCopiesAction(_p: FormResult, formData: FormData): Promise<FormResult> {
  return manage(async (i, a, u) => {
    const n = await addBookCopies(i, a, u, String(formData.get("bookId") ?? ""), Number(formData.get("count") ?? 1));
    return `${n} cop${n === 1 ? "y" : "ies"} added.`;
  });
}

export async function setCopyStatusAction(_p: FormResult, formData: FormData): Promise<FormResult> {
  return manage(async (i, a, u) => {
    await setCopyStatus(i, a, u, String(formData.get("copyId") ?? ""), String(formData.get("status") ?? "") as "available");
    return "Saved.";
  });
}

export async function withdrawBookAction(_p: FormResult, formData: FormData): Promise<FormResult> {
  const r = await manage(async (i, a, u) => {
    await withdrawBook(i, a, u, String(formData.get("bookId") ?? ""));
    return "Book withdrawn.";
  });
  if (!r.error) redirect("/library#catalogue");
  return r;
}

export async function saveLibrarySettingsAction(_p: FormResult, formData: FormData): Promise<FormResult> {
  return manage(async (i, a, u) => {
    await setLibraryConfig(i, a, u, {
      loanPeriodDays: Number(formData.get("loanPeriodDays")),
      finePerDay: Number(formData.get("finePerDay") || 0),
      graceDays: Number(formData.get("graceDays") || 0),
      requiresReadingReview: formData.get("requiresReadingReview") === "on",
      holdCollectDays: Number(formData.get("holdCollectDays") || 3),
    });
    return "Library settings saved.";
  });
}
