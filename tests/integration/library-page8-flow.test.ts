/**
 * PROMPT EDU ERP — Page 7 "Scoring" + Page 8 "Library" follow-up
 * (ARCHITECTURE.md §K.5, §M): library usage folded into the normalized
 * consolidated-score dispatch, pre-booking/holds (waitlist + auto-notify on
 * return + auto-fulfill on issue), and the self-service "Review Corner"
 * (write-after-read, browse, like/dislike reactions), plus tenant isolation
 * across every new function.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createStudent } from "../../modules/students/service";
import { recordScoreEvent, getNormalizedScore } from "../../modules/scoring/service";
import {
  createBook, listAvailableCopies, issueBook, returnBook,
  placeHold, cancelHold, listMyHolds, listPendingHolds,
  submitOwnReadingReview, listApprovedReviews, reactToReview,
  reviewReadingRecord, listReadingRecords,
} from "../../modules/library/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let librarianAuth: string, librarianUserId: string;
let student1: string, student2: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "lib8-school-a");
  institutionB = await seedDemoInstitution(db, "lib8-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@lib8-a.example", "Library8 Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const librarian = await seedDemoUser(db, institutionA, "librarian@lib8-a.example", "Library8 Librarian", "librarian");
  librarianAuth = librarian.authUserId; librarianUserId = librarian.userId;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "LIB8-1", fullName: "Page8 Student One" });
  student1 = s1.id;
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "LIB8-2", fullName: "Page8 Student Two" });
  student2 = s2.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Scoring: library folded into getNormalizedScore() (§K.5, §Page-7 follow-up)", () => {
  it("sums score_events where source_module='library' for the given student/date range, capped at 100", async () => {
    await recordScoreEvent(institutionA, adminAuth, adminUserId, {
      studentId: student1, sourceModule: "library", sourceEntityType: "reading_records", sourceEntityId: null, points: 40, scoringRuleId: null,
    });
    await recordScoreEvent(institutionA, adminAuth, adminUserId, {
      studentId: student1, sourceModule: "library", sourceEntityType: "reading_records", sourceEntityId: null, points: 30, scoringRuleId: null,
    });

    const score = await getNormalizedScore(institutionA, adminAuth, "library", student1, "2000-01-01", "2100-01-01");
    expect(score).toBe(70);
  });

  it("caps at 100 rather than exceeding it", async () => {
    await recordScoreEvent(institutionA, adminAuth, adminUserId, {
      studentId: student2, sourceModule: "library", sourceEntityType: "reading_records", sourceEntityId: null, points: 90, scoringRuleId: null,
    });
    await recordScoreEvent(institutionA, adminAuth, adminUserId, {
      studentId: student2, sourceModule: "library", sourceEntityType: "reading_records", sourceEntityId: null, points: 50, scoringRuleId: null,
    });

    const score = await getNormalizedScore(institutionA, adminAuth, "library", student2, "2000-01-01", "2100-01-01");
    expect(score).toBe(100);
  });

  it("a student with no library score_events normalizes to 0, not an error", async () => {
    const fresh = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "LIB8-3", fullName: "No Library Events" });
    const score = await getNormalizedScore(institutionA, adminAuth, "library", fresh.id, "2000-01-01", "2100-01-01");
    expect(score).toBe(0);
  });
});

describe("Pre-booking / holds (§Page-8 follow-up)", () => {
  it("refuses a hold when the book still has an available copy", async () => {
    const book = await createBook(institutionA, adminAuth, adminUserId, { title: "Always Available Book", copyCount: 1 });
    await expect(placeHold(institutionA, librarianAuth, librarianUserId, student1, book.id)).rejects.toThrow(/available copy/);
  });

  it("succeeds once every copy is issued out, and refuses a duplicate active hold from the same student", async () => {
    const book = await createBook(institutionA, adminAuth, adminUserId, { title: "Hold Test Book", copyCount: 1 });
    const copies = await listAvailableCopies(institutionA, librarianAuth, book.id);
    await issueBook(institutionA, librarianAuth, librarianUserId, student2, copies[0].id);

    const hold = await placeHold(institutionA, librarianAuth, librarianUserId, student1, book.id);
    expect(hold.status).toBe("pending");
    expect(hold.book_id).toBe(book.id);

    await expect(placeHold(institutionA, librarianAuth, librarianUserId, student1, book.id)).rejects.toThrow(/already have an active pre-booking/);

    const myHolds = await listMyHolds(institutionA, librarianAuth, student1);
    expect(myHolds.some((h) => h.id === hold.id)).toBe(true);

    const pending = await listPendingHolds(institutionA, librarianAuth);
    expect(pending.some((h) => h.id === hold.id)).toBe(true);
  });

  it("returning the issued copy auto-notifies the oldest pending hold (status -> 'notified')", async () => {
    const book = await createBook(institutionA, adminAuth, adminUserId, { title: "Auto Notify Book", copyCount: 1 });
    const copies = await listAvailableCopies(institutionA, librarianAuth, book.id);
    const issue = await issueBook(institutionA, librarianAuth, librarianUserId, student2, copies[0].id);
    const hold = await placeHold(institutionA, librarianAuth, librarianUserId, student1, book.id);

    await returnBook(institutionA, librarianAuth, librarianUserId, { bookIssueId: issue.id, conditionOnReturn: "good" });

    const myHolds = await listMyHolds(institutionA, librarianAuth, student1);
    const updated = myHolds.find((h) => h.id === hold.id);
    expect(updated?.status).toBe("notified");
    expect(updated?.notified_at).toBeTruthy();
  });

  it("issuing a fresh copy to the waiting student auto-fulfills their hold (drops off both lists)", async () => {
    const book = await createBook(institutionA, adminAuth, adminUserId, { title: "Auto Fulfill Book", copyCount: 1 });
    const copies = await listAvailableCopies(institutionA, librarianAuth, book.id);
    const issue = await issueBook(institutionA, librarianAuth, librarianUserId, student2, copies[0].id);
    const hold = await placeHold(institutionA, librarianAuth, librarianUserId, student1, book.id);
    await returnBook(institutionA, librarianAuth, librarianUserId, { bookIssueId: issue.id, conditionOnReturn: "good" });

    const freedCopies = await listAvailableCopies(institutionA, librarianAuth, book.id);
    await issueBook(institutionA, librarianAuth, librarianUserId, student1, freedCopies[0].id);

    const myHolds = await listMyHolds(institutionA, librarianAuth, student1);
    expect(myHolds.some((h) => h.id === hold.id)).toBe(false); // fulfilled holds are excluded (only pending/notified listed)

    const pending = await listPendingHolds(institutionA, librarianAuth);
    expect(pending.some((h) => h.id === hold.id)).toBe(false);
  });

  it("cancelHold() with ownerStudentId only lets the caller cancel their OWN hold", async () => {
    const book = await createBook(institutionA, adminAuth, adminUserId, { title: "Cancel Ownership Book", copyCount: 1 });
    const copies = await listAvailableCopies(institutionA, librarianAuth, book.id);
    await issueBook(institutionA, librarianAuth, librarianUserId, student2, copies[0].id);
    const hold = await placeHold(institutionA, librarianAuth, librarianUserId, student1, book.id);

    // student2 attempting to cancel student1's hold: no-op / throws, never succeeds
    await expect(cancelHold(institutionA, librarianAuth, librarianUserId, hold.id, student2)).rejects.toThrow(/not found/);

    const stillActive = await listMyHolds(institutionA, librarianAuth, student1);
    expect(stillActive.some((h) => h.id === hold.id)).toBe(true);

    // the true owner can cancel it
    await cancelHold(institutionA, librarianAuth, librarianUserId, hold.id, student1);
    const afterCancel = await listMyHolds(institutionA, librarianAuth, student1);
    expect(afterCancel.some((h) => h.id === hold.id)).toBe(false);
  });

  it("cancelHold() with no ownerStudentId (librarian/admin path) may cancel any hold", async () => {
    const book = await createBook(institutionA, adminAuth, adminUserId, { title: "Admin Cancel Book", copyCount: 1 });
    const copies = await listAvailableCopies(institutionA, librarianAuth, book.id);
    await issueBook(institutionA, librarianAuth, librarianUserId, student2, copies[0].id);
    const hold = await placeHold(institutionA, librarianAuth, librarianUserId, student1, book.id);

    await cancelHold(institutionA, librarianAuth, librarianUserId, hold.id);
    const afterCancel = await listMyHolds(institutionA, librarianAuth, student1);
    expect(afterCancel.some((h) => h.id === hold.id)).toBe(false);
  });
});

describe("Review Corner: self-service write, browse, and like/dislike (§Page-8 follow-up)", () => {
  let readingRecordId: string;

  it("submitOwnReadingReview() only updates the caller's OWN pending reading_records row", async () => {
    const book = await createBook(institutionA, adminAuth, adminUserId, { title: "Review Corner Book", copyCount: 1 });
    const copies = await listAvailableCopies(institutionA, librarianAuth, book.id);
    const issue = await issueBook(institutionA, librarianAuth, librarianUserId, student1, copies[0].id);
    const result = await returnBook(institutionA, librarianAuth, librarianUserId, { bookIssueId: issue.id, conditionOnReturn: "good" });
    readingRecordId = result.readingRecordId!;

    // student2 (not the owner) attempting to write into student1's pending record: no-op
    await submitOwnReadingReview(institutionA, librarianAuth, student2, readingRecordId, "Not my book, sneaky review.");
    const [afterWrongOwner] = await listReadingRecords(institutionA, librarianAuth, "pending", undefined, student1);
    expect(afterWrongOwner.review_text).toBeNull();

    // the true owner (student1) can write it
    await submitOwnReadingReview(institutionA, librarianAuth, student1, readingRecordId, "A moving read — highly recommend.");
    const [afterOwner] = await listReadingRecords(institutionA, librarianAuth, "pending", undefined, student1);
    expect(afterOwner.review_text).toBe("A moving read — highly recommend.");
  });

  it("only APPROVED reviews with text show up in listApprovedReviews()", async () => {
    const beforeApproval = await listApprovedReviews(institutionA, librarianAuth);
    expect(beforeApproval.some((r) => r.id === readingRecordId)).toBe(false);

    await reviewReadingRecord(institutionA, librarianAuth, librarianUserId, readingRecordId, "approved");

    const afterApproval = await listApprovedReviews(institutionA, librarianAuth);
    const row = afterApproval.find((r) => r.id === readingRecordId);
    expect(row).toBeTruthy();
    expect(row!.review_text).toBe("A moving read — highly recommend.");
    expect(row!.like_count).toBe(0);
    expect(row!.dislike_count).toBe(0);
    expect(row!.my_reaction).toBeNull();
  });

  it("reactToReview() toggles: first like inserts, same reaction again removes it, opposite reaction switches it", async () => {
    const afterLike = await reactToReview(institutionA, librarianAuth, student2, readingRecordId, "like");
    expect(afterLike).toEqual({ likeCount: 1, dislikeCount: 0, myReaction: "like" });

    const viewerRows = await listApprovedReviews(institutionA, librarianAuth, null, student2);
    expect(viewerRows.find((r) => r.id === readingRecordId)?.my_reaction).toBe("like");

    const afterUnlike = await reactToReview(institutionA, librarianAuth, student2, readingRecordId, "like");
    expect(afterUnlike).toEqual({ likeCount: 0, dislikeCount: 0, myReaction: null });

    const afterDislike = await reactToReview(institutionA, librarianAuth, student2, readingRecordId, "dislike");
    expect(afterDislike).toEqual({ likeCount: 0, dislikeCount: 1, myReaction: "dislike" });

    const afterSwitch = await reactToReview(institutionA, librarianAuth, student2, readingRecordId, "like");
    expect(afterSwitch).toEqual({ likeCount: 1, dislikeCount: 0, myReaction: "like" });
  });

  it("listApprovedReviews(bookId) narrows to a single book's reviews", async () => {
    const rows = await listApprovedReviews(institutionA, librarianAuth);
    const targetBook = rows.find((r) => r.id === readingRecordId)!.book_id;
    const narrowed = await listApprovedReviews(institutionA, librarianAuth, targetBook);
    expect(narrowed.every((r) => r.book_id === targetBook)).toBe(true);
    expect(narrowed.some((r) => r.id === readingRecordId)).toBe(true);
  });
});

describe("Tenant isolation (§E) across every new Page 7/8 function", () => {
  it("Institution B cannot see Institution A's holds, reviews, reactions, or library score_events", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@lib8-b.example", "Library8 B Admin");
    const studentB = await createStudent(institutionB, adminB.authUserId, adminB.userId, { admissionNumber: "LIB8-B-1", fullName: "Institution B Student" });

    const pendingB = await listPendingHolds(institutionB, adminB.authUserId);
    expect(pendingB).toHaveLength(0);

    const myHoldsB = await listMyHolds(institutionB, adminB.authUserId, studentB.id);
    expect(myHoldsB).toHaveLength(0);

    const reviewsB = await listApprovedReviews(institutionB, adminB.authUserId);
    expect(reviewsB).toHaveLength(0);

    const scoreB = await getNormalizedScore(institutionB, adminB.authUserId, "library", studentB.id, "2000-01-01", "2100-01-01");
    expect(scoreB).toBe(0);

    // cross-tenant cancel of an institution A hold, attempted under
    // institution B's context, must not resolve any row (RLS-scoped query
    // simply finds nothing to update).
    const bookA = await createBook(institutionA, adminAuth, adminUserId, { title: "Isolation Hold Book", copyCount: 1 });
    const copiesA = await listAvailableCopies(institutionA, librarianAuth, bookA.id);
    await issueBook(institutionA, librarianAuth, librarianUserId, student2, copiesA[0].id);
    const holdA = await placeHold(institutionA, librarianAuth, librarianUserId, student1, bookA.id);
    await expect(cancelHold(institutionB, adminB.authUserId, adminB.userId, holdA.id)).rejects.toThrow(/not found/);
  });
});
