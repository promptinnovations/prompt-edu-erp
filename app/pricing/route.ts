import { PRICING_HTML } from "./pricing-html";

/** §Marketing-pricing — https://eduerp.promptinnovations.net/pricing
 *
 *  The public price calculator (plan + number of students → one-time
 *  payment and monthly charge, with a WhatsApp quote button). Static: no
 *  session, no database, no institution data. Like /demo, middleware lets
 *  /pricing through without the app's nonce CSP because the page carries
 *  its own inline script and loads Google Fonts. */
export const dynamic = "force-static";

export function GET() {
  return new Response(PRICING_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
