/** The OAuth redirect URI — GOOGLE_DRIVE_REDIRECT_URI when set, otherwise
 *  this request's own host. It must match the one registered in Google
 *  Cloud exactly. */
export function driveRedirectUri(headers: Headers): string {
  if (process.env.GOOGLE_DRIVE_REDIRECT_URI) return process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}/api/storage/google/callback`;
}
export const DRIVE_NONCE_COOKIE = "perp_drive_nonce";
