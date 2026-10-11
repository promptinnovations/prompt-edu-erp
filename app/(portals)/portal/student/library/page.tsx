import Link from "next/link";
import { listBooks, listMyHolds, listReadingRecords, listApprovedReviews, listIssuedBooks } from "../../../../../modules/library/service";
import { requireOwnStudentId, NotLinkedNotice, Card } from "../_lib";
import PreBookSection from "../PreBookSection";
import MyPendingReviews from "../MyPendingReviews";
import ReviewCorner from "../ReviewCorner";
import LibraryCatalogueGrid from "../../../../(institution)/library/LibraryCatalogueGrid";
import { getReadingInsights } from "../../../../../modules/portal/student-insights";
import { PageHeader } from "../../../../components/portal/viz/blocks";
import ReadingStats from "../../../../components/portal/student/ReadingStats";
import { AREA } from "../../../../components/portal/student/areas";

/** Library & reading — the catalogue (same card-grid UI as the admin
 *  Library page, §"use the catalogue UI everywhere when catalogue is
 *  required"), the student's own bookings and current loans, and — per the
 *  follow-up "in side panel, Library will be available, there all reviews
 *  and catalogue can be available" — posting a review and browsing
 *  everyone else's (Review Corner) live here too.
 *
 *  §Library-workflow — every catalogue card now opens the book's own page
 *  (/portal/student/library/<bookId>) where details, availability,
 *  reviews and the take/pre-book action live; the old list-based
 *  "pre-book one of these" section is gone (PreBookSection renders only
 *  "My bookings" here). */
export default async function StudentLibraryPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const [books, myHolds, myLoans, pendingReviews, approvedReviews, reading] = await Promise.all([
    listBooks(institutionId, authUserId),
    listMyHolds(institutionId, authUserId, ownStudentId),
    listIssuedBooks(institutionId, authUserId, ownStudentId),
    listReadingRecords(institutionId, authUserId, "pending", undefined, ownStudentId),
    listApprovedReviews(institutionId, authUserId, null, ownStudentId),
    getReadingInsights(institutionId, authUserId, ownStudentId),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library & reading"
        subtitle="Your reading so far — then tap any book below for details, availability and reviews."
        icon={AREA.reading.icon}
        color={AREA.reading.color}
      />

      {/* §Student-portal-visual-redesign — the reading picture (books read,
          reviews, likes, genres; books per month; genre mix). */}
      <ReadingStats data={reading} />

      {myLoans.length > 0 || myHolds.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="With you now" subtitle="Books currently issued to you.">
            {myLoans.length === 0 ? (
              <p className="text-sm text-zinc-500">Nothing issued right now.</p>
            ) : (
              <ul className="space-y-1.5">
                {myLoans.map((l) => {
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/portal/student/library/${l.book_id}`} className="text-zinc-800 underline-offset-2 hover:underline">{l.book_title}</Link>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${l.is_overdue ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-600"}`}>
                        {l.is_overdue ? `Overdue since ${l.due_date}` : `Due ${l.due_date}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="My bookings" subtitle="Reserved for you, or waiting for a copy to come back.">
            <PreBookSection
              holdableBooks={[]}
              showHoldableList={false}
              myHolds={myHolds.map((h) => ({ id: h.id, book_title: h.book_title, status: h.status }))}
            />
          </Card>
        </div>
      ) : null}

      <Card title="Catalogue">
        <LibraryCatalogueGrid
          hrefBase="/portal/student/library"
          books={books.map((b) => ({
            id: b.id, title: b.title, subtitle: b.subtitle, author_name: b.author_name,
            category_name: b.category_name, shelf_name: b.shelf_name,
            available_copies: b.available_copies, total_copies: b.total_copies,
          }))}
        />
      </Card>

      {pendingReviews.length > 0 ? (
        <Card title="Write a review" subtitle="Books you've returned that are waiting for your thoughts.">
          <MyPendingReviews reviews={pendingReviews.map((r) => ({ id: r.id, book_title: r.book_title }))} />
        </Card>
      ) : null}

      <Card title="Review Corner" subtitle="See what others thought before you pick your next book.">
        <ReviewCorner reviews={approvedReviews} />
      </Card>
    </div>
  );
}
