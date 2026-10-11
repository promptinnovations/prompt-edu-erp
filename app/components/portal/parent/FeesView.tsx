import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateIST } from "../../../../services/datetime/ist";
import { PageHeader, Panel, StatTile, EmptyNote } from "../viz/blocks";
import { RingGauge, HBars, Timeline } from "../viz/charts";
import { seriesColor } from "../viz/palette";
import { FEES_COLOR } from "./ParentDashboardView";

export interface FeeInvoiceLite {
  id: string; category_name: string; amount_due: string; amount_paid: string; due_date: string | null; status: string;
}

const STATUS: Record<string, { text: string; bg: string; fg: string }> = {
  paid: { text: "Paid", bg: "#e6f4ec", fg: "#1f7a4d" },
  partial: { text: "Part paid", bg: "#fdf1dc", fg: "#8a5b0c" },
  pending: { text: "Pending", bg: "#f7f4ee", fg: "#4a5464" },
  overdue: { text: "Overdue", bg: "#fbeaec", fg: "#a72f3a" },
  waived: { text: "Waived", bg: "#e4f1f6", fg: "#1f6f8c" },
};

function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** §Parent-portal-visual-redesign — Fees: how much of the year's fees is
 *  paid (ring + totals), paid share per fee category, upcoming due dates,
 *  every invoice with its status and printable copy, and the pay form. */
export default function FeesView({ invoices, payForm, invoiceHref, headerExtra }: {
  invoices: FeeInvoiceLite[]; payForm?: ReactNode; invoiceHref: (id: string) => string; headerExtra?: ReactNode;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const live = invoices.filter((i) => i.status !== "waived");
  const due = live.reduce((s, i) => s + Number(i.amount_due), 0);
  const paid = live.reduce((s, i) => s + Number(i.amount_paid), 0);
  const balance = Math.max(0, due - paid);
  const paidPct = due > 0 ? Math.round((paid / due) * 1000) / 10 : null;
  const open = live.filter((i) => Number(i.amount_due) - Number(i.amount_paid) > 0);
  const statusOf = (i: FeeInvoiceLite) =>
    i.status === "paid" || i.status === "waived" ? i.status : i.due_date && i.due_date < today && Number(i.amount_due) > Number(i.amount_paid) ? "overdue" : i.status;
  const nextDue = open.filter((i) => i.due_date && i.due_date >= today).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0] ?? null;

  const byCategory = new Map<string, { due: number; paid: number }>();
  for (const i of live) {
    const c = byCategory.get(i.category_name) ?? { due: 0, paid: 0 };
    c.due += Number(i.amount_due); c.paid += Number(i.amount_paid);
    byCategory.set(i.category_name, c);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Fees" subtitle="What's paid, what's due, and receipts." icon="💳" color={FEES_COLOR}>{headerExtra}</PageHeader>

      {invoices.length === 0 ? (
        <Panel title="No fee invoices yet" color={FEES_COLOR}><EmptyNote>Invoices will appear here when the school raises them.</EmptyNote></Panel>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Paid so far" color={FEES_COLOR}>
              <div className="flex flex-col items-center gap-2">
                <RingGauge value={paidPct} color={FEES_COLOR} size={160} stroke={18} sub="paid" title={`${paidPct}% of fees paid`} />
                <p className="text-sm text-zinc-600">{rupees(paid)} of {rupees(due)}</p>
              </div>
            </Panel>
            <div className="grid grid-cols-2 gap-4 lg:col-span-2">
              <StatTile label="Balance" icon="🧾" color={balance > 0 ? seriesColor(7) : seriesColor(2)} value={balance > 0 ? rupees(balance) : "All paid"} sub={`${open.length} invoice${open.length === 1 ? "" : "s"} open`} />
              <StatTile label="Next due" icon="📅" color={seriesColor(3)} value={nextDue?.due_date ? formatDateIST(nextDue.due_date) : "—"} sub={nextDue ? `${nextDue.category_name} · ${rupees(Number(nextDue.amount_due) - Number(nextDue.amount_paid))}` : "Nothing upcoming"} />
              <StatTile label="Overdue" icon="⚠️" color={seriesColor(1)} value={open.filter((i) => statusOf(i) === "overdue").length} sub="Past their due date" />
              <StatTile label="Invoices" icon="📂" color={seriesColor(0)} value={invoices.length} sub="This and earlier years" />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Paid by fee type" subtitle="Share of each fee type paid." color={FEES_COLOR}>
              <HBars
                rows={[...byCategory.entries()].map(([name, c]) => ({
                  label: name, value: c.due > 0 ? Math.round((c.paid / c.due) * 1000) / 10 : null,
                  color: c.paid >= c.due ? seriesColor(2) : FEES_COLOR, note: `${rupees(c.paid)} of ${rupees(c.due)}`,
                }))}
              />
            </Panel>
            <Panel title="Upcoming and overdue" color={FEES_COLOR}>
              {open.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center"><span aria-hidden className="text-4xl">🎉</span><p className="text-sm text-zinc-600">Everything is paid.</p></div>
              ) : (
                <Timeline
                  items={[...open].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")).map((i) => {
                    const s = statusOf(i);
                    return {
                      key: i.id,
                      date: i.due_date ? `Due ${formatDateIST(i.due_date)}` : "No due date",
                      title: `${i.category_name} — ${rupees(Number(i.amount_due) - Number(i.amount_paid))}`,
                      meta: STATUS[s]?.text ?? s,
                      color: s === "overdue" ? "#e34948" : FEES_COLOR,
                      icon: s === "overdue" ? "!" : "₹",
                    };
                  })}
                />
              )}
            </Panel>
          </div>

          {payForm ? <Panel title="Pay a fee" color={FEES_COLOR}>{payForm}</Panel> : null}

          <Panel title="All invoices" color={FEES_COLOR}>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {invoices.map((i) => {
                const s = STATUS[statusOf(i)] ?? { text: i.status, bg: "#f7f4ee", fg: "#4a5464" };
                const pct = Number(i.amount_due) > 0 ? Math.min(100, (Number(i.amount_paid) / Number(i.amount_due)) * 100) : 0;
                return (
                  <li key={i.id} className="rounded-xl border border-[var(--border-subtle)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)]">{i.category_name}</span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: s.bg, color: s.fg }}>{s.text}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{rupees(Number(i.amount_paid))} paid of {rupees(Number(i.amount_due))}{i.due_date ? ` · due ${formatDateIST(i.due_date)}` : ""}</div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? seriesColor(2) : FEES_COLOR }} /></div>
                    <Link href={invoiceHref(i.id)} className="mt-2 inline-block text-xs font-medium text-[var(--brand)] hover:underline">View / print →</Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
