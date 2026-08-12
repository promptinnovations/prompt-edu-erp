/**
 * PROMPT EDU ERP — Library module service.
 * ARCHITECTURE.md §D.11, §M (Library Architecture), Phase 9 (§AA.2).
 *
 * §M.1: books (bibliographic record) -> book_copies (availability tracked
 * per PHYSICAL copy, not per title) -> book_issues/book_returns
 * (transactions) -> reading_records (student-facing review/approval layer
 * that feeds the portfolio, §M.3).
 *
 * Library config (loan period, fine/day, grace days, whether a reading
 * review is required) is institution CONFIGURATION stored in the existing
 * module_configs table (§K/§254 "config vs transaction tables separated
 * everywhere") — never a literal in this file.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { evaluateScoring, recordScoreEvent } from "../scoring/service";
import { recordPortfolioEvent } from "../portfolio/service";

export interface AuthorRecord { id: string; name: string }
export interface PublisherRecord { id: string; name: string }
export interface BookCategoryRecord { id: string; name: string }
export interface ShelfRecord { id: string; name: string; location: string | null }
export interface BookRecord {
  id: string; isbn: string | null; title: string; subtitle: string | null;
  author_id: string | null; publisher_id: string | null; category_id: string | null; shelf_id: string | null; status: string;
}
export interface BookRow extends BookRecord {
  author_name: string | null; publisher_name: string | null; category_name: string | null; shelf_name: string | null;
  available_copies: number; total_copies: number;
}
export interface BookCopyRecord { id: string; book_id: string; copy_code: string; condition: string; status: string }
export interface BookIssueRecord {
  id: string; book_copy_id: string; student_id: string; issue_date: string; due_date: string; status: string;
}
export interface BookIssueRow extends BookIssueRecord {
  book_title: string; student_name: string; is_overdue: boolean;
}
export interface ReadingRecordRow {
  id: string; student_id: string; student_name: string; book_id: string; book_title: string;
  book_issue_id: string; review_text: string | null; review_status: string;
}

export interface LibraryConfig {
  loanPeriodDays: number;
  finePerDay: number;
  graceDays: number;
  requiresReadingReview: boolean;
}
const DEFAULT_LIBRARY_CONFIG: LibraryConfig = {
  loanPeriodDays: 14, finePerDay: 0, graceDays: 0, requiresReadingReview: true,
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export async function getLibraryConfig(institutionId: string, authUserId: string): Promise<LibraryConfig> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ config_value_jsonb: LibraryConfig }>(
      `select mc.config_value_jsonb
         from module_configs mc join modules m on m.id = mc.module_id
        where m.code = 'library' and mc.config_key = 'settings'`
    );
    return rows[0] ? { ...DEFAULT_LIBRARY_CONFIG, ...rows[0].config_value_jsonb } : DEFAULT_LIBRARY_CONFIG;
  });
}

const setLibraryConfigSchema = z.object({
  loanPeriodDays: z.number().int().positive(),
  finePerDay: z.number().nonnegative(),
  graceDays: z.number().int().nonnegative(),
  requiresReadingReview: z.boolean(),
});

export async function setLibraryConfig(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof setLibraryConfigSchema>
): Promise<LibraryConfig> {
  const data = setLibraryConfigSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: moduleRows } = await scoped.query<{ id: string }>("select id from modules where code = 'library'");
    if (moduleRows.length === 0) throw new Error("library module not found in the platform catalogue.");
    await scoped.query(
      `insert into module_configs (institution_id, module_id, config_key, config_value_jsonb)
       values ($1, $2, 'settings', $3)
       on conflict (institution_id, module_id, config_key)
       do update set config_value_jsonb = excluded.config_value_jsonb, updated_at = now()`,
      [institutionId, moduleRows[0].id, JSON.stringify(data)]
    );
    await recordAudit(scoped, { institutionId, userId, action: "update", module: "library", entityType: "module_configs", entityId: null, after: data });
    return data;
  });
}

// ---------------------------------------------------------------------------
// Catalogue (config)
// ---------------------------------------------------------------------------
export async function listAuthors(institutionId: string, authUserId: string): Promise<AuthorRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AuthorRecord>("select id, name from authors order by name");
    return rows;
  });
}
export async function createAuthor(institutionId: string, authUserId: string, name: string): Promise<AuthorRecord> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AuthorRecord>("insert into authors (institution_id, name) values ($1, $2) returning id, name", [institutionId, name]);
    return rows[0];
  });
}

export async function listPublishers(institutionId: string, authUserId: string): Promise<PublisherRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<PublisherRecord>("select id, name from publishers order by name");
    return rows;
  });
}
export async function createPublisher(institutionId: string, authUserId: string, name: string): Promise<PublisherRecord> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<PublisherRecord>("insert into publishers (institution_id, name) values ($1, $2) returning id, name", [institutionId, name]);
    return rows[0];
  });
}

export async function listBookCategories(institutionId: string, authUserId: string): Promise<BookCategoryRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<BookCategoryRecord>("select id, name from book_categories order by name");
    return rows;
  });
}
export async function createBookCategory(institutionId: string, authUserId: string, name: string): Promise<BookCategoryRecord> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<BookCategoryRecord>(
      "insert into book_categories (institution_id, name) values ($1, $2) returning id, name",
      [institutionId, name]
    );
    return rows[0];
  });
}

export async function listShelves(institutionId: string, authUserId: string): Promise<ShelfRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ShelfRecord>("select id, name, location from shelves order by name");
    return rows;
  });
}
export async function createShelf(institutionId: string, authUserId: string, name: string, location?: string | null): Promise<ShelfRecord> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ShelfRecord>(
      "insert into shelves (institution_id, name, location) values ($1, $2, $3) returning id, name, location",
      [institutionId, name, location ?? null]
    );
    return rows[0];
  });
}

const createBookSchema = z.object({
  title: z.string().min(1).max(300),
  subtitle: z.string().max(300).nullable().optional(),
  isbn: z.string().max(30).nullable().optional(),
  authorId: z.string().uuid().nullable().optional(),
  publisherId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  shelfId: z.string().uuid().nullable().optional(),
  language: z.string().max(30).nullable().optional(),
  copyCount: z.number().int().nonnegative().default(1),
});

/** Creates a book AND its initial physical copies in one call — §M.1's
 *  "availability tracked per copy" means a book is never usable for
 *  issuing until at least one book_copies row exists. */
