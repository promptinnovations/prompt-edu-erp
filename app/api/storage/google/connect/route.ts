import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { requireRequestContext } from "../../../../../services/request-context";
import { can } from "../../../../../services/permissions/permission-service";
import { buildAuthUrl, isGoogleDriveConfigured, signState } from "../../../../../services/storage/google-drive";
import { driveRedirectUri, DRIVE_NONCE_COOKIE } from "../redirect-uri";

/** Storage → "Connect Google Drive": sends the admin to Google to let the
 *  app keep this institution's files in its own Drive (drive.file only). */
export async function GET(request: NextRequest) {
  const ctx = await requireRequestContext();
  const back = new URL("/storage", request.url);
  if (!ctx.institutionId || !(ctx.isSuperAdmin || can(ctx.permissions, "files.manage"))) {
    back.searchParams.set("drive", "forbidden");
    return NextResponse.redirect(back);
  }
  if (!isGoogleDriveConfigured()) {
    back.searchParams.set("drive", "unavailable");
    return NextResponse.redirect(back);
  }
  const nonce = randomBytes(16).toString("base64url");
  const state = signState({ institutionId: ctx.institutionId, userId: ctx.userId, nonce });
  const res = NextResponse.redirect(buildAuthUrl(driveRedirectUri(request.headers), state));
  res.cookies.set(DRIVE_NONCE_COOKIE, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/storage/google", maxAge: 600 });
  return res;
}
