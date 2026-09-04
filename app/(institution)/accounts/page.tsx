import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listAccountCategories, listTransactions, getAccountsSummary } from "../../../modules/accounts/service";
import { AccountCategoryForm, TransactionForm } from "./TransactionForm";

export default async function AccountsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "accounts");

  const canManage = can(ctx.permissions, "accounts.manage");

  const [categories, transactions, summary] = await Promise.all([
    listAccountCategories(institutionId, authUserId),
    listTransactions(institutionId, authUserId),
    getAccountsSummary(institutionId, authUserId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Accounts</h1>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Total income</div>
          <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">₹{summary.totalIncome}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Total expense</div>
          <div className="text-lg font-semibold text-red-600 dark:text-red-400">₹{summary.totalExpense}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Net balance</div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">₹{summary.netBalance}</div>
        </div>
      </section>

      {summary.byCategory.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">By category</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {summary.byCategory.map((c) => (
              <div key={`${c.category_name}-${c.type}`} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{c.category_name} ({c.type})</div>
                <div className={`text-sm font-semibold ${c.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>₹{c.total}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Categories</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <span key={c.id} className={`rounded-full px-3 py-1 text-xs ${c.type === "income" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"}`}>
                {c.name}
              </span>
            ))}
          </div>
          <AccountCategoryForm />
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Record income / expense / purchase</h2>
          <TransactionForm categories={categories} />
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Ledger ({transactions.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                <th className="py-1.5 pr-3">Date</th><th className="py-1.5 pr-3">Category</th><th className="py-1.5 pr-3">Type</th>
                <th className="py-1.5 pr-3">Amount</th><th className="py-1.5 pr-3">Description</th><th className="py-1.5 pr-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 pr-3">{t.transaction_date}</td>
                  <td className="py-1.5 pr-3">{t.category_name}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.type === "income" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">₹{t.amount}</td>
                  <td className="py-1.5 pr-3">
                    {t.description ?? "—"}
                    {t.vendor_name ? <span className="text-zinc-400 dark:text-zinc-500"> · {t.vendor_name}{t.item_description ? ` (${t.item_description})` : ""}</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-zinc-400 dark:text-zinc-500">{t.source_module ?? "manual"}</td>
                </tr>
              ))}
              {transactions.length === 0 ? <tr><td colSpan={6} className="py-3 text-center text-zinc-400 dark:text-zinc-500">No transactions yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
