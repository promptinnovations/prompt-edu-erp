/**
 * PROMPT EDU ERP — Task #415: staff daily attendance, two ways — "each
 * staff mark own attendance and principal approve it, or principal himself
 * mark staff attendance" (migration 0042, modules/staff/service.ts).
 *
 * markOwnStaffAttendance() always writes approval_status='pending';
 * markStaffAttendance() (the existing principal/admin bulk-grid path)
 * always writes approval_status='approved' — which is also how a pending
 * self-marked row gets approved, since the grid resubmits every visible
 * row on Save.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { listAttendanceStatuses } from "../../modules/attendance/service";
import {
  createStaffMember, getStaffAttendanceGrid, markStaffAttendance,
  markOwnStaffAttendance, getOwnStaffAttendanceToday,
} from "../../modules/staff/service";

let institutionA: string;
let adminAuth: string, adminUserId: string;
let staffId: string;
let presentStatusId: string, absentStatusId: string;
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "self-attend-school-a");
  const admin = await seedDemoUser(db, institutionA, "admin@self-attend-a.example", "Self Attend Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const statuses = await listAttendanceStatuses(institutionA, adminAuth);
  presentStatusId = statuses.find((s) => s.counts_as_present)!.id;
  absentStatusId = statuses.find((s) => !s.counts_as_present)!.id;

  const staff = await createStaffMember(institutionA, adminAuth, adminUserId, {
    email: "selfmark@self-attend-a.example", fullName: "Self Marking Teacher", staffCode: "SM-001",
    designation: "Teacher", department: "Academics", joiningDate: "2021-06-01",
    employmentStatus: "active", roleCode: "teacher",
  });
  staffId = staff.id;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Staff self-mark attendance (§415, approval_status)", () => {
  it("getOwnStaffAttendanceToday() returns null before anything is marked", async () => {
    const own = await getOwnStaffAttendanceToday(institutionA, adminAuth, staffId);
    expect(own).toBeNull();
  });

  it("markOwnStaffAttendance() writes approval_status='pending'", async () => {
    await markOwnStaffAttendance(institutionA, adminAuth, adminUserId, {
      staffId, date: today, statusId: presentStatusId,
    });
    const own = await getOwnStaffAttendanceToday(institutionA, adminAuth, staffId);
    expect(own?.approval_status).toBe("pending");
    expect(own?.status_id).toBe(presentStatusId);
  });

  it("markOwnStaffAttendance() rejects a date other than today", async () => {
    await expect(
      markOwnStaffAttendance(institutionA, adminAuth, adminUserId, {
        staffId, date: "2020-01-01", statusId: presentStatusId,
      })
    ).rejects.toThrow(/only mark today's attendance/);
  });

  it("the staff attendance grid (principal view) shows the pending self-marked row", async () => {
    const grid = await getStaffAttendanceGrid(institutionA, adminAuth, today);
    const row = grid.find((r) => r.staff_id === staffId);
    expect(row?.approval_status).toBe("pending");
    expect(row?.status_id).toBe(presentStatusId);
  });

  it("markStaffAttendance() (principal Save) approves the pending row — 'principal approve it'", async () => {
    await markStaffAttendance(institutionA, adminAuth, adminUserId, {
      date: today, entries: [{ staffId, statusId: presentStatusId }],
    });
    const own = await getOwnStaffAttendanceToday(institutionA, adminAuth, staffId);
    expect(own?.approval_status).toBe("approved");

    const grid = await getStaffAttendanceGrid(institutionA, adminAuth, today);
    const row = grid.find((r) => r.staff_id === staffId);
    expect(row?.approval_status).toBe("approved");
  });

  it("markStaffAttendance() (principal marks directly, no prior self-mark) also lands as 'approved' — 'principal himself mark staff attendance'", async () => {
    const staff2 = await createStaffMember(institutionA, adminAuth, adminUserId, {
      email: "principalmarked@self-attend-a.example", fullName: "Principal Marked Teacher", staffCode: "PM-001",
      designation: "Teacher", department: "Academics", joiningDate: "2021-06-01",
      employmentStatus: "active", roleCode: "teacher",
    });
    await markStaffAttendance(institutionA, adminAuth, adminUserId, {
      date: today, entries: [{ staffId: staff2.id, statusId: absentStatusId }],
    });
    const grid = await getStaffAttendanceGrid(institutionA, adminAuth, today);
    const row = grid.find((r) => r.staff_id === staff2.id);
    expect(row?.approval_status).toBe("approved");
    expect(row?.status_id).toBe(absentStatusId);
  });

  it("markOwnStaffAttendance() can update a still-pending mark before approval", async () => {
    const staff3 = await createStaffMember(institutionA, adminAuth, adminUserId, {
      email: "updateself@self-attend-a.example", fullName: "Update Self Teacher", staffCode: "US-001",
      designation: "Teacher", department: "Academics", joiningDate: "2021-06-01",
      employmentStatus: "active", roleCode: "teacher",
    });
    await markOwnStaffAttendance(institutionA, adminAuth, adminUserId, { staffId: staff3.id, date: today, statusId: absentStatusId });
    await markOwnStaffAttendance(institutionA, adminAuth, adminUserId, { staffId: staff3.id, date: today, statusId: presentStatusId });
    const own = await getOwnStaffAttendanceToday(institutionA, adminAuth, staff3.id);
    expect(own?.status_id).toBe(presentStatusId);
    expect(own?.approval_status).toBe("pending");
  });
});
