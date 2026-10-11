import { cookies } from "next/headers";
import { requireRequestContext } from "../../../../services/request-context";
import { getOwnParentId, listChildrenForParent, type ChildRow } from "../../../../modules/portal/service";

/** Shared guard for every /portal/parent/* sub-route (mirrors the student
 *  portal's own _lib.tsx requireOwnStudentId(), split out so the four new
 *  "details" pages behind the main page's stat-card buttons don't each
 *  re-derive institutionId/authUserId/ownParentId/children by hand, and so
 *  the §Z portal-identity rule — a requested childId is only ever honoured
 *  once isOwnChild() confirms it — is enforced in exactly one place. */
/** §Parent-portal-visual-redesign — the child a parent last picked, so
 *  moving between sidebar pages keeps showing the same child (sidebar links
 *  carry no ?childId). Only a HINT: it is honoured only if it is one of
 *  this parent's own children (the list below), exactly like ?childId. */
export const PARENT_CHILD_COOKIE = "perp_parent_child";

export async function requireOwnParentContext(childId: string | undefined) {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const ownParentId = await getOwnParentId(institutionId, authUserId, ctx.userId);
  const children = ownParentId ? await listChildrenForParent(institutionId, authUserId, ownParentId) : [];

  const remembered = (await cookies()).get(PARENT_CHILD_COOKIE)?.value;
  const requested = childId || remembered;
  const selectedChildId =
    ownParentId && requested && children.some((c) => c.id === requested)
      ? requested
      : children.find((c) => c.is_primary_contact)?.id ?? children[0]?.id ?? null;

  return { ctx, institutionId, authUserId, ownParentId, children, selectedChildId };
}

/** A page whose section the school has switched off for parents
 *  (Settings → parent portal sections), reached by an old link. */
export function NotEnabledNotice({ what }: { what: string }) {
  return (
    <div className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-6">
      <p className="text-sm text-zinc-500">{what} isn&apos;t shared with parents at this school.</p>
    </div>
  );
}

export function NotLinkedNotice() {
  return (
    <div className="rounded-card border bg-white p-6">
      <p className="text-sm text-zinc-500">
        Your account isn&apos;t linked to a parent/guardian record yet, or no children are linked to it. Ask your institution admin to set this up.
      </p>
    </div>
  );
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border bg-white p-6">
      <h2 className="text-sm font-semibold text-[var(--heading)]">{title}</h2>
      {subtitle ? <p className="mb-3 mt-0.5 text-xs text-zinc-500">{subtitle}</p> : <div className="mb-3" />}
      {children}
    </div>
  );
}

export type { ChildRow };
