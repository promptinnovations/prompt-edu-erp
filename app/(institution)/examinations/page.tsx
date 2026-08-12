import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { listExamTypes, listExaminations } from "../../../modules/examination/service";
import { listAcademicYears } from "../../../modules/academic/service";
import ExaminationForm from "./ExaminationForm";

export default async function ExaminationsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");

  const [examTypes, academicYears, examinations] = await Promise.all([
    listExamTypes(institutionId, authUserId),
    listAcademicYears(institutionId, authUserId),
    listExaminations(institutionId, authUserId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Examinations</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Create examination</h2>
        <ExaminationForm examTypes={examTypes} academicYears={academicYears} />
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {examinations.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2">{e.name}</td>
                <td className="px-4 py-2 capitalize">{e.status}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/examinations/${e.id}`} className="text-sm text-zinc-600 underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {examinations.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-400">—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