export async function createBook(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createBookSchema>,
  scopedClient?: DbClient // §Q.1, see modules/academic/service.ts's createClass() for why
): Promise<BookRecord> {
  const data = createBookSchema.parse(input);
  const run = async (scoped: DbClient) => {
    const { rows } = await scoped.query<BookRecord>(
      `insert into books (institution_id, title, subtitle, isbn, author_id, publisher_id, category_id, shelf_id, language)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id, isbn, title, subtitle, author_id, publisher_id, category_id, shelf_id, status`,
      [institutionId, data.title, data.subtitle ?? null, data.isbn ?? null, data.authorId ?? null, data.publisherId ?? null, data.categoryId ?? null, data.shelfId ?? null, data.language ?? null]
    );
    const book = rows[0];
    for (let i = 1; i <= data.copyCount; i++) {
      await scoped.query(
        `insert into book_copies (institution_id, book_id, copy_code) values ($1, $2, $3)`,
        [institutionId, book.id, `${book.id.slice(0, 8)}-${i}`]
      );
    }
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "library", entityType: "books", entityId: book.id, after: book });
    return book;
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

export async function listBooks(institutionId: string, authUserId: string): Promise<BookRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<BookRow>(
      `select b.id, b.isbn, b.title, b.subtitle, b.author_id, b.publisher_id, b.category_id, b.shelf_id, b.status,
              a.name as author_name, p.name as publisher_name, c.name as category_name, s.name as shelf_name,
              count(bc.id) filter (where bc.status = 'available') as available_copies,
              count(bc.id) as total_copies
         from books b
         left join authors a on a.id = b.author_id
         left join publishers p on p.id = b.publisher_id
         left join book_categories c on c.id = b.category_id
         left join shelves s on s.id = b.shelf_id
         left join book_copies bc on bc.book_id = b.id
        where b.status = 'active'
        group by b.id, b.isbn, b.title, b.subtitle, b.author_id, b.publisher_id, b.category_id, b.shelf_id, b.status, a.name, p.name, c.name, s.name
        order by b.title`
    );
    return rows;
  });
}

