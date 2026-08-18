/**
 * PROMPT EDU ERP — User/role management flow. Proves: an institution admin
 * can create a REAL, immediately-usable login (§137 follow-up: "add and
 * show current password of each user" — no more claimable/self-signup
 * placeholder, see user-management-service.ts's own header comment) and
 * assign it MULTIPLE roles in one call, multi-role assignment is preserved
 * and independently editable afterward (add + remove in the same call),
 * unknown role codes are rejected before any write happens (atomic — no
 * partial user), duplicate emails are rejected with a clear error (not a
 * raw constraint-violation leak), the current password is visible and
 * resettable via setUserPassword(), a caller can never modify their own
 * role assignments or deactivate themselves, and deactivating a membership
 * genuinely blocks resolveActiveInstitution() from resolving that
 * institution for them (real access removal, not a cosmetic flag) while
 * reactivating restores it.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { resolveActiveInstitution } from "../../services/tenant/tenant-service";
import {
  listInstitutionRoles, listInstitutionUsers, createInstitutionUser, updateUserRoles, setUserMembershipStatus, setUserPassword,
} from "../../services/users/user-management-service";

let institutionId: string;
let adminAuth: string, adminUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionId = await seedDemoInstitution(db, "um-school");
  const admin = await seedDemoUser(db, institutionId, "admin@um-school.example", "UM Institution Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
});

describe("listInstitutionRoles", () => {
  it("returns the system roles seeded for this institution", async () => {
    const roles = await listInstitutionRoles(institutionId, adminAuth);
    const codes = roles.map((r) => r.code).sort();
    expect(codes).toEqual(
      ["institution_admin", "librarian", "management", "parent", "staff", "student", "teacher"].sort()
    );
  });
});

describe("createInstitutionUser — multi-role login generation", () => {
  it("creates a real, immediately-usable login with two roles at once, password visible", async () => {
    const { userId } = await createInstitutionUser(institutionId, adminAuth, adminUserId, {
      email: "multi-role@um-school.example",
      fullName: "Multi Role Person",
      password: "startpass1",
      roleCodes: ["teacher", "librarian"],
    });
    expect(userId).toBeTruthy();

    const users = await listInstitutionUsers(institutionId, adminAuth);
    const created = users.find((u) => u.userId === userId);
    expect(created).toBeTruthy();
    expect(created!.isClaimed).toBe(true); // real auth account created up front, no separate "sign up yourself" step
    expect(created!.currentPassword).toBe("startpass1");
    expect(created!.membershipStatus).toBe("active");
    expect(created!.roleCodes.sort()).toEqual(["librarian", "teacher"].sort());
  });

  it("rejects an unknown role code and creates nothing (atomic — no partial user, no orphaned auth account)", async () => {
    await expect(
      createInstitutionUser(institutionId, adminAuth, adminUserId, {
        email: "bad-role@um-school.example",
        fullName: "Bad Role Person",
        password: "startpass1",
        roleCodes: ["teacher", "not-a-real-role"],
      })
    ).rejects.toThrow(/Unknown role code/);

    const users = await listInstitutionUsers(institutionId, adminAuth);
    expect(users.find((u) => u.email === "bad-role@um-school.example")).toBeUndefined();
  });

  it("rejects a duplicate email with a clear error, not a raw DB error", async () => {
    await expect(
      createInstitutionUser(institutionId, adminAuth, adminUserId, {
        email: "multi-role@um-school.example", // already created above
        fullName: "Duplicate Attempt",
        password: "startpass1",
        roleCodes: ["teacher"],
      })
    ).rejects.toThrow(/already exists/);
  });

  it("an already-claimed account (real signup) shows isClaimed=true", async () => {
    // seedDemoUser (no claimable flag) gives a real, non-null authUserId —
    // exactly what a genuine Supabase Auth sign-up would leave behind.
    await seedDemoUser((await getDbClient()), institutionId, "already-claimed@um-school.example", "Already Claimed", "teacher");
    const users = await listInstitutionUsers(institutionId, adminAuth);
    const claimed = users.find((u) => u.email === "already-claimed@um-school.example");
    expect(claimed?.isClaimed).toBe(true);
  });
});

describe("setUserPassword — view/reset a login's current password", () => {
  it("resets an existing login's password and it's reflected in listInstitutionUsers", async () => {
    const { userId } = await createInstitutionUser(institutionId, adminAuth, adminUserId, {
      email: "reset-me@um-school.example",
      fullName: "Reset Me",
      password: "original1",
      roleCodes: ["teacher"],
    });

    await setUserPassword(institutionId, adminAuth, adminUserId, userId, { password: "newpass99" });

    const users = await listInstitutionUsers(institutionId, adminAuth);
    expect(users.find((u) => u.userId === userId)!.currentPassword).toBe("newpass99");
  });
});

describe("updateUserRoles — replaces the full role set", () => {
  it("can add and remove roles in the same call", async () => {
    const { userId } = await createInstitutionUser(institutionId, adminAuth, adminUserId, {
      email: "role-swap@um-school.example",
      fullName: "Role Swap Person",
      password: "startpass1",
      roleCodes: ["teacher"],
    });

    await updateUserRoles(institutionId, adminAuth, adminUserId, userId, { roleCodes: ["librarian", "management"] });

    const users = await listInstitutionUsers(institutionId, adminAuth);
    const updated = users.find((u) => u.userId === userId);
    expect(updated!.roleCodes.sort()).toEqual(["librarian", "management"].sort());
  });

  it("can clear all roles by passing an empty list", async () => {
    const { userId } = await createInstitutionUser(institutionId, adminAuth, adminUserId, {
      email: "clear-roles@um-school.example",
      fullName: "Clear Roles Person",
      password: "startpass1",
      roleCodes: ["teacher"],
    });
    await updateUserRoles(institutionId, adminAuth, adminUserId, userId, { roleCodes: [] });
    const users = await listInstitutionUsers(institutionId, adminAuth);
    expect(users.find((u) => u.userId === userId)!.roleCodes).toEqual([]);
  });

  it("rejects an unknown role code", async () => {
    const { userId } = await createInstitutionUser(institutionId, adminAuth, adminUserId, {
      email: "role-unknown@um-school.example",
      fullName: "Role Unknown Person",
      password: "startpass1",
      roleCodes: ["teacher"],
    });
    await expect(
      updateUserRoles(institutionId, adminAuth, adminUserId, userId, { roleCodes: ["not-a-real-role"] })
    ).rejects.toThrow(/Unknown role code/);
  });

  it("refuses to let a caller change their own role assignments", async () => {
    await expect(
      updateUserRoles(institutionId, adminAuth, adminUserId, adminUserId, { roleCodes: ["teacher"] })
    ).rejects.toThrow(/your own role assignments/);
  });
});

describe("setUserMembershipStatus — deactivation actually removes access", () => {
  it("deactivating blocks resolveActiveInstitution from resolving this institution for them", async () => {
    const { userId } = await createInstitutionUser(institutionId, adminAuth, adminUserId, {
      email: "deactivate-me@um-school.example",
      fullName: "Deactivate Me",
      password: "startpass1",
      roleCodes: ["teacher"],
    });
    // Simulate this account being claimed for real (same shape as a real Supabase sign-up).
    const db = await getDbClient();
    const fakeAuthId = crypto.randomUUID();
    await db.query("update users set auth_user_id = $1 where id = $2", [fakeAuthId, userId]);

    const activeBefore = await resolveActiveInstitution(fakeAuthId, userId, null);
    expect(activeBefore?.institutionId).toBe(institutionId);

    await setUserMembershipStatus(institutionId, adminAuth, adminUserId, userId, { status: "inactive" });
    const activeAfter = await resolveActiveInstitution(fakeAuthId, userId, null);
    expect(activeAfter).toBeNull();

    await setUserMembershipStatus(institutionId, adminAuth, adminUserId, userId, { status: "active" });
    const activeRestored = await resolveActiveInstitution(fakeAuthId, userId, null);
    expect(activeRestored?.institutionId).toBe(institutionId);
  });

  it("refuses to let a caller deactivate their own account", async () => {
    await expect(
      setUserMembershipStatus(institutionId, adminAuth, adminUserId, adminUserId, { status: "inactive" })
    ).rejects.toThrow(/your own account/);
  });
});
