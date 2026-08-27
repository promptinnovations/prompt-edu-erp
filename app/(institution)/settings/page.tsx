import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { getInstitution, getParentPortalSections } from "../../../services/institution/institution-service";
import LogoForm from "./LogoForm";
import InstallAppButton from "./InstallAppButton";
import ParentPortalSectionsForm from "./ParentPortalSectionsForm";

export default async function SettingsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;

  // Full-page gate, same pattern as /users — not just hiding the form.
  if (!can(ctx.permissions, "settings.manage")) redirect("/dashboard");

  const [institution, parentPortalSections] = await Promise.all([
    getInstitution(institutionId, ctx.session.authUserId),
    getParentPortalSections(institutionId, ctx.session.authUserId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Institution</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{institution?.appName || institution?.name}</p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Logo</h2>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Upload your institution&apos;s own logo — once set, it replaces the generated letter badge everywhere the
          app currently shows one.
        </p>
        <LogoForm logoUrl={institution?.logoFileId && institution.code ? `/api/institution-logo/${institution.code}` : null} />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Install app</h2>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          {institution?.name} has its own installable app, separate from every other institution — branded with your
          own name and logo, and kept independent on shared devices.
        </p>
        <InstallAppButton
          appName={institution?.appName || institution?.name || "This institution"}
          logoUrl={institution?.logoFileId && institution.code ? `/api/institution-logo/${institution.code}` : null}
        />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Appearance</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          PROMPT EDU ERP now uses one consistent look across every institution. Switch between light and dark mode
          any time using the toggle at the bottom of the sidebar (or in the portal header) — your choice is
          remembered on this device.
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Parent portal — what parents can see</h2>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Choose which sections of a child&apos;s page show on the parent portal. Unchecked sections stay hidden from
          parents but remain fully visible to staff.
        </p>
        <ParentPortalSectionsForm sections={parentPortalSections} />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-200">Grading &amp; points</h2>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Define your own grading scale, scoring rule points, achievement categories/levels, and skill
          types/activities — every institution configures these independently.
        </p>
        <Link
          href="/settings/grading"
          className="inline-block rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
        >
          Manage grading &amp; points
        </Link>
      </section>
    </div>
  );
}
