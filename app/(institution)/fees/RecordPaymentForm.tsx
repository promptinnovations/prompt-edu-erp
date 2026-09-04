"use client";

import { useActionState } from "react";
import { recordFeePaymentAction } from "./actions";

export interface InvoiceOption { id: string; label: string }

export default function RecordPaymentForm({ invoices }: { invoices: InvoiceOption[] }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(recordFeePaymentAction, { error: null });
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Invoice (student — category — pending)</label>
        <select name="invoiceId" required defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="" disabled>Select…</option>
          {invoices.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Amount (₹)</label>
        <input name="amount" type="number" min={0.01} step="0.01" required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Method</label>
        <select name="paymentMethod" defaultValue="cash" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="cheque">Cheque</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Reference no. (optional)</label>
        <input name="referenceNo" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Record payment
        </button>
        {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}
