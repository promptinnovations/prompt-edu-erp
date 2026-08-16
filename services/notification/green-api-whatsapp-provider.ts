/**
 * PROMPT EDU ERP — GreenApiWhatsAppProvider (real delivery via GREEN-API —
 * see services/notification/whatsapp-provider.ts for when this is selected).
 *
 * GREEN-API (https://green-api.com) is a WhatsApp-automation provider that
 * pairs to a real WhatsApp number via QR code (like WhatsApp Web) rather
 * than requiring Meta Business verification — chosen for this build because
 * it needs no business-account approval process to start sending. Untested
 * against a real instance in this environment; once real credentials are
 * set (per-institution, via Super Admin -> institution detail — see
 * whatsapp-provider.ts's own doc comment for why per-institution, not a
 * single global env var), sending goes live with no further code changes.
 *
 * API shape (https://green-api.com/en/docs/api/sending/SendMessage/):
 *   POST {apiUrl}/waInstance{idInstance}/sendMessage/{apiTokenInstance}
 *   body: { chatId: "<countrycode><number>@c.us", message: "..." }
 *
 * chatId formatting: GREEN-API requires digits-only + country code, no
 * leading "+" or "0". Numbers in this codebase are stored as plain local
 * numbers with no country code (§137 follow-up student-login design), so a
 * 10-digit number is assumed local and gets WHATSAPP_DEFAULT_COUNTRY_CODE
 * (default "91" — every institution provisioned so far is in Kerala,
 * India) prepended; anything else is assumed to already include a country
 * code and is passed through digits-only, unmodified.
 */
import type { WhatsAppProvider, GreenApiCredentials } from "./whatsapp-provider";

function toChatId(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const countryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "91";
  const withCountryCode = digits.length === 10 ? `${countryCode}${digits}` : digits;
  return `${withCountryCode}@c.us`;
}

export function createGreenApiWhatsAppProvider(credentials: GreenApiCredentials): WhatsAppProvider {
  return {
    isConfigured: true,
    async sendMessage(phone, message) {
      try {
        const apiUrl = credentials.apiUrl || "https://api.green-api.com";
        const { idInstance, apiTokenInstance } = credentials;
        const res = await fetch(`${apiUrl}/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: toChatId(phone), message }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { ok: false, error: `GREEN-API responded ${res.status}: ${text.slice(0, 200)}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "WhatsApp send failed." };
      }
    },
  };
}
