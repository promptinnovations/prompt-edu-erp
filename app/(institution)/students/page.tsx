import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireRequestContext } from "../../../services/request-context";
import { listStudents } from "../../../modules/students/service";
import StudentForm from "./StudentForm";

export default async function StudentsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const t = await getTranslations("students");
  const students = await listStudents(institutionId, ctx.session.authUserId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{t("title")}</h1>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <StudentForm />
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2">{t("admissionNumber")}</th>
              <th className="px-4 py-2">{t("fullName")}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {students.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2">{s.admission_number}</td>
                <td className="px-4 py-2">{s.full_name}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/students/${s.id}`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">
                    {t("view")}
                  </Link>
                </td>
              </tr>
            ))}
            {students.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-400 dark:text-zinc-500">
                  —
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
