import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { getOwnParentId, listChildrenForParent, isOwnChild } from "../../../../modules/portal/service";
import { getStudent360 } from "../../../../modules/portfolio/service";
import { listLeaveApplicationsForStudent } from "../../../../modules/attendance/service";
import ChildPicker from "./ChildPicker";
import ApplyLeaveForm from "./ApplyLeaveForm";

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
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Your account isn&apos;t linked to a parent/guardian record yet. Ask your institution admin to set this up.
        </p>
      </div>
    );
  }

  const children = await listChildrenForParent(institutionId, authUserId, ownParentId);
  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No children are linked to your account yet.</p>
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

  const [summary, childLeaves] = await Promise.all([
    getStudent360(institutionId, authUserId, selectedChildId),
    can(ctx.permissions, "attendance.leave.apply")
      ? listLeaveApplicationsForStudent(institutionId, authUserId, selectedChildId)
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My children</h1>
      <ChildPicker options={children} selectedChildId={selectedChildId} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {summary.attendanceSummary ? `${summary.attendanceSummary.present_percent}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Attendance (this year)</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {summary.latestResult ? `${summary.latestResult.percentage}%` : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {summary.latestResult ? `Latest: ${summary.latestResult.examination_name}` : "No results yet"}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {summary.latestConsolidatedScore ? summary.latestConsolidatedScore.score : "—"}
          </div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Consolidated score</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{summary.recentPortfolioEvents.length}</div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Recent portfolio events</div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Recent portfolio timeline</h2>
        <ul className="space-y-2 text-sm">
          {summary.recentPortfolioEvents.map((e) => (
            <li key={e.id} className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
              <span>{e.title}</span>
              <span className="text-zinc-400 dark:text-zinc-500">{e.event_date}</span>
            </li>
          ))}
          {summary.recentPortfolioEvents.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing yet.</li> : null}
        </ul>
      </div>

      {can(ctx.permissions, "attendance.leave.apply") ? (
        <ApplyLeaveForm
          studentId={selectedChildId}
          studentName={children.find((c) => c.id === selectedChildId)?.full_name ?? "your child"}
          leaves={childLeaves}
        />
      ) : null}
    </div>
  );
}
