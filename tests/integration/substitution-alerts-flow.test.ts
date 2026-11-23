/**
 * PROMPT EDU ERP — substitution alerts: a teacher who is newly given a period
 * gets a bell notification and (when they enrolled a phone) a web push.
 */
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { createECDH } from "node:crypto";
import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createClass, createSection, createSubject } from "../../modules/academic/service";
import { createStaffMember } from "../../modules/staff/service";
import { confirmSubstitutions } from "../../modules/substitution/service";
import { b64u, decryptPayload, generateVapidKeys } from "../../services/notification/web-push";

const DAY = "2099-02-02";
let inst: string, adminAuth: string, adminUserId: string;
let absentStaffId: string, coverStaffId: string, coverUserId: string;
let classId: string, sectionId: string, subjectId: string;
const phone = createECDH("prime256v1");
const phoneAuth = Buffer.from("fedcba9876543210");

async function notificationsFor(userId: string) {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, async (scoped) =>
    (await scoped.query<{ channel: string; status: string; title: string; body: string }>(
      "select channel, status, title, body from notifications where user_id = $1 and type = 'substitution' order by created_at, channel", [userId]
    )).rows);
}
const confirm = (periodNo: number, coveringStaffId: string | null) =>
  confirmSubstitutions(inst, adminAuth, adminUserId, { date: DAY, absentStaffId, rows: [{ classId, sectionId, periodNo, subjectId, coveringStaffId }] });

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  inst = await seedDemoInstitution(db, "alerts-school");
  const admin = await seedDemoUser(db, inst, "admin@alerts.example", "Alerts Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;
  const c = await createClass(inst, adminAuth, adminUserId, { name: "Grade 6", sortOrder: 1 });
  classId = c.id; sectionId = (await createSection(inst, adminAuth, adminUserId, { classId, name: "B" })).id;
  subjectId = (await createSubject(inst, adminAuth, adminUserId, { name: "English" })).id;
  const mk = (n: number, name: string) => createStaffMember(inst, adminAuth, adminUserId, {
    email: `a${n}@alerts.example`, fullName: name, staffCode: `AL-00${n}`, designation: "Teacher", department: null, employmentStatus: "active",
  });
  absentStaffId = (await mk(1, "Absent One")).id;
  const cover = await mk(2, "Cover Two");
  coverStaffId = cover.id; coverUserId = cover.user_id;
  phone.generateKeys();
});
afterAll(async () => { const db = await getDbClient(); await db.close(); __resetDbClientForTests(); });
afterEach(() => { vi.restoreAllMocks(); delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; });

describe("substitution alerts", () => {
  it("a newly assigned teacher gets a bell notification; phone push is skipped when not set up", async () => {
    await confirm(1, coverStaffId);
    const rows = await notificationsFor(coverUserId);
    expect(rows).toEqual([
      expect.objectContaining({ channel: "in_app", status: "sent", title: "Substitution assigned to you" }),
      expect.objectContaining({ channel: "push", status: "skipped" }),
    ]);
    expect(rows[0].body).toContain("P1 Grade 6 B");
    expect(rows[0].body).toContain("Absent One");
  });

  it("re-confirming the same teacher for the same period does not alert again", async () => {
    await confirm(1, coverStaffId);
    expect(await notificationsFor(coverUserId)).toHaveLength(2);
  });

  it("with push configured and a phone enrolled, the phone is sent an encrypted alert", async () => {
    const keys = generateVapidKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    const db = await getDbClient();
    await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, (scoped) => scoped.query(
      "insert into push_subscriptions (institution_id, user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4, $5)",
      [inst, coverUserId, "https://push.example.test/send/abc", b64u.encode(phone.getPublicKey()), b64u.encode(phoneAuth)]
    ));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    await confirm(2, coverStaffId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://push.example.test/send/abc");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^vapid t=.+, k=.+$/);
    const plain = JSON.parse(decryptPayload(Buffer.from(init.body as Uint8Array), { privateKey: phone.getPrivateKey(), publicKey: phone.getPublicKey(), auth: phoneAuth }).toString());
    expect(plain).toMatchObject({ title: "Substitution assigned to you", url: "/dashboard" });
    expect(plain.body).toContain("P2 Grade 6 B");
    expect((await notificationsFor(coverUserId)).filter((r) => r.channel === "push").pop()?.status).toBe("sent");
  });

  it("a phone the push service says is gone (410) is forgotten", async () => {
    const keys = generateVapidKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 410 }));
    await confirm(3, coverStaffId);
    const db = await getDbClient();
    const { rows } = await db.withInstitutionContext({ institutionId: inst, authUserId: adminAuth }, (scoped) => scoped.query("select 1 from push_subscriptions where user_id = $1", [coverUserId]));
    expect(rows).toHaveLength(0);
  });
});
