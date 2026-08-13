import { getTranslations } from "next-intl/server";
import { requireRequestContext } from "../../../services/request-context";
import { listClasses, listSections, listSubjects } from "../../../modules/academic/service";
import ClassForm from "./ClassForm";
import SectionForm from "./SectionForm";
import SubjectForm from "./SubjectForm";

export default async function AcademicPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const t = await getTranslations("academic");

  const [classes, sections, subjects] = await Promise.all([
    listClasses(institutionId, ctx.session.authUserId),
    listSections(institutionId, ctx.session.authUserId),
    listSubjects(institutionId, ctx.session.authUserId),
  ]);

  const sectionsByClass = new Map<string, typeof sections>();
  for (const s of sections) {
    const arr = sectionsByClass.get(s.class_id) ?? [];
    arr.push(s);
    sectionsByClass.set(s.class_id, arr);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{t("title")}</h1>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("classesHeading")}</h2>
        <ClassForm />
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
          {classes.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span>{c.name}</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {(sectionsByClass.get(c.id) ?? []).map((s) => s.name).join(", ") || "—"}
              </span>
            </li>
          ))}
          {classes.length === 0 ? <li className="py-2 text-zinc-400 dark:text-zinc-500">—</li> : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("sectionsHeading")}</h2>
        <SectionForm classes={classes} />
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
          {sections.map((s) => (
            <li key={s.id} className="py-2">
              {classes.find((c) => c.id === s.class_id)?.name} — {s.name}
            </li>
          ))}
          {sections.length === 0 ? <li className="py-2 text-zinc-400 dark:text-zinc-500">—</li> : null}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("subjectsHeading")}</h2>
        <SubjectForm />
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
          {subjects.map((s) => (
            <li key={s.id} className="py-2">
              {s.name}
            </li>
          ))}
          {subjects.length === 0 ? <li className="py-2 text-zinc-400 dark:text-zinc-500">—</li> : null}
        </ul>
      </section>
    </div>
  );
}
