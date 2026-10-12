import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStudents } from "../../../modules/students/service";
import {
  listDisciplineCategories, listDisciplineRecords, listCharacterAttributes, listCharacterAssessments,
  listCharacterRatingLabels,
} from "../../../modules/discipline/service";
import DisciplineRecordForm from "./DisciplineRecordForm";
import CharacterAssessmentForm from "./CharacterAssessmentForm";
import DisciplineConfigSection from "./DisciplineConfigSection";
import { Panel } from "../../components/portal/viz/blocks";
import { CountDonut, MonthBars, CountBars } from "../../components/staff/insights";
import { seriesColor, STATUS_COLOR } from "../../components/portal/viz/palette";

export default async function DisciplinePage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "discipline");

  const canManage = can(ctx.permissions, "settings.manage");
  const [students, categories, records, attributes, assessments, ratingLabels, allCategories, allAttributes] = await Promise.all([
    listStudents(institutionId, authUserId),
    listDisciplineCategories(institutionId, authUserId),
    listDisciplineRecords(institutionId, authUserId),
    listCharacterAttributes(institutionId, authUserId),
    listCharacterAssessments(institutionId, authUserId),
    listCharacterRatingLabels(institutionId, authUserId),
    canManage ? listDisciplineCategories(institutionId, authUserId, { includeInactive: true }) : Promise.resolve([]),
    canManage ? listCharacterAttributes(institutionId, authUserId, { includeInactive: true }) : Promise.resolve([]),
  ]);

  const canRecord = can(ctx.permissions, "discipline.record");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Discipline &amp; Character</h1>

      {/* §Staff-pages-visual — records at a glance (same rows as below). */}
      {records.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Positive vs needs attention" color={seriesColor(4)}>
            <CountDonut rows={records} sub="records" label={(r) => (r.is_positive ? "Positive" : "Needs attention")}
              fixed={{ Positive: STATUS_COLOR.present, "Needs attention": STATUS_COLOR.absent }} />
          </Panel>
          <Panel title="Records per month" subtitle="Last 6 months." color={seriesColor(4)}>
            <MonthBars rows={records} date={(r) => r.date} color={seriesColor(4)} />
          </Panel>
          <Panel title="Most recorded" color={seriesColor(4)}>
            <CountBars rows={records} label={(r) => r.category_name} color={seriesColor(4)} limit={7} />
          </Panel>
        </div>
      ) : null}

      <section id="records" className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Discipline records</h2>
        <DisciplineRecordForm
          students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
          categories={categories}
          records={records}
          canRecord={canRecord}
        />
      </section>

      <section id="character" className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Character assessments</h2>
        <CharacterAssessmentForm
          students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
          attributes={attributes}
          assessments={assessments}
          ratingLabels={ratingLabels}
          canRecord={canRecord}
        />
      </section>

      {canManage ? (
        <section id="config" className="rounded-card border bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Configure categories, attributes &amp; rating scale</h2>
          <p className="mb-3 text-xs text-zinc-500">
            Add, rename, reorder, or deactivate discipline categories and character attributes anytime — no code
            change needed. Deactivated items stay on historical records but drop out of new-record dropdowns.
          </p>
          <DisciplineConfigSection categories={allCategories} attributes={allAttributes} ratingLabels={ratingLabels} />
        </section>
      ) : null}
    </div>
  );
}
