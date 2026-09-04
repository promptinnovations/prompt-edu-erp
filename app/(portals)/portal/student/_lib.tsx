import { requireRequestContext } from "../../../../services/request-context";
import { getOwnStudentId } from "../../../../modules/portal/service";

/** Shared guard for every /portal/student/* sub-route (§ student-portal
 *  redesign, split from one long page into Dashboard/Portfolio/Exams/
 *  Library/Reviews): resolves the signed-in login's own student id once,
 *  the same way the old single page.tsx did, so each sub-route doesn't
 *  re-derive institutionId/authUserId by hand. */
export async function requireOwnStudentId() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const ownStudentId = await getOwnStudentId(institutionId, authUserId, ctx.userId);
  return { ctx, institutionId, authUserId, ownStudentId };
}

export function NotLinkedNotice() {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6">
      <p className="text-sm text-zinc-500">
        Your account isn&apos;t linked to a student record yet. Ask your institution admin to set this up.
      </p>
    </div>
  );
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-[var(--foreground)]">{title}</h2>
      {subtitle ? <p className="mb-3 mt-0.5 text-xs text-zinc-500">{subtitle}</p> : <div className="mb-3" />}
      {children}
    </div>
  );
}
