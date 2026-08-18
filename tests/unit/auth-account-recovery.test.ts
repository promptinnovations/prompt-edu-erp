/**
 * PROMPT EDU ERP — unit test for createOrRecoverAuthAccount() (services/
 * users/user-management-service.ts), the fix for a real production bug:
 * "Could not create the login (A user with this email address has already
 * been registered)" when trying to set a password for a still-claimable
 * ("Not signed up yet") Users & Roles row whose email already had a real,
 * orphaned Supabase Auth account from an old self-service sign-up attempt.
 *
 * Uses a stub AuthService (not PGlite/dev-auth-provider) since the bug is
 * specifically about how the real SupabaseAuthProvider's adminCreateUser()
 * behaves on a duplicate email — dev auth is deliberately passwordless and
 * never reports that error, so it can't reproduce or verify this path.
 */
import { describe, expect, it, vi } from "vitest";
import { createOrRecoverAuthAccount } from "../../services/users/user-management-service";
import type { AuthService } from "../../services/auth/auth-service";

function makeStubAuthService(overrides: Partial<AuthService>): AuthService {
  return {
    getSession: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    adminCreateUser: vi.fn(),
    adminUpdatePassword: vi.fn(),
    adminDeleteUser: vi.fn(),
    adminFindUserByEmail: vi.fn(),
    ...overrides,
  } as AuthService;
}

describe("createOrRecoverAuthAccount", () => {
  it("returns the new account, wasCreated=true, on a normal successful create", async () => {
    const auth = makeStubAuthService({
      adminCreateUser: vi.fn().mockResolvedValue({ authUserId: "new-id", email: "a@example.com" }),
    });
    const result = await createOrRecoverAuthAccount(auth, "a@example.com", "pass1234");
    expect(result).toEqual({ authUserId: "new-id", wasCreated: true });
    expect(auth.adminFindUserByEmail).not.toHaveBeenCalled();
  });

  it("recovers an orphaned account on 'already been registered', sets its password, wasCreated=false", async () => {
    const auth = makeStubAuthService({
      adminCreateUser: vi.fn().mockResolvedValue({ error: "A user with this email address has already been registered" }),
      adminFindUserByEmail: vi.fn().mockResolvedValue({ authUserId: "orphan-id", email: "b@example.com" }),
      adminUpdatePassword: vi.fn().mockResolvedValue(undefined),
    });
    const result = await createOrRecoverAuthAccount(auth, "b@example.com", "newpass1");
    expect(result).toEqual({ authUserId: "orphan-id", wasCreated: false });
    expect(auth.adminUpdatePassword).toHaveBeenCalledWith("orphan-id", "newpass1");
  });

  it("throws if the duplicate account can't actually be found (genuinely inconsistent state)", async () => {
    const auth = makeStubAuthService({
      adminCreateUser: vi.fn().mockResolvedValue({ error: "A user with this email address has already been registered" }),
      adminFindUserByEmail: vi.fn().mockResolvedValue(null),
    });
    await expect(createOrRecoverAuthAccount(auth, "c@example.com", "pass1234")).rejects.toThrow(/Could not create the login/);
  });

  it("throws immediately on an unrelated creation error (does not attempt recovery)", async () => {
    const auth = makeStubAuthService({
      adminCreateUser: vi.fn().mockResolvedValue({ error: "Password should be at least 6 characters" }),
    });
    await expect(createOrRecoverAuthAccount(auth, "d@example.com", "abc")).rejects.toThrow(/Could not create the login/);
    expect(auth.adminFindUserByEmail).not.toHaveBeenCalled();
  });

  it("throws a clear error if the recovered account's password can't be set", async () => {
    const auth = makeStubAuthService({
      adminCreateUser: vi.fn().mockResolvedValue({ error: "already been registered" }),
      adminFindUserByEmail: vi.fn().mockResolvedValue({ authUserId: "orphan-id", email: "e@example.com" }),
      adminUpdatePassword: vi.fn().mockResolvedValue({ error: "rate limited" }),
    });
    await expect(createOrRecoverAuthAccount(auth, "e@example.com", "pass1234")).rejects.toThrow(/could not set its password/);
  });
});
