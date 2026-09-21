import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnParentContext } from "../../_lib";
import { can } from "../../../../../../services/permissions/permission-service";
import { getInstitution } from "../../../../../../services/institution/institution-service";
import { listStudentFeeInvoices, listFeePaymentsForInvoice } from "../../../../../../modules/fees/service";
import PrintButton from "../../../../../components/PrintButton";
import PrintLetterhead from "../../../../../components/PrintLetterhead";

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid", partial: "Partially paid", pending: "Pending", waived: "Waived",
};

/** Parent portal "generate invoice" (§6 follow-up) — a printable invoice/
 *  receipt for one of the signed-in parent's own children's fee invoices,
 *  on the institution's own letterhead (same PrintButton/PrintLetterhead
 *  pattern as Report Cards). Ownership is enforced the same way as every
 *  other /portal/parent/* sub-route: requireOwnParentContext() resolves
 *  selectedChildId only from THIS parent's own already-verified children,
 *  and the invoice is then looked up scoped to that studentId, so a
 *  parent can never view another family's invoice by guessing an id. */
export default async function ParentInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ childId?: string }>;
}) {
  const { invoiceId } = await params;
  const { childId } = await searchParams;
  const { ctx, institutionId, authUserId, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId || !can(ctx.permissions, "fees.pay_own")) notFound();

  const [institution, invoices] = await Promise.all([
    getInstitution(institutionId, authUserId),
    listStudentFeeInvoices(institutionId, authUserId, { studentId: selectedChildId }),
  ]);
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) notFound();

  const payments = await listFeePaymentsForInvoice(institutionId, authUserId, invoiceId);
  const confirmedPayments = payments.filter((p) => p.status === "confirmed");
  const balance = Number(invoice.amount_due) - Number(invoice.amount_paid);

  return (
    <div className="space-y-4">
      <Link href={`/portal/parent?childId=${selectedChildId}`} className="no-print text-sm text-zinc-500 underline">
        ← Back to portal
      </Link>
      <div className="no-print flex justify-end">
        <PrintButton label="Print / Save as PDF" />
      </div>

      <section className="print-area mx-auto max-w-2xl rounded-card border bg-white p-8">
        <div className="mb-6 text-center">
          <PrintLetterhead
            institutionName={institution?.appName || institution?.name || "PROMPT EDU ERP"}
            logoCode={institution?.logoFileId ? institution.code : null}
          />
          <p className="mt-1 text-sm text-zinc-500">Fee Invoice</p>
        </div>

        <div className="mb-6 flex justify-between text-sm">
          <div>
            <div className="font-medium text-zinc-900">{invoice.student_name}</div>
            <div className="text-zinc-500">Admission No: {invoice.admission_number}</div>
            {invoice.class_name ? (
              <div className="text-zinc-500">{invoice.class_name} {invoice.section_name ?? ""}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-zinc-500">Category: {invoice.category_name}</div>
            <div className="text-zinc-500">Due date: {invoice.due_date ?? "—"}</div>
            <div className="mt-1 font-medium text-zinc-900">{STATUS_LABEL[invoice.status] ?? invoice.status}</div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="py-1.5">Description</th>
              <th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="py-1.5">{invoice.category_name}</td>
              <td className="py-1.5 text-right">₹{invoice.amount_due}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between"><span className="text-zinc-500">Amount due</span><span>₹{invoice.amount_due}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Amount paid</span><span>₹{invoice.amount_paid}</span></div>
          <div className="flex justify-between font-medium text-zinc-900"><span>Balance</span><span>₹{balance.toFixed(2)}</span></div>
        </div>

        {confirmedPayments.length > 0 ? (
          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Payment history</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="py-1.5">Date</th><th className="py-1.5">Method</th><th className="py-1.5">Reference</th><th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {confirmedPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1.5">{p.payment_date?.slice(0, 10)}</td>
                    <td className="py-1.5">{p.payment_method.replace("_", " ")}</td>
                    <td className="py-1.5">{p.reference_no ?? "—"}</td>
                    <td className="py-1.5 text-right">₹{p.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="mt-10 text-center text-[10px] uppercase tracking-[0.08em] text-zinc-500">
          {institution?.appName || institution?.name || "PROMPT EDU ERP"} · Generated {new Date().toLocaleDateString("en-IN")}
        </p>
      </section>
    </div>
  );
}
