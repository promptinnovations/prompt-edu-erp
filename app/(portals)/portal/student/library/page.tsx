import { listBooks, listMyHolds, listReadingRecords, listApprovedReviews } from "../../../../../modules/library/service";
import { requireOwnStudentId, NotLinkedNotice, Card } from "../_lib";
import PreBookSection from "../PreBookSection";
import MyPendingReviews from "../MyPendingReviews";
import ReviewCorner from "../ReviewCorner";
import LibraryCatalogueGrid from "../../../../(institution)/library/LibraryCatalogueGrid";

/** Library & reading — the catalogue (same card-grid UI as the admin
 *  Library page, §"use the catalogue UI everywhere when catalogue is
 *  required"), pre-booking/holds, and — per the follow-up "in side panel,
 *  Library will be available, there all reviews and catalogue can be
 *  available" — posting a review and browsing everyone else's (Review
 *  Corner) live here too, not on the Dashboard front page. */
export default async function StudentLibraryPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;

  const [books, myHolds, pendingReviews, approvedReviews] = await Promise.all([
    listBooks(institutionId, authUserId),
    listMyHolds(institutionId, authUserId, ownStudentId),
    listReadingRecords(institutionId, authUserId, "pending", undefined, ownStudentId),
    listApprovedReviews(institutionId, authUserId, null, ownStudentId),
  ]);
  const holdableBooks = books.filter((b) => b.available_copies === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Library &amp; reading</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Browse the catalogue, pre-book, and read what others thought.</p>
      </div>

      <Card title="Catalogue">
        <LibraryCatalogueGrid
          books={books.map((b) => ({
            id: b.id, title: b.title, subtitle: b.subtitle, author_name: b.author_name,
            category_name: b.category_name, shelf_name: b.shelf_name,
            available_copies: b.available_copies, total_copies: b.total_copies,
          }))}
        />
      </Card>

      <Card title="Pre-book" subtitle="Reserve a copy that's currently all checked out.">
        <PreBookSection
          holdableBooks={holdableBooks.map((b) => ({ id: b.id, title: b.title, available_copies: b.available_copies }))}
          myHolds={myHolds.map((h) => ({ id: h.id, book_title: h.book_title, status: h.status }))}
        />
      </Card>

      <Card title="Post a review">
        <MyPendingReviews reviews={pendingReviews.map((r) => ({ id: r.id, book_title: r.book_title }))} />
      </Card>

      <Card title="Review Corner" subtitle="See what others thought before you pick your next book.">
        <ReviewCorner reviews={approvedReviews} />
      </Card>
    </div>
  );
}
