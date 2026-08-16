/**
 * PROMPT EDU ERP — ConsoleWhatsAppProvider (local development / no-GREEN-API-
 * instance-configured fallback — see services/notification/whatsapp-provider.ts).
 *
 * Logs the message so it's visible during development/testing, but never
 * actually delivers anything — `isConfigured: false` tells
 * NotificationService to record the notification's status as 'skipped'
 * rather than 'sent', so nothing pretends a WhatsApp message went out when
 * it didn't (§R.4's "progressive enhancement", applied honestly — same
 * pattern as console-email-provider.ts).
 */
import type { WhatsAppProvider } from "./whatsapp-provider";

export function createConsoleWhatsAppProvider(): WhatsAppProvider {
  return {
    isConfigured: false,
    async sendMessage(phone, message) {
      console.log(`[dev WhatsApp — not actually sent, no GREEN_API_ID_INSTANCE configured] to=${phone}\n${message}`);
      return { ok: true };
    },
  };
}
