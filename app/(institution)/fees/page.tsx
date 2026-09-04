import { requireRequestContext } from "../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../services/modules/module-service";
import { can } from "../../../services/permissions/permission-service";
import { listClasses, listAcademicYears } from "../../../modules/academic/service";
import {
  listFeeCategories, listFeeStructures, listStudentFeeInvoices, getFeeSummary, listPendingConfirmationPayments,
} from "../../../modules/fees/service";
import FeeCategoryForm from "./FeeCategoryForm";
import { FeeStructureForm, AssignFeeStructureButton } from "./FeeStructureForm";
import RecordPaymentForm from "./RecordPaymentForm";
import PendingConfirmations from "./PendingConfirmations";

const STATUS_BADGE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  waived: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
};

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "fees");
  const { status } = await searchParams;

  const canManage = can(ctx.permissions, "fees.manage");
  const canCollect = can(ctx.permissions, "fees.collect");

  const [classes, academicYears, categories, structures, invoices, summary, pendingConfirmations] = await Promise.all([
    listClasses(institutionId, authUserId),
    listAcademicYears(institutionId, authUserId),
    listFeeCategories(institutionId, authUserId),
    listFeeStructures(institutionId, authUserId),
    listStudentFeeInvoices(institutionId, authUserId, status ? { status } : {}),
    getFeeSummary(institutionId, authUserId),
    canCollect ? listPendingConfirmationPayments(institutionId, authUserId) : Promise.resolve([]),
  ]);

  const outstandingInvoices = invoices.filter((i) => i.status === "pending" || i.status === "partial");
  const invoiceOptions = outstandingInvoices.map((i) => ({
    id: i.id,
    label: `${i.student_name} (${i.admission_number}) — ${i.category_name} — ₹${(Number(i.amount_due) - Number(i.amount_paid)).toFixed(2)} pending`,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Fees</h1>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Total due</div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">₹{summary.totalDue}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Collected</div>
          <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">₹{summary.totalCollected}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Pending</div>
          <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">₹{summary.totalPending}</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Paid / Partial / Pending</div>
          <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{summary.countPaid} / {summary.countPartial} / {summary.countPending}</div>
        </div>
      </section>

      {canManage ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Fee categories</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <span key={c.id} className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300">{c.name}</span>
            ))}
          </div>
          <FeeCategoryForm />
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Fee structures (&quot;fee details&quot;)</h2>
          <FeeStructureForm
            categories={categories}
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
            academicYears={academicYears.map((y) => ({ id: y.id, name: y.name }))}
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                  <th className="py-1.5 pr-3">Category</th><th className="py-1.5 pr-3">Class</th><th className="py-1.5 pr-3">Year</th>
                  <th className="py-1.5 pr-3">Amount</th><th className="py-1.5 pr-3">Due date</th><th className="py-1.5 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {structures.map((s) => (
                  <tr key={s.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-3">{s.category_name}</td>
                    <td className="py-1.5 pr-3">{s.class_name ?? "Every class"}</td>
                    <td className="py-1.5 pr-3">{s.academic_year_name}</td>
                    <td className="py-1.5 pr-3">₹{s.amount}</td>
                    <td className="py-1.5 pr-3">{s.due_date ?? "—"}</td>
                    <td className="py-1.5 pr-3"><AssignFeeStructureButton feeStructureId={s.id} /></td>
                  </tr>
                ))}
                {structures.length === 0 ? <tr><td colSpan={6} className="py-3 text-center text-zinc-400 dark:text-zinc-500">No fee structures yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canCollect ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Record a payment</h2>
          <RecordPaymentForm invoices={invoiceOptions} />
        </section>
      ) : null}

      {canCollect ? (
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Parent-submitted payments awaiting confirmation
          </h2>
          <PendingConfirmations payments={pendingConfirmations} />
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Invoices ({invoices.length})</h2>
          <div className="flex gap-1 text-xs">
            {[["", "All"], ["pending", "Pending"], ["partial", "Partial"], ["paid", "Paid"]].map(([value, label]) => (
              <a key={value} href={value ? `/fees?status=${value}` : "/fees"}
                 className={`rounded-full px-3 py-1 ${(status ?? "") === value ? "bg-[var(--brand)] text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"}`}>
                {label}
              </a>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 dark:text-zinc-400">
                <th className="py-1.5 pr-3">Student</th><th className="py-1.5 pr-3">Category</th>
                <th className="py-1.5 pr-3">Due</th><th className="py-1.5 pr-3">Paid</th><th className="py-1.5 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 pr-3">{i.student_name} <span className="text-zinc-400 dark:text-zinc-500">({i.admission_number})</span></td>
                  <td className="py-1.5 pr-3">{i.category_name}</td>
                  <td className="py-1.5 pr-3">₹{i.amount_due}</td>
                  <td className="py-1.5 pr-3">₹{i.amount_paid}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[i.status] ?? ""}`}>{i.status}</span>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 ? <tr><td colSpan={5} className="py-3 text-center text-zinc-400 dark:text-zinc-500">No invoices.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
