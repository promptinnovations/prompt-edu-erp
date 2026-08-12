/**
 * PROMPT EDU ERP — i18n request config (ARCHITECTURE.md §S).
 *
 * Unprefixed locale routing (no /en/, /ml/ URL segments) — locale is read
 * from a cookie, defaulting to 'en'. v1 ships two UI language bundles: 'en'
 * (always available) and 'ml' (Malayalam, offered only when an institution
 * has enabled it via institution_settings.enabled_ui_languages — §S.2). The
 * bundle set is intentionally small; adding 'ar'/'ur'/'hi'/'kn' later is
 * "add a JSON file", not an architecture change (§S.1).
 */
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const SUPPORTED_LOCALES = ["en", "ml"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_COOKIE = "perp_locale";

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale: SupportedLocale =
    cookieLocale && (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale)
      ? (cookieLocale as SupportedLocale)
      : "en";

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
