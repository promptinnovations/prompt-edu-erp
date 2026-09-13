/**
 * PROMPT EDU ERP — Examinations > Seating Arrangement service (migration
 * 0049).
 *
 * Three responsibilities, in this order:
 *   1. CRUD for exam_rooms, the reusable classroom master list.
 *   2. generateSeatingPlan() — pull the examination's roster, hand it plus
 *      the chosen rooms to the pure allocator in ./seating-allocator.ts,
 *      and persist the result as a plan + snapshotted rooms + assignments.
 *   3. Read-back: the room-wise chart (for the screen) and the flat
 *      sticker list (for printing), both already in the order they should
 *      be rendered.
 *
 * Every rule about WHO sits WHERE lives in the allocator, not here — this
 * file only knows how to load the inputs and write down the answer.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { sortRoster, gradeSortKey } from "../../services/academic/roster-order";
import {
  allocateSeats,
  type AllocatorRoom, type AllocatorStudent, type GenderRule,
} from "./seating-allocator";

export { SeatingCapacityError } from "./seating-allocator";
export type { GenderRule } from "./seating-allocator";

// ---------------------------------------------------------------------------
// Exam rooms (the reusable master list)
// ---------------------------------------------------------------------------
export interface ExamRoomRecord {
  id: string;
  name: string;
  bench_count: number;
  seats_per_bench: number;
  gender_restriction: "male" | "female" | null;
  is_active: boolean;
  /** bench_count x seats_per_bench, computed for display. */
  capacity: number;
}

const examRoomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  benchCount: z.number().int().min(1).max(500),
  seatsPerBench: z.number().int().min(1).max(10),
  genderRestriction: z.enum(["male", "female"]).nullable().optional(),
  isActive: z.boolean().optional(),
});

const EXAM_ROOM_COLUMNS = "id, name, bench_count, seats_per_bench, gender_restriction, is_active";

function toRoomRecord(row: Omit<ExamRoomRecord, "capacity">): ExamRoomRecord {
  return { ...row, capacity: row.bench_count * row.seats_per_bench };
}

/** Rooms in "Room 2 before Room 10" order — reuses roster-order's
 *  gradeSortKey(), which already does exactly this leading-number-then-text
 *  comparison for class names, rather than a second near-identical
 *  natural-sort helper living here. */
function compareRoomNames(a: string, b: string): number {
  const [an, at] = gradeSortKey(a);
  const [bn, bt] = gradeSortKey(b);
  if (an !== bn) return an - bn;
  return at.localeCompare(bt);
}

export async function listExamRooms(
  institutionId: string, authUserId: string, opts: { includeInactive?: boolean } = {}
): Promise<ExamRoomRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    // The is_active filter is spliced into the SQL TEXT rather than bound,
    // because a bound parameter that never appears in the statement is a
    // hard Postgres error (42P18 "could not determine data type of
    // parameter") — the exact bug this repo hit in modules/fees/service.ts.
    // Nothing user-supplied is interpolated: it is a fixed literal chosen
    // by a boolean.
    const activeFilter = opts.includeInactive ? "" : " where is_active = true";
    const { rows } = await scoped.query<Omit<ExamRoomRecord, "capacity">>(
      `select ${EXAM_ROOM_COLUMNS} from exam_rooms${activeFilter}`
    );
    return rows.map(toRoomRecord).sort((a, b) => compareRoomNames(a.name, b.name));
  });
}

export async function createExamRoom(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof examRoomSchema>
): Promise<ExamRoomRecord> {
  const data = examRoomSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: existing } = await scoped.query<{ id: string }>(
      "select id from exam_rooms where name = $1", [data.name]
    );
    if (existing.length > 0) throw new Error(`A room named "${data.name}" already exists.`);

    const { rows } = await scoped.query<Omit<ExamRoomRecord, "capacity">>(
      `insert into exam_rooms (institution_id, name, bench_count, seats_per_bench, gender_restriction, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning ${EXAM_ROOM_COLUMNS}`,
      [institutionId, data.name, data.benchCount, data.seatsPerBench, data.genderRestriction ?? null, userId]
    );
    await recordAudit(scoped, {
      institutionId, userId, action: "create", module: "examination",
      entityType: "exam_rooms", entityId: rows[0].id, after: data,
    });
    return toRoomRecord(rows[0]);
  });
}

