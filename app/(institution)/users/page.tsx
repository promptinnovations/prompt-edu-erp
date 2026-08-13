import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listInstitutionRoles, listInstitutionUsers } from "../../../services/users/user-management-service";
import CreateUserForm from "./CreateUserForm";
import UserRolesForm from "./UserRolesForm";
import UserStatusForm from "./UserStatusForm";

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

  const [roles, users] = await Promise.all([
    listInstitutionRoles(institutionId, authUserId),
    listInstitutionUsers(institutionId, authUserId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Users & Roles</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Create a login for a new person and assign them one or more roles. They&apos;ll sign up themselves at{" "}
        <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-xs">/login</code> with the email you set here —
        nobody&apos;s password is ever entered by an admin. A user can hold several roles at once (e.g. Teacher +
        Librarian).
      </p>

      {canManageUsers ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Create a login</h2>
          <CreateUserForm roleOptions={roles} />
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">All users ({users.length})</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Name</th>
              <th className="py-1.5">Email</th>
              <th className="py-1.5">Roles</th>
              <th className="py-1.5">Login status</th>
              <th className="py-1.5">Membership</th>
              {canManageRoles ? <th className="py-1.5"></th> : null}
              {canManageUsers ? <th className="py-1.5"></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {users.map((u) => (
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
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-center text-zinc-400 dark:text-zinc-500">
                  No users yet.
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
