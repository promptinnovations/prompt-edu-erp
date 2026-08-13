import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { getInstitution } from "../../../services/institution/institution-service";

export default async function SettingsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;

  // Full-page gate, same pattern as /users — not just hiding the form.
  if (!can(ctx.permissions, "settings.manage")) redirect("/dashboard");

  const institution = await getInstitution(institutionId, ctx.session.authUserId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Institution</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{institution?.appName || institution?.name}</p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Appearance</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          PROMPT EDU ERP now uses one consistent look across every institution. Switch between light and dark mode
          any time using the toggle at the bottom of the sidebar (or in the portal header) — your choice is
          remembered on this device.
        </p>
      </section>
    </div>
  );
}
