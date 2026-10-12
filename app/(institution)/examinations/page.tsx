import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listExamTypes, listExaminations, examinationWorkflowStatus } from "../../../modules/examination/service";
import { listAcademicYears } from "../../../modules/academic/service";
import { getInstitution } from "../../../services/institution/institution-service";
import ExaminationForm from "./ExaminationForm";
import ExaminationsTable from "./ExaminationsTable";
import { Panel } from "../../components/portal/viz/blocks";
import { CountDonut, CountBars } from "../../components/staff/insights";
import { seriesColor } from "../../components/portal/viz/palette";

export default async function ExaminationsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");

  const canManage = can(ctx.permissions, "settings.manage");

  const [examTypes, academicYears, rawExaminations, institution] = await Promise.all([
    listExamTypes(institutionId, authUserId),
    listAcademicYears(institutionId, authUserId),
    listExaminations(institutionId, authUserId),
    getInstitution(institutionId, authUserId),
  ]);
  // §"result is published, still status shows draft, why?" — the list's
  // Status column must reflect the same Open/Closed/Published/Archived
  // state the detail page shows, not the legacy `status` column (which
  // publishExamination()/closeMarkEntry() never touch). Computed here
  // (server component) rather than in the client-side ExaminationsTable,
  // since examinationWorkflowStatus() lives in a server-only module.
  const examinations = rawExaminations.map((e) => ({ ...e, workflowStatus: examinationWorkflowStatus(e) }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Examinations</h1>

      {/* §Staff-pages-visual — exams at a glance (same list as the table). */}
      {examinations.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="By stage" subtitle="Where each examination is in its workflow." color={seriesColor(0)}>
            <CountDonut rows={examinations} sub="exams" label={(e) => String(e.workflowStatus).charAt(0).toUpperCase() + String(e.workflowStatus).slice(1)} />
          </Panel>
          <Panel title="By exam type" color={seriesColor(0)}>
            <CountBars rows={examinations} label={(e) => examTypes.find((t) => t.id === e.exam_type_id)?.name} color={seriesColor(0)} limit={8} />
          </Panel>
        </div>
      ) : null}

      {/* §Teacher-access follow-up: "create exam is there, cancel it for all
         teachers" — this section was previously rendered unconditionally.
         createExaminationAction() already requires settings.manage
         server-side (so a teacher could never actually create an exam by
         posting the form), but the form itself was still visible to every
         teacher — gate the UI to match, same as ExaminationsTable's
         canManage-gated Edit/Delete below. */}
      {canManage ? (
        <section id="create" className="rounded-card border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Create examination</h2>
          <ExaminationForm examTypes={examTypes} academicYears={academicYears} educationMode={institution?.educationMode ?? "academic"} />
        </section>
      ) : null}

      <section id="list" className="overflow-hidden rounded-2xl border bg-white">
        <ExaminationsTable
          examinations={examinations}
          academicYears={academicYears}
          canManage={canManage}
        />
      </section>
    </div>
  );
}
