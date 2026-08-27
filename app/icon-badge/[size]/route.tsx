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
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { getRequestContext } from "../../../services/request-context";
import { resolveAppIdentity, resolveAppIdentityByCode } from "../../../services/branding/app-identity";
import { getPublicLogoFile } from "../../../services/institution/institution-service";
import { getStorageProviderByName } from "../../../services/storage/storage-provider";

const SIZES: Record<string, number> = { "192": 192, "512": 512 };

export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: sizeParam } = await params;
  const size = SIZES[sizeParam] ?? 192;

  // See app/manifest.webmanifest/route.ts's identical fix for why the
  // URL-derived code (via middleware.ts's x-institution-code header)
  // takes priority over the session-dependent lookup here.
  const institutionCode = request.headers.get("x-institution-code");
  const identity = institutionCode
    ? await resolveAppIdentityByCode(institutionCode)
    : await resolveAppIdentity(await getRequestContext().catch(() => null));

  // "Can I add institution logo?" follow-up — once an institution has
  // uploaded its own logo, the PWA install icon/favicon use the real image
  // instead of the generated letter-gradient badge below. Streamed directly
  // (same lookup the pre-auth /api/institution-logo/[code] route uses) —
  // this route is already authenticated via ctx by this point, but the
  // lookup itself doesn't need a second, redundant auth check.
  if (identity.logoInstitutionCode) {
    const file = await getPublicLogoFile(identity.logoInstitutionCode).catch(() => null);
    if (file) {
      if (file.storageProvider !== "local") {
        const url = await getStorageProviderByName(file.storageProvider).getDownloadUrl(file.storageFileId);
        return NextResponse.redirect(url);
      }
      const bytes = await getStorageProviderByName("local").download(file.storageFileId);
      return new NextResponse(new Uint8Array(bytes), {
        status: 200,
        headers: {
          "Content-Type": file.mimeType || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

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
          background: `linear-gradient(135deg, ${identity.badgeGradient[0]} 0%, ${identity.badgeGradient[1]} 55%, ${identity.badgeGradient[2]} 100%)`,
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
