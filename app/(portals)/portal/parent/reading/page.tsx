import { getParentPortalSections } from "../../../../../services/institution/institution-service";
import { getReadingInsights } from "../../../../../modules/portal/student-insights";
import { listIssuedBooks } from "../../../../../modules/library/service";
import { formatDateIST } from "../../../../../services/datetime/ist";
import { requireOwnParentContext, NotLinkedNotice, NotEnabledNotice } from "../_lib";
import ChildPicker from "../ChildPicker";
import ReadingStats from "../../../../components/portal/student/ReadingStats";
import { PageHeader, Panel, EmptyNote } from "../../../../components/portal/viz/blocks";
import { AREA } from "../../../../components/portal/student/areas";

/** Parent → Reading — §Parent-portal-visual-redesign. The selected child's
 *  reading picture (books read, reviews, genres, books per month), what
 *  they have on loan right now, and the titles they have read. */
export default async function ParentReadingPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const s = await getParentPortalSections(institutionId, authUserId);
  if (!s.library) return <NotEnabledNotice what="Library reading" />;
  const [data, loans] = await Promise.all([
    getReadingInsights(institutionId, authUserId, selectedChildId),
    listIssuedBooks(institutionId, authUserId, selectedChildId),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Reading" subtitle="Books borrowed from the school library." icon={AREA.reading.icon} color={AREA.reading.color}>
        <ChildPicker options={children} selectedChildId={selectedChildId} />
      </PageHeader>
      <ReadingStats data={data} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="On loan now" color={AREA.reading.color}>
          {loans.length === 0 ? <EmptyNote>No books on loan right now.</EmptyNote> : (
            <ul className="space-y-2">
              {loans.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm">
                  <span className="font-medium text-[var(--foreground)]">{l.book_title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${l.is_overdue ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-600"}`}>
                    {l.is_overdue ? `Overdue since ${formatDateIST(l.due_date)}` : `Due ${formatDateIST(l.due_date)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Books read" color={AREA.reading.color}>
          {data.books.length === 0 ? <EmptyNote>No books returned yet.</EmptyNote> : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {data.books.slice(0, 15).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate text-[var(--foreground)]">{b.title}{b.category ? <span className="text-zinc-500"> · {b.category}</span> : null}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{formatDateIST(b.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
