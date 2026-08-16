import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getRequestContext } from "../services/request-context";
import { resolveAppIdentity } from "../services/branding/app-identity";
import "./globals.css";

// System font stack (no next/font/google network dependency, §80 "optimize
// for lower-end mobile devices and slower networks" — a system stack loads
// instantly with zero extra requests).
const fontClass = "font-sans";

// Dynamic (not a static `export const metadata`) so the browser tab title,
// favicon, and — critically — `apple-mobile-web-app-title` /
// `apple-touch-icon` (what iOS actually uses for the home-screen name and
// icon when a user taps Share → Add to Home Screen; it does not reliably
// read manifest.webmanifest the way Android/Chrome does) all reflect the
// signed-in institution (or "SA" for a pure Super Admin session), matching
// app/manifest.ts and app/icon-badge/[size]/route.tsx. See
// services/branding/app-identity.ts for the shared resolver. Falls back to
// generic PROMPT EDU ERP branding with no active institution (e.g. the
// public /login page).
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getRequestContext().catch(() => null);
  const identity = await resolveAppIdentity(ctx);

  return {
    title: identity.name,
    description: "PROMPT EDU ERP — Technology with Purpose. A product of Prompt Innovations.",
    // §137 follow-up — a genuinely distinct URL per institution, not just a
    // shared one serving different content (see assetBasePath's own doc
    // comment in services/branding/app-identity.ts for why that distinction
    // is what actually makes "Install" create a separate app).
    manifest: `${identity.assetBasePath}/manifest.webmanifest`,
    icons: identity.dynamicIcon
      ? {
          icon: [{ url: `${identity.assetBasePath}/icon-badge/192`, sizes: "192x192", type: "image/png" }],
          apple: [{ url: `${identity.assetBasePath}/icon-badge/512`, sizes: "512x512", type: "image/png" }],
        }
      : {
          icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
          apple: [{ url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
        },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: identity.name,
    },
  };
}

// Explicit rather than relying on Next.js's implicit default — old Android
// WebViews are inconsistent about applying an implicit viewport correctly,
// and this is the one meta tag every mobile browser (new or 10 years old)
// has always understood, so it's worth being explicit. Zoom is left enabled
// (no maximum-scale/user-scalable=no) for accessibility.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs synchronously before first paint (blocking <head> script, not a
// module) so a visitor whose last choice — or OS preference, on a first
// visit — was dark mode never sees a flash of the light theme while
// React hydrates. app/components/ThemeToggle.tsx reads/writes the exact
// same localStorage key afterward.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === "ar" || locale === "ur" ? "rtl" : "ltr"; // §S.4 RTL-ready, unused in v1

  return (
    <html lang={locale} dir={dir} className={`${fontClass} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
