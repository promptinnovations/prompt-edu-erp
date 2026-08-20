import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listClasses, listSections, listSubjects, listClassSubjects, listAcademicYears } from "../../../modules/academic/service";
import ClassForm from "./ClassForm";
import SectionForm from "./SectionForm";
import SubjectForm from "./SubjectForm";
import ClassRow from "./ClassRow";
import SectionRow from "./SectionRow";
import ClassSubjectsForm from "./ClassSubjectsForm";
import AcademicYearForm from "./AcademicYearForm";
import SetCurrentYearButton from "./SetCurrentYearButton";

export default async function AcademicPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const t = await getTranslations("academic");
  const canManage = can(ctx.permissions, "settings.manage");

  const [classes, sections, subjects, classSubjects, academicYears] = await Promise.all([
    listClasses(institutionId, ctx.session.authUserId),
    listSections(institutionId, ctx.session.authUserId),
    listSubjects(institutionId, ctx.session.authUserId),
    listClassSubjects(institutionId, ctx.session.authUserId),
    listAcademicYears(institutionId, ctx.session.authUserId),
  ]);

  const sectionsByClass = new Map<string, typeof sections>();
  for (const s of sections) {
    const arr = sectionsByClass.get(s.class_id) ?? [];
    arr.push(s);
    sectionsByClass.set(s.class_id, arr);
  }

  const subjectsByClass = new Map<string, { subjectId: string; subjectName: string }[]>();
  for (const cs of classSubjects) {
    const arr = subjectsByClass.get(cs.class_id) ?? [];
    arr.push({ subjectId: cs.subject_id, subjectName: cs.subject_name });
    subjectsByClass.set(cs.class_id, arr);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{t("title")}</h1>

      <section id="academic-years" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Academic years</h2>
          {can(ctx.permissions, "academic.promote") ? (
            <Link href="/academic/promotion" className="text-xs text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300">
              Promote a class →
            </Link>
          ) : null}
        </div>
        {canManage ? <AcademicYearForm /> : null}
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
          {academicYears.map((y) => (
            <li key={y.id} className="flex items-center justify-between py-2">
              <span>
                {y.name} <span className="text-zinc-400 dark:text-zinc-500">({y.start_date} — {y.end_date})</span>
              </span>
              {y.is_current ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  Current
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    Archived
                  </span>
                  {canManage ? <SetCurrentYearButton academicYearId={y.id} /> : null}
                </span>
              )}
            </li>
          ))}
          {academicYears.length === 0 ? <li className="py-2 text-zinc-400 dark:text-zinc-500">—</li> : null}
        </ul>
      </section>

      <section id="classes" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("classesHeading")}</h2>
        {canManage ? <ClassForm /> : null}
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
          {classes.map((c) => (
            <ClassRow
              key={c.id}
              classId={c.id}
              name={c.name}
              stage={c.stage}
              sectionsLabel={(sectionsByClass.get(c.id) ?? []).map((s) => s.name).join(", ") || "—"}
              canManage={canManage}
            />
          ))}
          {classes.length === 0 ? <li className="py-2 text-zinc-400 dark:text-zinc-500">—</li> : null}
        </ul>
      </section>

      <section id="sections" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("sectionsHeading")}</h2>
        {canManage ? <SectionForm classes={classes} /> : null}
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
          {sections.map((s) => (
            <SectionRow
              key={s.id}
              sectionId={s.id}
              classLabel={classes.find((c) => c.id === s.class_id)?.name ?? "?"}
              name={s.name}
              canManage={canManage}
            />
          ))}
          {sections.length === 0 ? <li className="py-2 text-zinc-400 dark:text-zinc-500">—</li> : null}
        </ul>
      </section>

      <section id="subjects" className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
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

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Subjects per class</h2>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
          Which subjects each class studies — shown to teachers/students on that class&apos;s own page.
        </p>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
          {classes.map((c) => (
            <ClassSubjectsForm
              key={c.id}
              classId={c.id}
              className={c.name}
              assigned={subjectsByClass.get(c.id) ?? []}
              availableSubjects={subjects}
              canManage={canManage}
            />
          ))}
          {classes.length === 0 ? <li className="py-2 text-zinc-400 dark:text-zinc-500">Add a class above first.</li> : null}
        </ul>
      </section>
    </div>
  );
}
