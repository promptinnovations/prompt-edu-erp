import Link from "next/link";
import { requireSuperAdminContext } from "../../../../services/request-context";
import { listInstitutions } from "../../../../services/super-admin/super-admin-service";
import {
  listSamplePrincipals, listSampleManagement, listSampleClassTeachers, listSampleStudentsWithParent,
  type SamplePortalCandidate, type SamplePortalStudentCandidate,
} from "../../../../services/super-admin/sample-portal-service";
import { viewAsSamplePortalAction } from "./actions";

/** Follow-up ask (verbatim): "For super admin - in the side panel, add
 *  different sample portals, to see the updated version with full data,
 *  chosen from any institution, not fake data. principal, management,
 *  class teacher, parent- student portals."
 *
 * Every name/class/roll number below is a REAL row pulled live from the
 * institution picked — see services/super-admin/sample-portal-service.ts's
 * own header comment for exactly which role each section maps to and why.
 * Clicking "View as" signs the Super Admin's OWN session into that real
 * person's real permissions and real data for this institution (never a
 * copy, never synthetic) until "Exit sample portal" — see
 * services/request-context.ts's viewingAsUser / setSuperAdminViewAsUser(). */
export default async function SamplePortalsPage({
  searchParams,
}: {
  searchParams: Promise<{ institutionId?: string }>;
}) {
  const { institutionId } = await searchParams;
  const ctx = await requireSuperAdminContext();
  const institutions = await listInstitutions(ctx.session.authUserId);
  const institution = institutionId ? institutions.find((i) => i.id === institutionId) : null;

  const [principals, management, classTeachers, students] = institution
    ? await Promise.all([
        listSamplePrincipals(ctx.session.authUserId, institution.id),
        listSampleManagement(ctx.session.authUserId, institution.id),
        listSampleClassTeachers(ctx.session.authUserId, institution.id),
        listSampleStudentsWithParent(ctx.session.authUserId, institution.id),
      ])
    : [[], [], [], []];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Sample Portals</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Pick an institution, then view the app exactly as one of its real people sees it — Principal, Management,
          a Class Teacher, a Student, or that student&apos;s Parent. Every name and record below is real, live data
          from that institution, not a demo — only people with a working login are listed.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Institution</h2>
        <div className="flex flex-wrap gap-2">
          {institutions.map((i) => (
            <Link
              key={i.id}
              href={`/super-admin/sample-portals?institutionId=${i.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                institution?.id === i.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {i.name}
            </Link>
          ))}
          {institutions.length === 0 ? <p className="text-sm text-zinc-400">No institutions yet.</p> : null}
        </div>
      </section>

      {!institution ? null : (
        <>
          <RoleSection
            title="Principal"
            hint="Institution Admin — full functional access, created for this institution at onboarding."
            institutionId={institution.id}
            roleLabel="Principal"
            dest="/dashboard"
            candidates={principals}
          />
          <RoleSection
            title="Management"
            hint='"Principal / Management" role — school-leadership access (marks approval, staff, reports, promotion), narrower than Institution Admin.'
            institutionId={institution.id}
            roleLabel="Management"
            dest="/dashboard"
            candidates={management}
          />
          <RoleSection
            title="Class Teacher"
            hint="Real teachers who are the current year's class teacher of at least one class/division — scoped to only their own class, same as their real dashboard."
            institutionId={institution.id}
            roleLabel="Class Teacher"
            dest="/dashboard"
            candidates={classTeachers}
          />
          <StudentParentSection institutionId={institution.id} students={students} />
        </>
      )}
    </div>
  );
}

function RoleSection({
  title, hint, institutionId, roleLabel, dest, candidates,
}: {
  title: string; hint: string; institutionId: string; roleLabel: string; dest: string; candidates: SamplePortalCandidate[];
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h2>
      <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>
      {candidates.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          No {title.toLowerCase()} with a working login found in this institution yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {candidates.map((c) => (
            <li key={c.userId} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{c.fullName}</div>
                <div className="truncate text-xs text-zinc-400 dark:text-zinc-500">{c.detail ?? c.email ?? "—"}</div>
              </div>
              <form action={viewAsSamplePortalAction}>
                <input type="hidden" name="institutionId" value={institutionId} />
                <input type="hidden" name="userId" value={c.userId} />
                <input type="hidden" name="roleLabel" value={roleLabel} />
                <input type="hidden" name="dest" value={dest} />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  View as {roleLabel}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StudentParentSection({ institutionId, students }: { institutionId: string; students: SamplePortalStudentCandidate[] }) {
  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Parent &amp; Student</h2>
      <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
        In section (stage) → GRADE → division → roll number order. &quot;View as Parent&quot; is only offered when
        that student&apos;s primary contact parent also has a working login.
      </p>
      {students.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No student with a working login found in this institution yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {students.map((s) => (
            <li key={s.userId} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{s.fullName}</div>
                <div className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                  {[s.className, s.sectionName].filter(Boolean).join(" ") || "No current class"}
                  {s.rollNumber != null ? ` · Roll ${s.rollNumber}` : ""}
                  {s.parent ? ` · Parent: ${s.parent.fullName}` : " · No linked parent login"}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <form action={viewAsSamplePortalAction}>
                  <input type="hidden" name="institutionId" value={institutionId} />
                  <input type="hidden" name="userId" value={s.userId} />
                  <input type="hidden" name="roleLabel" value="Student" />
                  <input type="hidden" name="dest" value="/portal/student" />
                  <button
                    type="submit"
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    View as Student
                  </button>
                </form>
                {s.parent ? (
                  <form action={viewAsSamplePortalAction}>
                    <input type="hidden" name="institutionId" value={institutionId} />
                    <input type="hidden" name="userId" value={s.parent.userId} />
                    <input type="hidden" name="roleLabel" value="Parent" />
                    <input type="hidden" name="dest" value="/portal/parent" />
                    <button
                      type="submit"
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      View as Parent
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
