/**
 * PROMPT EDU ERP — Phase D §3 "send a communication to teachers,
 * principals... award flowers or congratulations for teachers and
 * students".
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createStudent, createParent, linkParentToStudent } from "../../modules/students/service";
import { provisionParentPortalAccount } from "../../modules/portal/service";
import {
  sendParentMessage, listMessagesForStaff, replyToParentMessage,
  sendKudos, listKudosForStaff, listKudosForStudent,
} from "../../modules/communication/service";
import { getUnreadNotificationCount } from "../../services/notification/notification-service";

let institutionA: string;
let adminAuth: string, adminUserId: string;
let teacherStaffId: string, teacherUserId: string, teacherAuth: string;
let studentId: string, parentId: string, parentUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "communication-school-a");
  const admin = await seedDemoUser(db, institutionA, "admin@comm-a.example", "Comm Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const teacher = await seedDemoUser(db, institutionA, "teacher@comm-a.example", "Comm Teacher", "teacher");
  teacherAuth = teacher.authUserId; teacherUserId = teacher.userId;
  // Insert the staff row directly against the teacher's own login user
  // (createStaffMember() always provisions a brand-new, login-less user —
  // see home-redesign-flow.test.ts's note on the same tradeoff — but this
  // suite specifically needs listMessagesForStaff()/listKudosForStaff() to
  // resolve against a staff record backed by teacherAuth's real login).
  await db.withInstitutionContext({ institutionId: institutionA, authUserId: adminAuth }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into staff (institution_id, user_id, staff_code, designation, employment_status)
       values ($1, $2, $3, $4, 'active') returning id`,
      [institutionA, teacherUserId, "T-COMM-1", "Class Teacher"]
    );
    teacherStaffId = rows[0].id;
  });

  const student = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "COMM-1", fullName: "Comm Student" });
  studentId = student.id;
  const parent = await createParent(institutionA, adminAuth, adminUserId, { fullName: "Comm Parent" });
  parentId = parent.id;
  await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId, parentId, isPrimaryContact: true });
  const parentAccount = await provisionParentPortalAccount(institutionA, adminAuth, adminUserId, {
    parentId, email: "comm.parent@example.com", fullName: "Comm Parent",
  });
  parentUserId = parentAccount.userId;
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("Parent -> staff messaging (§3)", () => {
  it("sendParentMessage() delivers to the teacher's inbox and notifies them", async () => {
    const unreadBefore = await getUnreadNotificationCount(institutionA, teacherAuth, teacherUserId);

    const { id } = await sendParentMessage(institutionA, adminAuth, adminUserId, {
      parentId, studentId, toUserId: teacherUserId, subject: "Question about homework", body: "Can you clarify today's assignment?",
    });
    expect(id).toBeTruthy();

    const inbox = await listMessagesForStaff(institutionA, teacherAuth, teacherUserId);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].subject).toBe("Question about homework");
    expect(inbox[0].student_name).toBe("Comm Student");
    expect(inbox[0].read_at).toBeNull();

    const unreadAfter = await getUnreadNotificationCount(institutionA, teacherAuth, teacherUserId);
    expect(unreadAfter).toBe(unreadBefore + 1);
  });

  it("replyToParentMessage() notifies the parent", async () => {
    const inbox = await listMessagesForStaff(institutionA, teacherAuth, teacherUserId);
    const unreadBefore = await getUnreadNotificationCount(institutionA, adminAuth, parentUserId);

    await replyToParentMessage(institutionA, teacherAuth, teacherUserId, {
      messageId: inbox[0].id, replyText: "It's on page 42.",
    });

    const inboxAfter = await listMessagesForStaff(institutionA, teacherAuth, teacherUserId);
    expect(inboxAfter[0].reply_text).toBe("It's on page 42.");

    const unreadAfter = await getUnreadNotificationCount(institutionA, adminAuth, parentUserId);
    expect(unreadAfter).toBe(unreadBefore + 1);
  });
});

describe("Kudos (§3 'flowers or congratulations')", () => {
  it("sendKudos() to a teacher shows up on listKudosForStaff()", async () => {
    await sendKudos(institutionA, adminAuth, adminUserId, {
      parentId, toStaffId: teacherStaffId, kind: "flower", message: "Thank you for your patience!",
    });
    const kudos = await listKudosForStaff(institutionA, teacherAuth, teacherStaffId);
    expect(kudos).toHaveLength(1);
    expect(kudos[0].kind).toBe("flower");
    expect(kudos[0].message).toBe("Thank you for your patience!");
  });

  it("sendKudos() to a student shows up on listKudosForStudent()", async () => {
    await sendKudos(institutionA, adminAuth, adminUserId, {
      parentId, toStudentId: studentId, kind: "congratulations", message: "Great exam result!",
    });
    const kudos = await listKudosForStudent(institutionA, adminAuth, studentId);
    expect(kudos).toHaveLength(1);
    expect(kudos[0].kind).toBe("congratulations");
  });

  it("sendKudos() rejects when both/neither target is given", async () => {
    await expect(
      sendKudos(institutionA, adminAuth, adminUserId, { parentId, kind: "flower" })
    ).rejects.toThrow();
    await expect(
      sendKudos(institutionA, adminAuth, adminUserId, { parentId, toStaffId: teacherStaffId, toStudentId: studentId, kind: "flower" })
    ).rejects.toThrow();
  });
});
