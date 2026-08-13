import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listStudents } from "../../../modules/students/service";
import {
  listScoringRules, listScoreEvents, listConsolidatedScores, getDefaultPerformanceProfile, listPerformanceComponents,
} from "../../../modules/scoring/service";
import ComputeScoreForm from "./ComputeScoreForm";

export default async function ScoringPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const canManage = can(ctx.permissions, "settings.manage");
  const canView = can(ctx.permissions, "reports.view");

  const [students, rules, events, scores, profile] = await Promise.all([
    listStudents(institutionId, authUserId),
    listScoringRules(institutionId, authUserId),
    listScoreEvents(institutionId, authUserId),
    listConsolidatedScores(institutionId, authUserId),
    getDefaultPerformanceProfile(institutionId, authUserId),
  ]);
  const components = profile ? await listPerformanceComponents(institutionId, authUserId, profile.id) : [];
  const studentNameById = new Map(students.map((s) => [s.id, s.full_name]));

  if (!canView && !canManage) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Scoring &amp; performance</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">You don&apos;t have permission to view this.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Scoring &amp; performance</h1>

      {canManage ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Scoring rules (config)</h2>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1.5">Module</th>
                <th className="py-1.5">Activity code</th>
                <th className="py-1.5">Points</th>
                <th className="py-1.5">Max</th>
                <th className="py-1.5">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5">{r.module}</td>
                  <td className="py-1.5">{r.activity_code}</td>
                  <td className="py-1.5">{r.points}</td>
                  <td className="py-1.5">{r.max_points ?? "—"}</td>
                  <td className="py-1.5">{r.is_active ? "Yes" : "No"}</td>
                </tr>
              ))}
              {rules.length === 0 ? (
                <tr><td colSpan={5} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No scoring rules configured yet.</td></tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </section>
      ) : null}

      {canManage && profile ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Default performance profile: {profile.name}
          </h2>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1.5">Component</th>
                <th className="py-1.5">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {components.map((c) => (
                <tr key={c.id}>
                  <td className="py-1.5 capitalize">{c.component_module}</td>
                  <td className="py-1.5">{c.weight_percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      ) : null}

      {canView ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Consolidated score</h2>
          <ComputeScoreForm students={students.map((s) => ({ id: s.id, full_name: s.full_name }))} />
          <div className="overflow-x-auto">
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1.5">Student</th>
                <th className="py-1.5">Period</th>
                <th className="py-1.5">Score</th>
                <th className="py-1.5">Breakdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {scores.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5">{studentNameById.get(s.student_id) ?? "—"}</td>
                  <td className="py-1.5">{s.period}</td>
                  <td className="py-1.5">{s.score}</td>
                  <td className="py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {Object.entries(s.breakdown_jsonb).map(([k, v]) => `${k}: ${Number(v).toFixed(1)}`).join(", ")}
                  </td>
                </tr>
              ))}
              {scores.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No consolidated scores computed yet.</td></tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </section>
      ) : null}

      {canView ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Score events ledger</h2>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1.5">Student</th>
                <th className="py-1.5">Source module</th>
                <th className="py-1.5">Points</th>
                <th className="py-1.5">Computed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {events.slice(0, 50).map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5">{studentNameById.get(e.student_id) ?? "—"}</td>
                  <td className="py-1.5">{e.source_module}</td>
                  <td className="py-1.5">{e.points}</td>
                  <td className="py-1.5 text-xs text-zinc-500 dark:text-zinc-400">{new Date(e.computed_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {events.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-center text-zinc-400 dark:text-zinc-500">No score events yet.</td></tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
