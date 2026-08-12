import { getTranslations } from "next-intl/server";
import { requireRequestContext } from "../../../services/request-context";
import { getInstitution } from "../../../services/institution/institution-service";
import { listClasses, listSections, listSubjects } from "../../../modules/academic/service";
import { listStudents } from "../../../modules/students/service";

export default async function DashboardPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const t = await getTranslations("dashboard");

  const [institution, classes, sections, subjects, students] = await Promise.all([
    getInstitution(institutionId, ctx.session.authUserId),
    listClasses(institutionId, ctx.session.authUserId),
    listSections(institutionId, ctx.session.authUserId),
    listSubjects(institutionId, ctx.session.authUserId),
    listStudents(institutionId, ctx.session.authUserId),
  ]);

  const cards: Array<[string, number]> = [
    [t("classes"), classes.length],
    [t("sections"), sections.length],
    [t("subjects"), subjects.length],
    [t("students"), students.length],
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {t("institution")}: {institution?.name}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="text-2xl font-semibold text-zinc-900">{value}</div>
            <div className="mt-1 text-sm text-zinc-500">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
