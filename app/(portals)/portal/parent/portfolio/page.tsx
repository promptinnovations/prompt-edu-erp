import Link from "next/link";
import { requireOwnParentContext, NotLinkedNotice, Card } from "../_lib";
import { listPortfolioTimeline } from "../../../../../modules/portfolio/service";
import { loadPortfolioDashboardData } from "../../../../../modules/portfolio/dashboard-service";
import { getParentPortalSections } from "../../../../../services/institution/institution-service";
import StudentPortfolioDashboard from "../../../../components/portfolio/StudentPortfolioDashboard";

/**
 * Portfolio — §Portfolio-dashboard follow-up ("the student and parent
 * portal should be like this [rich dashboard reference] — do everything
 * needed for that"). Same shared StudentPortfolioDashboard the staff
 * Student Portfolio tab and the student portal use, scoped to the
 * selected child and gated by this institution's own
 * `parent_portal_sections` config (Settings) — a section the admin has
 * turned off for parents simply isn't fetched or rendered here.
 */
export default async function ParentPortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const child = children.find((c) => c.id === selectedChildId);

  const sections = await getParentPortalSections(institutionId, authUserId);
  const [dashboardData, events] = await Promise.all([
    loadPortfolioDashboardData(institutionId, authUserId, selectedChildId, sections),
    sections.portfolio ? listPortfolioTimeline(institutionId, authUserId, selectedChildId, 100) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/portal/parent?childId=${selectedChildId}`} className="text-xs text-[var(--brand)] underline hover:text-[var(--brand-hover)]">
          ← Back to {child?.full_name ?? "overview"}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--heading)]">Portfolio — {child?.full_name}</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Academic, attendance, behaviour and activity record for this academic year.</p>
      </div>

      {dashboardData ? (
        <StudentPortfolioDashboard data={dashboardData} />
      ) : (
        <Card title="Portfolio">No portfolio data available yet.</Card>
      )}

      {sections.portfolio ? (
        <Card title={`${events.length} timeline event${events.length === 1 ? "" : "s"}`}>
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
      ) : null}
    </div>
  );
}
