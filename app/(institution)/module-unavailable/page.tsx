import Link from "next/link";

/**
 * PROMPT EDU ERP — shown when a page's module has been disabled for this
 * institution by a Super Admin (services/modules/module-service.ts's
 * requireModuleEnabled()). Reached only via a server-side redirect from an
 * optional-module page — never navigated to directly with anything
 * institution-specific rendered here.
 */
export default async function ModuleUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const { module } = await searchParams;

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Module not available</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {module ? `The "${module}" module` : "This module"} has not been enabled for your institution. Contact
          Prompt Innovations if you need it turned on.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-md bg-[var(--brand)] px-4 py-2 text-sm text-white hover:bg-[var(--brand-hover)]"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
