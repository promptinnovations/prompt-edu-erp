/** Learner Record (migration 0059): entries per section, tenant isolation,
 *  student-limited sections, and QR verification tokens. */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createStudent } from "../../modules/students/service";
import { createLearnerEntry, listLearnerEntries, deleteLearnerEntry } from "../../modules/learner-record/service";
import { createRecordToken, parseRecordToken } from "../../services/learner-record/verification";

let instA: string, instB: string, adminAuth: string, adminUser: string, bAuth: string, student: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  instA = await seedDemoInstitution(db, "lr-a");
  instB = await seedDemoInstitution(db, "lr-b");
  const a = await seedDemoUser(db, instA, "admin@lr-a.example", "Admin A", "institution_admin");
  const b = await seedDemoUser(db, instB, "admin@lr-b.example", "Admin B", "institution_admin");
  adminAuth = a.authUserId; adminUser = a.userId; bAuth = b.authUserId;
  student = (await createStudent(instA, adminAuth, adminUser, { admissionNumber: "LR-1", fullName: "Learner One" })).id;
});
afterAll(async () => { const db = await getDbClient(); await db.close(); __resetDbClientForTests(); });

describe("Learner Record entries", () => {
  it("creates and lists entries per section; empty until entered", async () => {
    expect(await listLearnerEntries(instA, adminAuth, student)).toEqual([]);
    await createLearnerEntry(instA, adminAuth, adminUser, { studentId: student, section: "quran", title: "Hifz — Juz 30", value: "Completed" }, "staff");
    await createLearnerEntry(instA, adminAuth, adminUser, { studentId: student, section: "activity", title: "Scouts", hours: 12 }, "staff");
    const rows = await listLearnerEntries(instA, adminAuth, student);
    expect(rows.map((r) => r.section).sort()).toEqual(["activity", "quran"]);
    expect(Number(rows.find((r) => r.section === "activity")!.hours)).toBe(12);
  });

  it("students may only add reflections and goals", async () => {
    await expect(createLearnerEntry(instA, adminAuth, adminUser, { studentId: student, section: "quran", title: "x" }, "student")).rejects.toThrow();
    await createLearnerEntry(instA, adminAuth, adminUser, { studentId: student, section: "goal", title: "Memorise Juz 29" }, "student");
    expect((await listLearnerEntries(instA, adminAuth, student)).some((r) => r.section === "goal")).toBe(true);
  });

  it("is tenant-isolated and deletable", async () => {
    expect(await listLearnerEntries(instB, bAuth, student)).toEqual([]);
    const [first] = await listLearnerEntries(instA, adminAuth, student);
    await deleteLearnerEntry(instA, adminAuth, adminUser, first.id);
    expect((await listLearnerEntries(instA, adminAuth, student)).find((r) => r.id === first.id)).toBeUndefined();
  });
});

describe("Verification tokens", () => {
  it("round-trips and rejects tampering", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const t = createRecordToken(id, "2026-10-06");
    expect(parseRecordToken(t)).toEqual({ studentId: id, date: "2026-10-06" });
    expect(parseRecordToken(t.replace("20261006", "20261007"))).toBeNull();
    expect(parseRecordToken(t.slice(0, -1) + "0")).toBeNull();
  });
});
