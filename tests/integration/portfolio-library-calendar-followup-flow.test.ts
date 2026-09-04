/**
 * PROMPT EDU ERP — Follow-up tasks #423/#424/#425.
 *
 * §423/§424 "reading reviews posted by a student" / "list of book[s] he
 * read" — listReadingRecords() with no status filter now returns EVERY
 * returned book (not just ones with an approved review), and each row now
 * carries created_at so a portfolio can order/display "read on" dates.
 *
 * §425 "add clubs in charge for events (may be optional)" — calendar_events
 * gained an optional club_in_charge column (migration 0044), threaded
 * through createCalendarEvent()/updateCalendarEvent() and the bulk-import
 * entity definition.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import {
  createBook, listAvailableCopies, issueBook, returnBook, listReadingRecords, submitReadingReview, reviewReadingRecord,
} from "../../modules/library/service";
import { createCalendarEvent, updateCalendarEvent, listCalendarEvents, CALENDAR_EVENT_TYPES } from "../../modules/calendar/service";

let institutionA: string;
let adminAuth: string, adminUserId: string;
let studentId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "portfolio-followup-school-a");
  const admin = await seedDemoUser(db, institutionA, "admin@portfolio-followup-a.example", "Followup Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 6", sortOrder: 1 });
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId: cls.id, name: "A" });
  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "FU-1", fullName: "Followup Student" });
  studentId = student.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId, classId: cls.id, sectionId: section.id, academicYearId: year!.id });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Reading records: full 'books read' list vs approved-reviews-only (§423/§424)", () => {
  it("a returned book WITHOUT an approved review still shows up in the unfiltered 'books read' list", async () => {
    const book = await createBook(institutionA, adminAuth, adminUserId, { title: "Unreviewed Book", copyCount: 1 });
    const copies = await listAvailableCopies(institutionA, adminAuth, book.id);
    const issue = await issueBook(institutionA, adminAuth, adminUserId, studentId, copies[0].id);
    await returnBook(institutionA, adminAuth, adminUserId, { bookIssueId: issue.id, conditionOnReturn: "good" });

    // §424: no status filter -- every book this student finished, regardless of review state.
    const allBooks = await listReadingRecords(institutionA, adminAuth, undefined, undefined, studentId);
    const found = allBooks.find((r) => r.book_title === "Unreviewed Book");
    expect(found).toBeTruthy();
    expect(found?.review_status).toBe("pending"); // demo institution's default config requires a review
    expect(found?.created_at).toBeTruthy();

    // But it must NOT appear in the approved-only view (§L.3 "only approved counts").
    const approvedOnly = await listReadingRecords(institutionA, adminAuth, "approved", undefined, studentId);
    expect(approvedOnly.find((r) => r.book_title === "Unreviewed Book")).toBeUndefined();
  });

  it("once a review is submitted AND approved, the same book appears in the approved-reviews list with its text (§423)", async () => {
    const book = await createBook(institutionA, adminAuth, adminUserId, { title: "Reviewed Book", copyCount: 1 });
    const copies = await listAvailableCopies(institutionA, adminAuth, book.id);
    const issue = await issueBook(institutionA, adminAuth, adminUserId, studentId, copies[0].id);
    await returnBook(institutionA, adminAuth, adminUserId, { bookIssueId: issue.id, conditionOnReturn: "good" });

    const pending = await listReadingRecords(institutionA, adminAuth, "pending", undefined, studentId);
    const record = pending.find((r) => r.book_title === "Reviewed Book");
    expect(record).toBeTruthy();

    await submitReadingReview(institutionA, adminAuth, record!.id, "<p>A great read!</p>");
    await reviewReadingRecord(institutionA, adminAuth, adminUserId, record!.id, "approved");

    const approved = await listReadingRecords(institutionA, adminAuth, "approved", undefined, studentId);
    const approvedRecord = approved.find((r) => r.book_title === "Reviewed Book");
    expect(approvedRecord?.review_text).toBe("<p>A great read!</p>");

    // And it's still present in the unfiltered full history too.
    const allBooks = await listReadingRecords(institutionA, adminAuth, undefined, undefined, studentId);
    expect(allBooks.find((r) => r.book_title === "Reviewed Book")?.review_status).toBe("approved");
  });
});

describe("Academic Calendar club_in_charge (§425, migration 0044)", () => {
  it("createCalendarEvent() accepts and persists an optional clubInCharge", async () => {
    const event = await createCalendarEvent(institutionA, adminAuth, adminUserId, {
      title: "Inter-school Debate", eventType: "other", startDate: "2026-11-10", clubInCharge: "Literary Club",
    });
    expect(event.club_in_charge).toBe("Literary Club");

    const list = await listCalendarEvents(institutionA, adminAuth);
    expect(list.find((e) => e.id === event.id)?.club_in_charge).toBe("Literary Club");
  });

  it("clubInCharge stays null when never set (§K, always optional)", async () => {
    const event = await createCalendarEvent(institutionA, adminAuth, adminUserId, {
      title: "Founder's Day", eventType: "other", startDate: "2026-12-01",
    });
    expect(event.club_in_charge).toBeNull();
  });

  it("updateCalendarEvent() can set clubInCharge independently of other fields", async () => {
    const event = await createCalendarEvent(institutionA, adminAuth, adminUserId, {
      title: "Nature Walk", eventType: "other", startDate: "2027-01-15",
    });
    const updated = await updateCalendarEvent(institutionA, adminAuth, adminUserId, {
      id: event.id, clubInCharge: "Nature Club",
    });
    expect(updated.club_in_charge).toBe("Nature Club");
    expect(updated.title).toBe("Nature Walk"); // untouched
  });

  it("every CALENDAR_EVENT_TYPE has a distinct entry (colour-coding source list, §425)", () => {
    // Not a UI test (no DOM here) -- just guards the enum this feature's
    // colour/badge maps in app/(institution)/calendar/page.tsx key off of,
    // so a future new event type doesn't silently render uncoloured.
    expect(new Set(CALENDAR_EVENT_TYPES).size).toBe(CALENDAR_EVENT_TYPES.length);
    expect(CALENDAR_EVENT_TYPES).toContain("holiday");
  });
});
