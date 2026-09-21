"use client";

import { useActionState, useState } from "react";
import { updateFeePaymentAction } from "./actions";

export interface InvoicePaymentRow {
  id: string;
  amount: string;
  payment_date: string;
  payment_method: string;
  reference_no: string | null;
  notes: string | null;
  status: string;
}

const METHODS = ["cash", "upi", "bank_transfer", "cheque", "card", "other"] as const;

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  pending_confirmation: "Awaiting confirmation",
  rejected: "Rejected",
};

function EditPaymentForm({ payment, onDone }: { payment: InvoicePaymentRow; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(updateFeePaymentAction, { error: null });
  return (
    <form action={formAction} className="mt-2 grid grid-cols-2 gap-2 rounded-lg border bg-zinc-50 p-3 text-xs sm:grid-cols-3">
      <input type="hidden" name="id" value={payment.id} />
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500">Amount</span>
        <input name="amount" type="number" step="0.01" min="0.01" defaultValue={payment.amount} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500">Payment date</span>
        <input name="paymentDate" type="date" defaultValue={payment.payment_date?.slice(0, 10)} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500">Method</span>
        <select name="paymentMethod" defaultValue={payment.payment_method} className="rounded border bg-white px-2 py-1">
          {METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-500">Reference no.</span>
        <input name="referenceNo" defaultValue={payment.reference_no ?? ""} className="rounded border px-2 py-1" />
      </label>
      <label className="col-span-2 flex flex-col gap-1 sm:col-span-2">
        <span className="text-zinc-500">Notes</span>
        <input name="notes" defaultValue={payment.notes ?? ""} className="rounded border px-2 py-1" />
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
  return (
    <div className="border-t py-2 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-zinc-900">₹{payment.amount}</span>
          <span className="text-zinc-500">{payment.payment_date?.slice(0, 10)}</span>
          <span className="text-zinc-500">{payment.payment_method.replace("_", " ")}</span>
          {payment.reference_no ? <span className="text-zinc-500">Ref: {payment.reference_no}</span> : null}
          <span className={`rounded-full px-2 py-0.5 ${payment.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : payment.status === "rejected" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
            {STATUS_LABEL[payment.status] ?? payment.status}
          </span>
        </div>
        {payment.status !== "rejected" ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-full border px-2 py-1 text-zinc-600 hover:bg-zinc-100"
          >
            {editing ? "Close" : "Edit"}
          </button>
        ) : null}
      </div>
      {editing ? <EditPaymentForm payment={payment} onDone={() => setEditing(false)} /> : null}
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