export async function listAvailableCopies(institutionId: string, authUserId: string, bookId: string): Promise<BookCopyRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<BookCopyRecord>(
      "select id, book_id, copy_code, condition, status from book_copies where book_id = $1 and status = 'available' order by copy_code",
      [bookId]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Issue / return (§M.2)
// ---------------------------------------------------------------------------
export async function issueBook(
  institutionId: string, authUserId: string, userId: string, studentId: string, bookCopyId: string
): Promise<BookIssueRecord> {
  const config = await getLibraryConfig(institutionId, authUserId);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: copyRows } = await scoped.query<{ status: string }>("select status from book_copies where id = $1", [bookCopyId]);
    if (copyRows.length === 0) throw new Error("Copy not found.");
    if (copyRows[0].status !== "available") throw new Error("This copy is not available.");

    const { rows } = await scoped.query<BookIssueRecord>(
      `insert into book_issues (institution_id, book_copy_id, student_id, issued_by, due_date)
       values ($1, $2, $3, $4, current_date + ($5 || ' days')::interval)
       returning id, book_copy_id, student_id, issue_date, due_date, status`,
      [institutionId, bookCopyId, studentId, userId, config.loanPeriodDays]
    );
    await scoped.query("update book_copies set status = 'issued' where id = $1", [bookCopyId]);
    await recordAudit(scoped, { institutionId, userId, action: "issue", module: "library", entityType: "book_issues", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

export async function listIssuedBooks(institutionId: string, authUserId: string, studentId?: string): Promise<BookIssueRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = studentId
      ? await scoped.query<BookIssueRow>(
          `select bi.id, bi.book_copy_id, bi.student_id, bi.issue_date, bi.due_date, bi.status,
                  b.title as book_title, s.full_name as student_name,
                  (bi.status = 'issued' and bi.due_date < current_date) as is_overdue
             from book_issues bi
             join book_copies bc on bc.id = bi.book_copy_id
             join books b on b.id = bc.book_id
             join students s on s.id = bi.student_id
            where bi.status = 'issued' and bi.student_id = $1
            order by bi.due_date`,
          [studentId]
        )
      : await scoped.query<BookIssueRow>(
          `select bi.id, bi.book_copy_id, bi.student_id, bi.issue_date, bi.due_date, bi.status,
                  b.title as book_title, s.full_name as student_name,
                  (bi.status = 'issued' and bi.due_date < current_date) as is_overdue
             from book_issues bi
             join book_copies bc on bc.id = bi.book_copy_id
             join books b on b.id = bc.book_id
             join students s on s.id = bi.student_id
            where bi.status = 'issued'
            order by bi.due_date`
        );
    return rows;
  });
}

const returnBookSchema = z.object({
  bookIssueId: z.string().uuid(),
  conditionOnReturn: z.enum(["good", "damaged", "lost"]).default("good"),
});

/** §M.2 return flow + §M.3 reading-review kickoff, in one call (mirrors
 *  the spec's "emits book.returned -> if review required, create
 *  reading_records" sequence — no separate event bus exists yet, same
 *  documented simplification as the scoring/portfolio wiring). */
export async function returnBook(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof returnBookSchema>
): Promise<{ fineAmount: number; readingRecordId: string | null }> {
  const data = returnBookSchema.parse(input);
  const config = await getLibraryConfig(institutionId, authUserId);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: issueRows } = await scoped.query<{ book_copy_id: string; student_id: string; due_date: string; status: string }>(
      "select book_copy_id, student_id, due_date, status from book_issues where id = $1",
      [data.bookIssueId]
    );
    if (issueRows.length === 0 || issueRows[0].status !== "issued") throw new Error("Issue not found or already returned.");
    const issue = issueRows[0];

    const { rows: overdueRows } = await scoped.query<{ overdue_days: number }>(
      `select greatest(0, (current_date - due_date::date) - $2) as overdue_days from book_issues where id = $1`,
      [data.bookIssueId, config.graceDays]
    );
    const overdueDays = Number(overdueRows[0]?.overdue_days ?? 0);
    const fineAmount = Math.round(overdueDays * config.finePerDay * 100) / 100;

    await scoped.query(
      `insert into book_returns (institution_id, book_issue_id, returned_by, condition_on_return, fine_amount)
       values ($1, $2, $3, $4, $5)`,
      [institutionId, data.bookIssueId, userId, data.conditionOnReturn, fineAmount]
    );

    const newIssueStatus = data.conditionOnReturn === "lost" ? "lost" : "returned";
    await scoped.query("update book_issues set status = $1 where id = $2", [newIssueStatus, data.bookIssueId]);

    const newCopyStatus = data.conditionOnReturn === "lost" ? "lost" : data.conditionOnReturn === "damaged" ? "damaged" : "available";
    await scoped.query("update book_copies set status = $1 where id = $2", [newCopyStatus, issue.book_copy_id]);

    await recordAudit(scoped, {
      institutionId, userId, action: "return", module: "library", entityType: "book_issues", entityId: data.bookIssueId,
      after: { conditionOnReturn: data.conditionOnReturn, fineAmount },
    });

    // §M.3: book.returned -> reading_records row, review required or not.
    const { rows: bookRows } = await scoped.query<{ book_id: string }>(
      "select book_id from book_copies where id = $1", [issue.book_copy_id]
    );
    const reviewStatus = config.requiresReadingReview ? "pending" : "not_required";
    const { rows: readingRows } = await scoped.query<{ id: string }>(
      `insert into reading_records (institution_id, student_id, book_id, book_issue_id, review_status)
       values ($1, $2, $3, $4, $5) returning id`,
      [institutionId, issue.student_id, bookRows[0].book_id, data.bookIssueId, reviewStatus]
    );

    return { fineAmount, readingRecordId: readingRows[0]?.id ?? null };
  });
}