export async function updateExamRoom(
  institutionId: string, authUserId: string, userId: string, roomId: string, input: z.infer<typeof examRoomSchema>
): Promise<ExamRoomRecord> {
  const data = examRoomSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: clash } = await scoped.query<{ id: string }>(
      "select id from exam_rooms where name = $1 and id <> $2", [data.name, roomId]
    );
    if (clash.length > 0) throw new Error(`A room named "${data.name}" already exists.`);

    const { rows } = await scoped.query<Omit<ExamRoomRecord, "capacity">>(
      `update exam_rooms
          set name = $1, bench_count = $2, seats_per_bench = $3, gender_restriction = $4,
              is_active = $5, updated_at = now()
        where id = $6
       returning ${EXAM_ROOM_COLUMNS}`,
      [data.name, data.benchCount, data.seatsPerBench, data.genderRestriction ?? null, data.isActive ?? true, roomId]
    );
    if (!rows[0]) throw new Error("Room not found.");
    await recordAudit(scoped, {
      institutionId, userId, action: "update", module: "examination",
      entityType: "exam_rooms", entityId: roomId, after: data,
    });
    return toRoomRecord(rows[0]);
  });
}

/** Deleting a master room never damages an already-generated plan: each
 *  plan snapshots the room's name/benches/seats into
 *  exam_seating_plan_rooms, whose exam_room_id is `on delete set null`. */
export async function deleteExamRoom(
  institutionId: string, authUserId: string, userId: string, roomId: string
): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>("delete from exam_rooms where id = $1 returning id", [roomId]);
    if (rows.length === 0) throw new Error("Room not found.");
    await recordAudit(scoped, {
      institutionId, userId, action: "delete", module: "examination", entityType: "exam_rooms", entityId: roomId,
    });
  });
}

// ---------------------------------------------------------------------------
// Roster for one examination
// ---------------------------------------------------------------------------
export interface SeatingRosterRow {
  student_id: string;
  full_name: string;
  admission_number: string;
  gender: string | null;
  roll_number: number | null;
  class_id: string;
  class_name: string;
  section_name: string | null;
  stage: string | null;
}

/** Every actively-enrolled student in the classes/divisions this
 *  examination covers — the same exam_classes join getMarksGrid() uses
 *  (including its `ec.section_id is null` = "the whole grade" semantics),
 *  returned in canonical roster order via sortRoster(). */
export async function listSeatingRoster(
  institutionId: string, authUserId: string, examinationId: string
): Promise<SeatingRosterRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SeatingRosterRow>(
      `select distinct s.id as student_id, s.full_name, s.admission_number, s.gender,
              se.roll_number, c.id as class_id, c.name as class_name, c.stage,
              sec.name as section_name
         from exam_classes ec
         join classes c on c.id = ec.class_id
         join student_enrollments se on se.class_id = ec.class_id
              and (ec.section_id is null or se.section_id = ec.section_id) and se.status = 'active'
         join students s on s.id = se.student_id and s.status = 'active'
         left join sections sec on sec.id = se.section_id
        where ec.examination_id = $1`,
      [examinationId]
    );
    return sortRoster(rows);
  });
}

// ---------------------------------------------------------------------------
// Plan generation
// ---------------------------------------------------------------------------
const adHocRoomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  benchCount: z.number().int().min(1).max(500),
  seatsPerBench: z.number().int().min(1).max(10),
  genderRestriction: z.enum(["male", "female"]).nullable().optional(),
});

