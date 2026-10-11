import { can } from "../../../../../services/permissions/permission-service";
import { listStudentFeeInvoices } from "../../../../../modules/fees/service";
import { formatDateIST } from "../../../../../services/datetime/ist";
import { requireOwnParentContext, NotLinkedNotice, NotEnabledNotice } from "../_lib";
import ChildPicker from "../ChildPicker";
import PayFeeForm from "../PayFeeForm";
import FeesView from "../../../../components/portal/parent/FeesView";

/** Parent → Fees — §Parent-portal-visual-redesign. Paid-so-far ring,
 *  balance / next due / overdue, paid share by fee type, upcoming and
 *  overdue dues, the pay form and every invoice (printable). */
export default async function ParentFeesPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { ctx, institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  if (!can(ctx.permissions, "fees.pay_own")) return <NotEnabledNotice what="Fees" />;
  const invoices = await listStudentFeeInvoices(institutionId, authUserId, { studentId: selectedChildId });
  const pending = invoices.filter((i) => (i.status === "pending" || i.status === "partial") && Number(i.amount_due) > Number(i.amount_paid));
  return (
    <FeesView
      invoices={invoices}
      invoiceHref={(id) => `/portal/parent/invoice/${id}?childId=${selectedChildId}`}
      headerExtra={<ChildPicker options={children} selectedChildId={selectedChildId} />}
      payForm={pending.length > 0 ? (
        <PayFeeForm
          invoices={pending.map((i) => ({
            id: i.id,
            label: `${i.category_name} — ₹${(Number(i.amount_due) - Number(i.amount_paid)).toFixed(2)} pending${i.due_date ? ` (due ${formatDateIST(i.due_date)})` : ""}`,
            balance: Number(i.amount_due) - Number(i.amount_paid),
          }))}
        />
      ) : undefined}
    />
  );
}
