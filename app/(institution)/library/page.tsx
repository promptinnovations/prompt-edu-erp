import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStudents } from "../../../modules/students/service";
import {
  listBooks, listAvailableCopies, listIssuedBooks, listReadingRecords,
  listAuthors, listPublishers, listBookCategories, listShelves,
} from "../../../modules/library/service";
import AddBookForm from "./AddBookForm";
import IssueBookForm from "./IssueBookForm";
import ReturnBookForm from "./ReturnBookForm";
import ReadingReviewQueue from "./ReadingReviewQueue";

export default async function LibraryPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "library");

  const [students, books, issued, pendingReviews, authors, publishers, categories, shelves] = await Promise.all([
    listStudents(institutionId, authUserId),
    listBooks(institutionId, authUserId),
    listIssuedBooks(institutionId, authUserId),
    listReadingRecords(institutionId, authUserId, "pending"),
    listAuthors(institutionId, authUserId),
    listPublishers(institutionId, authUserId),
    listBookCategories(institutionId, authUserId),
    listShelves(institutionId, authUserId),
  ]);

  const copiesByBook: Record<string, Awaited<ReturnType<typeof listAvailableCopies>>> = {};
  for (const b of books) {
    copiesByBook[b.id] = await listAvailableCopies(institutionId, authUserId, b.id);
  }

  const canManage = can(ctx.permissions, "library.manage");
  const canIssue = can(ctx.permissions, "library.issue");
  const canReturn = can(ctx.permissions, "library.return");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Library</h1>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Catalogue</h2>
        {canManage ? (
          <div className="mb-4">
            <AddBookForm authors={authors} publishers={publishers} categories={categories} shelves={shelves} />
          </div>
        ) : null}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Title</th>
              <th className="py-1.5">Author</th>
              <th className="py-1.5">Category</th>
              <th className="py-1.5">Shelf</th>
              <th className="py-1.5">Available</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {books.map((b) => (
              <tr key={b.id}>
                <td className="py-1.5">{b.title}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{b.author_name ?? "—"}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{b.category_name ?? "—"}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{b.shelf_name ?? "—"}</td>
                <td className="py-1.5">{b.available_copies} / {b.total_copies}</td>
              </tr>
            ))}
            {books.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No books yet.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>

      {canIssue ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Issue a book</h2>
          <IssueBookForm
            students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
            books={books.map((b) => ({ id: b.id, title: b.title, available_copies: b.available_copies }))}
            copiesByBook={Object.fromEntries(Object.entries(copiesByBook).map(([k, v]) => [k, v.map((c) => ({ id: c.id, book_id: c.book_id, copy_code: c.copy_code }))]))}
          />
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Currently issued</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Book</th>
              <th className="py-1.5">Student</th>
              <th className="py-1.5">Due</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {issued.map((i) => (
              <tr key={i.id}>
                <td className="py-1.5">{i.book_title}</td>
                <td className="py-1.5">{i.student_name}</td>
                <td className="py-1.5 text-zinc-500 dark:text-zinc-400">{i.due_date}</td>
                <td className="py-1.5">{canReturn ? <ReturnBookForm bookIssueId={i.id} isOverdue={i.is_overdue} /> : null}</td>
              </tr>
            ))}
            {issued.length === 0 ? (
              <tr><td colSpan={4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">Nothing currently issued.</td></tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Reading reviews</h2>
        <ReadingReviewQueue records={pendingReviews} canReview={canManage} />
      </section>
    </div>
  );
}