const generateSchema = z.object({
  examinationId: z.string().uuid(),
  /** Ids from the exam_rooms master list. */
  roomIds: z.array(z.string().uuid()).default([]),
  /** Rooms borrowed for this one exam — never written to the master list. */
  adHocRooms: z.array(adHocRoomSchema).default([]),
});

export interface GenerateSeatingPlanResult {
  planId: string;
  studentCount: number;
  seatCount: number;
  roomCount: number;
  genderRule: GenderRule;
  /** Rooms that ended up holding both boys and girls (best-effort only). */
  mixedRoomNames: string[];
  /** Students seated with no gender on record — the rule can't apply to them. */
  unknownGenderCount: number;
}

/**
 * Builds (or rebuilds) the seating plan for one examination. Regenerating
 * REPLACES the previous plan for that examination — exam_seating_plans is
 * unique on (institution_id, examination_id) precisely so "the seating plan
 * for this exam" is never ambiguous on a printed sticker.
 *
 * Throws SeatingCapacityError, with a message naming the actual blocker,
 * when the chosen rooms can't seat everyone under the institution's active
 * boys/girls rule and the no-same-grade-per-bench rule.
 */
export async function generateSeatingPlan(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof generateSchema>
): Promise<GenerateSeatingPlanResult> {
  const data = generateSchema.parse(input);
  if (data.roomIds.length === 0 && data.adHocRooms.length === 0) {
    throw new Error("Select at least one room, or add an ad-hoc room for this exam.");
  }

  const roster = await listSeatingRoster(institutionId, authUserId, data.examinationId);

  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: examRows } = await scoped.query<{ id: string }>(
      "select id from examinations where id = $1", [data.examinationId]
    );
    if (!examRows[0]) throw new Error("Examination not found.");

    const { rows: instRows } = await scoped.query<{ exam_seating_gender_rule: GenderRule }>(
      "select exam_seating_gender_rule from institutions where id = $1", [institutionId]
    );
    const genderRule: GenderRule = instRows[0]?.exam_seating_gender_rule ?? "best_effort";

    // Master rooms, in the caller's chosen order — the chart and the
    // printed stickers both follow this order, so it is worth preserving
    // rather than re-sorting behind the admin's back.
    const { rows: masterRooms } = await scoped.query<{
      id: string; name: string; bench_count: number; seats_per_bench: number; gender_restriction: "male" | "female" | null;
    }>(
      `select id, name, bench_count, seats_per_bench, gender_restriction
         from exam_rooms where id = any($1::uuid[])`,
      [data.roomIds]
    );
    if (masterRooms.length !== data.roomIds.length) {
      throw new Error("One of the selected rooms no longer exists — reload the page and try again.");
    }
    const masterById = new Map(masterRooms.map((r) => [r.id, r]));

    interface PlanRoomInput extends AllocatorRoom {
      examRoomId: string | null;
      isAdHoc: boolean;
    }
    const planRooms: PlanRoomInput[] = [
      ...data.roomIds.map((id) => {
        const r = masterById.get(id)!;
        return {
          key: `master:${r.id}`, examRoomId: r.id, isAdHoc: false, name: r.name,
          benchCount: r.bench_count, seatsPerBench: r.seats_per_bench, genderRestriction: r.gender_restriction,
        };
      }),
      ...data.adHocRooms.map((r, i) => ({
        key: `adhoc:${i}`, examRoomId: null, isAdHoc: true, name: r.name,
        benchCount: r.benchCount, seatsPerBench: r.seatsPerBench, genderRestriction: r.genderRestriction ?? null,
      })),
    ];

    const duplicateName = planRooms.find((r, i) => planRooms.findIndex((o) => o.name === r.name) !== i);
    if (duplicateName) throw new Error(`Two rooms in this plan are both named "${duplicateName.name}" — give the ad-hoc room a different name.`);

    const students: AllocatorStudent[] = roster.map((r) => ({
      studentId: r.student_id,
      fullName: r.full_name,
      classId: r.class_id,
      className: r.class_name,
      divisionName: r.section_name,
      rollNumber: r.roll_number,
      admissionNumber: r.admission_number,
      gender: r.gender,
    }));

    // Throws SeatingCapacityError before anything is written, so a failed
    // generation never leaves a half-built plan behind.
    const allocation = allocateSeats(students, planRooms, genderRule);

    const mixedRoomNames = planRooms.filter((r) => allocation.mixedRoomKeys.includes(r.key)).map((r) => r.name);

    await scoped.query("delete from exam_seating_plans where examination_id = $1", [data.examinationId]);

    const { rows: planRows } = await scoped.query<{ id: string }>(
      `insert into exam_seating_plans
         (institution_id, examination_id, gender_rule, student_count, seat_count, mixed_room_count, generated_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [institutionId, data.examinationId, genderRule, students.length, allocation.totalSeats, mixedRoomNames.length, userId]
    );
    const planId = planRows[0].id;

    const planRoomIdByKey = new Map<string, string>();
    for (const [index, room] of planRooms.entries()) {
      const { rows } = await scoped.query<{ id: string }>(
        `insert into exam_seating_plan_rooms
           (institution_id, plan_id, exam_room_id, name, bench_count, seats_per_bench, gender_restriction, is_ad_hoc, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id`,
        [institutionId, planId, room.examRoomId, room.name, room.benchCount, room.seatsPerBench, room.genderRestriction, room.isAdHoc, index]
      );
      planRoomIdByKey.set(room.key, rows[0].id);
    }

    for (const seat of allocation.seats) {
      await scoped.query(
        `insert into exam_seating_assignments
           (institution_id, plan_id, plan_room_id, student_id, class_id, bench_number, seat_number,
            student_name, class_name, division_name, roll_number, admission_number, gender)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          institutionId, planId, planRoomIdByKey.get(seat.roomKey), seat.student.studentId, seat.student.classId,
          seat.benchNumber, seat.seatNumber, seat.student.fullName, seat.student.className,
          seat.student.divisionName, seat.student.rollNumber, seat.student.admissionNumber, seat.student.gender,
        ]
      );
    }

    await recordAudit(scoped, {
      institutionId, userId, action: "generate", module: "examination",
      entityType: "exam_seating_plans", entityId: planId,
      after: { examinationId: data.examinationId, genderRule, students: students.length, rooms: planRooms.length, mixedRooms: mixedRoomNames },
    });

    return {
      planId,
      studentCount: students.length,
      seatCount: allocation.totalSeats,
      roomCount: planRooms.length,
      genderRule,
      mixedRoomNames,
      unknownGenderCount: allocation.unknownGenderCount,
    };
  });
}

