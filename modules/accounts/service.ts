/**
 * PROMPT EDU ERP — Accounts module service (Phase D §2 "Add an accounts
 * module where income and expense, debit credit, purchase everything will
 * be calculated - connected to fee module if it is active").
 *
 * A single general ledger (account_transactions), typed income/expense —
 * "debit/credit" and "purchase" are represented as expense transactions
 * (with optional vendor_name/item_description for purchases) rather than
 * a second schema, per migration 0046's own comment on why a full
 * double-entry ledger would be out of proportion here.
 *
 * The Fee-module connection (auto-posting a confirmed fee payment as
 * income) lives in modules/fees/service.ts's postToAccountsIfActive() —
 * this file only OWNS the ledger, it doesn't need to know Fees exists.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";

export interface AccountCategoryRecord { id: string; name: string; type: "income" | "expense" }
export interface AccountTransactionRow {
  id: string; category_id: string; category_name: string; type: "income" | "expense"; amount: string;
  transaction_date: string; description: string | null; vendor_name: string | null; item_description: string | null;
  payment_method: string; reference_no: string | null; source_module: string | null; source_entity_id: string | null; created_at: string;
}

export async function listAccountCategories(institutionId: string, authUserId: string): Promise<AccountCategoryRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AccountCategoryRecord>(
      "select id, name, type from account_categories order by type, name"
    );
    if (rows.length > 0) return rows;
    // Self-heal a sensible starter set on first read (§ self-heal pattern,
    // modules/staff/service.ts's listObservationCriteria()) so a freshly
    // enabled Accounts module isn't a blank "type a category name" screen.
    const defaults: Array<[string, "income" | "expense"]> = [
      ["Fee Collection", "income"], ["Donation", "income"], ["Other Income", "income"],
      ["Salary", "expense"], ["Stationery Purchase", "expense"], ["Maintenance", "expense"], ["Other Expense", "expense"],
    ];
    for (const [name, type] of defaults) {
      await scoped.query(
        "insert into account_categories (institution_id, name, type) values ($1, $2, $3) on conflict (institution_id, name) do nothing",
        [institutionId, name, type]
      );
    }
    const { rows: seeded } = await scoped.query<AccountCategoryRecord>("select id, name, type from account_categories order by type, name");
    return seeded;
  });
}

const createCategorySchema = z.object({ name: z.string().min(1).max(150), type: z.enum(["income", "expense"]) });
export async function createAccountCategory(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createCategorySchema>
): Promise<AccountCategoryRecord> {
  const data = createCategorySchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AccountCategoryRecord>(
      "insert into account_categories (institution_id, name, type) values ($1, $2, $3) returning id, name, type",
      [institutionId, data.name, data.type]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "accounts", entityType: "account_categories", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

const recordTransactionSchema = z.object({
  categoryId: z.string().uuid(),
  type: z.enum(["income", "expense"]),
  amount: z.number().positive(),
  transactionDate: z.string().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  vendorName: z.string().max(200).nullable().optional(),
  itemDescription: z.string().max(500).nullable().optional(),
  paymentMethod: z.enum(["cash", "upi", "bank_transfer", "cheque", "card", "other"]).default("cash"),
  referenceNo: z.string().max(200).nullable().optional(),
});
/** Covers income, expense, AND purchase (an expense with vendor/item
 *  filled in) — "purchase everything will be calculated" (§2). */
export async function recordTransaction(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof recordTransactionSchema>
): Promise<AccountTransactionRow> {
  const data = recordTransactionSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into account_transactions
         (institution_id, category_id, type, amount, transaction_date, description, vendor_name, item_description, payment_method, reference_no, recorded_by)
       values ($1, $2, $3, $4, coalesce($5, current_date), $6, $7, $8, $9, $10, $11)
       returning id`,
      [institutionId, data.categoryId, data.type, data.amount, data.transactionDate ?? null, data.description ?? null,
       data.vendorName ?? null, data.itemDescription ?? null, data.paymentMethod, data.referenceNo ?? null, userId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "accounts", entityType: "account_transactions", entityId: rows[0].id });
    const list = await listTransactionsInternal(scoped, institutionId, { transactionId: rows[0].id });
    return list[0];
  });
}

async function listTransactionsInternal(scoped: import("../../services/db/client").DbClient, institutionId: string, filters: {
  type?: "income" | "expense"; from?: string; to?: string; categoryId?: string; transactionId?: string;
}): Promise<AccountTransactionRow[]> {
  const { rows } = await scoped.query<AccountTransactionRow>(
    `select at.id, at.category_id, ac.name as category_name, at.type, at.amount::text as amount,
            at.transaction_date::text as transaction_date, at.description, at.vendor_name, at.item_description,
            at.payment_method, at.reference_no, at.source_module, at.source_entity_id::text as source_entity_id, at.created_at::text as created_at
       from account_transactions at
       join account_categories ac on ac.id = at.category_id
      where at.institution_id = $1
        and ($2::text is null or at.type = $2)
        and ($3::date is null or at.transaction_date >= $3)
        and ($4::date is null or at.transaction_date <= $4)
        and ($5::uuid is null or at.category_id = $5)
        and ($6::uuid is null or at.id = $6)
      order by at.transaction_date desc, at.created_at desc`,
    [institutionId, filters.type ?? null, filters.from ?? null, filters.to ?? null, filters.categoryId ?? null, filters.transactionId ?? null]
  );
  return rows;
}

export async function listTransactions(institutionId: string, authUserId: string, filters: {
  type?: "income" | "expense"; from?: string; to?: string; categoryId?: string;
} = {}): Promise<AccountTransactionRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, (scoped) => listTransactionsInternal(scoped, institutionId, filters));
}

export async function getAccountsSummary(institutionId: string, authUserId: string, from?: string, to?: string): Promise<{
  totalIncome: string; totalExpense: string; netBalance: string;
  byCategory: Array<{ category_name: string; type: "income" | "expense"; total: string }>;
}> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: totals } = await scoped.query<{ type: "income" | "expense"; total: string }>(
      `select type, coalesce(sum(amount), 0)::text as total
         from account_transactions
        where institution_id = $1 and ($2::date is null or transaction_date >= $2) and ($3::date is null or transaction_date <= $3)
        group by type`,
      [institutionId, from ?? null, to ?? null]
    );
    const totalIncome = Number(totals.find((t) => t.type === "income")?.total ?? 0);
    const totalExpense = Number(totals.find((t) => t.type === "expense")?.total ?? 0);

    const { rows: byCategory } = await scoped.query<{ category_name: string; type: "income" | "expense"; total: string }>(
      `select ac.name as category_name, at.type, coalesce(sum(at.amount), 0)::text as total
         from account_transactions at join account_categories ac on ac.id = at.category_id
        where at.institution_id = $1 and ($2::date is null or at.transaction_date >= $2) and ($3::date is null or at.transaction_date <= $3)
        group by ac.name, at.type
        order by total desc`,
      [institutionId, from ?? null, to ?? null]
    );

    return {
      totalIncome: totalIncome.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      netBalance: (totalIncome - totalExpense).toFixed(2),
      byCategory,
    };
  });
}
