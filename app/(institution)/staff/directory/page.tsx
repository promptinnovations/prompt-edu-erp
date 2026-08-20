import Link from "next/link";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { listStaff, listTeacherAssignments } from "../../../../modules/staff/service";

/**
 * §Teacher-Profile feature ("prepare a similar staff directory + staff
 * profile") — a card-per-staff-member directory, mirroring the Student
 * Management directory (app/(institution)/students/directory/page.tsx)
 * exactly. Every card opens /staff/[id]; that page itself decides whether
 * to show the full Teacher Profile (6-section template + exam analysis +
 * observations) or a plain staff record, based on whether this person has
 * any teacher_assignments row — the "Teachers only" scope the user
 * explicitly chose (AskUserQuestion #3) lives there, not here, so this
 * directory doesn't need two different card styles.
 */
export default async function StaffDirectoryPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "staff");

  const [staff, assignments] = await Promise.all([
    listStaff(institutionId, authUserId),
    listTeacherAssignments(institutionId, authUserId),
  ]);
  const teacherUserIds = new Set(assignments.map((a) => a.user_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Staff profiles</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Open a card for a staff member&apos;s full profile. Teaching staff also get exam results and classroom observations.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        {staff.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">No staff members yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {staff.map((s) => {
              const isTeacher = teacherUserIds.has(s.user_id);
              return (
                <Link
                  key={s.id}
                  href={`/staff/${s.id}`}
                  className="flex flex-col items-center rounded-xl border border-transparent p-4 text-center hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100 text-xl font-medium text-zinc-500 ring-2 ring-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-800">
                    {s.full_name.charAt(0).toUpperCase()}
                  </span>
                  <div className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">{s.full_name}</div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{s.designation ?? "—"}</div>
                  <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{s.staff_code}</div>
                  {isTeacher ? (
                    <span className="mt-1.5 rounded-full bg-[var(--brand)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--brand)]">Teacher</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
