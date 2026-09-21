import { requireRequestContext } from "../../../../services/request-context";
import { getOwnParentId, listChildrenForParent, isOwnChild, type ChildRow } from "../../../../modules/portal/service";

/** Shared guard for every /portal/parent/* sub-route (mirrors the student
 *  portal's own _lib.tsx requireOwnStudentId(), split out so the four new
 *  "details" pages behind the main page's stat-card buttons don't each
 *  re-derive institutionId/authUserId/ownParentId/children by hand, and so
 *  the §Z portal-identity rule — a requested childId is only ever honoured
 *  once isOwnChild() confirms it — is enforced in exactly one place. */
export async function requireOwnParentContext(childId: string | undefined) {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const ownParentId = await getOwnParentId(institutionId, authUserId, ctx.userId);
  const children = ownParentId ? await listChildrenForParent(institutionId, authUserId, ownParentId) : [];

  const selectedChildId =
    ownParentId && childId && (await isOwnChild(institutionId, authUserId, ownParentId, childId))
      ? childId
      : children.find((c) => c.is_primary_contact)?.id ?? children[0]?.id ?? null;

  return { ctx, institutionId, authUserId, ownParentId, children, selectedChildId };
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
