/**
 * PROMPT EDU ERP — dynamically-rendered install icon, one per active
 * institution (or "SA" for a pure Super Admin session). Referenced from
 * app/manifest.ts's `icons` array and app/layout.tsx's favicon/
 * apple-touch-icon metadata — see services/branding/app-identity.ts for
 * the shared "what should this badge say" logic both call into.
 *
 * Deliberately plain Node.js runtime (no `export const runtime = "edge"`):
 * resolveAppIdentity() → getRequestContext() ultimately reaches the
 * Postgres client via services/db/client.ts, which is not edge-compatible
 * — the same reason app/manifest.ts itself never declared edge either.
 */
import { ImageResponse } from "next/og";
import { getRequestContext } from "../../../services/request-context";
import { resolveAppIdentity } from "../../../services/branding/app-identity";

const SIZES: Record<string, number> = { "192": 192, "512": 512 };

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: sizeParam } = await params;
  const size = SIZES[sizeParam] ?? 192;

  const ctx = await getRequestContext().catch(() => null);
  const identity = await resolveAppIdentity(ctx);
  const label = identity.badgeText;
  const fontSize = label.length <= 2 ? size * 0.42 : label.length <= 4 ? size * 0.3 : size * 0.22;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #d946ef 100%)",
        }}
      >
        <div
          style={{
            color: "#ffffff",
            fontSize,
            fontWeight: 700,
            fontFamily: "sans-serif",
            letterSpacing: label.length > 2 ? -1 : 0,
          }}
        >
          {label}
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=3600" },
    }
  );
}
