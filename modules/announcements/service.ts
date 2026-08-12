/**
 * PROMPT EDU ERP — Announcements module (ARCHITECTURE.md §D.13, §Q roadmap
 * item 15 "notifications, email, SMS/WhatsApp architecture", Phase 15).
 *
 * publishAnnouncement() resolves an audience to a concrete list of user
 * ids, inserts the announcement row, then calls the core
 * NotificationService's notifyUser() once per recipient, all inside ONE
 * transaction (via the scopedClient param — same pattern as bulk import's
 * confirmImport(), modules/bulk/service.ts) so a failure partway through
 * fan-out doesn't leave an announcement "published" with only some
 * recipients notified.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { notifyUser } from "../../services/notification/notification-service";

export type AnnouncementAudience =
  | { type: "all" }
  | { type: "role"; roleCodes: string[] };

const publishAnnouncementSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1),
  audience: z.union([
    z.object({ type: z.literal("all") }),
    z.object({ type: z.literal("role"), roleCodes: z.array(z.string()).min(1) }),
  ]),
});

export interface AnnouncementRecord {
  id: string; title: string; body: string; audience_jsonb: AnnouncementAudience;
  published_by: string | null; published_at: string;
}

async function resolveAudienceUserIds(
  scoped: { query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  institutionId: string,
  audience: AnnouncementAudience
): Promise<string[]> {
  if (audience.type === "all") {
    const { rows } = await scoped.query<{ user_id: string }>(
      "select user_id from user_institution_memberships where institution_id = $1 and status = 'active'",
      [institutionId]
    );
    return rows.map((r) => r.user_id);
  }
  // audience.type === "role"
  const { rows } = await scoped.query<{ user_id: string }>(
    `select distinct ur.user_id
       from user_roles ur join roles r on r.id = ur.role_id
      where ur.institution_id = $1 and r.code = any($2::text[])`,
    [institutionId, audience.roleCodes]
  );
  return rows.map((r) => r.user_id);
}

export async function publishAnnouncement(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof publishAnnouncementSchema>
): Promise<{ announcement: AnnouncementRecord; notifiedCount: number }> {
  const data = publishAnnouncementSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AnnouncementRecord>(
      `insert into announcements (institution_id, title, body, audience_jsonb, published_by)
       values ($1, $2, $3, $4, $5)
       returning id, title, body, audience_jsonb, published_by, published_at`,
      [institutionId, data.title, data.body, JSON.stringify(data.audience), userId]
    );
    const announcement = rows[0];

    const recipientIds = await resolveAudienceUserIds(scoped, institutionId, data.audience as AnnouncementAudience);
    for (const recipientId of recipientIds) {
      await notifyUser(institutionId, authUserId, recipientId, {
        type: "announcement", title: data.title, body: data.body,
        relatedEntityType: "announcements", relatedEntityId: announcement.id,
      }, scoped);
    }

    await recordAudit(scoped, {
      institutionId, userId, action: "publish", module: "announcements",
      entityType: "announcements", entityId: announcement.id,
      after: { title: data.title, audience: data.audience, notifiedCount: recipientIds.length },
    });

    return { announcement, notifiedCount: recipientIds.length };
  });
}

export interface AnnouncementRow extends AnnouncementRecord {
  published_by_name: string | null;
}

export async function listAnnouncements(institutionId: string, authUserId: string, limit = 50): Promise<AnnouncementRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<AnnouncementRow>(
      `select a.id, a.title, a.body, a.audience_jsonb, a.published_by, a.published_at, u.full_name as published_by_name
         from announcements a left join users u on u.id = a.published_by
        order by a.published_at desc
        limit $1`,
      [limit]
    );
    return rows;
  });
}

/** For the audience picker in the publish UI — this institution's roles
 *  (system + any custom ones, §23), not a hard-coded list (§2). */
export async function listInstitutionRoles(institutionId: string, authUserId: string): Promise<{ code: string; name: string }[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ code: string; name: string }>(
      "select code, name from roles where institution_id = $1 order by name",
      [institutionId]
    );
    return rows;
  });
}
