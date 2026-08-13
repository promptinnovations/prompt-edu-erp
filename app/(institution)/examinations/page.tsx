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
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Examinations</h1>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Create examination</h2>
        <ExaminationForm examTypes={examTypes} academicYears={academicYears} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {examinations.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2">{e.name}</td>
                <td className="px-4 py-2 capitalize">{e.status}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/examinations/${e.id}`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {examinations.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-400 dark:text-zinc-500">—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
