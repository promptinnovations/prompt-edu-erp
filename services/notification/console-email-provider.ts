/**
 * PROMPT EDU ERP — ConsoleEmailProvider (local development / no-SMTP-
 * configured fallback — see services/notification/email-provider.ts).
 *
 * Logs the email so it's visible during development/testing, but never
 * actually delivers anything — `isConfigured: false` tells
 * NotificationService to record the notification's status as 'skipped'
 * rather than 'sent', so nothing pretends an email went out when it
 * didn't (§R.4's "progressive enhancement", applied honestly).
 */
import type { EmailProvider } from "./email-provider";

export function createConsoleEmailProvider(): EmailProvider {
  return {
    isConfigured: false,
    async sendEmail(to, subject, body) {
      console.log(`[dev email — not actually sent, no SMTP_HOST configured] to=${to} subject="${subject}"\n${body}`);
      return { ok: true };
    },
  };
}
