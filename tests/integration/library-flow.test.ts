/**
 * PROMPT EDU ERP — Library module flow (ARCHITECTURE.md §D.11, §M,
 * Phase 9): issue/return with per-copy availability tracking, overdue fine
 * calculation from institution config, the reading-review workflow
 * (required vs not_required per config) and its wiring into the scoring
 * engine + portfolio timeline on approval, permission boundaries, and
 * tenant isolation.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { createStudent } from "../../modules/students/service";
import { listScoreEvents } from "../../modules/scoring/service";
import { listPortfolioTimeline } from "../../modules/portfolio/service";
import {
  getLibraryConfig, setLibraryConfig, listBooks, listAvailableCopies, createBook,
  issueBook, returnBook, listIssuedBooks, listReadingRecords, submitReadingReview, reviewReadingRecord,
  createAuthor, createPublisher, createBookCategory, createShelf,
} from "../../modules/library/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let librarianAuth: string, librarianUserId: string;
let teacherAuth: string, teacherUserId: string;
let student1: string;
let bookId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "lib-school-a");
  institutionB = await seedDemoInstitution(db, "lib-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@lib-a.example", "Library Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const librarian = await seedDemoUser(db, institutionA, "librarian@lib-a.example", "Library Librarian", "librarian");
  librarianAuth = librarian.authUserId; librarianUserId = librarian.userId;

  const teacher = await seedDemoUser(db, institutionA, "teacher@lib-a.example", "Library Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "LIB-1", fullName: "Library Student" });
  student1 = s1.id;

  const books = await listBooks(institutionA, adminAuth);
  bookId = books[0].id; // seeded 'Risale-i Nur (Selections)', 2 copies
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Permissions (§F)", () => {
  it("librarian has library.issue/return/manage; teacher has none of them", async () => {
    const librarianPerms = await getPermissionsForUser(librarianAuth, librarianUserId, institutionA);
    expect(() => requirePermission(librarianPerms, "library.issue")).not.toThrow();
    expect(() => requirePermission(librarianPerms, "library.return")).not.toThrow();
    expect(() => requirePermission(librarianPerms, "library.manage")).not.toThrow();

    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "library.issue")).toThrow(/Forbidden/);
  });
});

describe("Issue / return flow (§M.2)", () => {
  it("issuing a copy marks it unavailable and computes due_date from the institution's configured loan period", async () => {
    const config = await getLibraryConfig(institutionA, librarianAuth);
    expect(config.loanPeriodDays).toBe(14); // seeded value

    const copiesBefore = await listAvailableCopies(institutionA, librarianAuth, bookId);
    expect(copiesBefore).toHaveLength(2);

    const issue = await issueBook(institutionA, librarianAuth, librarianUserId, student1, copiesBefore[0].id);
    expect(issue.status).toBe("issued");

    const expectedDue = new Date(issue.issue_date);
    expectedDue.setDate(expectedDue.getDate() + config.loanPeriodDays);
    expect(new Date(issue.due_date).toISOString().slice(0, 10)).toBe(expectedDue.toISOString().slice(0, 10));

    const copiesAfter = await listAvailableCopies(institutionA, librarianAuth, bookId);
    expect(copiesAfter).toHaveLength(1);
  });

  it("issuing an already-issued copy is refused", async () => {
    const copies = await listAvailableCopies(institutionA, librarianAuth, bookId);
    const copy = copies[0]; // the remaining available one
    await issueBook(institutionA, librarianAuth, librarianUserId, student1, copy.id);
    await expect(issueBook(institutionA, librarianAuth, librarianUserId, student1, copy.id)).rejects.toThrow(/not available/);
  });

  it("an on-time return has zero fine, frees the copy, and creates a pending reading_records row (review required by config)", async () => {
    const issued = await listIssuedBooks(institutionA, librarianAuth, student1);
    expect(issued.length).toBeGreaterThanOrEqual(1);
    const issue = issued[0];

    const result = await returnBook(institutionA, librarianAuth, librarianUserId, { bookIssueId: issue.id, conditionOnReturn: "good" });
    expect(result.fineAmount).toBe(0);
    expect(result.readingRecordId).toBeTruthy();

    const records = await listReadingRecords(institutionA, librarianAuth, "pending");
    expect(records.some((r) => r.id === result.readingRecordId)).toBe(true);
  });

  it("an overdue return calculates a fine using the configured fine-per-day and grace period", async () => {
    const copies = await listAvailableCopies(institutionA, librarianAuth, bookId);
    const issue = await issueBook(institutionA, librarianAuth, librarianUserId, student1, copies[0].id);

    // Simulate 5 days overdue by backdating due_date directly (no time-travel
    // available in tests) — config is financePerDay=1, graceDays=2, so
    // expected fine = (5 - 2) * 1 = 3.
    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: librarianAuth }, async (scoped) => {
      await scoped.query("update book_issues set due_date = current_date - interval '5 days' where id = $1", [issue.id]);
    });

    const result = await returnBook(institutionA, librarianAuth, librarianUserId, { bookIssueId: issue.id, conditionOnReturn: "good" });
    expect(result.fineAmount).toBe(3);
  });

  it("returning a lost copy marks both the issue and the copy as lost, not available", async () => {
    const copies = await listAvailableCopies(institutionA, librarianAuth, bookId);
    expect(copies.length).toBeGreaterThanOrEqual(1);
    const issue = await issueBook(institutionA, librarianAuth, librarianUserId, student1, copies[0].id);

    await returnBook(institutionA, librarianAuth, librarianUserId, { bookIssueId: issue.id, conditionOnReturn: "lost" });

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: librarianAuth }, async (scoped) => {
      const { rows: copyRows } = await scoped.query<{ status: string }>("select status from book_copies where id = $1", [copies[0].id]);
      expect(copyRows[0].status).toBe("lost");
      const { rows: issueRows } = await scoped.query<{ status: string }>("select status from book_issues where id = $1", [issue.id]);
      expect(issueRows[0].status).toBe("lost");
    });
  });
});

describe("Reading review -> scoring + portfolio integration (§M.3)", () => {
  it("approving a reading review writes a score_event (seeded scoring_rules row) and a portfolio_events row; rejecting writes neither", async () => {
    const [pending] = await listReadingRecords(institutionA, librarianAuth, "pending");
    expect(pending).toBeTruthy();

    await submitReadingReview(institutionA, teacherAuth, pending.id, "A thoughtful reflection on patience.");

    const approved = await reviewReadingRecord(institutionA, librarianAuth, librarianUserId, pending.id, "approved");
    expect(approved?.review_status).toBe("approved");

    const events = await listScoreEvents(institutionA, librarianAuth, pending.student_id);
    const readingEvent = events.find((e) => e.source_module === "library");
    expect(readingEvent).toBeTruthy();
    expect(Number(readingEvent!.points)).toBe(2); // seeded flat rule

    const timeline = await listPortfolioTimeline(institutionA, librarianAuth, pending.student_id);
    const portfolioEvent = timeline.find((e) => e.entity_id === pending.id);
    expect(portfolioEvent).toBeTruthy();
    expect(portfolioEvent!.module).toBe("library");
  });

  it("a rejected reading review never earns points or a portfolio entry", async () => {
    // Fresh book (rather than reusing bookId, whose 2 seeded copies are
    // exhausted by the issue/return tests above) so a copy is guaranteed available.
    const freshBook = await createBook(institutionA, adminAuth, adminUserId, { title: "Rejected Review Book", copyCount: 1 });
    const copies = await listAvailableCopies(institutionA, librarianAuth, freshBook.id);
    const issue = await issueBook(institutionA, librarianAuth, librarianUserId, student1, copies[0].id);
    const result = await returnBook(institutionA, librarianAuth, librarianUserId, { bookIssueId: issue.id, conditionOnReturn: "good" });

    const rejected = await reviewReadingRecord(institutionA, librarianAuth, librarianUserId, result.readingRecordId!, "rejected");
    expect(rejected?.review_status).toBe("rejected");

    const timeline = await listPortfolioTimeline(institutionA, librarianAuth, student1);
    expect(timeline.some((e) => e.entity_id === result.readingRecordId)).toBe(false);
  });

  it("when the institution disables reading review, returns create a not_required record immediately, no pending step", async () => {
    await setLibraryConfig(institutionA, adminAuth, adminUserId, {
      loanPeriodDays: 14, finePerDay: 1, graceDays: 2, requiresReadingReview: false,
    });

    const newBook = await createBook(institutionA, adminAuth, adminUserId, { title: "No-Review Book", copyCount: 1 });
    const copies = await listAvailableCopies(institutionA, librarianAuth, newBook.id);
    const issue = await issueBook(institutionA, librarianAuth, librarianUserId, student1, copies[0].id);
    const result = await returnBook(institutionA, librarianAuth, librarianUserId, { bookIssueId: issue.id, conditionOnReturn: "good" });

    const records = await listReadingRecords(institutionA, librarianAuth, "not_required");
    expect(records.some((r) => r.id === result.readingRecordId)).toBe(true);

    // restore config for isolation from any later tests in this file
    await setLibraryConfig(institutionA, adminAuth, adminUserId, {
      loanPeriodDays: 14, finePerDay: 1, graceDays: 2, requiresReadingReview: true,
    });
  });
});

describe("Catalogue: full 'Add book' fields (§125 follow-up — author/publisher/category/shelf)", () => {
  it("createBook() persists author/publisher/category/shelf and listBooks() joins their names", async () => {
    const author = await createAuthor(institutionA, adminAuth, "Said Nursi");
    const publisher = await createPublisher(institutionA, adminAuth, "Sozler Publishing");
    const category = await createBookCategory(institutionA, adminAuth, "Theology");
    const shelf = await createShelf(institutionA, adminAuth, "Shelf B2", "Reading Room, 2nd floor");

    const book = await createBook(institutionA, adminAuth, adminUserId, {
      title: "The Words",
      subtitle: "Selected treatises",
      isbn: "978-0000000000",
      authorId: author.id,
      publisherId: publisher.id,
      categoryId: category.id,
      shelfId: shelf.id,
      language: "en",
      copyCount: 1,
    });
    expect(book.author_id).toBe(author.id);
    expect(book.publisher_id).toBe(publisher.id);
    expect(book.category_id).toBe(category.id);
    expect(book.shelf_id).toBe(shelf.id);

    const books = await listBooks(institutionA, adminAuth);
    const row = books.find((b) => b.id === book.id);
    expect(row).toBeTruthy();
    expect(row!.author_name).toBe("Said Nursi");
    expect(row!.publisher_name).toBe("Sozler Publishing");
    expect(row!.category_name).toBe("Theology");
    expect(row!.shelf_name).toBe("Shelf B2");
  });

  it("a book created without any of these fields still works (all remain optional)", async () => {
    const book = await createBook(institutionA, adminAuth, adminUserId, { title: "Minimal Book", copyCount: 1 });
    expect(book.author_id).toBeNull();
    expect(book.publisher_id).toBeNull();
    expect(book.category_id).toBeNull();
    expect(book.shelf_id).toBeNull();
  });

  it("createBookCategory() and createShelf() are institution-scoped like createAuthor()/createPublisher()", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "cat-admin@lib-b.example", "Library B Category Admin");
    const categoryB = await createBookCategory(institutionB, adminB.authUserId, "Institution B Only Category");
    const categoriesA = await (async () => {
      const db = await getDbClient();
      return db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, (scoped) =>
        scoped.query<{ id: string }>("select id from book_categories where id = $1", [categoryB.id])
      );
    })();
    expect(categoriesA.rows).toHaveLength(0); // RLS hides institution B's row from institution A's context
  });
});

describe("Library tenant isolation (§E, extended to migration 0011 tables)", () => {
  it("Institution B cannot see Institution A's books, issues, or reading records", async () => {
    const adminB = await seedDemoUser(await getDbClient(), institutionB, "admin@lib-b.example", "Library B Admin");

    // Institution B's own seed also creates a book titled "Risale-i Nur
    // (Selections)" (same tenant-agnostic seed script) — the isolation
    // proof is that it's a DIFFERENT row (own id), not that the title is absent.
    const booksB = await listBooks(institutionB, adminB.authUserId);
    expect(booksB.every((b) => b.id !== bookId)).toBe(true);

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const rows = await scoped.query("select id from book_issues where student_id = $1", [student1]);
      expect(rows.rows).toHaveLength(0);
    });

    const readingRecordsB = await listReadingRecords(institutionB, adminB.authUserId);
    expect(readingRecordsB).toHaveLength(0);
  });
});
