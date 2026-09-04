"use client";

import { useActionState, useState } from "react";
import { createAccountCategoryAction, recordTransactionAction } from "./actions";

export interface CategoryOption { id: string; name: string; type: "income" | "expense" }

export function AccountCategoryForm() {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createAccountCategoryAction, { error: null });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Category name</label>
        <input name="name" required placeholder="e.g. Stationery" className="w-56 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Type</label>
        <select name="type" defaultValue="expense" className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </div>
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Add category
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

export function TransactionForm({ categories }: { categories: CategoryOption[] }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(recordTransactionAction, { error: null });
  const [type, setType] = useState<"income" | "expense">("expense");
  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Type</label>
        <select name="type" value={type} onChange={(e) => setType(e.target.value as "income" | "expense")} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="income">Income</option>
          <option value="expense">Expense (incl. purchases)</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Category</label>
        <select name="categoryId" required defaultValue="" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="" disabled>Select…</option>
          {categories.filter((c) => c.type === type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Amount (₹)</label>
        <input name="amount" type="number" min={0.01} step="0.01" required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Date</label>
        <input name="transactionDate" type="date" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Description</label>
        <input name="description" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Vendor (purchases)</label>
        <input name="vendorName" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Item bought (purchases)</label>
        <input name="itemDescription" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Method</label>
        <select name="paymentMethod" defaultValue="cash" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm">
          <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option>
          <option value="cheque">Cheque</option><option value="card">Card</option><option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Reference no.</label>
        <input name="referenceNo" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      </div>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Record transaction
        </button>
        {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
      </div>
    </form>
  );
}
