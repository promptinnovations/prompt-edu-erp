"use client";

import { useActionState, useState } from "react";
import { updateFeePaymentAction, deleteFeePaymentAction } from "./actions";

export interface InvoicePaymentRow {
  id: string;
  amount: string;
  payment_date: string;
  payment_method: string;
  reference_no: string | null;
  notes: string | null;
  status: string;
  void_reason?: string | null;
}

const METHODS = ["cash", "upi", "bank_transfer", "cheque", "card", "other"] as const;

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  pending_confirmation: "Awaiting confirmation",
  rejected: "Rejected",
  voided: "Deleted",
};

/** §Fee-payment-delete — "Delete" asks for a reason in place (no browser
 *  dialog) and then voids the payment: it stops counting in the invoice,
 *  the fee totals and Accounts, but stays listed as "Deleted" with the
 *  reason, and in the audit log. */
function DeletePaymentForm({ payment, onDone }: { payment: InvoicePaymentRow; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<{ error: string | null; done?: boolean }, FormData>(deleteFeePaymentAction, { error: null });
  return (
    <form action={formAction} className="mt-2 grid gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs">
      <input type="hidden" name="id" value={payment.id} />
      <p className="text-red-700">
        Delete this payment of <b>₹{payment.amount}</b> ({payment.payment_date?.slice(0, 10)})? It will no longer count towards the invoice or Accounts. The record stays in the history as deleted.
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-600">Reason</span>
        <input autoComplete="off" name="reason" required minLength={3} maxLength={300} placeholder="e.g. Entered twice by mistake" className="rounded border bg-white px-2 py-1" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-full bg-red-600 px-3 py-1.5 text-white hover:bg-red-700 disabled:opacity-50">
          {pending ? "Deleting…" : "Delete payment"}
        </button>
        <button type="button" onClick={onDone} className="rounded-full border bg-white px-3 py-1.5 text-zinc-600">Cancel</button>
      </div>
      {state.error ? <div className="text-red-700">{state.error}</div> : null}
    </form>
  );
}

function EditPaymentForm({ payment, onDone }: { payment: InvoicePaymentRow; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateFeePaymentAction, { error: null });
  return (
    <form action={formAction} className="mt-2 grid grid-cols-2 gap-2 rounded-lg border bg-zinc-50 p-3 text-xs sm:grid-cols-3">
      <input type="hidden" name="id" value={payment.id} />
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500">Amount</span>
        <input autoComplete="off" name="amount" type="number" step="0.01" min="0.01" defaultValue={payment.amount} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500">Payment date</span>
        <input autoComplete="off" name="paymentDate" type="date" defaultValue={payment.payment_date?.slice(0, 10)} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500">Method</span>
        <select name="paymentMethod" defaultValue={payment.payment_method} className="rounded border bg-white px-2 py-1">
          {METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500">Reference no.</span>
        <input autoComplete="off" name="referenceNo" defaultValue={payment.reference_no ?? ""} className="rounded border px-2 py-1" />
      </label>
      <label className="col-span-2 flex flex-col gap-1 sm:col-span-2">
        <span className="text-zinc-500">Notes</span>
        <input autoComplete="off" name="notes" defaultValue={payment.notes ?? ""} className="rounded border px-2 py-1" />
      </label>
      <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-white">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} className="rounded-full border px-3 py-1.5 text-zinc-600">
          Cancel
        </button>
      </div>
      {state.error ? <div className="col-span-2 text-red-600 sm:col-span-3">{state.error}</div> : null}
    </form>
  );
}

function PaymentRow({ payment }: { payment: InvoicePaymentRow }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const voided = payment.status === "voided";
  return (
    <div className="border-t py-2 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${voided ? "text-zinc-500 line-through" : "text-zinc-900"}`}>₹{payment.amount}</span>
          <span className="text-zinc-500">{payment.payment_date?.slice(0, 10)}</span>
          <span className="text-zinc-500">{payment.payment_method.replace("_", " ")}</span>
          {payment.reference_no ? <span className="text-zinc-500">Ref: {payment.reference_no}</span> : null}
          <span className={`rounded-full px-2 py-0.5 ${payment.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : payment.status === "rejected" || voided ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
            {STATUS_LABEL[payment.status] ?? payment.status}
          </span>
          {voided && payment.void_reason ? <span className="text-zinc-500">Reason: {payment.void_reason}</span> : null}
        </div>
        {payment.status !== "rejected" && !voided ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => { setEditing((v) => !v); setDeleting(false); }}
              className="rounded-full border px-2 py-1 text-zinc-600 hover:bg-zinc-100"
            >
              {editing ? "Close" : "Edit"}
            </button>
            <button
              type="button"
              onClick={() => { setDeleting((v) => !v); setEditing(false); }}
              className="rounded-full border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
            >
              {deleting ? "Close" : "Delete"}
            </button>
          </div>
        ) : null}
      </div>
      {editing ? <EditPaymentForm payment={payment} onDone={() => setEditing(false)} /> : null}
      {deleting && !voided ? <DeletePaymentForm payment={payment} onDone={() => setDeleting(false)} /> : null}
    </div>
  );
}

export default function InvoicePayments({ payments }: { payments: InvoicePaymentRow[] }) {
  if (payments.length === 0) return <p className="py-2 text-xs text-zinc-500">No payments recorded yet.</p>;
  return (
    <div>
      {payments.map((p) => (
        <PaymentRow key={p.id} payment={p} />
      ))}
    </div>
  );
}
