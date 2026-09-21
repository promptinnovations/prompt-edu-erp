/**
 * PROMPT EDU ERP — Phase D §1/§2: Fee module + Accounts module (wired
 * together via the Fee->Accounts auto-posting hook).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import {
  createFeeCategory, createFeeStructure, assignFeeStructureToClass, listStudentFeeInvoices,
  recordFeePayment, submitParentFeePayment, listPendingConfirmationPayments, confirmPendingFeePayment,
  getFeeSummary, updateFeePayment, listFeePaymentsForInvoice, listFeePaymentsForInvoices,
} from "../../modules/fees/service";
import { listAccountCategories, createAccountCategory, recordTransaction, listTransactions, getAccountsSummary } from "../../modules/accounts/service";

let institutionA: string;
let adminAuth: string, adminUserId: string;
let classId: string, sectionId: string, yearId: string;
let studentId: string, student2Id: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "fees-accounts-school-a");
  const admin = await seedDemoUser(db, institutionA, "admin@fees-a.example", "Fees Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Grade 7", sortOrder: 1 });
  classId = cls.id;
  const section = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = section.id;
  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  yearId = year!.id;

  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "FA-1", fullName: "Fee Student One" });
  studentId = s1.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId, classId, sectionId, academicYearId: yearId });

  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "FA-2", fullName: "Fee Student Two" });
  student2Id = s2.id;
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: student2Id, classId, sectionId, academicYearId: yearId });
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Fee module (§1)", () => {
  it("createFeeCategory + createFeeStructure + assignFeeStructureToClass generates one invoice per enrolled student", async () => {
    const category = await createFeeCategory(institutionA, adminAuth, adminUserId, { name: "Tuition Fee" });
    const structure = await createFeeStructure(institutionA, adminAuth, adminUserId, {
      feeCategoryId: category.id, academicYearId: yearId, classId, amount: 5000, dueDate: "2026-12-31",
    });
    const result = await assignFeeStructureToClass(institutionA, adminAuth, adminUserId, structure.id);
    expect(result.invoicesCreated).toBe(2);

    const invoices = await listStudentFeeInvoices(institutionA, adminAuth, { classId });
    expect(invoices).toHaveLength(2);
    expect(invoices.every((i) => i.status === "pending")).toBe(true);
    expect(invoices.every((i) => i.amount_due === "5000.00")).toBe(true);

    // Calling assign again is a no-op (idempotent) -- no duplicate invoices.
    const result2 = await assignFeeStructureToClass(institutionA, adminAuth, adminUserId, structure.id);
    expect(result2.invoicesCreated).toBe(0);
  });

  it("recordFeePayment moves an invoice pending -> partial -> paid, and auto-posts to Accounts (§2 wiring)", async () => {
    const invoices = await listStudentFeeInvoices(institutionA, adminAuth, { studentId });
    const invoice = invoices[0];

    await recordFeePayment(institutionA, adminAuth, adminUserId, { invoiceId: invoice.id, amount: 2000, paymentMethod: "cash" });
    const [updated] = await listStudentFeeInvoices(institutionA, adminAuth, { studentId, status: "partial" });
    expect(updated.status).toBe("partial");
    expect(updated.amount_paid).toBe("2000.00");

    await recordFeePayment(institutionA, adminAuth, adminUserId, { invoiceId: invoice.id, amount: 3000, paymentMethod: "upi", referenceNo: "UPI123" });
    const paidList = await listStudentFeeInvoices(institutionA, adminAuth, { studentId, status: "paid" });
    expect(paidList).toHaveLength(1);
    expect(paidList[0].amount_paid).toBe("5000.00");

    // Accounts module is default-enabled (no institution_modules row) -- both
    // confirmed payments should have posted as income transactions.
    const income = await listTransactions(institutionA, adminAuth, { type: "income" });
    const feeIncome = income.filter((t) => t.source_module === "fees");
    expect(feeIncome).toHaveLength(2);
    expect(feeIncome.reduce((sum, t) => sum + Number(t.amount), 0)).toBe(5000);
  });

  it("parent-submitted payment sits pending_confirmation until account staff confirms it (§L.3 pattern)", async () => {
    const invoices = await listStudentFeeInvoices(institutionA, adminAuth, { studentId: student2Id });
    const invoice = invoices[0];

    const submitted = await submitParentFeePayment(institutionA, adminAuth, adminUserId, {
      invoiceId: invoice.id, amount: 1000, paymentMethod: "upi", referenceNo: "PARENT-UPI-1",
    });
    expect(submitted.status).toBe("pending_confirmation");

    // Doesn't move the invoice yet.
    const [stillPending] = await listStudentFeeInvoices(institutionA, adminAuth, { studentId: student2Id, status: "pending" });
    expect(Number(stillPending.amount_paid)).toBe(0);

    const pendingList = await listPendingConfirmationPayments(institutionA, adminAuth);
    expect(pendingList.find((p) => p.id === submitted.id)).toBeTruthy();

    await confirmPendingFeePayment(institutionA, adminAuth, adminUserId, submitted.id, "confirmed");
    const [afterConfirm] = await listStudentFeeInvoices(institutionA, adminAuth, { studentId: student2Id, status: "partial" });
    expect(afterConfirm.amount_paid).toBe("1000.00");

    // And it also posted to Accounts once confirmed.
    const feeIncomeAfter = (await listTransactions(institutionA, adminAuth, { type: "income" })).filter((t) => t.source_entity_id === submitted.id);
    expect(feeIncomeAfter).toHaveLength(1);
  });

  it("getFeeSummary totals due/collected/pending correctly", async () => {
    const summary = await getFeeSummary(institutionA, adminAuth, yearId);
    expect(Number(summary.totalDue)).toBe(10000); // 2 invoices x 5000
    expect(Number(summary.totalCollected)).toBe(6000); // 5000 + 1000 confirmed
    expect(Number(summary.totalPending)).toBe(4000);
  });
});

describe("Fee payment editing (§8 follow-up: admin/accounts can edit a recorded payment)", () => {
  it("editing a confirmed payment's amount updates the invoice status and the linked Accounts transaction in place (no duplicate)", async () => {
    const invoices = await listStudentFeeInvoices(institutionA, adminAuth, { studentId });
    const invoice = invoices[0];
    const payments = await listFeePaymentsForInvoice(institutionA, adminAuth, invoice.id);
    const upiPayment = payments.find((p) => p.reference_no === "UPI123")!;
    expect(upiPayment.status).toBe("confirmed");

    const before = (await listTransactions(institutionA, adminAuth, { type: "income" })).filter((t) => t.source_entity_id === upiPayment.id);
    expect(before).toHaveLength(1);

    // Was 3000 (invoice was fully paid at 2000+3000=5000/5000); dropping it
    // to 2500 should demote the invoice from paid back to partial.
    const updated = await updateFeePayment(institutionA, adminAuth, adminUserId, { id: upiPayment.id, amount: 2500 });
    expect(updated.amount).toBe("2500.00");

    const [afterEdit] = await listStudentFeeInvoices(institutionA, adminAuth, { studentId, status: "partial" });
    expect(afterEdit.amount_paid).toBe("4500.00");

    // Still exactly one Accounts transaction for this payment -- updated in
    // place, not duplicated -- and its amount now matches the edit.
    const after = (await listTransactions(institutionA, adminAuth, { type: "income" })).filter((t) => t.source_entity_id === upiPayment.id);
    expect(after).toHaveLength(1);
    expect(Number(after[0].amount)).toBe(2500);

    // Restore so later assertions in this file aren't affected.
    await updateFeePayment(institutionA, adminAuth, adminUserId, { id: upiPayment.id, amount: 3000 });
    const [restored] = await listStudentFeeInvoices(institutionA, adminAuth, { studentId, status: "paid" });
    expect(restored.amount_paid).toBe("5000.00");
  });

  it("editing a payment still awaiting confirmation updates the row but never touches Accounts", async () => {
    const invoices = await listStudentFeeInvoices(institutionA, adminAuth, { studentId: student2Id });
    const invoice = invoices[0];
    const submitted = await submitParentFeePayment(institutionA, adminAuth, adminUserId, {
      invoiceId: invoice.id, amount: 500, paymentMethod: "upi", referenceNo: "PARENT-UPI-EDIT",
    });

    const updated = await updateFeePayment(institutionA, adminAuth, adminUserId, { id: submitted.id, amount: 600, notes: "Corrected amount before confirming" });
    expect(updated.amount).toBe("600.00");
    expect(updated.status).toBe("pending_confirmation");

    const txns = (await listTransactions(institutionA, adminAuth, { type: "income" })).filter((t) => t.source_entity_id === submitted.id);
    expect(txns).toHaveLength(0);
  });

  it("a rejected payment can't be edited", async () => {
    const invoices = await listStudentFeeInvoices(institutionA, adminAuth, { studentId: student2Id });
    const invoice = invoices[0];
    const submitted = await submitParentFeePayment(institutionA, adminAuth, adminUserId, {
      invoiceId: invoice.id, amount: 200, paymentMethod: "cash",
    });
    await confirmPendingFeePayment(institutionA, adminAuth, adminUserId, submitted.id, "rejected");

    await expect(updateFeePayment(institutionA, adminAuth, adminUserId, { id: submitted.id, amount: 300 }))
      .rejects.toThrow(/rejected payment/i);
  });

  it("listFeePaymentsForInvoices groups payments for multiple invoices in one query", async () => {
    const invoices = await listStudentFeeInvoices(institutionA, adminAuth, {});
    const grouped = await listFeePaymentsForInvoices(institutionA, adminAuth, invoices.map((i) => i.id));
    const invoiceIds = new Set(invoices.map((i) => i.id));
    expect(grouped.length).toBeGreaterThan(0);
    expect(grouped.every((p) => invoiceIds.has(p.invoice_id))).toBe(true);
    expect(await listFeePaymentsForInvoices(institutionA, adminAuth, [])).toEqual([]);
  });
});

describe("Accounts module (§2)", () => {
  it("listAccountCategories self-heals a starter set on first read", async () => {
    const institutionB = await seedDemoInstitution((await getDbClient()), "accounts-school-b");
    const admin = await seedDemoUser(await getDbClient(), institutionB, "admin@accounts-b.example", "Accounts Admin B", "institution_admin");
    const categories = await listAccountCategories(institutionB, admin.authUserId);
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.some((c) => c.type === "income")).toBe(true);
    expect(categories.some((c) => c.type === "expense")).toBe(true);
  });

  it("recordTransaction supports a purchase (expense with vendor/item) and getAccountsSummary nets income vs expense", async () => {
    const expenseCategory = await createAccountCategory(institutionA, adminAuth, adminUserId, { name: "Stationery Purchase Test", type: "expense" });
    await recordTransaction(institutionA, adminAuth, adminUserId, {
      categoryId: expenseCategory.id, type: "expense", amount: 1500,
      vendorName: "ABC Stationers", itemDescription: "Notebooks and pens", paymentMethod: "cash",
    });

    const summary = await getAccountsSummary(institutionA, adminAuth);
    expect(Number(summary.totalExpense)).toBeGreaterThanOrEqual(1500);
    expect(Number(summary.totalIncome)).toBeGreaterThanOrEqual(6000); // from the fee auto-posting above

    const expenses = await listTransactions(institutionA, adminAuth, { type: "expense" });
    const purchase = expenses.find((t) => t.vendor_name === "ABC Stationers");
    expect(purchase?.item_description).toBe("Notebooks and pens");
  });
});
