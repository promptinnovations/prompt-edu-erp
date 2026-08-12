import { requireRequestContext } from "../../../../services/request-context";
import { getOwnParentId, listChildrenForParent, isOwnChild } from "../../../../modules/portal/service";
import { getStudent360 } from "../../../../modules/portfolio/service";
import ChildPicker from "./ChildPicker";

export default async function ParentPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const { childId } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const ownParentId = await getOwnParentId(institutionId, authUserId, ctx.userId);
  if (!ownParentId) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-sm text-zinc-500">
          Your account isn&apos;t linked to a parent/guardian record yet. Ask your institution admin to set this up.
        </p>
      </div>
    );
  }

  const children = await listChildrenForParent(institutionId, authUserId, ownParentId);
  if (children.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-sm text-zinc-500">No children are linked to your account yet.</p>
      </div>
    );
  }

  // §Z portal identity rule: a requested childId is only ever honoured if
  // isOwnChild() confirms it — never trust the query string to pick
  // WHICH child, only to pick AMONG this parent's own already-resolved set.
  const selectedChildId =
    childId && (await isOwnChild(institutionId, authUserId, ownParentId, childId))
      ? childId
      : children.find((c) => c.is_primary_contact)?.id ?? children[0].id;

  const summary = await getStudent360(institutionId, authUserId, selectedChildId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">My children</h1>
      <ChildPicker options={children} selectedChildId={selectedChildId} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">
            {summary.attendanceSummary ? `${summary.attendanceSummary.present_percent}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">Attendance (this year)</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">
            {summary.latestResult ? `${summary.latestResult.percentage}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {summary.latestResult ? `Latest: ${summary.latestResult.examination_name}` : "No results yet"}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">
            {summary.latestConsolidatedScore ? summary.latestConsolidatedScore.score : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500">Consolidated score</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-2xl font-semibold text-zinc-900">{summary.recentPortfolioEvents.length}</div>
          <div className="mt-1 text-sm text-zinc-500">Recent portfolio events</div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Recent portfolio timeline</h2>
        <ul className="space-y-2 text-sm">
          {summary.recentPortfolioEvents.map((e) => (
            <li key={e.id} className="flex items-center justify-between border-b border-zinc-100 pb-2 last:border-0">
              <span>{e.title}</span>
              <span className="text-zinc-400">{e.event_date}</span>
            </li>
          ))}
          {summary.recentPortfolioEvents.length === 0 ? <li className="text-zinc-400">Nothing yet.</li> : null}
        </ul>
      </div>
    </div>
  );
}
