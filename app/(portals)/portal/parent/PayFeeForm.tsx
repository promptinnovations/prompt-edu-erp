"use client";

import { useActionState } from "react";
import { payChildFeeAction } from "./actions";

export interface PendingInvoiceOption { id: string; label: string; balance: number }

export default function PayFeeForm({ invoices }: { invoices: PendingInvoiceOption[] }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(payChildFeeAction, { error: null });
  if (invoices.length === 0) return <p className="text-sm text-zinc-400 dark:text-zinc-500">No pending fees for this child. 🎉</p>;
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Invoice</label>
        <select name="invoiceId" required defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="" disabled>Select…</option>
          {invoices.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Amount paid (₹)</label>
        <input name="amount" type="number" min={0.01} step="0.01" required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Paid via</label>
        <select name="paymentMethod" defaultValue="upi" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="upi">UPI</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="cash">Cash (paid to school office)</option>
          <option value="cheque">Cheque</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Reference / transaction no. (optional)</label>
        <input name="referenceNo" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div className="sm:col-span-2 flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Submit payment
        </button>
        {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      </div>
      <p className="sm:col-span-2 text-xs text-zinc-400 dark:text-zinc-500">
        Submitting here records that you&apos;ve paid — the school office will confirm it shortly, and the balance will update once confirmed.
      </p>
    </form>
  );
}
