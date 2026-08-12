/**
 * PROMPT EDU ERP e2e — login/sign-out, against the real /login page and
 * server actions (services/auth/dev-auth-provider.ts, app/(auth)/login/
 * actions.ts), using the demo institution admin seeded by global-setup.ts.
 */
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@badrudhuja.example";

test.describe("Login", () => {
  test("shows an error for an email with no matching account", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody-provisioned@nowhere.example");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/No PROMPT EDU ERP user found/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("signs in with a seeded demo account and reaches the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(/Institution:/)).toBeVisible();
  });

  test("an unauthenticated visit to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signing out returns to /login and re-blocks the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
