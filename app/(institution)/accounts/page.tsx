import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listAccountCategories, listTransactions, getAccountsSummary } from "../../../modules/accounts/service";
import { AccountCategoryForm, TransactionForm } from "./TransactionForm";
import { Panel } from "../../components/portal/viz/blocks";
import { DonutChart, HBars } from "../../components/portal/viz/charts";
import { seriesColor } from "../../components/portal/viz/palette";

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
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Accounts</h1>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-card border bg-white p-4">
          <div className="text-xs text-zinc-500">Total income</div>
          <div className="text-lg font-semibold text-emerald-600">₹{summary.totalIncome}</div>
        </div>
        <div className="rounded-card border bg-white p-4">
          <div className="text-xs text-zinc-500">Total expense</div>
          <div className="text-lg font-semibold text-red-600">₹{summary.totalExpense}</div>
        </div>
        <div className="rounded-card border bg-white p-4">
          <div className="text-xs text-zinc-500">Net balance</div>
          <div className="text-lg font-semibold text-zinc-900">₹{summary.netBalance}</div>
        </div>
      </section>

      {/* §Staff-pages-visual — income vs expense and where money goes, from
          the same summary as the cards and the category list below. */}
      {summary.byCategory.length > 0 ? (() => {
        const income = Number(summary.totalIncome) || 0;
        const expense = Number(summary.totalExpense) || 0;
        const rows = (type: string) => summary.byCategory.filter((c) => c.type === type).map((c) => ({ label: c.category_name, value: Number(c.total) || 0 }))
          .sort((a, b) => b.value - a.value).slice(0, 8);
        const inc = rows("income"); const exp = rows("expense");
        const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
        return (
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Income vs expense" color={seriesColor(6)}>
              <DonutChart size={136} stroke={21} center={rupees(income - expense)} sub="net" segments={[
                { label: `Income ${rupees(income)}`, value: income, color: "#1baf7a" },
                { label: `Expense ${rupees(expense)}`, value: expense, color: "#e34948" },
              ]} />
            </Panel>
            <Panel title="Income by category" color="#1baf7a">
              <HBars unit="" max={Math.max(1, ...inc.map((r) => r.value))} rows={inc.map((r) => ({ label: r.label, value: r.value, color: "#1baf7a", suffix: "", note: rupees(r.value) }))} />
            </Panel>
            <Panel title="Expense by category" color="#e34948">
              <HBars unit="" max={Math.max(1, ...exp.map((r) => r.value))} rows={exp.map((r) => ({ label: r.label, value: r.value, color: "#e34948", suffix: "", note: rupees(r.value) }))} />
            </Panel>
          </div>
        );
      })() : null}

      {summary.byCategory.length > 0 ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">By category</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {summary.byCategory.map((c) => (
              <div key={`${c.category_name}-${c.type}`} className="rounded-card border p-3">
                <div className="text-xs text-zinc-500">{c.category_name} ({c.type})</div>
                <div className={`text-sm font-semibold ${c.type === "income" ? "text-emerald-600" : "text-red-600"}`}>₹{c.total}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Categories</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <span key={c.id} className={`rounded-full px-3 py-1 text-xs ${c.type === "income" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-700"}`}>
                {c.name}
              </span>
            ))}
          </div>
          <AccountCategoryForm />
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Record income / expense / purchase</h2>
          <TransactionForm categories={categories} />
        </section>
      ) : null}

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Ledger ({transactions.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500">
                <th className="py-1.5 pr-3">Date</th><th className="py-1.5 pr-3">Category</th><th className="py-1.5 pr-3">Type</th>
                <th className="py-1.5 pr-3">Amount</th><th className="py-1.5 pr-3">Description</th><th className="py-1.5 pr-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-1.5 pr-3">{t.transaction_date}</td>
                  <td className="py-1.5 pr-3">{t.category_name}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.type === "income" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">₹{t.amount}</td>
                  <td className="py-1.5 pr-3">
                    {t.description ?? "—"}
                    {t.vendor_name ? <span className="text-zinc-500"> · {t.vendor_name}{t.item_description ? ` (${t.item_description})` : ""}</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-zinc-500">{t.source_module ?? "manual"}</td>
                </tr>
              ))}
              {transactions.length === 0 ? <tr><td colSpan={6} className="py-3 text-center text-zinc-500">No transactions yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