export async function deleteSeatingPlan(
  institutionId: string, authUserId: string, userId: string, examinationId: string
): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      "delete from exam_seating_plans where examination_id = $1 returning id", [examinationId]
    );
    if (rows.length === 0) throw new Error("No seating plan exists for this examination.");
    await recordAudit(scoped, {
      institutionId, userId, action: "delete", module: "examination",
      entityType: "exam_seating_plans", entityId: rows[0].id,
    });
  });
}

// ---------------------------------------------------------------------------
// Read-back: room-wise chart + flat sticker list
// ---------------------------------------------------------------------------
export interface SeatingAssignmentRow {
  id: string;
  student_id: string | null;
  bench_number: number;
  seat_number: number;
  student_name: string;
  class_name: string;
  division_name: string | null;
  roll_number: number | null;
  admission_number: string | null;
  gender: string | null;
}

export interface SeatingPlanRoomChart {
  id: string;
  name: string;
  bench_count: number;
  seats_per_bench: number;
  gender_restriction: "male" | "female" | null;
  is_ad_hoc: boolean;
  /** Every bench, in order, with a null for each empty seat. */
  benches: Array<{ benchNumber: number; seats: Array<SeatingAssignmentRow | null> }>;
  seatedCount: number;
  isMixed: boolean;
}

