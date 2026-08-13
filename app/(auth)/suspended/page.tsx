import Link from "next/link";
import { signOutAction } from "../../(institution)/actions";

/**
 * PROMPT EDU ERP — shown when a user's active institution has been marked
 * inactive/suspended by a Super Admin (§W, SECURITY.md). Reached only
 * through a server-side redirect from (institution)/layout.tsx or
 * (portals)/portal/layout.tsx — never a page a user can navigate to
 * directly and see anything institution-specific (it renders no
 * institution data at all, deliberately).
 */
export default async function SuspendedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const isSuspended = reason === "suspended";

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {isSuspended ? "Institution suspended" : "Institution inactive"}
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {isSuspended
            ? "This institution's access has been suspended. Please contact Prompt Innovations for assistance."
            : "This institution is not currently active. Please contact Prompt Innovations for assistance."}
        </p>
        <form action={signOutAction} className="mt-6">
          <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800">
            Sign out
          </button>
        </form>
        <Link href="/login" className="mt-3 block text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
