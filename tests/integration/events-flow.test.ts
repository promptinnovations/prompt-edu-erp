/**
 * PROMPT EDU ERP — Events & Activities flow (migration 0070): houses and
 * balanced auto-assignment, event → item → enrolment rules (eligibility,
 * gender, house limits, per-student item limit, self-enrolment), judging,
 * result ranking (shared places, grades, points), house leader board,
 * champions, publishing into the portfolio, permissions and tenant
 * isolation.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { getPermissionsForUser, can } from "../../services/permissions/permission-service";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { listPortfolioTimeline } from "../../modules/portfolio/service";
import {
  createHouse, listHouses, autoAssignHouses, listStudentHouses, createEvent, setEventStatus, createItem,
  enrolEntry, withdrawEntry, listEntries, setItemJudges, listMyJudgingItems, getScoreSheet, saveScores,
  getHouseLeaderboard, getChampions, groupChampions, getStudentEventsView, listEvents, rankEntries,
} from "../../modules/events/service";

let A: string, B: string;
let adminAuth: string, adminId: string;
let teacherAuth: string, teacherId: string;
let otherTeacherAuth: string, otherTeacherId: string;
let studentAuth: string, studentUserId: string, parentAuth: string, parentUserId: string;
let juniorClass: string, seniorClass: string;
const kids: Record<string, string> = {};
let red: string, blue: string;
let eventId: string, elocution: string, groupSong: string, juniorQuiz: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);
  A = await seedDemoInstitution(db, "events-a");
  B = await seedDemoInstitution(db, "events-b");
  const admin = await seedDemoUser(db, A, "admin@events-a.example", "Events Admin", "institution_admin");
  adminAuth = admin.authUserId; adminId = admin.userId;
  const t = await seedDemoUser(db, A, "judge@events-a.example", "Judge One", "teacher");
  teacherAuth = t.authUserId; teacherId = t.userId;
  const t2 = await seedDemoUser(db, A, "judge2@events-a.example", "Judge Two", "teacher");
  otherTeacherAuth = t2.authUserId; otherTeacherId = t2.userId;
  const st = await seedDemoUser(db, A, "kid@events-a.example", "Kid", "student");
  studentAuth = st.authUserId; studentUserId = st.userId;
  const p = await seedDemoUser(db, A, "parent@events-a.example", "Parent", "parent");
  parentAuth = p.authUserId; parentUserId = p.userId;

  const year = (await getCurrentAcademicYear(A, adminAuth))!;
  const jc = await createClass(A, adminAuth, adminId, { name: "Grade 5", sortOrder: 1, stage: "Junior" });
  const sc = await createClass(A, adminAuth, adminId, { name: "Grade 9", sortOrder: 2, stage: "Senior" });
  juniorClass = jc.id; seniorClass = sc.id;
  const js = await createSection(A, adminAuth, adminId, { classId: jc.id, name: "A" });
  const ss = await createSection(A, adminAuth, adminId, { classId: sc.id, name: "A" });
  const people: Array<[string, string, string, string]> = [
    ["amal", "male", jc.id, js.id], ["bushra", "female", jc.id, js.id], ["chand", "male", jc.id, js.id], ["dua", "female", jc.id, js.id],
    ["faiz", "male", sc.id, ss.id], ["gulnar", "female", sc.id, ss.id], ["hadi", "male", sc.id, ss.id], ["iqra", "female", sc.id, ss.id],
  ];
  for (const [n, g, c, sId] of people) {
    const s = await createStudent(A, adminAuth, adminId, { admissionNumber: `EV-${n}`, fullName: n[0].toUpperCase() + n.slice(1), gender: g });
    await enrollStudent(A, adminAuth, adminId, { studentId: s.id, classId: c, sectionId: sId, academicYearId: year.id });
    kids[n] = s.id;
  }
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("permissions", () => {
  it("grants manage to admins, judge to teachers, enrol_self to students, view to parents", async () => {
    const admin = await getPermissionsForUser(adminAuth, adminId, A);
    const teacher = await getPermissionsForUser(teacherAuth, teacherId, A);
    const student = await getPermissionsForUser(studentAuth, studentUserId, A);
    const parent = await getPermissionsForUser(parentAuth, parentUserId, A);
    expect(can(admin, "events.manage")).toBe(true);
    expect(can(teacher, "events.judge")).toBe(true);
    expect(can(teacher, "events.manage")).toBe(false);
    expect(can(student, "events.enrol_self")).toBe(true);
    expect(can(student, "events.judge")).toBe(false);
    expect(can(parent, "events.view")).toBe(true);
    expect(can(parent, "events.enrol_self")).toBe(false);
  });
});

describe("houses", () => {
  it("auto-assigns every student, balanced per class and gender", async () => {
    red = (await createHouse(A, adminAuth, adminId, { name: "Red", color: "#b91c1c" })).id;
    blue = (await createHouse(A, adminAuth, adminId, { name: "Blue", color: "#1d4ed8" })).id;
    await expect(createHouse(A, adminAuth, adminId, { name: "Red", color: "#000000" })).rejects.toThrow(/already exists/);
    expect(await autoAssignHouses(A, adminAuth, adminId)).toBe(8);
    const roster = await listStudentHouses(A, adminAuth);
    expect(roster.every((r) => r.house_id)).toBe(true);
    for (const cls of [juniorClass, seniorClass]) for (const g of ["male", "female"]) {
      const group = roster.filter((r) => r.class_id === cls && r.gender === g);
      expect(new Set(group.map((r) => r.house_id)).size).toBe(2); // 1 per house
    }
    const houses = await listHouses(A, adminAuth);
    expect(houses.map((h) => h.member_count)).toEqual([4, 4]);
    expect(await autoAssignHouses(A, adminAuth, adminId)).toBe(0); // nothing left
  });
});

describe("events, items and enrolment", () => {
  it("creates an event with items", async () => {
    eventId = (await createEvent(A, adminAuth, adminId, { name: "Arts Fest", kind: "arts", startDate: "2026-12-01", maxItemsPerStudent: 2 })).id;
    elocution = (await createItem(A, adminAuth, adminId, eventId, {
      name: "Elocution", participation: "individual", criteria: ["Content", "Delivery"], maxMarkPerCriterion: 10, maxEntriesPerHouse: 2,
    })).id;
    groupSong = (await createItem(A, adminAuth, adminId, eventId, { name: "Group Song", participation: "group", teamSizeMax: 3 })).id;
    juniorQuiz = (await createItem(A, adminAuth, adminId, eventId, {
      name: "Junior Quiz (girls)", participation: "individual", eligibleClassIds: [juniorClass], gender: "female",
    })).id;
    await expect(createItem(A, adminAuth, adminId, eventId, { name: "Elocution", participation: "individual" })).rejects.toThrow(/already has/);
  });

  it("students cannot self-enrol while the event is a draft; staff can", async () => {
    await expect(enrolEntry(A, adminAuth, null, { itemId: elocution, studentIds: [kids.amal], mode: "self" })).rejects.toThrow(/closed/);
    const e = await enrolEntry(A, adminAuth, adminId, { itemId: elocution, studentIds: [kids.amal], mode: "staff" });
    expect(e.entry_no).toBe(1);
  });

  it("enforces eligibility, gender, duplicates, house and per-student limits", async () => {
    await setEventStatus(A, adminAuth, adminId, eventId, "enrolment_open");
    await expect(enrolEntry(A, adminAuth, adminId, { itemId: juniorQuiz, studentIds: [kids.gulnar], mode: "staff" })).rejects.toThrow(/class cannot take part/);
    await expect(enrolEntry(A, adminAuth, adminId, { itemId: juniorQuiz, studentIds: [kids.amal], mode: "staff" })).rejects.toThrow(/girls only/);
    await expect(enrolEntry(A, adminAuth, adminId, { itemId: elocution, studentIds: [kids.amal], mode: "staff" })).rejects.toThrow(/already entered/);
    await expect(enrolEntry(A, adminAuth, adminId, { itemId: groupSong, studentIds: [kids.amal, kids.bushra], mode: "self" })).rejects.toThrow(/teachers/);

    const roster = await listStudentHouses(A, adminAuth);
    const houseOf = (id: string) => roster.find((r) => r.student_id === id)!.house_id;
    const amalHouse = houseOf(kids.amal);
    const sameHouse = roster.filter((r) => r.house_id === amalHouse && r.student_id !== kids.amal).map((r) => r.student_id);
    const otherHouse = roster.filter((r) => r.house_id !== amalHouse).map((r) => r.student_id);

    // a mixed-house team is refused, a same-house team is fine
    await expect(enrolEntry(A, adminAuth, adminId, { itemId: groupSong, studentIds: [kids.amal, otherHouse[0]], mode: "staff" })).rejects.toThrow(/same house/);
    await enrolEntry(A, adminAuth, adminId, { itemId: groupSong, studentIds: [kids.amal, sameHouse[0]], teamName: "Team A", mode: "staff" });
    // amal is now in 2 items — the event's limit
    await expect(enrolEntry(A, adminAuth, adminId, { itemId: juniorQuiz, studentIds: [kids.amal], mode: "staff" })).rejects.toThrow(/(girls only|most allowed)/);

    // house limit of 2 on elocution
    await enrolEntry(A, adminAuth, adminId, { itemId: elocution, studentIds: [sameHouse[1]], mode: "staff" });
    await expect(enrolEntry(A, adminAuth, adminId, { itemId: elocution, studentIds: [sameHouse[2]], mode: "staff" })).rejects.toThrow(/already has 2/);

    // self-enrol of a student from the other house
    const self = await enrolEntry(A, adminAuth, null, { itemId: elocution, studentIds: [otherHouse[0]], mode: "self" });
    expect(self.entry_no).toBe(3);
    // withdraw own entry, then re-enrol (deleted, so allowed again)
    await expect(withdrawEntry(A, adminAuth, null, self.id, "self", kids.amal)).rejects.toThrow(/own entry/);
    await withdrawEntry(A, adminAuth, null, self.id, "self", otherHouse[0]);
    const again = await enrolEntry(A, adminAuth, null, { itemId: elocution, studentIds: [otherHouse[0]], mode: "self" });
    expect(again.entry_no).toBe(3);

    const view = await getStudentEventsView(A, adminAuth, kids.bushra);
    const ev = view.events.find((e) => e.id === eventId)!;
    expect(ev.openItems.map((i) => i.name).sort()).toEqual(["Elocution", "Junior Quiz (girls)"]); // group item not self-enrollable
  });
});

describe("judging and results", () => {
  it("only assigned judges mark, after enrolment closes", async () => {
    await setItemJudges(A, adminAuth, adminId, elocution, [teacherId, otherTeacherId]);
    const entries = await listEntries(A, adminAuth, elocution);
    expect(entries).toHaveLength(3);
    const marks = Object.fromEntries(entries.map((e, n) => [e.id, { Content: 9 - n * 2, Delivery: 9 - n * 2 }]));
    await expect(saveScores(A, teacherAuth, teacherId, elocution, marks, { canManage: false })).rejects.toThrow(/after enrolment closes/);

    await setEventStatus(A, adminAuth, adminId, eventId, "enrolment_closed");
    expect((await listMyJudgingItems(A, teacherAuth, teacherId)).map((i) => i.item_name)).toEqual(["Elocution"]);
    await expect(saveScores(A, teacherAuth, teacherId, groupSong, {}, { canManage: false })).rejects.toThrow(/not a judge/);
    await expect(saveScores(A, teacherAuth, teacherId, elocution, { [entries[0].id]: { Content: 11 } }, { canManage: false })).rejects.toThrow(/between 0 and 10/);

    await saveScores(A, teacherAuth, teacherId, elocution, marks, { canManage: false });
    await saveScores(A, otherTeacherAuth, otherTeacherId, elocution, marks, { canManage: false });
    const sheet = await getScoreSheet(A, teacherAuth, teacherId, elocution);
    expect(sheet!.is_judge).toBe(true);
    expect(sheet!.entries[0].marks).toEqual({ Content: 9, Delivery: 9 });

    const ranked = await listEntries(A, adminAuth, elocution);
    expect(ranked.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(ranked.map((e) => e.grade)).toEqual(["A", "A", "C"]); // 90 %, 70 %, 50 %
  });

  it("ranks with shared places, grades and points", () => {
    const r = rankEntries(
      [{ entryId: "a", pct: 90 }, { entryId: "b", pct: 90 }, { entryId: "c", pct: 65 }, { entryId: "d", pct: 55 }, { entryId: "e", pct: 40 }],
      { a: 70, b: 60, c: 50 }, { first: 5, second: 3, third: 1, a: 5, b: 3, c: 1 }
    );
    expect(r.map((x) => [x.position, x.grade, x.points])).toEqual([
      [1, "A", 10], [1, "A", 10], [2, "B", 6], [3, "C", 2], [null, null, 0],
    ]);
  });

  it("hides results from the portal until published, then adds them to the portfolio", async () => {
    const before = await getStudentEventsView(A, adminAuth, kids.amal);
    expect(before.events.find((e) => e.id === eventId)!.myEntries.find((m) => m.item_name === "Elocution")!.position).toBeNull();
    expect(before.standings.every((h) => h.points === 0)).toBe(true);

    await setEventStatus(A, adminAuth, adminId, eventId, "published");
    const after = await getStudentEventsView(A, adminAuth, kids.amal);
    expect(after.events.find((e) => e.id === eventId)!.myEntries.find((m) => m.item_name === "Elocution")!.position).toBe(1);
    const board = await getHouseLeaderboard(A, adminAuth, { eventId });
    expect(board[0].points).toBeGreaterThan(board[1].points);
    expect(board[0].firsts).toBe(1);

    const champs = groupChampions(await getChampions(A, adminAuth, eventId));
    expect(champs.overall[0].student_id).toBe(kids.amal);
    expect(champs.boys[0].student_id).toBe(kids.amal);
    expect(champs.byStage.find((s) => s.stage === "Junior")!.rows[0].student_id).toBe(kids.amal);

    const timeline = await listPortfolioTimeline(A, adminAuth, kids.amal);
    expect(timeline.some((t) => t.title === "1st place — Grade A: Elocution")).toBe(true);

    // unpublishing removes the portfolio lines again
    await setEventStatus(A, adminAuth, adminId, eventId, "judging");
    expect((await listPortfolioTimeline(A, adminAuth, kids.amal)).some((t) => t.module === "events")).toBe(false);
    await setEventStatus(A, adminAuth, adminId, eventId, "published");
  });
});

describe("tenant isolation", () => {
  it("another institution sees none of it", async () => {
    const other = await seedDemoUser(await getDbClient(), B, "admin@events-b.example", "B Admin", "institution_admin");
    expect(await listEvents(B, other.authUserId)).toHaveLength(0);
    expect(await listHouses(B, other.authUserId)).toHaveLength(0);
    expect(await listEntries(B, other.authUserId, elocution)).toHaveLength(0);
  });
});
