// Prints a fresh VAPID key pair for phone alerts (web push).
// Usage: node scripts/generate-vapid-keys.mjs
import { createECDH } from "node:crypto";
const e = createECDH("prime256v1");
e.generateKeys();
console.log(`VAPID_PUBLIC_KEY=${e.getPublicKey().toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${e.getPrivateKey().toString("base64url")}`);
