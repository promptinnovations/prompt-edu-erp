"use client";

import { useActionState } from "react";
import { createParentAction, provisionStudentPortalAccountAction, provisionParentPortalAccountAction } from "./actions";

export interface ParentLinkRow {
  id: string; full_name: string; phone: string | null; email: string | null;
  occupation: string | null; user_id: string | null;
  relationship: string | null; is_primary_contact: boolean;
}

function ProvisionParentAccountForm({ parentId, studentId, defaultEmail, defaultName }: {
  parentId: string; studentId: string; defaultEmail: string; defaultName: string;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(provisionParentPortalAccountAction, { error: null });
  return (
    <form action={formAction} className="mt-1 flex flex-wrap items-end gap-1">
      <input type="hidden" name="parentId" value={parentId} />
      <input type="hidden" name="redirectStudentId" value={studentId} />
      <input name="email" type="email" defaultValue={defaultEmail} placeholder="login email" required className="rounded-md border border-zinc-300 px-2 py-1 text-xs" />
      <input type="hidden" name="fullName" value={defaultName} />
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50">
        Create parent portal login
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

export default function ParentSection({
  studentId, parents, canManage,
}: {
  studentId: string; parents: ParentLinkRow[]; canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createParentAction, { error: null });

  return (
    <div className="space-y-4">
      {canManage ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="studentId" value={studentId} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Name</label>
            <input name="fullName" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Relationship</label>
            <input name="relationship" placeholder="Father / Mother / Guardian" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Phone</label>
            <input name="phone" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Email</label>
            <input name="email" type="email" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            <input type="checkbox" name="isPrimaryContact" /> Primary contact
          </label>
          <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
            Add parent/guardian
          </button>
          {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        </form>
      ) : null}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="py-1.5">Name</th>
            <th className="py-1.5">Relationship</th>
            <th className="py-1.5">Contact</th>
            <th className="py-1.5">Portal account</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {parents.map((p) => (
            <tr key={p.id}>
              <td className="py-1.5">{p.full_name}{p.is_primary_contact ? " (primary)" : ""}</td>
              <td className="py-1.5 text-zinc-500">{p.relationship || "—"}</td>
              <td className="py-1.5 text-zinc-500">{p.email || p.phone || "—"}</td>
              <td className="py-1.5">
                {p.user_id ? (
                  <span className="text-emerald-700">Linked</span>
                ) : canManage ? (
                  <ProvisionParentAccountForm parentId={p.id} studentId={studentId} defaultEmail={p.email ?? ""} defaultName={p.full_name} />
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
          {parents.length === 0 ? (
            <tr><td colSpan={4} className="py-4 text-center text-zinc-400">No parents/guardians linked yet.</td></tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export function ProvisionStudentAccountForm({
  studentId, defaultEmail, defaultName, alreadyLinked,
}: {
  studentId: string; defaultEmail: string; defaultName: string; alreadyLinked: boolean;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(provisionStudentPortalAccountAction, { error: null });
  if (alreadyLinked) return <p className="text-sm text-emerald-700">Portal account linked.</p>;
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="studentId" value={studentId} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Login email</label>
        <input name="email" type="email" defaultValue={defaultEmail} required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <input type="hidden" name="fullName" value={defaultName} />
      <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Create student portal login
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