// ---------------------------------------------------------------------------
// Reading review -> portfolio integration (§M.3)
// ---------------------------------------------------------------------------
export async function listReadingRecords(institutionId: string, authUserId: string, status?: string): Promise<ReadingRecordRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = status
      ? await scoped.query<ReadingRecordRow>(
          `select rr.id, rr.student_id, s.full_name as student_name, rr.book_id, b.title as book_title,
                  rr.book_issue_id, rr.review_text, rr.review_status
             from reading_records rr
             join students s on s.id = rr.student_id
             join books b on b.id = rr.book_id
            where rr.review_status = $1
            order by rr.created_at desc`,
          [status]
        )
      : await scoped.query<ReadingRecordRow>(
          `select rr.id, rr.student_id, s.full_name as student_name, rr.book_id, b.title as book_title,
                  rr.book_issue_id, rr.review_text, rr.review_status
             from reading_records rr
             join students s on s.id = rr.student_id
             join books b on b.id = rr.book_id
            order by rr.created_at desc`
        );
    return rows;
  });
}

export async function submitReadingReview(
  institutionId: string, authUserId: string, readingRecordId: string, reviewText: string
): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(
      "update reading_records set review_text = $1, updated_at = now() where id = $2 and review_status = 'pending'",
      [reviewText, readingRecordId]
    );
  });
}

/** Staff approval step (§M.3 "Approval Workflow Engine" applied to
 *  reading_records). Approval is the single point (§L.3 pattern, same as
 *  skills/achievements) that fans out to the scoring engine (module=
 *  "reading", activity_code="book_reading_review" — a flat, institution-
 *  configurable rule, §K) and the portfolio timeline. Rejection does
 *  neither, matching every other approval-gated module in this codebase. */
export async function reviewReadingRecord(
  institutionId: string, authUserId: string, userId: string, readingRecordId: string, decision: "approved" | "rejected"
): Promise<ReadingRecordRow | null> {
  const db = await getDbClient();
  const updated = await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ReadingRecordRow>(
      `update reading_records set review_status = $1, approved_by = $2, updated_at = now()
         where id = $3 and review_status = 'pending'
       returning id, student_id, book_id, book_issue_id, review_text, review_status`,
      [decision, userId, readingRecordId]
    );
    if (rows.length === 0) return null;
    const { rows: joined } = await scoped.query<ReadingRecordRow>(
      `select rr.id, rr.student_id, s.full_name as student_name, rr.book_id, b.title as book_title,
              rr.book_issue_id, rr.review_text, rr.review_status
         from reading_records rr join students s on s.id = rr.student_id join books b on b.id = rr.book_id
        where rr.id = $1`,
      [readingRecordId]
    );
    await recordAudit(scoped, { institutionId, userId, action: decision, module: "library", entityType: "reading_records", entityId: readingRecordId, after: joined[0] });
    return joined[0] ?? null;
  });

  if (updated && decision === "approved") {
    const evaluation = await evaluateScoring(institutionId, authUserId, "reading", "book_reading_review", {});
    if (evaluation.rule) {
      await recordScoreEvent(institutionId, authUserId, userId, {
        studentId: updated.student_id, sourceModule: "library", sourceEntityType: "reading_records",
        sourceEntityId: updated.id, points: evaluation.points, scoringRuleId: evaluation.rule.id,
      });
    }
    await recordPortfolioEvent(institutionId, authUserId, {
      studentId: updated.student_id, eventType: "reading_review_approved", module: "library",
      entityType: "reading_records", entityId: updated.id,
      title: `Read: ${updated.book_title}`,
      description: updated.review_text,
      score: evaluation.rule ? evaluation.points : null,
      approvedBy: userId,
    });
  }
  return updated;
}
