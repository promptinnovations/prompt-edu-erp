/**
 * PROMPT EDU ERP — Fee module service (Phase D §1 "Add a module for FEE -
 * admin will add fee details, category etc. admin or account staff will
 * update payment status - generate paid list, pending etc.").
 *
 * fee_categories/fee_structures: what an admin authors ("fee details,
 * category"). assignFeeStructureToClass() is what turns a structure into
 * real per-student debt — it snapshots the structure's amount/category/
 * academic year onto one student_fee_invoices row per currently-enrolled
 * student (class_id null on the structure = every enrolled student that
 * year), so a later edit to the structure never silently changes an
 * invoice a student may have already partially paid against.
 *
 * recordFeePayment(): the single place invoice status transitions happen
 * (pending -> partial -> paid), computed from the sum of CONFIRMED
 * payments only — a 'pending_confirmation' parent-submitted payment (see
 * submitParentFeePayment() in this same file) never moves the needle until
 * confirmPendingFeePayment() flips it to 'confirmed'. This mirrors §L.3
 * ("only approved counts") for money instead of portfolio content.
 *
 * Accounts-module wiring: when a payment is newly confirmed, this module
 * checks (via a plain institution_modules read, not a hard import cycle)
 * whether 'accounts' is enabled for the institution and, if so, calls
 * modules/accounts/service.ts's postFeePaymentAsIncome() so the two
 * modules "connect... if it is active" per the request, without Fees
 * hard-depending on Accounts existing at all (works standalone otherwise).
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export interface FeeCategoryRecord { id: string; name: string; description: string | null }
export interface FeeStructureRecord {
  id: string; fee_category_id: string; academic_year_id: string; class_id: string | null;
  amount: string; due_date: string | null;
}
export interface FeeStructureRow extends FeeStructureRecord {
  category_name: string; class_name: string | null; academic_year_name: string;
}
export interface StudentFeeInvoiceRow {
  id: string; student_id: string; student_name: string; admission_number: string;
  fee_category_id: string; category_name: string; academic_year_id: string;
  amount_due: string; amount_paid: string; due_date: string | null; status: string; created_at: string;
}
export interface FeePaymentRow {
  id: string; invoice_id: string; amount: string; payment_date: string; payment_method: string;
  reference_no: string | null; notes: string | null; status: string; recorded_by: string | null; created_at: string;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function listFeeCategories(institutionId: string, authUserId: string): Promise<FeeCategoryRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FeeCategoryRecord>(
      "select id, name, description from fee_categories order by name"
    );
    return rows;
  });
}

const createCategorySchema = z.object({ name: z.string().min(1).max(150), description: z.string().max(500).nullable().optional() });
export async function createFeeCategory(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createCategorySchema>
): Promise<FeeCategoryRecord> {
  const data = createCategorySchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FeeCategoryRecord>(
      "insert into fee_categories (institution_id, name, description) values ($1, $2, $3) returning id, name, description",
      [institutionId, data.name, data.description ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "fees", entityType: "fee_categories", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

// ---------------------------------------------------------------------------
// Structures ("admin will add fee details")
// ---------------------------------------------------------------------------
export async function listFeeStructures(institutionId: string, authUserId: string, academicYearId?: string): Promise<FeeStructureRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FeeStructureRow>(
      `select fs.id, fs.fee_category_id, fs.academic_year_id, fs.class_id, fs.amount::text as amount, fs.due_date::text as due_date,
              fc.name as category_name, c.name as class_name, ay.name as academic_year_name
         from fee_structures fs
         join fee_categories fc on fc.id = fs.fee_category_id
         left join classes c on c.id = fs.class_id
         join academic_years ay on ay.id = fs.academic_year_id
        where ($2::uuid is null or fs.academic_year_id = $2)
        order by ay.start_date desc, fc.name`,
      [institutionId, academicYearId ?? null]
    );
    return rows;
  });
}

const createStructureSchema = z.object({
  feeCategoryId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  classId: z.string().uuid().nullable().optional(),
  amount: z.number().nonnegative(),
  dueDate: z.string().nullable().optional(),
});
export async function createFeeStructure(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createStructureSchema>
): Promise<FeeStructureRecord> {
  const data = createStructureSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FeeStructureRecord>(
      `insert into fee_structures (institution_id, fee_category_id, academic_year_id, class_id, amount, due_date, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, fee_category_id, academic_year_id, class_id, amount::text as amount, due_date::text as due_date`,
      [institutionId, data.feeCategoryId, data.academicYearId, data.classId ?? null, data.amount, data.dueDate ?? null, userId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "fees", entityType: "fee_structures", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

/** Turns a fee_structure into real per-student debt — one student_fee_
 *  invoices row per currently-enrolled student (that structure's class, or
 *  every enrolled student that year if class_id is null). Safe to call more
 *  than once: a student who already has an invoice for this exact structure
 *  is skipped (checked by fee_structure_id, not by category/amount, so a
 *  later edit to the structure's amount doesn't re-trigger for everyone). */
