/**
 * PROMPT EDU ERP — Communication flow (ARCHITECTURE.md §D.13, §G.4, §R.4,
 * Phase 15): announcement publish + audience resolution ("all" / "role"),
 * the core NotificationService's fan-out (in-app always, email honestly
 * marked 'skipped' with no SMTP provider configured), ownership-scoped
 * notification reads, the reviewLeaveApplication() -> notifyUser() hook
 * proving the service generalizes beyond announcements, permission
 * boundaries, and tenant isolation on migration 0017's tables.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";
delete process.env.SMTP_HOST; // this suite asserts the no-SMTP-configured fallback behavior

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, requirePermission } from "../../services/permissions/permission-service";
import { publishAnnouncement, listAnnouncements } from "../../modules/announcements/service";
import {
  notifyUser, listMyNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead,
} from "../../services/notification/notification-service";
import { getEmailProvider } from "../../services/notification/email-provider";
import { applyForLeave, reviewLeaveApplication } from "../../modules/attendance/service";
import { createStaffMember } from "../../modules/staff/service";

let institutionA: string;
let institutionB: string;
let adminAuth: string, adminUserId: string;
let teacherAuth: string, teacherUserId: string;
let managementAuth: string, managementUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "comm-school-a");
  institutionB = await seedDemoInstitution(db, "comm-school-b");

  const admin = await seedDemoUser(db, institutionA, "admin@comm-a.example", "Comm Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const teacher = await seedDemoUser(db, institutionA, "teacher@comm-a.example", "Comm Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;
  const management = await seedDemoUser(db, institutionA, "mgmt@comm-a.example", "Comm Management", "management");
  managementAuth = management.authUserId; managementUserId = management.userId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("EmailProvider selection (§R.4)", () => {
  it("falls back to the console provider when SMTP_HOST is not configured", () => {
    const provider = getEmailProvider();
    expect(provider.isConfigured).toBe(false);
  });
});

describe("notifyUser() (core NotificationService, §G.4)", () => {
  it("always creates a 'sent' in_app row, and an honestly-'skipped' email row with no SMTP configured", async () => {
    await notifyUser(institutionA, adminAuth, teacherUserId, {
      type: "test", title: "Direct notify test", body: "Hello",
    });
    const inbox = await listMyNotifications(institutionA, teacherAuth, teacherUserId);
    const found = inbox.find((n) => n.title === "Direct notify test");
    expect(found).toBeTruthy();
    expect(found!.status).toBe("sent"); // in_app is the only channel listMyNotifications() surfaces

    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      const { rows } = await scoped.query<{ channel: string; status: string }>(
        "select channel, status from notifications where user_id = $1 and title = 'Direct notify test' order by channel",
        [teacherUserId]
      );
      const byChannel = Object.fromEntries(rows.map((r) => [r.channel, r.status]));
      expect(byChannel.in_app).toBe("sent");
      expect(byChannel.email).toBe("skipped"); // no SMTP_HOST -> honestly marked, not silently "sent"
    });
  });

  it("sms/whatsapp/push channels are schema-ready but always 'skipped' (no provider built yet)", async () => {
    await notifyUser(institutionA, adminAuth, teacherUserId, {
      type: "test", title: "Multi-channel test", body: "Hi", channels: ["sms", "whatsapp", "push"],
    });
    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
      const { rows } = await scoped.query<{ status: string }>(
        "select status from notifications where user_id = $1 and title = 'Multi-channel test'",
        [teacherUserId]
      );
      expect(rows.every((r) => r.status === "skipped")).toBe(true);
      expect(rows).toHaveLength(3);
    });
  });
});

describe("Notification ownership scoping (§X, application-layer gate)", () => {
  it("a user only ever sees their OWN notifications, never another user's", async () => {
    await notifyUser(institutionA, adminAuth, teacherUserId, { type: "test", title: "Only for teacher", body: "..." });
    const teacherInbox = await listMyNotifications(institutionA, teacherAuth, teacherUserId);
    expect(teacherInbox.some((n) => n.title === "Only for teacher")).toBe(true);

    const adminInbox = await listMyNotifications(institutionA, adminAuth, adminUserId);
    expect(adminInbox.some((n) => n.title === "Only for teacher")).toBe(false);
  });

  it("unread count and mark-read/mark-all-read only affect the caller's own rows", async () => {
    const before = await getUnreadNotificationCount(institutionA, teacherAuth, teacherUserId);
    await notifyUser(institutionA, adminAuth, teacherUserId, { type: "test", title: "Unread test", body: "..." });
    const after = await getUnreadNotificationCount(institutionA, teacherAuth, teacherUserId);
    expect(after).toBe(before + 1);

    const inbox = await listMyNotifications(institutionA, teacherAuth, teacherUserId);
    const target = inbox.find((n) => n.title === "Unread test")!;

    // admin cannot mark the teacher's notification read by guessing its id
    await markNotificationRead(institutionA, adminAuth, adminUserId, target.id);
    const stillUnread = await listMyNotifications(institutionA, teacherAuth, teacherUserId, { unreadOnly: true });
    expect(stillUnread.some((n) => n.id === target.id)).toBe(true);

    await markNotificationRead(institutionA, teacherAuth, teacherUserId, target.id);
    const nowRead = await listMyNotifications(institutionA, teacherAuth, teacherUserId, { unreadOnly: true });
    expect(nowRead.some((n) => n.id === target.id)).toBe(false);

    await notifyUser(institutionA, adminAuth, teacherUserId, { type: "test", title: "Another unread", body: "..." });
    await markAllNotificationsRead(institutionA, teacherAuth, teacherUserId);
    expect(await getUnreadNotificationCount(institutionA, teacherAuth, teacherUserId)).toBe(0);
  });
});

describe("Announcements: audience resolution + fan-out (§D.13)", () => {
  it('audience {type:"all"} notifies every active institution member', async () => {
    const result = await publishAnnouncement(institutionA, adminAuth, adminUserId, {
      title: "School closed Friday", body: "Due to weather.", audience: { type: "all" },
    });
    expect(result.notifiedCount).toBeGreaterThanOrEqual(3); // admin, teacher, management (at least)

    const teacherInbox = await listMyNotifications(institutionA, teacherAuth, teacherUserId);
    expect(teacherInbox.some((n) => n.title === "School closed Friday")).toBe(true);
    const managementInbox = await listMyNotifications(institutionA, managementAuth, managementUserId);
    expect(managementInbox.some((n) => n.title === "School closed Friday")).toBe(true);
  });

  it('audience {type:"role"} notifies only members of the given role(s)', async () => {
    await publishAnnouncement(institutionA, adminAuth, adminUserId, {
      title: "Management meeting at 4pm", body: "Room 2.", audience: { type: "role", roleCodes: ["management"] },
    });
    const managementInbox = await listMyNotifications(institutionA, managementAuth, managementUserId);
    expect(managementInbox.some((n) => n.title === "Management meeting at 4pm")).toBe(true);
    const teacherInbox = await listMyNotifications(institutionA, teacherAuth, teacherUserId);
    expect(teacherInbox.some((n) => n.title === "Management meeting at 4pm")).toBe(false);
  });

  it("listAnnouncements() returns published announcements newest first", async () => {
    const list = await listAnnouncements(institutionA, adminAuth);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].published_at >= list[list.length - 1].published_at).toBe(true);
  });
});

describe("NotificationService generalizing beyond announcements: leave review hook", () => {
  it("approving a staff leave application notifies the staff member's linked user account", async () => {
    const staffMember = await createStaffMember(institutionA, adminAuth, adminUserId, {
      email: "leavestaff@comm-a.example", fullName: "Leave Staff", staffCode: "LV-01", employmentStatus: "active",
    });
    const staffAuth = await seedDemoUser(await getDbClient(), institutionA, "leavestaff@comm-a.example", "Leave Staff").then((u) => u.authUserId);

    const leave = await applyForLeave(institutionA, adminAuth, adminUserId, {
      applicantType: "staff", applicantId: staffMember.id, startDate: "2026-09-01", endDate: "2026-09-02", reason: "Personal",
    });
    await reviewLeaveApplication(institutionA, adminAuth, adminUserId, leave.id, "approved");

    const inbox = await listMyNotifications(institutionA, staffAuth, staffMember.user_id);
    expect(inbox.some((n) => n.type === "leave_reviewed" && n.title.includes("approved"))).toBe(true);
  });
});

describe("Permission boundaries (§F.3)", () => {
  it("teacher lacks announcements.publish but has announcements.view", async () => {
    const teacherPerms = await getPermissionsForUser(teacherAuth, teacherUserId, institutionA);
    expect(() => requirePermission(teacherPerms, "announcements.publish")).toThrow(/Forbidden/);
    expect(() => requirePermission(teacherPerms, "announcements.view")).not.toThrow();

    const adminPerms = await getPermissionsForUser(adminAuth, adminUserId, institutionA);
    expect(() => requirePermission(adminPerms, "announcements.publish")).not.toThrow();
  });
});

describe("Tenant isolation (§E, extended to migration 0017)", () => {
  it("Institution B never sees Institution A's announcements or notifications", async () => {
    const db = await getDbClient();
    const adminB = await seedDemoUser(db, institutionB, "admin@comm-b.example", "Comm B Admin");
    const announcementsB = await listAnnouncements(institutionB, adminB.authUserId);
    expect(announcementsB).toHaveLength(0);

    await db.withInstitutionContext({ institutionId: institutionB, authUserId: adminB.authUserId }, async (scoped) => {
      const rows = await scoped.query("select id from announcements where institution_id = $1", [institutionA]);
      expect(rows.rows).toHaveLength(0);
      const notifRows = await scoped.query("select id from notifications where institution_id = $1", [institutionA]);
      expect(notifRows.rows).toHaveLength(0);
    });
  });
});
