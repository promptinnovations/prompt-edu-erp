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
      <h1 className="text-2xl font-semibold text-zinc-900">{t("title")}</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <StudentForm />
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2">{t("admissionNumber")}</th>
              <th className="px-4 py-2">{t("fullName")}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {students.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2">{s.admission_number}</td>
                <td className="px-4 py-2">{s.full_name}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/students/${s.id}`} className="text-sm text-zinc-600 underline">
                    {t("view")}
                  </Link>
                </td>
              </tr>
            ))}
            {students.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-400">
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
