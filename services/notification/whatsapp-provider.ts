/**
 * PROMPT EDU ERP — WhatsAppProvider abstraction (ARCHITECTURE.md §G.4
 * NotificationService). Same provider-swap SHAPE as email-provider.ts:
 *   - GreenApiWhatsAppProvider — real delivery via GREEN-API
 *     (https://green-api.com).
 *   - ConsoleWhatsAppProvider  — logs the message and marks it undelivered,
 *     used whenever no credentials are configured (see docs/SETUP.md).
 *
 * §D.6 follow-up ("message for each institution should go from a number
 * which is related to the institution... I will add for each institution"):
 * GREEN-API credentials are PER-INSTITUTION, not one platform-wide
 * instance — each institution gets its own paired WhatsApp number, stored
 * on `institutions.whatsapp_green_api_id_instance`/`_token_instance` (set
 * by the platform owner via Super Admin -> institution detail, migration
 * 0027). getWhatsAppProvider() takes that institution's own credentials as
 * an explicit argument (resolved by the caller, inside its own
 * institution-scoped DB context — see notification-service.ts) rather than
 * reading a single global env var, so two institutions never end up
 * sharing one WhatsApp number, and one institution's messages can never be
 * sent from another's. The GREEN_API_ID_INSTANCE/GREEN_API_TOKEN_INSTANCE
 * env vars remain a platform-wide FALLBACK only — useful for local dev/
 * testing with one shared instance, never used once an institution has its
 * own configured.
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

export interface GreenApiCredentials {
  idInstance: string;
  apiTokenInstance: string;
  apiUrl?: string | null;
}

export function getWhatsAppProvider(credentials?: GreenApiCredentials | null): WhatsAppProvider {
  if (credentials?.idInstance && credentials?.apiTokenInstance) {
    return createGreenApiWhatsAppProvider(credentials);
  }
  const hasGlobalFallback = !!process.env.GREEN_API_ID_INSTANCE && !!process.env.GREEN_API_TOKEN_INSTANCE;
  if (hasGlobalFallback) {
    return createGreenApiWhatsAppProvider({
      idInstance: process.env.GREEN_API_ID_INSTANCE!,
      apiTokenInstance: process.env.GREEN_API_TOKEN_INSTANCE!,
      apiUrl: process.env.GREEN_API_URL,
    });
  }
  return createConsoleWhatsAppProvider();
}
