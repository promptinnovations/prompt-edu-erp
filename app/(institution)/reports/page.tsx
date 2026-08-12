import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listReportDefinitions, listRecentReports } from "../../../modules/reporting/service";
import { listClasses, listSections } from "../../../modules/academic/service";
import { listExaminations } from "../../../modules/examination/service";
import ReportGeneratorForm from "./ReportGeneratorForm";

export default async function ReportsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  if (!can(ctx.permissions, "reports.view")) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        You do not have permission to view reports.
      </div>
    );
  }

  const [definitions, recent, classes, sections, examinations] = await Promise.all([
    listReportDefinitions(institutionId, authUserId),
    listRecentReports(institutionId, authUserId),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listExaminations(institutionId, authUserId),
  ]);

  const canExport = can(ctx.permissions, "reports.export");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Reports (§P)</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Generate a report</h2>
        {canExport ? (
          <ReportGeneratorForm
            definitions={definitions.map((d) => ({ code: d.code, name: d.name, dataSource: d.data_source }))}
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
            sections={sections.map((s) => ({ id: s.id, classId: s.class_id, name: s.name }))}
            examinations={examinations.map((e) => ({ id: e.id, name: e.name }))}
          />
        ) : (
          <p className="text-sm text-zinc-400">
            You can view the report catalogue below, but generating/downloading reports requires the
            &quot;reports.export&quot; permission.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Built-in report catalogue</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-400">
              <th className="pb-2 font-medium">Report</th>
              <th className="pb-2 font-medium">Data source</th>
            </tr>
          </thead>
          <tbody>
            {definitions.map((d) => (
              <tr key={d.code} className="border-b border-zinc-100">
                <td className="py-2 text-zinc-900">{d.name}</td>
                <td className="py-2 text-zinc-500">{d.data_source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Recently generated (this institution)</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-zinc-400">No reports generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-400">
                <th className="pb-2 font-medium">Report type</th>
                <th className="pb-2 font-medium">Format</th>
                <th className="pb-2 font-medium">Generated at</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100">
                  <td className="py-2 text-zinc-900">{r.report_type}</td>
                  <td className="py-2 text-zinc-500 uppercase">{r.format}</td>
                  <td className="py-2 text-zinc-500">{new Date(r.generated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
