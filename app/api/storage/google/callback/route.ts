import { NextResponse, type NextRequest } from "next/server";
import { requireRequestContext } from "../../../../../services/request-context";
import { can } from "../../../../../services/permissions/permission-service";
import { getInstitution } from "../../../../../services/institution/institution-service";
import { createFolder, exchangeCode, verifyState } from "../../../../../services/storage/google-drive";
import { saveDriveConnection } from "../../../../../services/storage/institution-storage";
import { driveRedirectUri, DRIVE_NONCE_COOKIE } from "../redirect-uri";

/** Google sends the admin back here: check the signed state against the
 *  signed-in admin and the nonce cookie, keep the (encrypted) refresh
 *  token, make the institution's folder, and return to the Storage page. */
export async function GET(request: NextRequest) {
  const back = (status: string) => {
    const u = new URL("/storage", request.url);
    u.searchParams.set("drive", status);
    const res = NextResponse.redirect(u);
    res.cookies.delete({ name: DRIVE_NONCE_COOKIE, path: "/api/storage/google" });
    return res;
  };
  const url = request.nextUrl;
  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  const state = verifyState(url.searchParams.get("state") ?? "");
  const nonce = request.cookies.get(DRIVE_NONCE_COOKIE)?.value;
  if (!code || !state || !nonce || nonce !== state.nonce) return back("failed");

  const ctx = await requireRequestContext();
  if (ctx.institutionId !== state.institutionId || ctx.userId !== state.userId || !(ctx.isSuperAdmin || can(ctx.permissions, "files.manage"))) {
    return back("forbidden");
  }
  try {
    const { refreshToken, accessToken, email } = await exchangeCode(code, driveRedirectUri(request.headers));
    const institution = await getInstitution(ctx.institutionId, ctx.session.authUserId);
    const folderId = await createFolder(accessToken, `EduErp — ${institution?.name ?? "Institution files"}`);
    await saveDriveConnection(ctx.institutionId, ctx.session.authUserId, ctx.userId, { email, folderId, refreshToken });
    return back("connected");
  } catch (e) {
    console.error("[google drive connect]", e);
    return back("failed");
  }
}
