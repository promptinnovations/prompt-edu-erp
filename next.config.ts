import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Bug report: "logo is uploaded, it is not working" -- root cause was
  // Next.js's default 1 MB Server Action request-body limit. Every upload
  // in this app (institution logo, student/staff photos, achievement
  // certificates, reading-review evidence, ...) is submitted as a Server
  // Action FormData post (see LogoForm.tsx -> uploadInstitutionLogoAction),
  // and services/storage/file-service.ts already enforces its OWN 10 MB
  // limit (MAX_UPLOAD_BYTES) server-side -- but Next was silently rejecting
  // anything over 1 MB *before* that code ever ran, with no error surfaced
  // to the form (uploadState.error never gets set because the action never
  // executes). Small cropped student photos happened to fit under 1 MB, so
  // that path looked fine; a real logo export (letterhead-quality PNG) does
  // not. Raised to match the app's own already-documented 10 MB ceiling so
  // the two limits agree instead of the framework one silently overriding.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  // ESLint's flat-config integration for eslint-config-next now works via
  // FlatCompat (eslint.config.mjs) — the previous `nextVitals is not
  // iterable` packaging mismatch (§AC, formerly tracked in docs/SETUP.md's
  // "Known follow-ups") is fixed as of Phase 18, so lint runs on every
  // build again rather than being skipped.

  // §X.1 "Security headers" — applied to every route. HSTS is meaningful
  // once served over real TLS (production hosting); harmless as a no-op
  // header locally over HTTP.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
