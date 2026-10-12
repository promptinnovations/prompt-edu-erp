import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getRequestContext } from "../services/request-context";
import { resolveAppIdentity, resolveAppIdentityByCode } from "../services/branding/app-identity";
import { Lora } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// Interface text stays on the system font stack (§80 "optimize for
// lower-end mobile devices and slower networks" — zero extra requests).
// Lora is the one display face, reserved for h1 page titles / .display
// (see globals.css): one weight, Latin only, self-hosted by next/font at
// build time — served from this app's own origin (CSP font-src 'self'),
// never fetched from Google at runtime, with a serif fallback stack.
const lora = Lora({ subsets: ["latin"], weight: "600", display: "swap", preload: false, variable: "--font-lora" });
const fontClass = `font-sans ${lora.variable}`;

// §Install-button ("if clicked, app should get installed"). Chrome/Edge fire
// `beforeinstallprompt` ONCE, early in page load — often before React has
// hydrated and the install button's hook has attached its listener, which
// left the button with nothing to call. This tiny inline script (first
// thing in <body>, CSP-nonced) catches the event the moment it fires and
// parks it on window for useInstallPrompt(), records which manifest it
// belongs to, and registers the service worker (public/sw.js) that older
// Android Chrome and Samsung Internet require before they offer install.
const PWA_BOOT = `(function(){var w=window;function mf(){var l=document.querySelector('link[rel="manifest"]');return l?l.getAttribute('href'):'';}
w.addEventListener('beforeinstallprompt',function(e){e.preventDefault();w.__pwaPrompt=e;w.__pwaPromptManifest=mf();w.dispatchEvent(new Event('pwa:prompt'));});
w.addEventListener('appinstalled',function(){w.__pwaPrompt=null;w.__pwaInstalled=true;w.dispatchEvent(new Event('pwa:installed'));});
if('serviceWorker' in navigator){w.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});});}})();`;

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
  // §Install-button: before sign-in (an institution's own /<code>/login)
  // there's no session, which used to fall back to the generic PROMPT EDU
  // ERP app — so "Install" on the login screen installed the wrong app.
  // The institution code in the URL (middleware's x-institution-code)
  // identifies it without a session, same as the manifest route does.
  const urlCode = (await headers()).get("x-institution-code");
  const identity = !ctx && urlCode ? await resolveAppIdentityByCode(urlCode) : await resolveAppIdentity(ctx);

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
      statusBarStyle: "default",
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === "ar" || locale === "ur" ? "rtl" : "ltr"; // §S.4 RTL-ready, unused in v1
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // "Never use dark" follow-up: the app no longer has a dark mode to flash
  // to begin with (see globals.css / services/branding/palettes.ts — every
  // palette is light-only), so the old blocking no-flash <head> script that
  // used to pre-apply a `dark` class from localStorage before first paint
  // has been removed entirely, not just its trigger.
  return (
    <html lang={locale} dir={dir} className={`${fontClass} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: PWA_BOOT }} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
