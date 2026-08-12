/**
 * PROMPT EDU ERP e2e — locale switcher (app/(institution)/layout.tsx's
 * `setLocaleAction` form), only rendered when an institution has more than
 * one enabled UI language. Demo institution seed enables both en/ml — see
 * database/scripts/seed.ts's seedDemoInstitution() — but this test stays
 * defensive and skips itself if that ever changes, rather than asserting on
 * an implementation detail of the seed data.
 */
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@badrudhuja.example";

test("switching the language updates nav labels", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const languageSelect = page.getByLabel("Language");
  const count = await languageSelect.count();
  test.skip(count === 0, "Only one UI language enabled for this institution — switcher not rendered.");

  await expect(page.getByRole("link", { name: "Students" })).toBeVisible();
  await languageSelect.selectOption("ml");
  await page.getByRole("button", { name: "Go" }).click();

  await expect(page.getByRole("link", { name: "വിദ്യാർത്ഥികൾ" })).toBeVisible();
});
