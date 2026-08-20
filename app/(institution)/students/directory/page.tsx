import Link from "next/link";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { listStudentsForAdmin } from "../../../../modules/students/service";
import { listClasses } from "../../../../modules/academic/service";
import { getTeacherClassScope } from "../../../../services/scope/teacher-scope-service";

/**
 * §Student Profile feature ("in student management page all students will
 * be together — refer img 3. once clicked it will take to the profile page
 * of each student") — a card-per-student directory (circular photo + name,
 * mirroring the reference "Employee Directory" screenshot) that replaces
 * the plain admin table as the front door into each student's own Profile
 * page (/students/[id]). The original table at /students (add-student form
 * + search + list) is kept exactly as-is and is what the sidebar now calls
 * "Enrollment" per the user's own clarification — this is a SEPARATE page,
 * not a redesign of that one, since Enrollment's dense table (roll number,
 * login credentials, row actions) genuinely serves a different task than
 * "browse and open a student's profile".
 *
 * The "Portfolio" sidebar entry also lands here (with ?tab=portfolio) since
 * portfolios live under each student's own profile, not on a standalone
 * page — picking a card is how you reach a specific child's Portfolio tab.
 */
export default async function StudentDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classId?: string; tab?: string }>;
}) {
  const { q = "", classId = "", tab = "" } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const canViewAll = can(ctx.permissions, "student.view_all");
  const scopeClassIds = canViewAll
    ? undefined
    : Array.from((await getTeacherClassScope(institutionId, authUserId, ctx.userId)).classIds);

  const [students, allClasses] = await Promise.all([
    listStudentsForAdmin(institutionId, authUserId, {
      search: q || undefined,
      classId: classId || undefined,
      classIds: scopeClassIds,
    }),
    listClasses(institutionId, authUserId),
  ]);
  const classes = scopeClassIds ? allClasses.filter((c) => scopeClassIds.includes(c.id)) : allClasses;

  // Preserves ?tab= onto every card's link so "Portfolio" in the sidebar can
  // send the visitor straight to that tab once a specific student is picked
  // (the Profile page itself, task #328, is what reads this query param).
  const tabSuffix = tab ? `?tab=${encodeURIComponent(tab)}` : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Student profiles</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {tab === "portfolio"
            ? "Pick a student to open their Portfolio tab."
            : "Every student in one place — open a card for their full profile."}
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <form className="flex flex-wrap items-end gap-2" method="get">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Name or admission number"
              className="w-56 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class</label>
            <select
              name="classId"
              defaultValue={classId}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {tab ? <input type="hidden" name="tab" value={tab} /> : null}
          <button
            type="submit"
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]"
          >
            Apply
          </button>
          {(q || classId) ? (
            <Link
              href={tab ? `/students/directory?tab=${encodeURIComponent(tab)}` : "/students/directory"}
              className="text-xs text-zinc-500 dark:text-zinc-400 underline"
            >
              Clear filters
            </Link>
          ) : null}
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        {students.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
            {q || classId ? "No students match those filters." : "No students yet."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {students.map((s) => (
              <Link
                key={s.id}
                href={`/students/${s.id}${tabSuffix}`}
                className={`flex flex-col items-center rounded-xl border border-transparent p-4 text-center hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${s.status === "withdrawn" ? "opacity-50" : ""}`}
              >
                {s.photo_file_id ? (
                  // eslint-disable-next-line @next/next/no-img-element -- avatar thumbnail from an authenticated /api/files route, not a static/optimizable asset
                  <img
                    src={`/api/files/${s.photo_file_id}`}
                    alt=""
                    className="h-20 w-20 rounded-full object-cover ring-2 ring-zinc-100 dark:ring-zinc-800"
                  />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100 text-xl font-medium text-zinc-500 ring-2 ring-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-800">
                    {s.full_name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {s.full_name}
                  {s.status === "withdrawn" ? <span className="block text-xs text-red-600 dark:text-red-400">(removed)</span> : null}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {s.class_name ? `${s.class_name}${s.section_name ? ` · Div. ${s.section_name}` : ""}` : "Not enrolled"}
                </div>
                <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{s.admission_number}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
