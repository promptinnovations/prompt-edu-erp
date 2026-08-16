/**
 * PROMPT EDU ERP — NotificationService (ARCHITECTURE.md §G.4 "core service
 * every module can depend on", §D.13, §R.4).
 *
 * notifyUser() is the ONE place a `notifications` row is ever written —
 * modules never insert into that table directly (mirrors §L.3's
 * recordPortfolioEvent() being the single portfolio-event writer). Every
 * call always creates an 'in_app' row (§R.4: in-app delivery can never
 * silently fail — it's just a database insert) and, unless the caller
 * opts out, an 'email' row whose actual delivery depends on which
 * EmailProvider is configured (see email-provider.ts). 'sms'/'push'
 * channels are schema-ready (the channel check constraint in migration
 * 0017 already allows them) but have no provider built yet — requesting
 * them always records status='skipped', an honest, documented placeholder
 * for real Twilio SMS/web-push integration later, not a silent no-op.
 * 'whatsapp' DOES have a real provider (see whatsapp-provider.ts, §D.6
 * attendance alerts follow-up) — same "skipped until configured, real once
 * it is" shape as 'email', not a permanent placeholder.
 */
import { getDbClient } from "../db/client";
import type { DbClient } from "../db/client";
import { getEmailProvider } from "./email-provider";
import { getWhatsAppProvider } from "./whatsapp-provider";

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp" | "push";
export type NotificationStatus = "pending" | "sent" | "failed" | "skipped";

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  /** Defaults to ["in_app", "email"] — §R.4's baseline guarantee. */
  channels?: NotificationChannel[];
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}

const CHANNELS_WITHOUT_A_PROVIDER: NotificationChannel[] = ["sms", "push"];

/** Notifies ONE user. Fan-out to many users (e.g. an announcement's
 *  audience) is the CALLER's job — looping this per recipient, inside the
 *  caller's own transaction via `scopedClient`, matching the pattern
 *  established for bulk import's insertRow() (modules/bulk/service.ts). */
export async function notifyUser(
  institutionId: string,
  authUserId: string,
  targetUserId: string,
  input: NotifyInput,
  scopedClient?: DbClient
): Promise<void> {
  const channels = input.channels ?? ["in_app", "email"];

  const run = async (scoped: DbClient) => {
    let recipientEmail: string | null = null;
    if (channels.includes("email")) {
      const { rows } = await scoped.query<{ email: string | null }>(
        "select email from users where id = $1",
        [targetUserId]
      );
      recipientEmail = rows[0]?.email ?? null;
    }
    let recipientPhone: string | null = null;
    if (channels.includes("whatsapp")) {
      const { rows } = await scoped.query<{ phone: string | null }>(
        "select phone from users where id = $1",
        [targetUserId]
      );
      recipientPhone = rows[0]?.phone ?? null;
    }

    for (const channel of channels) {
      let status: NotificationStatus = "pending";
      let sentAt: string | null = null;

      if (channel === "in_app") {
        status = "sent";
        sentAt = new Date().toISOString();
      } else if (channel === "email") {
        if (!recipientEmail) {
          status = "skipped"; // no email on file for this user — nothing to send to
        } else {
          const provider = getEmailProvider();
          if (!provider.isConfigured) {
            status = "skipped";
          } else {
            const result = await provider.sendEmail(recipientEmail, input.title, input.body);
            status = result.ok ? "sent" : "failed";
            if (result.ok) sentAt = new Date().toISOString();
          }
        }
      } else if (channel === "whatsapp") {
        if (!recipientPhone) {
          status = "skipped"; // no phone on file for this user — nothing to send to
        } else {
          const provider = getWhatsAppProvider();
          if (!provider.isConfigured) {
            status = "skipped"; // §R.4 — real provider exists (GREEN-API) but no instance configured yet
          } else {
            const result = await provider.sendMessage(recipientPhone, input.body);
            status = result.ok ? "sent" : "failed";
            if (result.ok) sentAt = new Date().toISOString();
          }
        }
      } else if (CHANNELS_WITHOUT_A_PROVIDER.includes(channel)) {
        status = "skipped"; // §R.4 — schema-ready, no provider built yet (see docs/SETUP.md)
      }

      await scoped.query(
        `insert into notifications
           (institution_id, user_id, type, title, body, channel, status, related_entity_type, related_entity_id, sent_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          institutionId, targetUserId, input.type, input.title, input.body, channel, status,
          input.relatedEntityType ?? null, input.relatedEntityId ?? null, sentAt,
        ]
      );
    }
  };

  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

export interface NotificationRow {
  id: string; type: string; title: string; body: string; status: NotificationStatus;
  related_entity_type: string | null; related_entity_id: string | null;
  read_at: string | null; created_at: string;
}

/** Always scoped to the CALLER's own resolved userId — never a
 *  client-supplied id (§X "never trust the client"; same application-layer
 *  gate pattern as mentoring's confidentiality and the portal's
 *  self-scoping, migrations 0013/0014). Only the 'in_app' channel is
 *  listed here — email/sms/whatsapp rows are delivery-attempt log entries,
 *  not something a user reads in an on-screen inbox. */
export async function listMyNotifications(
  institutionId: string, authUserId: string, userId: string, opts?: { unreadOnly?: boolean; limit?: number }
): Promise<NotificationRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<NotificationRow>(
      `select id, type, title, body, status, related_entity_type, related_entity_id, read_at, created_at
         from notifications
        where user_id = $1 and channel = 'in_app' ${opts?.unreadOnly ? "and read_at is null" : ""}
        order by created_at desc
        limit $2`,
      [userId, opts?.limit ?? 20]
    );
    return rows;
  });
}

export async function getUnreadNotificationCount(institutionId: string, authUserId: string, userId: string): Promise<number> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ count: string }>(
      "select count(*)::text as count from notifications where user_id = $1 and channel = 'in_app' and read_at is null",
      [userId]
    );
    return Number(rows[0]?.count ?? 0);
  });
}

/** Verifies ownership before updating — a notification id alone (client
 *  input) is never enough to mark it read; it must belong to the caller. */
export async function markNotificationRead(institutionId: string, authUserId: string, userId: string, notificationId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(
      "update notifications set read_at = now() where id = $1 and user_id = $2 and read_at is null",
      [notificationId, userId]
    );
  });
}

export async function markAllNotificationsRead(institutionId: string, authUserId: string, userId: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(
      "update notifications set read_at = now() where user_id = $1 and channel = 'in_app' and read_at is null",
      [userId]
    );
  });
}
