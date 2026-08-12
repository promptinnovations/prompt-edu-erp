/**
 * PROMPT EDU ERP e2e — the Phase 0 exit-criterion flow itself (§AC
 * "Login → Institution → Dashboard → Create class → Create section → Create
 * subject → Add student → View student"), driven through the real forms
 * (app/(institution)/academic/*, app/(institution)/students/*) rather than
 * the service layer directly (already covered exhaustively by
 * tests/integration/foundation-flow.test.ts).
 */
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@badrudhuja.example";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("creates a class, section, and subject from the Academic Setup page", async ({ page }) => {
  const suffix = Date.now();
  const className = `E2E Grade ${suffix}`;
  const sectionName = `E2E Section ${suffix}`;
  const subjectName = `E2E Subject ${suffix}`;

  await page.goto("/academic");

  await page.getByLabel("Class name").fill(className);
  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByText(className)).toBeVisible();

  await page.getByLabel("Select class").selectOption({ label: className });
  await page.getByLabel("Section name").fill(sectionName);
  await page.getByRole("button", { name: "Add" }).nth(1).click();
  await expect(page.getByText(`${className} — ${sectionName}`)).toBeVisible();

  await page.getByLabel("Subject name").fill(subjectName);
  await page.getByRole("button", { name: "Add" }).nth(2).click();
  await expect(page.getByText(subjectName)).toBeVisible();
});

test("adds a student and views their detail page", async ({ page }) => {
  const suffix = Date.now();
  const admissionNumber = `E2E-${suffix}`;
  const fullName = `E2E Test Student ${suffix}`;

  await page.goto("/students");
  await page.getByLabel("Admission number").fill(admissionNumber);
  await page.getByLabel("Full name").fill(fullName);
  await page.getByRole("button", { name: "Add student" }).click();

  const row = page.getByRole("row", { name: new RegExp(admissionNumber) });
  await expect(row).toBeVisible();

  await row.getByRole("link", { name: "View" }).click();
  await expect(page).toHaveURL(/\/students\/[^/]+$/);
  await expect(page.getByText(fullName)).toBeVisible();
});
