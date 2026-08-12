import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
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
