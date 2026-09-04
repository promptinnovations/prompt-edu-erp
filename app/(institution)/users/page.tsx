import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import {
  listInstitutionRoles, listStaffUsers, listStudentUsersWithParent,
} from "../../../services/users/user-management-service";
import CreateUserForm from "./CreateUserForm";
import UserRolesForm from "./UserRolesForm";
import UserStatusForm from "./UserStatusForm";
import UserPasswordForm from "./UserPasswordForm";

/** §users-roles follow-up ("Staff and Students list should be separated,
 *  student list always must follow class & roll number order") — this page
 *  used to be one "All users" table mixing institution_admin/teacher/other
 *  staff together with every student and parent portal login (Phase 12
 *  gives both a real users row), sorted only alphabetically. Now two
 *  separate tables: Staff (unchanged shape) and Students (one row per
 *  student login, in section/GRADE/division/roll-number order, with that
 *  student's own parent login attached inline rather than floating as an
 *  unrelated row elsewhere in the list) — see listStaffUsers()/
 *  listStudentUsersWithParent()'s own doc comments for why this is two
 *  queries rather than filtering one list client-side. */
export default async function UsersPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const canManageUsers = can(ctx.permissions, "users.manage");
  const canManageRoles = can(ctx.permissions, "roles.manage");
  // Full-page gate, not just the mutation forms — this list exposes every
  // colleague's email address and role assignments, which a teacher/staff
  // account has no business seeing just by guessing the URL.
  if (!canManageUsers && !canManageRoles) redirect("/dashboard");

  const [roles, staff, students] = await Promise.all([
    listInstitutionRoles(institutionId, authUserId),
    listStaffUsers(institutionId, authUserId),
    listStudentUsersWithParent(institutionId, authUserId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Users & Roles</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Create a login for a new person, set their password, and assign them one or more roles — it works immediately,
        no email confirmation step needed. A user can hold several roles at once (e.g. Teacher + Librarian). The
        current password for each user is shown below; reset it any time if someone loses it.
      </p>

      {canManageUsers ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Create a login</h2>
          <CreateUserForm roleOptions={roles} />
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Staff ({staff.length})</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Name</th>
              <th className="py-1.5">Email</th>
              <th className="py-1.5">Roles</th>
              <th className="py-1.5">Login status</th>
              <th className="py-1.5">Membership</th>
              {canManageUsers ? <th className="py-1.5">Password</th> : null}
              {canManageRoles ? <th className="py-1.5"></th> : null}
              {canManageUsers ? <th className="py-1.5"></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {staff.map((u) => (
              <tr key={u.userId}>
                <td className="py-2 font-medium text-zinc-900 dark:text-zinc-50">{u.fullName}</td>
                <td className="py-2 text-zinc-500 dark:text-zinc-400">{u.email ?? "—"}</td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">{u.roleNames.length > 0 ? u.roleNames.join(", ") : "—"}</td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      u.isClaimed ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400" : "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {u.isClaimed ? "Signed in" : "Not signed up yet"}
                  </span>
                </td>
                <td className="py-2 capitalize text-zinc-600 dark:text-zinc-400">{u.membershipStatus}</td>
                {canManageUsers ? (
                  <td className="py-2">
                    <UserPasswordForm userId={u.userId} currentPassword={u.currentPassword} />
                  </td>
                ) : null}
                {canManageRoles ? (
                  <td className="py-2">
                    <UserRolesForm userId={u.userId} roleOptions={roles} currentRoleCodes={u.roleCodes} />
                  </td>
                ) : null}
                {canManageUsers ? (
                  <td className="py-2">
                    <UserStatusForm userId={u.userId} currentStatus={u.membershipStatus} />
                  </td>
                ) : null}
              </tr>
            ))}
            {staff.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-4 text-center text-zinc-400 dark:text-zinc-500">
                  No staff logins yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Students ({students.length})</h2>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Section → Grade → Division → Roll number order. Each student&apos;s own parent login is shown alongside them.
        </p>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Student</th>
              <th className="py-1.5">Class</th>
              <th className="py-1.5">Roll No</th>
              <th className="py-1.5">Login status</th>
              {canManageUsers ? <th className="py-1.5">Password</th> : null}
              {canManageRoles ? <th className="py-1.5">Roles</th> : null}
              {canManageUsers ? <th className="py-1.5"></th> : null}
              <th className="py-1.5">Parent</th>
              <th className="py-1.5">Parent login</th>
              {canManageUsers ? <th className="py-1.5">Parent password</th> : null}
              {canManageUsers ? <th className="py-1.5"></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {students.map((s) => (
              <tr key={s.userId}>
                <td className="py-2 font-medium text-zinc-900 dark:text-zinc-50">{s.fullName}</td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">
                  {s.className ? `${s.className}${s.sectionName ? ` ${s.sectionName}` : ""}` : "—"}
                </td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">{s.rollNumber ?? "—"}</td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      s.isClaimed ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400" : "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {s.isClaimed ? "Signed in" : "Not signed up yet"}
                  </span>
                </td>
                {canManageUsers ? (
                  <td className="py-2">
                    <UserPasswordForm userId={s.userId} currentPassword={s.currentPassword} />
                  </td>
                ) : null}
                {canManageRoles ? (
                  <td className="py-2">
                    <UserRolesForm userId={s.userId} roleOptions={roles} currentRoleCodes={s.roleCodes} />
                  </td>
                ) : null}
                {canManageUsers ? (
                  <td className="py-2">
                    <UserStatusForm userId={s.userId} currentStatus={s.membershipStatus} />
                  </td>
                ) : null}
                <td className="py-2 text-zinc-600 dark:text-zinc-400">{s.parent?.fullName || "—"}</td>
                <td className="py-2">
                  {s.parent ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        s.parent.isClaimed ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400" : "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {s.parent.isClaimed ? "Signed in" : "Not signed up yet"}
                    </span>
                  ) : (
                    <span className="text-zinc-400 dark:text-zinc-500">—</span>
                  )}
                </td>
                {canManageUsers ? (
                  <td className="py-2">
                    {s.parent ? <UserPasswordForm userId={s.parent.userId} currentPassword={s.parent.currentPassword} /> : null}
                  </td>
                ) : null}
                {canManageUsers ? (
                  <td className="py-2">
                    {s.parent ? <UserStatusForm userId={s.parent.userId} currentStatus={s.parent.membershipStatus} /> : null}
                  </td>
                ) : null}
              </tr>
            ))}
            {students.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-4 text-center text-zinc-400 dark:text-zinc-500">
                  No student logins yet.
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
