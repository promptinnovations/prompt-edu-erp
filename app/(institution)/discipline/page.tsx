import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listStudents } from "../../../modules/students/service";
import {
  listDisciplineCategories, listDisciplineRecords, listCharacterAttributes, listCharacterAssessments,
} from "../../../modules/discipline/service";
import DisciplineRecordForm from "./DisciplineRecordForm";
import CharacterAssessmentForm from "./CharacterAssessmentForm";

export default async function DisciplinePage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "discipline");

  const [students, categories, records, attributes, assessments] = await Promise.all([
    listStudents(institutionId, authUserId),
    listDisciplineCategories(institutionId, authUserId),
    listDisciplineRecords(institutionId, authUserId),
    listCharacterAttributes(institutionId, authUserId),
    listCharacterAssessments(institutionId, authUserId),
  ]);

  const canRecord = can(ctx.permissions, "discipline.record");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Discipline &amp; Character</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Discipline records</h2>
        <DisciplineRecordForm
          students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
          categories={categories}
          records={records}
          canRecord={canRecord}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Character assessments</h2>
        <CharacterAssessmentForm
          students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
          attributes={attributes}
          assessments={assessments}
          canRecord={canRecord}
        />
      </section>
    </div>
  );
}
