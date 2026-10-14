import { DEMO_HTML } from "./demo-html";

/** §Marketing-demo — https://eduerp.promptinnovations.net/demo
 *
 *  The public, self-contained sales demo: a visitor answers a few questions
 *  and explores a sample-data copy of the app, with WhatsApp buttons for
 *  leads. Static (no session, no database, no institution data); middleware
 *  lets /demo through without the app's nonce CSP because the page carries
 *  its own inline script and loads Google Fonts. */
export const dynamic = "force-static";

export function GET() {
  return new Response(DEMO_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
