"use client";

import { useActionState } from "react";
import { confirmPendingFeePaymentAction } from "./actions";

export interface PendingPaymentRow {
  id: string; student_name: string; category_name: string; amount: string; payment_method: string; reference_no: string | null; created_at: string;
}

function DecisionButton({ paymentId, decision, label, className }: { paymentId: string; decision: "confirmed" | "rejected"; label: string; className: string }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(confirmPendingFeePaymentAction, { error: null });
  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="decision" value={decision} />
      <button type="submit" disabled={pending} className={className}>{label}</button>
      {state.error ? <div className="text-xs text-red-600 dark:text-red-400">{state.error}</div> : null}
    </form>
  );
}

export default function PendingConfirmations({ payments }: { payments: PendingPaymentRow[] }) {
  if (payments.length === 0) return <p className="text-sm text-zinc-400 dark:text-zinc-500">No parent-submitted payments awaiting confirmation.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-zinc-500 dark:text-zinc-400">
            <th className="py-1.5 pr-3">Student</th><th className="py-1.5 pr-3">Category</th><th className="py-1.5 pr-3">Amount</th>
            <th className="py-1.5 pr-3">Method</th><th className="py-1.5 pr-3">Reference</th><th className="py-1.5 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-1.5 pr-3">{p.student_name}</td>
              <td className="py-1.5 pr-3">{p.category_name}</td>
              <td className="py-1.5 pr-3">₹{p.amount}</td>
              <td className="py-1.5 pr-3">{p.payment_method}</td>
              <td className="py-1.5 pr-3">{p.reference_no ?? "—"}</td>
              <td className="py-1.5 pr-3">
                <div className="flex gap-2">
                  <DecisionButton paymentId={p.id} decision="confirmed" label="Confirm" className="rounded-lg bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700" />
                  <DecisionButton paymentId={p.id} decision="rejected" label="Reject" className="rounded-lg border border-red-300 dark:border-red-800 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
