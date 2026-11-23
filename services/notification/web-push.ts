/**
 * PROMPT EDU ERP — Web Push (RFC 8030 + VAPID RFC 8292 + message encryption
 * RFC 8291 "aes128gcm"), written on Node's own crypto so no extra package is
 * needed. This is what makes a phone show a notification (with the phone's
 * normal notification sound) even when the app is closed.
 *
 * Needs two environment variables (see docs/SETUP.md → Phone alerts):
 *   VAPID_PUBLIC_KEY   base64url, 65-byte uncompressed P-256 point
 *   VAPID_PRIVATE_KEY  base64url, 32-byte private scalar
 * and optionally VAPID_SUBJECT (a mailto: or https: contact, default the site).
 * Without them push is "not configured" and callers record 'skipped'.
 */
import { createCipheriv, createDecipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";

export interface PushTarget { endpoint: string; p256dh: string; auth: string }
export type PushOutcome = "sent" | "gone" | "failed";

export const b64u = {
  encode: (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url"),
  decode: (s: string) => Buffer.from(s, "base64url"),
};

export function getVapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || "https://eduerp.promptinnovations.net" };
}

export function isPushConfigured(): boolean {
  return getVapidKeys() !== null;
}

/** Makes a fresh VAPID key pair (used by scripts/generate-vapid-keys.mjs and tests). */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u.encode(ecdh.getPublicKey()), privateKey: b64u.encode(ecdh.getPrivateKey()) };
}

/** Signed JWT proving to the push service that this server is the sender. */
export function vapidJwt(endpoint: string, keys: { publicKey: string; privateKey: string; subject: string }, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const pub = b64u.decode(keys.publicKey);
  const key = createPrivateKey({
    format: "jwk",
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64u.encode(pub.subarray(1, 33)), y: b64u.encode(pub.subarray(33, 65)) },
  });
  const header = b64u.encode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.encode(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: keys.subject })));
  const input = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64u.encode(signature)}`;
}

/** RFC 8291 §3.4 encryption of one message (single record). */
export function encryptPayload(target: Pick<PushTarget, "p256dh" | "auth">, payload: Buffer, fixed?: { salt?: Buffer; senderPrivateKey?: Buffer }): Buffer {
  const uaPublic = b64u.decode(target.p256dh);
  const authSecret = b64u.decode(target.auth);
  const ecdh = createECDH("prime256v1");
  if (fixed?.senderPrivateKey) ecdh.setPrivateKey(fixed.senderPrivateKey); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = fixed?.salt ?? randomBytes(16);

  const prk = Buffer.from(hkdfSync("sha256", shared, authSecret, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

/** Receiver side — only used by tests to prove the round trip. */
export function decryptPayload(body: Buffer, receiver: { privateKey: Buffer; publicKey: Buffer; auth: Buffer }): Buffer {
  const salt = body.subarray(0, 16);
  const idLen = body[20];
  const asPublic = body.subarray(21, 21 + idLen);
  const data = body.subarray(21 + idLen);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(receiver.privateKey);
  const shared = ecdh.computeSecret(asPublic);
  const prk = Buffer.from(hkdfSync("sha256", shared, receiver.auth, Buffer.concat([Buffer.from("WebPush: info\0"), receiver.publicKey, asPublic]), 32));
  const cek = Buffer.from(hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0) end--;
  return plain.subarray(0, end - 1); // drop the 0x02 delimiter
}

/** Sends one push. Never throws: a dead phone must not break the caller. */
export async function sendWebPush(target: PushTarget, message: { title: string; body: string; url?: string; tag?: string }): Promise<PushOutcome> {
  const keys = getVapidKeys();
  if (!keys) return "failed";
  try {
    const body = encryptPayload(target, Buffer.from(JSON.stringify(message)));
    const res = await fetch(target.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${vapidJwt(target.endpoint, keys)}, k=${keys.publicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "high",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
