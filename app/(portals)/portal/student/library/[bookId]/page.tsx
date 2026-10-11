import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookDetail, listApprovedReviews } from "../../../../../../modules/library/service";
import { requireOwnStudentId, NotLinkedNotice, Card } from "../../_lib";
import ReviewCorner from "../../ReviewCorner";
import { ReviewForm } from "../../MyPendingReviews";
import BookActions from "../BookActions";

/** §Library-workflow — the student-portal book page: "when pressed on the
 *  book, its details like author, year of publishing, original language,
 *  genre everything will appear, availability also (taken or available
 *  with green and red colour), also if any reviews are available that
 *  also, at the top of each review there should be name of child who
 *  submitted that, those read should be able like and dislike. then should
 *  be able to take by clicking book... once the book returns, the child
 *  should be able submit a review of it".
 *
 *  Everything on this page is scoped to the signed-in student
 *  (requireOwnStudentId — never a studentId from the URL); the book itself
 *  is RLS-scoped, so a foreign/withdrawn id is simply a 404. */
export default async function StudentBookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const [detail, reviews] = await Promise.all([
    getBookDetail(institutionId, authUserId, bookId, ownStudentId),
    listApprovedReviews(institutionId, authUserId, bookId, ownStudentId),
  ]);
  if (!detail) notFound();
  const { book, myHold, myIssue, myPendingReview, timesRead } = detail;
  const available = book.available_copies > 0;

  const facts: Array<[string, string | null]> = [
    ["Author", book.author_name],
    ["Year of publishing", book.publication_year ? String(book.publication_year) : null],
    ["Genre", book.category_name],
    ["Language", book.language],
    ["Original language", book.original_language],
    ["Publisher", book.publisher_name],
    ["Edition", book.edition],
    ["ISBN", book.isbn],
    ["Shelf", book.shelf_name],
  ];

  return (
    <div className="space-y-6">
      <p className="text-xs text-zinc-500">
        <Link href="/portal/student/library" className="underline hover:text-zinc-700">Library</Link> / {book.title}
      </p>

      <Card title={book.title} subtitle={book.subtitle ?? undefined}>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                  available ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                }`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${available ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden="true" />
                {available ? `Available — ${book.available_copies} of ${book.total_copies} ${book.total_copies === 1 ? "copy" : "copies"} in` : `Taken — all ${book.total_copies} ${book.total_copies === 1 ? "copy is" : "copies are"} out`}
              </span>
              {timesRead > 0 ? (
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">
                  You&apos;ve read this {timesRead === 1 ? "once" : `${timesRead} times`}
                </span>
              ) : null}
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-dashed py-1 sm:block sm:border-0 sm:py-0">
                  <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">{label}</dt>
                  <dd className="text-right text-zinc-800 sm:text-left">{value ?? <span className="text-zinc-400">—</span>}</dd>
                </div>
              ))}
            </dl>

            {book.description ? (
              <div>
                <p className="mb-1 section-label">About this book</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">{book.description}</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <BookActions bookId={book.id} available={available} myHold={myHold} myIssue={myIssue ? { due_date: myIssue.due_date, is_overdue: myIssue.is_overdue } : null} />
          </div>
        </div>
      </Card>

      {myPendingReview ? (
        <Card title="Write your review" subtitle="You've returned this book — tell everyone what you thought. Your review appears here once the librarian approves it.">
          <ReviewForm readingRecordId={myPendingReview.reading_record_id} />
        </Card>
      ) : null}

      <Card
        title={`Reviews${reviews.length > 0 ? ` (${reviews.length})` : ""}`}
        subtitle={reviews.length > 0 ? "What other readers thought — tap 👍 or 👎 to react." : undefined}
      >
        {reviews.length === 0 ? (
          <p className="text-sm text-zinc-500">No reviews for this book yet{myIssue ? " — you could be the first, once you return it." : "."}</p>
        ) : (
          <ReviewCorner reviews={reviews} showBookTitle={false} />
        )}
      </Card>
    </div>
  );
}
