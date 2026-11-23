/**
 * PROMPT EDU ERP — hall tickets (migration 0076): per-grade exam timetable,
 * one ticket per student, optional seat from the seating plan.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser } from "../../database/scripts/seed";
import { createStudent, enrollStudent } from "../../modules/students/service";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import { listExamTypes, createExamination, addExamClass } from "../../modules/examination/service";
import { createExamRoom, generateSeatingPlan, listExamRooms } from "../../modules/examination/seating-service";
import {
  addExamTimetableEntry, addExamTimetableFromText, buildHallTickets, copyExamTimetable, deleteExamTimetableEntry,
  formatClock, getHallTicketSettings, listExamTimetable, parseTimetableText, saveHallTicketSettings,
} from "../../modules/examination/hall-ticket-service";

let inst: string, auth: string, userId: string, examId: string, g5: string, g6: string;

async function seedGrade(name: string, prefix: string, n: number): Promise<string> {
  const cls = await createClass(inst, auth, userId, { name, sortOrder: 1 });
  const sec = await createSection(inst, auth, userId, { classId: cls.id, name: "A" });
  const year = await getCurrentAcademicYear(inst, auth);
  for (let i = 1; i <= n; i += 1) {
    const s = await createStudent(inst, auth, userId, { admissionNumber: `${prefix}-${i}`, fullName: `${prefix} Student ${i}`, gender: i % 2 ? "male" : "female" });
    await enrollStudent(inst, auth, userId, { studentId: s.id, classId: cls.id, sectionId: sec.id, academicYearId: year!.id });
  }
  return cls.id;
}

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db); await applyPlatformSeeds(db);
  inst = await seedDemoInstitution(db, "hall-school");
  const a = await seedDemoUser(db, inst, "admin@hall.example", "Hall Admin", "institution_admin");
  auth = a.authUserId; userId = a.userId;
  g5 = await seedGrade("Grade 5", "G5", 4);
  g6 = await seedGrade("Grade 6", "G6", 3);
  const year = await getCurrentAcademicYear(inst, auth);
  const type = (await listExamTypes(inst, auth)).find((t) => !t.is_daily_assessment)!;
  examId = (await createExamination(inst, auth, userId, { examTypeId: type.id, academicYearId: year!.id, name: "Second Term Examination 2026-27" })).id;
  await addExamClass(inst, auth, examId, g5, null);
  await addExamClass(inst, auth, examId, g6, null);
});
afterAll(async () => { const db = await getDbClient(); await db.close(); __resetDbClientForTests(); });

describe("hall tickets", () => {
  it("parses pasted timetable lines and reports bad ones", () => {
    const r = parseTimetableText("2026-12-01, 10:00-12:00, English\n02/12/2026 | 1:30 PM - 3 PM | Maths\nnonsense");
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1]).toMatchObject({ examDate: "2026-12-02", startTime: "13:30", endTime: "15:00" });
    expect(r.errors).toHaveLength(1);
    expect(formatClock("13:30")).toBe("1:30 PM");
  });

  it("makes no ticket for a grade whose timetable is not fed", async () => {
    const b = await buildHallTickets(inst, auth, { examinationId: examId });
    expect(b!.tickets).toHaveLength(0);
    expect([...b!.classesWithoutTimetable].sort()).toEqual(["Grade 5", "Grade 6"]);
  });

  it("generates one ticket per student, grouped by day, and copies a timetable to another grade", async () => {
    const r = await addExamTimetableFromText(inst, auth, userId, {
      examinationId: examId, classId: g5,
      text: "2026-12-01, 10:00-12:00, English\n2026-12-01, 13:00-15:00, Maths\n2026-12-03, 10:00-12:00, Science",
    });
    expect(r.added).toBe(3);
    await copyExamTimetable(inst, auth, userId, { examinationId: examId, fromClassId: g5, toClassIds: [g6] });
    const b = await buildHallTickets(inst, auth, { examinationId: examId });
    expect(b!.tickets).toHaveLength(7);
    expect(b!.classesWithoutTimetable).toEqual([]);
    const t = b!.tickets.find((x) => x.admissionNumber === "G5-1")!;
    expect(t.days.map((d) => [d.date, d.papers.length])).toEqual([["2026-12-01", 2], ["2026-12-03", 1]]);
    expect(t.seat).toBeNull();
    const only6 = await buildHallTickets(inst, auth, { examinationId: examId, classId: g6 });
    expect(only6!.tickets).toHaveLength(3);
  });

  it("replaces a paper re-added in the same slot and lets an entry be removed", async () => {
    await addExamTimetableEntry(inst, auth, userId, { examinationId: examId, classId: g5, subjectLabel: "English II", examDate: "2026-12-01", startTime: "10:00" });
    const rows = await listExamTimetable(inst, auth, examId, g5);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.startTime === "10:00" && r.examDate === "2026-12-01")!.subjectLabel).toBe("English II");
    await deleteExamTimetableEntry(inst, auth, userId, rows[2].id);
    expect(await listExamTimetable(inst, auth, examId, g5)).toHaveLength(2);
  });

  it("includes seats only when asked, and warns when there is no plan", async () => {
    const noPlan = await buildHallTickets(inst, auth, { examinationId: examId, includeSeating: true });
    expect(noPlan!.seatingMissing).toBe("no_plan");
    await createExamRoom(inst, auth, userId, { name: "Hall 1", benchCount: 10, seatsPerBench: 2 });
    const room = (await listExamRooms(inst, auth, {}))[0];
    await generateSeatingPlan(inst, auth, userId, { examinationId: examId, roomIds: [room.id], adHocRooms: [] } as never);
    const withSeats = await buildHallTickets(inst, auth, { examinationId: examId, includeSeating: true });
    expect(withSeats!.tickets.every((t) => t.seat?.room === "Hall 1")).toBe(true);
    const without = await buildHallTickets(inst, auth, { examinationId: examId, includeSeating: false });
    expect(without!.tickets.every((t) => t.seat === null)).toBe(true);
  });

  it("saves ticket settings and defaults the instructions", async () => {
    const before = await getHallTicketSettings(inst, auth);
    expect(before.ticketTitle).toBe("ADMISSION TICKET");
    expect(before.instructions.length).toBeGreaterThan(0);
    await saveHallTicketSettings(inst, auth, userId, { ...before, ticketTitle: "HALL TICKET", showSignature: false, instructions: before.instructions.join("\n") });
    const after = await getHallTicketSettings(inst, auth);
    expect(after).toMatchObject({ ticketTitle: "HALL TICKET", showSignature: false });
  });
});