export async function assignFeeStructureToClass(
  institutionId: string, authUserId: string, userId: string, feeStructureId: string
): Promise<{ invoicesCreated: number }> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: structureRows } = await scoped.query<{
      id: string; fee_category_id: string; academic_year_id: string; class_id: string | null; amount: string; due_date: string | null;
    }>(
      "select id, fee_category_id, academic_year_id, class_id, amount::text as amount, due_date::text as due_date from fee_structures where id = $1",
      [feeStructureId]
    );
    const structure = structureRows[0];
    if (!structure) throw new Error("Fee structure not found.");

    const { rows: students } = await scoped.query<{ student_id: string }>(
      `select distinct se.student_id
         from student_enrollments se
        where se.institution_id = $1 and se.academic_year_id = $2 and se.status = 'active'
          and ($3::uuid is null or se.class_id = $3)`,
      [institutionId, structure.academic_year_id, structure.class_id]
    );

    let created = 0;
    for (const s of students) {
      const { rows: existing } = await scoped.query(
        "select id from student_fee_invoices where student_id = $1 and fee_structure_id = $2",
        [s.student_id, feeStructureId]
      );
      if (existing.length > 0) continue;
      await scoped.query(
        `insert into student_fee_invoices (institution_id, student_id, fee_structure_id, fee_category_id, academic_year_id, amount_due, due_date)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [institutionId, s.student_id, feeStructureId, structure.fee_category_id, structure.academic_year_id, structure.amount, structure.due_date]
      );
      created++;
    }
    await recordAudit(scoped, { institutionId, userId, action: "assign", module: "fees", entityType: "fee_structures", entityId: feeStructureId, after: { invoicesCreated: created } });
    return { invoicesCreated: created };
  });
}

const adHocFeeSchema = z.object({
  studentId: z.string().uuid(),
  feeCategoryId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  amount: z.number().positive(),
  dueDate: z.string().nullable().optional(),
});
/** For a fee that applies to exactly one student, not a whole class
 *  (a scholarship top-up, a fine, a one-off charge) — an invoice with no
 *  parent fee_structure. */
export async function assignAdHocFee(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof adHocFeeSchema>
): Promise<StudentFeeInvoiceRow> {
  const data = adHocFeeSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into student_fee_invoices (institution_id, student_id, fee_category_id, academic_year_id, amount_due, due_date)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [institutionId, data.studentId, data.feeCategoryId, data.academicYearId, data.amount, data.dueDate ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "fees", entityType: "student_fee_invoices", entityId: rows[0].id });
    const invoices = await listStudentFeeInvoicesInternal(scoped, institutionId, { invoiceId: rows[0].id });
    return invoices[0];
  });
}

// ---------------------------------------------------------------------------
// Invoices / paid & pending lists ("generate paid list, pending etc.")
// ---------------------------------------------------------------------------
async function listStudentFeeInvoicesInternal(
  scoped: DbClient, institutionId: string,
  filters: { studentId?: string; status?: string; classId?: string; academicYearId?: string; invoiceId?: string }
): Promise<StudentFeeInvoiceRow[]> {
  const { rows } = await scoped.query<StudentFeeInvoiceRow>(
    `select sfi.id, sfi.student_id, s.full_name as student_name, s.admission_number,
            sfi.fee_category_id, fc.name as category_name, sfi.academic_year_id,
            sfi.amount_due::text as amount_due,
            coalesce((select sum(fp.amount) from fee_payments fp where fp.invoice_id = sfi.id and fp.status = 'confirmed'), 0)::text as amount_paid,
            sfi.due_date::text as due_date, sfi.status, sfi.created_at::text as created_at
       from student_fee_invoices sfi
       join students s on s.id = sfi.student_id
       join fee_categories fc on fc.id = sfi.fee_category_id
      where sfi.institution_id = $1
        and ($2::uuid is null or sfi.student_id = $2)
        and ($3::text is null or sfi.status = $3)
        and ($4::uuid is null or exists (
              select 1 from student_enrollments se
               where se.student_id = sfi.student_id and se.academic_year_id = sfi.academic_year_id and se.class_id = $4 and se.status = 'active'))
        and ($5::uuid is null or sfi.academic_year_id = $5)
        and ($6::uuid is null or sfi.id = $6)
      order by sfi.due_date nulls last, s.full_name`,
    [institutionId, filters.studentId ?? null, filters.status ?? null, filters.classId ?? null, filters.academicYearId ?? null, filters.invoiceId ?? null]
  );
  return rows;
}

/** status: omit for everything, or "pending"/"partial"/"paid"/"waived" — the
 *  "generate paid list, pending etc." lists are just this with a status
 *  filter (partial counts as pending-ish for a "who still owes money" view;
 *  callers combine 'pending'+'partial' client-side when they want that). */
export async function listStudentFeeInvoices(
  institutionId: string, authUserId: string,
  filters: { studentId?: string; status?: string; classId?: string; academicYearId?: string } = {}
): Promise<StudentFeeInvoiceRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, (scoped) => listStudentFeeInvoicesInternal(scoped, institutionId, filters));
}

export async function getFeeSummary(institutionId: string, authUserId: string, academicYearId?: string): Promise<{
  totalDue: string; totalCollected: string; totalPending: string; countPaid: number; countPending: number; countPartial: number;
}> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{
      total_due: string; total_collected: string;
      count_paid: string; count_pending: string; count_partial: string;
    }>(
      `select
         coalesce(sum(sfi.amount_due), 0)::text as total_due,
         coalesce((select sum(fp.amount) from fee_payments fp
                     join student_fee_invoices i2 on i2.id = fp.invoice_id
                    where i2.institution_id = $1 and fp.status = 'confirmed'
                      and ($2::uuid is null or i2.academic_year_id = $2)), 0)::text as total_collected,
         count(*) filter (where sfi.status = 'paid')::text as count_paid,
         count(*) filter (where sfi.status = 'pending')::text as count_pending,
         count(*) filter (where sfi.status = 'partial')::text as count_partial
       from student_fee_invoices sfi
       where sfi.institution_id = $1 and ($2::uuid is null or sfi.academic_year_id = $2)`,
      [institutionId, academicYearId ?? null]
    );
    const r = rows[0];
    const totalDue = Number(r?.total_due ?? 0);
    const totalCollected = Number(r?.total_collected ?? 0);
    return {
      totalDue: totalDue.toFixed(2),
      totalCollected: totalCollected.toFixed(2),
      totalPending: Math.max(0, totalDue - totalCollected).toFixed(2),
      countPaid: Number(r?.count_paid ?? 0),
      countPending: Number(r?.count_pending ?? 0),
      countPartial: Number(r?.count_partial ?? 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Payments ("admin or account staff will update payment status")
// ---------------------------------------------------------------------------
async function recalculateInvoiceStatus(scoped: DbClient, invoiceId: string): Promise<void> {
  const { rows } = await scoped.query<{ amount_due: string; paid: string }>(
    `select sfi.amount_due::text as amount_due,
            coalesce((select sum(fp.amount) from fee_payments fp where fp.invoice_id = sfi.id and fp.status = 'confirmed'), 0)::text as paid
       from student_fee_invoices sfi where sfi.id = $1`,
    [invoiceId]
  );
  const row = rows[0];
  if (!row) return;
  const due = Number(row.amount_due);
  const paid = Number(row.paid);
  const status = paid <= 0 ? "pending" : paid >= due ? "paid" : "partial";
  await scoped.query("update student_fee_invoices set status = $2, updated_at = now() where id = $1", [invoiceId, status]);
}

const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  paymentDate: z.string().nullable().optional(),
  paymentMethod: z.enum(["cash", "upi", "bank_transfer", "cheque", "card", "other"]).default("cash"),
  referenceNo: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
/** Admin/account staff (fees.collect) recording a payment directly —
 *  status is 'confirmed' immediately, unlike submitParentFeePayment(). */
export async function recordFeePayment(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof recordPaymentSchema>
): Promise<FeePaymentRow> {
  const data = recordPaymentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FeePaymentRow>(
      `insert into fee_payments (institution_id, invoice_id, amount, payment_date, payment_method, reference_no, notes, status, recorded_by, confirmed_by, confirmed_at)
       values ($1, $2, $3, coalesce($4, current_date), $5, $6, $7, 'confirmed', $8, $8, now())
       returning id, invoice_id, amount::text as amount, payment_date::text as payment_date, payment_method, reference_no, notes, status, recorded_by, created_at::text as created_at`,
      [institutionId, data.invoiceId, data.amount, data.paymentDate ?? null, data.paymentMethod, data.referenceNo ?? null, data.notes ?? null, userId]
    );
    const payment = rows[0];
    await recalculateInvoiceStatus(scoped, data.invoiceId);
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "fees", entityType: "fee_payments", entityId: payment.id, after: payment });
    await postToAccountsIfActive(scoped, institutionId, userId, payment);
    return payment;
  });
}

/** Parent self-reporting a payment from the parent portal ("in parent
 *  portal, there can be an option for paying fee") — no live payment
 *  gateway is wired in (no gateway credentials were supplied for this
 *  project), so this records what the parent says they paid and how, and
 *  leaves the invoice's status untouched until an account staff member
 *  confirms it via confirmPendingFeePayment() — the same self-service-
 *  submit/staff-approves shape used everywhere else in this app (reading
 *  reviews, achievements, skills). */
const parentPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["upi", "bank_transfer", "cheque", "cash", "card", "other"]).default("upi"),
  referenceNo: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export async function submitParentFeePayment(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof parentPaymentSchema>
): Promise<FeePaymentRow> {
  const data = parentPaymentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FeePaymentRow>(
      `insert into fee_payments (institution_id, invoice_id, amount, payment_method, reference_no, notes, status, recorded_by)
       values ($1, $2, $3, $4, $5, $6, 'pending_confirmation', $7)
       returning id, invoice_id, amount::text as amount, payment_date::text as payment_date, payment_method, reference_no, notes, status, recorded_by, created_at::text as created_at`,
      [institutionId, data.invoiceId, data.amount, data.paymentMethod, data.referenceNo ?? null, data.notes ?? null, userId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "fees", entityType: "fee_payments", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

export async function listPendingConfirmationPayments(institutionId: string, authUserId: string): Promise<
  Array<FeePaymentRow & { student_name: string; category_name: string }>
> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FeePaymentRow & { student_name: string; category_name: string }>(
      `select fp.id, fp.invoice_id, fp.amount::text as amount, fp.payment_date::text as payment_date, fp.payment_method,
              fp.reference_no, fp.notes, fp.status, fp.recorded_by, fp.created_at::text as created_at,
              s.full_name as student_name, fc.name as category_name
         from fee_payments fp
         join student_fee_invoices sfi on sfi.id = fp.invoice_id
         join students s on s.id = sfi.student_id
         join fee_categories fc on fc.id = sfi.fee_category_id
        where fp.institution_id = $1 and fp.status = 'pending_confirmation'
        order by fp.created_at`,
      [institutionId]
    );
    return rows;
  });
}

/** Account staff/admin (fees.collect) confirming or rejecting a parent-
 *  submitted payment. Only on confirm does it count toward the invoice's
 *  status and (if active) get posted to Accounts as income. */
export async function confirmPendingFeePayment(
  institutionId: string, authUserId: string, userId: string, paymentId: string, decision: "confirmed" | "rejected"
): Promise<FeePaymentRow> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FeePaymentRow>(
      `update fee_payments set status = $2, confirmed_by = $3, confirmed_at = now()
        where id = $1 and status = 'pending_confirmation'
        returning id, invoice_id, amount::text as amount, payment_date::text as payment_date, payment_method, reference_no, notes, status, recorded_by, created_at::text as created_at`,
      [paymentId, decision, userId]
    );
    if (!rows[0]) throw new Error("Pending payment not found.");
    const payment = rows[0];
    if (decision === "confirmed") {
      await recalculateInvoiceStatus(scoped, payment.invoice_id);
      await postToAccountsIfActive(scoped, institutionId, userId, payment);
    }
    await recordAudit(scoped, { institutionId, userId, action: decision, module: "fees", entityType: "fee_payments", entityId: paymentId, after: payment });
    return payment;
  });
}

export async function listFeePaymentsForInvoice(institutionId: string, authUserId: string, invoiceId: string): Promise<FeePaymentRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<FeePaymentRow>(
      `select id, invoice_id, amount::text as amount, payment_date::text as payment_date, payment_method,
              reference_no, notes, status, recorded_by, created_at::text as created_at
         from fee_payments where invoice_id = $1 order by created_at`,
      [invoiceId]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Accounts-module wiring (§2 "connected to fee module if it is active")
// ---------------------------------------------------------------------------
async function postToAccountsIfActive(scoped: DbClient, institutionId: string, userId: string, payment: FeePaymentRow): Promise<void> {
  const { rows } = await scoped.query<{ is_enabled: boolean | null }>(
    `select im.is_enabled from institution_modules im
       join modules m on m.id = im.module_id
      where im.institution_id = $1 and m.code = 'accounts'`,
    [institutionId]
  );
  // Default-enabled semantics (services/modules/module-service.ts): no row = enabled.
  const accountsActive = rows.length === 0 || rows[0].is_enabled !== false;
  if (!accountsActive) return;

  const { rows: categoryRows } = await scoped.query<{ id: string }>(
    `insert into account_categories (institution_id, name, type) values ($1, 'Fee Collection', 'income')
     on conflict (institution_id, name) do update set name = excluded.name
     returning id`,
    [institutionId]
  );
  const categoryId = categoryRows[0].id;

  await scoped.query(
    `insert into account_transactions (institution_id, category_id, type, amount, transaction_date, description, payment_method, reference_no, source_module, source_entity_id, recorded_by)
     values ($1, $2, 'income', $3, coalesce($4, current_date), 'Fee payment', $5, $6, 'fees', $7, $8)`,
    [institutionId, categoryId, payment.amount, payment.payment_date, payment.payment_method, payment.reference_no, payment.id, userId]
  );
}
