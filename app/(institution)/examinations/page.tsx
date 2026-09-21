import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listExamTypes, listExaminations } from "../../../modules/examination/service";
import { listAcademicYears } from "../../../modules/academic/service";
import { getInstitution } from "../../../services/institution/institution-service";
import ExaminationForm from "./ExaminationForm";
import ExaminationsTable from "./ExaminationsTable";

export default async function ExaminationsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");

  const [examTypes, academicYears, examinations, institution] = await Promise.all([
    listExamTypes(institutionId, authUserId),
    listAcademicYears(institutionId, authUserId),
    listExaminations(institutionId, authUserId),
    getInstitution(institutionId, authUserId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Examinations</h1>

      <section id="create" className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Create examination</h2>
        <ExaminationForm examTypes={examTypes} academicYears={academicYears} educationMode={institution?.educationMode ?? "academic"} />
      </section>

      <section id="list" className="overflow-hidden rounded-2xl border bg-white">
        <ExaminationsTable
          examinations={examinations}
          academicYears={academicYears}
          canManage={can(ctx.permissions, "settings.manage")}
        />
      </section>
    </div>
  );
}
