/**
 * PROMPT EDU ERP — Examinations > Seating Arrangement (migration 0049).
 *
 * Covers what the feature actually promises:
 *   - exam_rooms CRUD (the reusable master list)
 *   - plan generation under BOTH boys/girls modes ('hard' and 'best_effort')
 *   - the no-two-students-from-the-same-grade-per-bench rule
 *   - the insufficient-capacity error path under the hard rule
 *   - ad-hoc rooms, snapshotting, and the sticker/chart read-backs
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import { listExamTypes, createExamination, addExamClass } from "../../modules/examination/service";
import {
  listExamRooms, createExamRoom, updateExamRoom, deleteExamRoom,
  listSeatingRoster, generateSeatingPlan, getSeatingPlan, listSeatingStickers, deleteSeatingPlan,
  SeatingCapacityError,
} from "../../modules/examination/seating-service";
import {
  getInstitution, updateExamSeatingGenderRule,
} from "../../services/institution/institution-service";

let institutionId: string;
let adminAuth: string, adminUserId: string;
let grade5: string, grade6: string;
let examinationId: string;

/** 8 students per grade, alternating boy/girl, so both the grade rule and
 *  the gender rule have something real to bite on. */
const PER_GRADE = 8;

async function seedGrade(name: string, prefix: string): Promise<string> {
  const cls = await createClass(institutionId, adminAuth, adminUserId, { name, sortOrder: 1 });
  const section = await createSection(institutionId, adminAuth, adminUserId, { classId: cls.id, name: "A" });
  const year = await getCurrentAcademicYear(institutionId, adminAuth);
  for (let i = 1; i <= PER_GRADE; i += 1) {
    const student = await createStudent(institutionId, adminAuth, adminUserId, {
      admissionNumber: `${prefix}-${i}`,
      fullName: `${prefix} Student ${i}`,
      gender: i % 2 === 1 ? "male" : "female",
    });
    await enrollStudent(institutionId, adminAuth, adminUserId, {
      studentId: student.id, classId: cls.id, sectionId: section.id, academicYearId: year!.id,
    });
  }
  return cls.id;
}

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionId = await seedDemoInstitution(db, "seating-school");
  const admin = await seedDemoUser(db, institutionId, "admin@seating.example", "Seating Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  grade5 = await seedGrade("Grade 5", "G5");
  grade6 = await seedGrade("Grade 6", "G6");

  const year = await getCurrentAcademicYear(institutionId, adminAuth);
  const examTypes = await listExamTypes(institutionId, adminAuth);
  const examType = examTypes.find((t) => !t.is_daily_assessment)!;
  const exam = await createExamination(institutionId, adminAuth, adminUserId, {
    examTypeId: examType.id, academicYearId: year!.id, name: "Term 1 Exam",
  });
  examinationId = exam.id;
  // section_id null = "the whole grade", the same scope semantics
  // getMarksGrid() uses.
  await addExamClass(institutionId, adminAuth, examinationId, grade5, null);
  await addExamClass(institutionId, adminAuth, examinationId, grade6, null);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

/** Removes every plan/room so each generation test starts from a known
 *  board — generation replaces the plan anyway, but rooms accumulate. */
async function resetRooms() {
  for (const room of await listExamRooms(institutionId, adminAuth, { includeInactive: true })) {
    await deleteExamRoom(institutionId, adminAuth, adminUserId, room.id);
  }
}

describe("exam_rooms — the reusable master list", () => {
  it("creates, lists, updates and deletes a room", async () => {
    const room = await createExamRoom(institutionId, adminAuth, adminUserId, {
      name: "Room 12", benchCount: 10, seatsPerBench: 2,
    });
    expect(room.capacity).toBe(20);
    expect(room.gender_restriction).toBeNull();
    expect(room.is_active).toBe(true);

    const listed = await listExamRooms(institutionId, adminAuth);
    expect(listed.map((r) => r.name)).toContain("Room 12");

    const updated = await updateExamRoom(institutionId, adminAuth, adminUserId, room.id, {
      name: "Room 12", benchCount: 12, seatsPerBench: 3, genderRestriction: "female",
    });
    expect(updated.capacity).toBe(36);
    expect(updated.gender_restriction).toBe("female");

    await deleteExamRoom(institutionId, adminAuth, adminUserId, room.id);
    expect((await listExamRooms(institutionId, adminAuth)).find((r) => r.id === room.id)).toBeUndefined();
  });

  it("rejects a duplicate room name and sorts Room 2 before Room 10", async () => {
    await resetRooms();
    await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 10", benchCount: 5, seatsPerBench: 2 });
    await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 2", benchCount: 5, seatsPerBench: 2 });
    await expect(
      createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 2", benchCount: 1, seatsPerBench: 1 })
    ).rejects.toThrow(/already exists/i);

    expect((await listExamRooms(institutionId, adminAuth)).map((r) => r.name)).toEqual(["Room 2", "Room 10"]);
    await resetRooms();
  });

  it("hides an inactive room from the default listing", async () => {
    await resetRooms();
    const room = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Store Room", benchCount: 2, seatsPerBench: 2 });
    await updateExamRoom(institutionId, adminAuth, adminUserId, room.id, {
      name: "Store Room", benchCount: 2, seatsPerBench: 2, isActive: false,
    });
    expect(await listExamRooms(institutionId, adminAuth)).toHaveLength(0);
    expect(await listExamRooms(institutionId, adminAuth, { includeInactive: true })).toHaveLength(1);
    await resetRooms();
  });
});

describe("roster for one examination", () => {
  it("returns every actively-enrolled student in the exam's classes, in roster order", async () => {
    const roster = await listSeatingRoster(institutionId, adminAuth, examinationId);
    expect(roster).toHaveLength(PER_GRADE * 2);
    // Grade 5 sorts before Grade 6 (roster-order's numeric grade compare).
    expect(roster[0].class_name).toBe("Grade 5");
    expect(roster[roster.length - 1].class_name).toBe("Grade 6");
  });
});

describe("generateSeatingPlan — best-effort boys/girls rule", () => {
  it("seats everyone, never putting two students of the same grade on one bench", async () => {
    await resetRooms();
    await updateExamSeatingGenderRule(institutionId, adminAuth, adminUserId, { examSeatingGenderRule: "best_effort" });
    const roomA = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 1", benchCount: 5, seatsPerBench: 2 });
    const roomB = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 2", benchCount: 5, seatsPerBench: 2 });

    const result = await generateSeatingPlan(institutionId, adminAuth, adminUserId, {
      examinationId, roomIds: [roomA.id, roomB.id], adHocRooms: [],
    });
    expect(result.studentCount).toBe(PER_GRADE * 2);
    expect(result.seatCount).toBe(20);
    expect(result.genderRule).toBe("best_effort");

    const chart = await getSeatingPlan(institutionId, adminAuth, examinationId);
    expect(chart).not.toBeNull();
    expect(chart!.rooms).toHaveLength(2);

    let seated = 0;
    for (const room of chart!.rooms) {
      for (const bench of room.benches) {
        const grades = bench.seats.filter(Boolean).map((s) => s!.class_name);
        seated += grades.length;
        expect(new Set(grades).size).toBe(grades.length); // rule: no repeat grade on a bench
      }
    }
    expect(seated).toBe(PER_GRADE * 2);
  });

  it("mixes genders only when capacity leaves no alternative", async () => {
    await resetRooms();
    await updateExamSeatingGenderRule(institutionId, adminAuth, adminUserId, { examSeatingGenderRule: "best_effort" });
    // 16 students, 8 boys + 8 girls, but only ONE room — mixing is the only
    // way anyone gets seated at all.
    const only = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Hall", benchCount: 8, seatsPerBench: 2 });

    const result = await generateSeatingPlan(institutionId, adminAuth, adminUserId, {
      examinationId, roomIds: [only.id], adHocRooms: [],
    });
    expect(result.studentCount).toBe(16);
    expect(result.mixedRoomNames).toEqual(["Hall"]);

    const chart = await getSeatingPlan(institutionId, adminAuth, examinationId);
    expect(chart!.rooms[0].isMixed).toBe(true);
    expect(chart!.plan.mixed_room_count).toBe(1);
  });

  it("keeps boys and girls apart when there is room to do so", async () => {
    await resetRooms();
    await updateExamSeatingGenderRule(institutionId, adminAuth, adminUserId, { examSeatingGenderRule: "best_effort" });
    const a = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 1", benchCount: 8, seatsPerBench: 2 });
    const b = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 2", benchCount: 8, seatsPerBench: 2 });

    const result = await generateSeatingPlan(institutionId, adminAuth, adminUserId, {
      examinationId, roomIds: [a.id, b.id], adHocRooms: [],
    });
    expect(result.mixedRoomNames).toEqual([]);

    const chart = await getSeatingPlan(institutionId, adminAuth, examinationId);
    for (const room of chart!.rooms) expect(room.isMixed).toBe(false);
  });
});

describe("generateSeatingPlan — hard boys/girls rule", () => {
  it("never mixes genders in a room", async () => {
    await resetRooms();
    await updateExamSeatingGenderRule(institutionId, adminAuth, adminUserId, { examSeatingGenderRule: "hard" });
    const a = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 1", benchCount: 8, seatsPerBench: 2 });
    const b = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 2", benchCount: 8, seatsPerBench: 2 });

    const result = await generateSeatingPlan(institutionId, adminAuth, adminUserId, {
      examinationId, roomIds: [a.id, b.id], adHocRooms: [],
    });
    expect(result.genderRule).toBe("hard");
    expect(result.mixedRoomNames).toEqual([]);

    const chart = await getSeatingPlan(institutionId, adminAuth, examinationId);
    for (const room of chart!.rooms) {
      const genders = new Set(room.benches.flatMap((bench) => bench.seats.filter(Boolean).map((s) => s!.gender)));
      expect(genders.size).toBeLessThanOrEqual(1);
    }
  });

  it("fails with a capacity-shortfall message when one room can't hold both genders", async () => {
    await resetRooms();
    await updateExamSeatingGenderRule(institutionId, adminAuth, adminUserId, { examSeatingGenderRule: "hard" });
    // Exactly 16 seats for 16 students — enough overall, but they'd have to
    // share a room, which the hard rule forbids.
    const only = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Hall", benchCount: 8, seatsPerBench: 2 });

    await expect(
      generateSeatingPlan(institutionId, adminAuth, adminUserId, { examinationId, roomIds: [only.id], adHocRooms: [] })
    ).rejects.toThrow(SeatingCapacityError);

    try {
      await generateSeatingPlan(institutionId, adminAuth, adminUserId, { examinationId, roomIds: [only.id], adHocRooms: [] });
      throw new Error("should not reach here");
    } catch (err) {
      expect(err).toBeInstanceOf(SeatingCapacityError);
      const capacityErr = err as SeatingCapacityError;
      expect(capacityErr.studentCount).toBe(16);
      expect(capacityErr.seatCount).toBe(16);
      expect(capacityErr.unseatedCount).toBeGreaterThan(0);
      expect(capacityErr.message).toMatch(/boys and girls may not share a room/i);
      expect(capacityErr.message).toMatch(/best effort/i);
    }
  });

  it("fails on plain capacity shortfall, and says how to fix it", async () => {
    await resetRooms();
    const tiny = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Tiny", benchCount: 2, seatsPerBench: 2 });
    await expect(
      generateSeatingPlan(institutionId, adminAuth, adminUserId, { examinationId, roomIds: [tiny.id], adHocRooms: [] })
    ).rejects.toThrow(/Add another room/i);
  });

  it("leaves no plan behind when generation fails", async () => {
    await resetRooms();
    await updateExamSeatingGenderRule(institutionId, adminAuth, adminUserId, { examSeatingGenderRule: "best_effort" });
    const roomA = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 1", benchCount: 8, seatsPerBench: 2 });
    const roomB = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 2", benchCount: 8, seatsPerBench: 2 });
    await generateSeatingPlan(institutionId, adminAuth, adminUserId, { examinationId, roomIds: [roomA.id, roomB.id], adHocRooms: [] });
    const before = await getSeatingPlan(institutionId, adminAuth, examinationId);
    expect(before).not.toBeNull();

    const tiny = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Tiny", benchCount: 1, seatsPerBench: 1 });
    await expect(
      generateSeatingPlan(institutionId, adminAuth, adminUserId, { examinationId, roomIds: [tiny.id], adHocRooms: [] })
    ).rejects.toThrow(SeatingCapacityError);

    // The previous plan is untouched — the allocator throws before any write.
    const after = await getSeatingPlan(institutionId, adminAuth, examinationId);
    expect(after?.plan.id).toBe(before!.plan.id);
  });
});

describe("the no-same-grade-per-bench rule under pressure", () => {
  it("leaves seats empty rather than seating two students of one grade together", async () => {
    await resetRooms();
    await updateExamSeatingGenderRule(institutionId, adminAuth, adminUserId, { examSeatingGenderRule: "best_effort" });
    // A single exam covering ONE grade only: with 2 seats per bench and no
    // second grade to pair with, at most one seat per bench is usable — so
    // 8 students need at least 8 benches, and 4 benches must fail.
    const year = await getCurrentAcademicYear(institutionId, adminAuth);
    const examTypes = await listExamTypes(institutionId, adminAuth);
    const soloExam = await createExamination(institutionId, adminAuth, adminUserId, {
      examTypeId: examTypes.find((t) => !t.is_daily_assessment)!.id,
      academicYearId: year!.id, name: "Grade 5 only exam",
    });
    await addExamClass(institutionId, adminAuth, soloExam.id, grade5, null);

    const small = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Small", benchCount: 4, seatsPerBench: 2 });
    await expect(
      generateSeatingPlan(institutionId, adminAuth, adminUserId, { examinationId: soloExam.id, roomIds: [small.id], adHocRooms: [] })
    ).rejects.toThrow(/same grade may share a bench|same grade/i);

    const wide = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Wide", benchCount: 8, seatsPerBench: 2 });
    const ok = await generateSeatingPlan(institutionId, adminAuth, adminUserId, {
      examinationId: soloExam.id, roomIds: [wide.id], adHocRooms: [],
    });
    expect(ok.studentCount).toBe(PER_GRADE);

    const chart = await getSeatingPlan(institutionId, adminAuth, soloExam.id);
    for (const bench of chart!.rooms[0].benches) {
      expect(bench.seats.filter(Boolean)).toHaveLength(1); // second seat unusable, as it must be
    }
  });
});

describe("ad-hoc rooms, stickers, and plan lifecycle", () => {
  it("uses an ad-hoc room for one plan without adding it to the master list", async () => {
    await resetRooms();
    await updateExamSeatingGenderRule(institutionId, adminAuth, adminUserId, { examSeatingGenderRule: "best_effort" });
    const master = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 1", benchCount: 4, seatsPerBench: 2 });

    const result = await generateSeatingPlan(institutionId, adminAuth, adminUserId, {
      examinationId,
      roomIds: [master.id],
      adHocRooms: [{ name: "Assembly Hall", benchCount: 6, seatsPerBench: 2, genderRestriction: null }],
    });
    expect(result.roomCount).toBe(2);
    expect(result.seatCount).toBe(20);

    // Never persisted to the master list.
    const masterRooms = await listExamRooms(institutionId, adminAuth, { includeInactive: true });
    expect(masterRooms.map((r) => r.name)).toEqual(["Room 1"]);

    const chart = await getSeatingPlan(institutionId, adminAuth, examinationId);
    const adHoc = chart!.rooms.find((r) => r.name === "Assembly Hall");
    expect(adHoc?.is_ad_hoc).toBe(true);
  });

  it("keeps a generated plan intact after its master room is deleted (snapshot)", async () => {
    await resetRooms();
    const room = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Doomed Room", benchCount: 10, seatsPerBench: 2 });
    await generateSeatingPlan(institutionId, adminAuth, adminUserId, { examinationId, roomIds: [room.id], adHocRooms: [] });
    await deleteExamRoom(institutionId, adminAuth, adminUserId, room.id);

    const chart = await getSeatingPlan(institutionId, adminAuth, examinationId);
    expect(chart!.rooms[0].name).toBe("Doomed Room");
    expect(chart!.rooms[0].bench_count).toBe(10);
  });

  it("produces one sticker per seated student, in room -> bench -> seat order", async () => {
    await resetRooms();
    const a = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 1", benchCount: 8, seatsPerBench: 2 });
    const b = await createExamRoom(institutionId, adminAuth, adminUserId, { name: "Room 2", benchCount: 8, seatsPerBench: 2 });
    await generateSeatingPlan(institutionId, adminAuth, adminUserId, { examinationId, roomIds: [a.id, b.id], adHocRooms: [] });

    const stickers = await listSeatingStickers(institutionId, adminAuth, examinationId);
    expect(stickers).toHaveLength(16);
    for (const sticker of stickers) {
      expect(sticker.student_name).toBeTruthy();
      expect(sticker.class_name).toBeTruthy();
      expect(sticker.division_name).toBe("A");
      expect(sticker.room_name).toBeTruthy();
    }
    // Stable print order: Room 1's stickers all come before Room 2's.
    const firstRoom2 = stickers.findIndex((s) => s.room_name === "Room 2");
    const lastRoom1 = stickers.map((s) => s.room_name).lastIndexOf("Room 1");
    expect(lastRoom1).toBeLessThan(firstRoom2);
  });

  it("regenerating replaces the previous plan rather than adding a second one", async () => {
    const before = await getSeatingPlan(institutionId, adminAuth, examinationId);
    const rooms = await listExamRooms(institutionId, adminAuth);
    await generateSeatingPlan(institutionId, adminAuth, adminUserId, {
      examinationId, roomIds: rooms.map((r) => r.id), adHocRooms: [],
    });
    const after = await getSeatingPlan(institutionId, adminAuth, examinationId);
    expect(after!.plan.id).not.toBe(before!.plan.id);
    expect(after!.rooms).toHaveLength(rooms.length);
  });

  it("deletes a plan", async () => {
    await deleteSeatingPlan(institutionId, adminAuth, adminUserId, examinationId);
    expect(await getSeatingPlan(institutionId, adminAuth, examinationId)).toBeNull();
    expect(await listSeatingStickers(institutionId, adminAuth, examinationId)).toHaveLength(0);
    await expect(deleteSeatingPlan(institutionId, adminAuth, adminUserId, examinationId)).rejects.toThrow(/No seating plan/i);
  });
});

describe("institution-level gender rule setting", () => {
  it("round-trips through getInstitution() and defaults to best_effort", async () => {
    await updateExamSeatingGenderRule(institutionId, adminAuth, adminUserId, { examSeatingGenderRule: "hard" });
    expect((await getInstitution(institutionId, adminAuth))?.examSeatingGenderRule).toBe("hard");
    await updateExamSeatingGenderRule(institutionId, adminAuth, adminUserId, { examSeatingGenderRule: "best_effort" });
    expect((await getInstitution(institutionId, adminAuth))?.examSeatingGenderRule).toBe("best_effort");
  });

  it("grants examinations.seating.manage to institution_admin and management", async () => {
    const db = await getDbClient();
    const { rows } = await db.query<{ code: string }>(
      `select r.code from roles r
         join role_permissions rp on rp.role_id = r.id
         join permissions p on p.id = rp.permission_id
        where r.institution_id = $1 and p.code = 'examinations.seating.manage'
        order by r.code`,
      [institutionId]
    );
    expect(rows.map((r) => r.code)).toEqual(["institution_admin", "management"]);
  });
});