export interface SeatingPlanChart {
  plan: {
    id: string;
    examination_id: string;
    gender_rule: GenderRule;
    student_count: number;
    seat_count: number;
    mixed_room_count: number;
    created_at: string;
  };
  rooms: SeatingPlanRoomChart[];
}

/** The room -> bench -> seat chart for one examination, or null if no plan
 *  has been generated yet. Empty seats are materialised as nulls here (the
 *  database only stores occupied ones) so the UI can draw a real bench. */
export async function getSeatingPlan(
  institutionId: string, authUserId: string, examinationId: string
): Promise<SeatingPlanChart | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: planRows } = await scoped.query<SeatingPlanChart["plan"]>(
      `select id, examination_id, gender_rule, student_count, seat_count, mixed_room_count, created_at
         from exam_seating_plans where examination_id = $1`,
      [examinationId]
    );
    if (!planRows[0]) return null;
    const plan = planRows[0];

    const { rows: roomRows } = await scoped.query<{
      id: string; name: string; bench_count: number; seats_per_bench: number;
      gender_restriction: "male" | "female" | null; is_ad_hoc: boolean;
    }>(
      `select id, name, bench_count, seats_per_bench, gender_restriction, is_ad_hoc
         from exam_seating_plan_rooms where plan_id = $1 order by sort_order`,
      [plan.id]
    );

    const { rows: seatRows } = await scoped.query<SeatingAssignmentRow & { plan_room_id: string }>(
      `select id, plan_room_id, student_id, bench_number, seat_number, student_name, class_name,
              division_name, roll_number, admission_number, gender
         from exam_seating_assignments where plan_id = $1 order by bench_number, seat_number`,
      [plan.id]
    );

    const seatsByRoom = new Map<string, Array<SeatingAssignmentRow & { plan_room_id: string }>>();
    for (const seat of seatRows) {
      const list = seatsByRoom.get(seat.plan_room_id);
      if (list) list.push(seat);
      else seatsByRoom.set(seat.plan_room_id, [seat]);
    }

    const rooms: SeatingPlanRoomChart[] = roomRows.map((room) => {
      const roomSeats = seatsByRoom.get(room.id) ?? [];
      const byPosition = new Map(roomSeats.map((s) => [`${s.bench_number}:${s.seat_number}`, s]));
      const benches = Array.from({ length: room.bench_count }, (_, b) => ({
        benchNumber: b + 1,
        seats: Array.from({ length: room.seats_per_bench }, (_, s) => byPosition.get(`${b + 1}:${s + 1}`) ?? null),
      }));
      const genders = new Set(roomSeats.map((s) => (s.gender ?? "").trim().toLowerCase()[0]));
      return {
        ...room,
        benches,
        seatedCount: roomSeats.length,
        isMixed: genders.has("m") && genders.has("f"),
      };
    });

    return { plan, rooms };
  });
}

export interface SeatingStickerRow extends SeatingAssignmentRow {
  room_name: string;
  is_ad_hoc: boolean;
}

/** One row per seated student, already in room -> bench -> seat order so a
 *  printed sheet can be cut apart and handed out room by room. */
export async function listSeatingStickers(
  institutionId: string, authUserId: string, examinationId: string
): Promise<SeatingStickerRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<SeatingStickerRow>(
      `select a.id, a.student_id, a.bench_number, a.seat_number, a.student_name, a.class_name,
              a.division_name, a.roll_number, a.admission_number, a.gender,
              r.name as room_name, r.is_ad_hoc
         from exam_seating_assignments a
         join exam_seating_plan_rooms r on r.id = a.plan_room_id
         join exam_seating_plans p on p.id = a.plan_id
        where p.examination_id = $1
        order by r.sort_order, a.bench_number, a.seat_number`,
      [examinationId]
    );
    return rows;
  });
}
