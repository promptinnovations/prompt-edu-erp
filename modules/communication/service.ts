/**
 * PROMPT EDU ERP — Parent-portal communication (Phase D §3 "send a
 * communication to teachers, principals. they also can award flowers or
 * congratulations for teachers and students for performance - it will be
 * shown in their respective portals").
 *
 * sendParentMessage(): one-way parent -> staff message, delivered via the
 * existing notifyUser() (in-app + email, same as every other notification
 * in this app) rather than a bespoke inbox/threading system — staff see it
 * via the notification bell immediately, and also via listMessagesForStaff()
 * below for the fuller "who sent this, about which child" context. A single
 * optional reply is supported (replyToParentMessage()), not a full thread.
 *
 * sendKudos(): a parent awarding a flower/congratulations to a teacher or
 * their own child, shown on that person's own profile/portal
 * (listKudosForStaff()/listKudosForStudent()) — see migration
 * 0047_parent_communication.sql's header comment for the to_staff_id XOR
 * to_student_id + "own child only for student kudos" design rationale.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { notifyUser } from "../../services/notification/notification-service";

export interface ParentMessageRow {
  id: string; from_parent_id: string; parent_name: string; about_student_id: string | null; student_name: string | null;
  to_user_id: string; subject: string; body: string; reply_text: string | null; replied_at: string | null;
  read_at: string | null; created_at: string;
}

const sendMessageSchema = z.object({
  parentId: z.string().uuid(),
  studentId: z.string().uuid().nullable().optional(),
  toUserId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
});
export async function sendParentMessage(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof sendMessageSchema>
): Promise<{ id: string }> {
  const data = sendMessageSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into parent_messages (institution_id, from_parent_id, about_student_id, to_user_id, subject, body)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [institutionId, data.parentId, data.studentId ?? null, data.toUserId, data.subject, data.body]
    );
    await notifyUser(institutionId, authUserId, data.toUserId, {
      type: "parent_message", title: `Message from a parent: ${data.subject}`, body: data.body,
      relatedEntityType: "parent_messages", relatedEntityId: rows[0].id,
    }, scoped);
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "communication", entityType: "parent_messages", entityId: rows[0].id });
    return rows[0];
  });
}

export async function listMessagesForStaff(institutionId: string, authUserId: string, staffUserId: string): Promise<ParentMessageRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ParentMessageRow>(
      `select pm.id, pm.from_parent_id, p.full_name as parent_name, pm.about_student_id, s.full_name as student_name,
              pm.to_user_id, pm.subject, pm.body, pm.reply_text, pm.replied_at::text as replied_at,
              pm.read_at::text as read_at, pm.created_at::text as created_at
         from parent_messages pm
         join parents p on p.id = pm.from_parent_id
         left join students s on s.id = pm.about_student_id
        where pm.institution_id = $1 and pm.to_user_id = $2
        order by pm.created_at desc`,
      [institutionId, staffUserId]
    );
    return rows;
  });
}

export async function markMessageRead(institutionId: string, authUserId: string, messageId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query("update parent_messages set read_at = now() where id = $1 and read_at is null", [messageId]);
  });
}

const replySchema = z.object({ messageId: z.string().uuid(), replyText: z.string().min(1).max(4000) });
export async function replyToParentMessage(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof replySchema>
): Promise<void> {
  const data = replySchema.parse(input);
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ from_parent_id: string; subject: string }>(
      "update parent_messages set reply_text = $2, replied_at = now(), read_at = coalesce(read_at, now()) where id = $1 returning from_parent_id, subject",
      [data.messageId, data.replyText]
    );
    if (!rows[0]) throw new Error("Message not found.");
    const { rows: parentUser } = await scoped.query<{ user_id: string | null }>("select user_id from parents where id = $1", [rows[0].from_parent_id]);
    if (parentUser[0]?.user_id) {
      await notifyUser(institutionId, authUserId, parentUser[0].user_id, {
        type: "parent_message_reply", title: `Reply: ${rows[0].subject}`, body: data.replyText,
        relatedEntityType: "parent_messages", relatedEntityId: data.messageId,
      }, scoped);
    }
    await recordAudit(scoped, { institutionId, userId, action: "reply", module: "communication", entityType: "parent_messages", entityId: data.messageId });
  });
}

// ---------------------------------------------------------------------------
// Kudos ("flowers or congratulations")
// ---------------------------------------------------------------------------
export interface KudosRow {
  id: string; from_parent_id: string; parent_name: string; kind: "flower" | "congratulations"; message: string | null; created_at: string;
}

const sendKudosSchema = z.object({
  parentId: z.string().uuid(),
  toStaffId: z.string().uuid().nullable().optional(),
  toStudentId: z.string().uuid().nullable().optional(),
  kind: z.enum(["flower", "congratulations"]),
  message: z.string().max(500).nullable().optional(),
}).refine((d) => (!!d.toStaffId) !== (!!d.toStudentId), { message: "Kudos must go to exactly one teacher or student." });
export async function sendKudos(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof sendKudosSchema>
): Promise<{ id: string }> {
  const data = sendKudosSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into kudos (institution_id, from_parent_id, to_staff_id, to_student_id, kind, message)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [institutionId, data.parentId, data.toStaffId ?? null, data.toStudentId ?? null, data.kind, data.message ?? null]
    );

    let recipientUserId: string | null = null;
    if (data.toStaffId) {
      const { rows: staffRows } = await scoped.query<{ user_id: string }>("select user_id from staff where id = $1", [data.toStaffId]);
      recipientUserId = staffRows[0]?.user_id ?? null;
    } else if (data.toStudentId) {
      const { rows: studentRows } = await scoped.query<{ user_id: string | null }>("select user_id from students where id = $1", [data.toStudentId]);
      recipientUserId = studentRows[0]?.user_id ?? null;
    }
    if (recipientUserId) {
      const label = data.kind === "flower" ? "sent you a flower 🌸" : "congratulated you 🎉";
      await notifyUser(institutionId, authUserId, recipientUserId, {
        type: "kudos", title: `A parent ${label}`, body: data.message ?? "", relatedEntityType: "kudos", relatedEntityId: rows[0].id,
      }, scoped);
    }
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "communication", entityType: "kudos", entityId: rows[0].id });
    return rows[0];
  });
}

export async function listKudosForStaff(institutionId: string, authUserId: string, staffId: string): Promise<KudosRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<KudosRow>(
      `select k.id, k.from_parent_id, p.full_name as parent_name, k.kind, k.message, k.created_at::text as created_at
         from kudos k join parents p on p.id = k.from_parent_id
        where k.institution_id = $1 and k.to_staff_id = $2
        order by k.created_at desc`,
      [institutionId, staffId]
    );
    return rows;
  });
}

export async function listKudosForStudent(institutionId: string, authUserId: string, studentId: string): Promise<KudosRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<KudosRow>(
      `select k.id, k.from_parent_id, p.full_name as parent_name, k.kind, k.message, k.created_at::text as created_at
         from kudos k join parents p on p.id = k.from_parent_id
        where k.institution_id = $1 and k.to_student_id = $2
        order by k.created_at desc`,
      [institutionId, studentId]
    );
    return rows;
  });
}
