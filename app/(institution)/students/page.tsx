import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listStudentsForAdmin } from "../../../modules/students/service";
import { listClasses, listSections, getCurrentAcademicYear } from "../../../modules/academic/service";
import { getTeacherClassScope } from "../../../services/scope/teacher-scope-service";
import StudentForm from "./StudentForm";
import StudentRowActions from "./StudentRowActions";

/** §137 follow-up ("should be able edit, delete, search") — search box +
 *  class filter + a "show removed" toggle, all plain GET query params so
 *  the page stays a server component (no client-side data fetching) and
 *  the filtered view is itself a shareable/bookmarkable URL. */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classId?: string; removed?: string }>;
}) {
  const { q = "", classId = "", removed = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const t = await getTranslations("students");
  const canManage = can(ctx.permissions, "student.edit");
  const canDelete = can(ctx.permissions, "student.delete");

  // "Teachers can give access only to their respective classes" follow-up —
  // student.view (but not student.view_all) means scoped to teacher_assignments.
  const canViewAll = can(ctx.permissions, "student.view_all");
  const scopeClassIds = canViewAll
    ? undefined
    : Array.from((await getTeacherClassScope(institutionId, ctx.session.authUserId, ctx.userId)).classIds);

  const [students, allClasses, allSections, academicYear] = await Promise.all([
    listStudentsForAdmin(institutionId, ctx.session.authUserId, {
      search: q || undefined,
      classId: classId || undefined,
      includeWithdrawn: removed === "1",
      classIds: scopeClassIds,
      // §Page-3 follow-up "Login Credentials" column — the student's
      // portal PASSWORD is the primary parent's phone number (§137), so
      // showing it here means real, working credentials, not a placeholder.
      includeParentContact: true,
    }),
    listClasses(institutionId, ctx.session.authUserId),
    listSections(institutionId, ctx.session.authUserId),
    getCurrentAcademicYear(institutionId, ctx.session.authUserId),
  ]);
  const classes = scopeClassIds ? allClasses.filter((c) => scopeClassIds.includes(c.id)) : allClasses;
  const classNameById = new Map(allClasses.map((c) => [c.id, c.name]));
  const sectionOptions = allSections
    .filter((s) => !scopeClassIds || scopeClassIds.includes(s.class_id))
    .map((s) => ({ id: s.id, classId: s.class_id, label: `${classNameById.get(s.class_id) ?? "?"} — ${s.name}` }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{t("title")}</h1>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <StudentForm academicYearId={academicYear?.id ?? null} sections={sectionOptions} />
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <form className="flex flex-wrap items-end gap-2" method="get">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{t("search")}</label>
            <input
              name="q"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              className="w-56 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{t("filterByClass")}</label>
            <select
              name="classId"
              defaultValue={classId}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            >
              <option value="">{t("allClasses")}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-zinc-500 dark:text-zinc-400">
            <input type="checkbox" name="removed" value="1" defaultChecked={removed === "1"} />
            {t("showRemoved")}
          </label>
          <button
            type="submit"
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]"
          >
            {t("applyFilters")}
          </button>
          {(q || classId || removed) ? (
            <Link href="/students" className="text-xs text-zinc-500 dark:text-zinc-400 underline">
              {t("clearFilters")}
            </Link>
          ) : null}
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2" />
              <th className="px-4 py-2">{t("admissionNumber")}</th>
              <th className="px-4 py-2">{t("fullName")}</th>
              <th className="px-4 py-2">{t("class")}</th>
              <th className="px-4 py-2">Roll no.</th>
              <th className="px-4 py-2">Login credentials</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {students.map((s) => (
              <tr key={s.id} className={s.status === "withdrawn" ? "opacity-50" : undefined}>
                <td className="px-4 py-2">
                  {s.photo_file_id ? (
                    // eslint-disable-next-line @next/next/no-img-element -- avatar thumbnail from an authenticated /api/files route, not a static/optimizable asset
                    <img
                      src={`/api/files/${s.photo_file_id}`}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {s.full_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">{s.admission_number}</td>
                <td className="px-4 py-2">
                  {s.full_name}
                  {s.status === "withdrawn" ? <span className="ml-2 text-xs text-red-600 dark:text-red-400">({t("removed")})</span> : null}
                </td>
                <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                  {s.class_name ? `${s.class_name}${s.section_name ? ` — ${s.section_name}` : ""}` : "—"}
                </td>
                <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">{s.roll_number ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {s.login_id ? (
                    <>
                      {s.login_id}
                      {s.parent_phone ? <span className="text-zinc-400 dark:text-zinc-500"> / {s.parent_phone}</span> : null}
                    </>
                  ) : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/students/${s.id}`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">
                      {t("view")}
                    </Link>
                    <StudentRowActions
                      studentId={s.id}
                      fullName={s.full_name}
                      withdrawn={s.status === "withdrawn"}
                      canDelete={canDelete}
                      canManage={canManage}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {students.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-zinc-400 dark:text-zinc-500">
                  {q || classId ? t("noMatches") : "—"}
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
