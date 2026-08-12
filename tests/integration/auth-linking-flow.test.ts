/**
 * PROMPT EDU ERP — linkOrResolveAuthenticatedUser() (§AA follow-up, real
 * auth: services/tenant/tenant-service.ts). This is the pure DB-side
 * logic that runs right after a successful AuthService.signIn()/signUp()
 * — it doesn't touch Supabase itself (that round trip can't run against a
 * live project inside this test suite; the manual verification for that
 * half is documented in docs/SETUP.md), only the "does a matching users
 * row exist, and is it safe to link" decision, which is exactly what's
 * worth covering here.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds } from "../../database/scripts/seed";
import { linkOrResolveAuthenticatedUser, resolveUserByAuthId } from "../../services/tenant/tenant-service";

// `users` is intentionally NOT institution-scoped (database/migrations/
// 0001_foundation.sql's own comment on the table) — no institution needs
// to be seeded for these tests, only platform-level roles/permissions.
beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

async function createPendingUser(email: string, fullName: string): Promise<string> {
  const db = await getDbClient();
  const { rows } = await db.query<{ id: string }>(
    `insert into users (email, full_name, preferred_locale) values ($1, $2, 'en') returning id`,
    [email, fullName]
  );
  return rows[0].id;
}

describe("linkOrResolveAuthenticatedUser()", () => {
  it("links a real auth id to a pre-created users row on first sign-in (the 'claim' step)", async () => {
    const userId = await createPendingUser("claimtest@auth-link.example", "Claim Test");
    const freshAuthUserId = crypto.randomUUID();

    const resolved = await linkOrResolveAuthenticatedUser(freshAuthUserId, "claimtest@auth-link.example");
    expect(resolved.userId).toBe(userId);

    // The link persisted — a second call with no email at all still resolves.
    const resolvedAgain = await linkOrResolveAuthenticatedUser(freshAuthUserId, null);
    expect(resolvedAgain.userId).toBe(userId);
  });

  it("matches email case-insensitively", async () => {
    const userId = await createPendingUser("MixedCase@Auth-Link.example", "Mixed Case");
    const freshAuthUserId = crypto.randomUUID();

    const resolved = await linkOrResolveAuthenticatedUser(freshAuthUserId, "mixedcase@auth-link.example");
    expect(resolved.userId).toBe(userId);
  });

  it("refuses to link a second auth id to an already-claimed email", async () => {
    const firstAuthUserId = crypto.randomUUID();
    await createPendingUser("collision@auth-link.example", "Collision Test");
    await linkOrResolveAuthenticatedUser(firstAuthUserId, "collision@auth-link.example");

    const secondAuthUserId = crypto.randomUUID();
    await expect(
      linkOrResolveAuthenticatedUser(secondAuthUserId, "collision@auth-link.example")
    ).rejects.toThrow(/already linked to a different sign-in/);
  });

  it("refuses sign-in for an email with no matching users row at all", async () => {
    const authUserId = crypto.randomUUID();
    await expect(
      linkOrResolveAuthenticatedUser(authUserId, "nobody-provisioned-this@auth-link.example")
    ).rejects.toThrow(/No PROMPT EDU ERP account exists/);
  });

  it("refuses when there is no existing link AND no email to look up by", async () => {
    const authUserId = crypto.randomUUID();
    await expect(linkOrResolveAuthenticatedUser(authUserId, null)).rejects.toThrow(/No PROMPT EDU ERP account exists/);
  });

  it("an already-linked user resolves via resolveUserByAuthId() directly, matching the fast path", async () => {
    const userId = await createPendingUser("fastpath@auth-link.example", "Fast Path");
    const authUserId = crypto.randomUUID();
    await linkOrResolveAuthenticatedUser(authUserId, "fastpath@auth-link.example");

    const direct = await resolveUserByAuthId(authUserId);
    expect(direct?.userId).toBe(userId);
  });
});
