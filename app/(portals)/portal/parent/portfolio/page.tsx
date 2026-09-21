import Link from "next/link";
import { requireOwnParentContext, NotLinkedNotice, Card } from "../_lib";
import { listPortfolioTimeline } from "../../../../../modules/portfolio/service";

/** Detail view behind the parent dashboard's "Recent portfolio events"
 *  stat-card button — the full timeline (limit 100) rather than the
 *  10-event preview getStudent360() returns for the overview page. */
export default async function ParentPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const child = children.find((c) => c.id === selectedChildId);

  const events = await listPortfolioTimeline(institutionId, authUserId, selectedChildId, 100);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/portal/parent?childId=${selectedChildId}`} className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
          ← Back to {child?.full_name ?? "overview"}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--heading)]">Portfolio timeline — {child?.full_name}</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Every approved portfolio event, most recent first.</p>
      </div>

      <Card title={`${events.length} event${events.length === 1 ? "" : "s"}`}>
        <ul className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between border-b pb-2 last:border-0">
              <div>
                <span>{e.title}</span>
                {e.description ? <p className="mt-0.5 text-xs text-zinc-500">{e.description}</p> : null}
              </div>
              <span className="shrink-0 pl-3 text-zinc-500">{e.event_date}</span>
            </li>
          ))}
          {events.length === 0 ? <li className="text-zinc-500">Nothing yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
