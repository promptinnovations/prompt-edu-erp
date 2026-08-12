import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

// System font stack (no next/font/google network dependency, §80 "optimize
// for lower-end mobile devices and slower networks" — a system stack loads
// instantly with zero extra requests).
const fontClass = "font-sans";

export const metadata: Metadata = {
  title: "PROMPT EDU ERP",
  description: "PROMPT EDU ERP — Technology with Purpose. A product of Prompt Innovations.",
  manifest: "/manifest.webmanifest",
};

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

  return (
    <html lang={locale} dir={dir} className={`${fontClass} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
