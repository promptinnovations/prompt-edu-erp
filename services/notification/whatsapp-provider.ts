/**
 * PROMPT EDU ERP — WhatsAppProvider abstraction (ARCHITECTURE.md §G.4
 * NotificationService). Same provider-swap SHAPE as email-provider.ts:
 *   - GreenApiWhatsAppProvider — real delivery via GREEN-API
 *     (https://green-api.com), used whenever GREEN_API_ID_INSTANCE +
 *     GREEN_API_TOKEN_INSTANCE are configured.
 *   - ConsoleWhatsAppProvider  — logs the message and marks it undelivered,
 *     used whenever those env vars are absent (this build's default — no
 *     real WhatsApp credentials are configured yet; the person building
 *     this chose GREEN-API but hasn't set up an instance yet as of this
 *     writing, see docs/SETUP.md).
 *
 * Recipient phone numbers in this codebase are stored as plain local
 * numbers (e.g. "9567794185", see modules/portal/service.ts's student-login
 * "parent phone as password" design) without a country code — chatId
 * formatting (digits-only + country code + "@c.us") is GREEN-API's
 * requirement, not a general phone-number rule, so it lives entirely in
 * green-api-whatsapp-provider.ts, not here.
 */
import { createConsoleWhatsAppProvider } from "./console-whatsapp-provider";
import { createGreenApiWhatsAppProvider } from "./green-api-whatsapp-provider";

export interface WhatsAppProvider {
  /** false for the console/dev fallback — lets callers distinguish "we
   *  tried to send and it failed" from "there is nothing to try". */
  readonly isConfigured: boolean;
  sendMessage(phone: string, message: string): Promise<{ ok: boolean; error?: string }>;
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const hasGreenApiConfig = !!process.env.GREEN_API_ID_INSTANCE && !!process.env.GREEN_API_TOKEN_INSTANCE;
  return hasGreenApiConfig ? createGreenApiWhatsAppProvider() : createConsoleWhatsAppProvider();
}
