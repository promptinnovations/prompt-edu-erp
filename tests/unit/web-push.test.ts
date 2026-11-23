import { describe, expect, it } from "vitest";
import { createECDH, createPublicKey, verify } from "node:crypto";
import { b64u, decryptPayload, encryptPayload, generateVapidKeys, vapidJwt } from "../../services/notification/web-push";

describe("web push", () => {
  it("encrypts a message that only the phone's key can read (RFC 8291 round trip)", () => {
    const phone = createECDH("prime256v1"); phone.generateKeys();
    const auth = Buffer.from("0123456789abcdef");
    const message = Buffer.from(JSON.stringify({ title: "Substitution assigned to you", body: "Today: P3 Grade 7 A — അറിയിപ്പ്" }));
    const body = encryptPayload({ p256dh: b64u.encode(phone.getPublicKey()), auth: b64u.encode(auth) }, message);
    expect(body[20]).toBe(65); // sender key length in the header
    const plain = decryptPayload(body, { privateKey: phone.getPrivateKey(), publicKey: phone.getPublicKey(), auth });
    expect(plain.toString("utf8")).toBe(message.toString("utf8"));
  });

  it("signs the VAPID token so the push service can verify it with our public key", () => {
    const keys = { ...generateVapidKeys(), subject: "https://example.org" };
    const jwt = vapidJwt("https://fcm.googleapis.com/fcm/send/abc", keys, 1_800_000_000);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "https://example.org", exp: 1_800_000_000 + 12 * 3600 });
    const pub = b64u.decode(keys.publicKey);
    const publicKey = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: b64u.encode(pub.subarray(1, 33)), y: b64u.encode(pub.subarray(33, 65)) } });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, b64u.decode(s))).toBe(true);
  });
});
