/**
 * PROMPT EDU ERP — Exam seating allocator (Examinations > Seating
 * Arrangement, migration 0049).
 *
 * A PURE function: no database, no institution context, no I/O — it takes a
 * roster and a set of rooms and returns who sits where, or throws
 * SeatingCapacityError. modules/examination/seating-service.ts owns all the
 * SQL and calls this; keeping the rules here is what makes every branch of
 * them (both gender modes, the grade rule, the shortfall path) directly
 * testable without a database.
 *
 * The two rules it enforces:
 *
 * 1. No two students from the same GRADE may share a bench. Same grade in
 *    the same ROOM is fine and expected — the rule is about who a student
 *    can actually see and reach, i.e. their bench-mates. "Grade" is
 *    classes.id, so 5-A and 5-B are the same grade and may not share a
 *    bench, while 5-A and 6-A may.
 *
 * 2. Boys/girls separation, per the institution's own setting:
 *      'hard'        — a room never holds both boys and girls. If the
 *                      selected rooms can't absorb both groups separately,
 *                      generation fails with a shortfall message rather
 *                      than quietly mixing.
 *      'best_effort' — same preference, but a room MAY end up mixed when
 *                      that's the only way to seat everyone. Which rooms
 *                      ended up mixed is reported back so the UI can say so.
 *
 * A room's OWN gender_restriction ("Girls only") is honoured in both modes,
 * always — that is the institution stating a fact about the room, not a
 * preference the allocator may trade away.
 *
 * Students whose gender isn't recorded are a third group. They are seated
 * LAST, and they never make a room "mixed" — the separation rule can't
 * meaningfully apply to a value the school never captured, and failing a
 * whole generation over a blank field would be worse than seating them.
 * The count is reported back so the UI can flag it.
 */
import { genderRank } from "../../services/academic/roster-order";

export type GenderRule = "hard" | "best_effort";
export type GenderGroup = "male" | "female" | "other";

export interface AllocatorRoom {
  /** Stable identifier for this room within one allocation run. */
  key: string;
  name: string;
  benchCount: number;
  seatsPerBench: number;
  genderRestriction: "male" | "female" | null;
}

export interface AllocatorStudent {
  studentId: string;
  fullName: string;
  /** classes.id — the GRADE, the no-same-bench key (not the division). */
  classId: string;
  className: string;
  divisionName: string | null;
  rollNumber: number | null;
  admissionNumber: string;
  gender: string | null;
}

export interface AllocatedSeat {
  roomKey: string;
  /** 1-based. */
  benchNumber: number;
  /** 1-based, within the bench. */
  seatNumber: number;
  student: AllocatorStudent;
}

export interface AllocationResult {
  seats: AllocatedSeat[];
  /** Room keys that ended up holding both boys and girls (best-effort only). */
  mixedRoomKeys: string[];
  /** Students seated without a recorded gender — surfaced as a UI warning. */
  unknownGenderCount: number;
  totalSeats: number;
}

/** Thrown when the selected rooms cannot seat everyone under the active
 *  rules. Carries the numbers so callers can show them without re-deriving. */
export class SeatingCapacityError extends Error {
  readonly studentCount: number;
  readonly seatCount: number;
  readonly unseatedCount: number;

  constructor(message: string, counts: { studentCount: number; seatCount: number; unseatedCount: number }) {
    super(message);
    this.name = "SeatingCapacityError";
    this.studentCount = counts.studentCount;
    this.seatCount = counts.seatCount;
    this.unseatedCount = counts.unseatedCount;
  }
}

/** Reuses roster-order's tolerant gender parsing ("M"/"male"/"BOY"/...) —
 *  the same ranking the whole app already sorts rosters by, so "male" here
 *  can never drift from "male" there. */
export function genderGroupOf(gender: string | null | undefined): GenderGroup {
  const rank = genderRank(gender);
  return rank === 0 ? "male" : rank === 1 ? "female" : "other";
}

interface BenchState {
  seats: Array<AllocatorStudent | null>;
  classIds: Set<string>;
}

interface RoomState {
  room: AllocatorRoom;
  benches: BenchState[];
  /** Gender groups actually seated here so far — drives the hard rule. */
  present: Set<GenderGroup>;
  freeSeats: number;
}

function capacityOf(room: AllocatorRoom): number {
  return room.benchCount * room.seatsPerBench;
}

function newRoomState(room: AllocatorRoom): RoomState {
  return {
    room,
    benches: Array.from({ length: room.benchCount }, () => ({
      seats: Array.from({ length: room.seatsPerBench }, () => null),
      classIds: new Set<string>(),
    })),
    present: new Set<GenderGroup>(),
    freeSeats: capacityOf(room),
  };
}

/** Seats one student in the first bench that has a free seat AND no
 *  classmate from their own grade already on it. Gender is NOT checked here
 *  — callers decide which rooms a student is allowed into. */
function placeInRoom(state: RoomState, student: AllocatorStudent): boolean {
  for (const bench of state.benches) {
    if (bench.classIds.has(student.classId)) continue;
    const seatIndex = bench.seats.indexOf(null);
    if (seatIndex === -1) continue;
    bench.seats[seatIndex] = student;
    bench.classIds.add(student.classId);
    state.present.add(genderGroupOf(student.gender));
    state.freeSeats -= 1;
    return true;
  }
  return false;
}

/**
 * Fills one room from its own pool, bench by bench, always taking the next
 * student from whichever grade has the MOST students still waiting (among
 * grades not already on this bench). Largest-remaining-first is what keeps
 * a dominant grade from stranding itself: filling naively in roster order
 * would put 5-A's whole class in first, then have nowhere left to put 5-B.
 *
 * Returns the students it could not seat, in their original roster order.
 */
function fillRoom(state: RoomState, pool: AllocatorStudent[]): AllocatorStudent[] {
  // Insertion order of this map is first-appearance-in-roster order, which
  // is what makes the ties below break toward the earlier grade — the
  // allocation is fully deterministic for a given roster.
  const queues = new Map<string, AllocatorStudent[]>();
  for (const student of pool) {
    const queue = queues.get(student.classId);
    if (queue) queue.push(student);
    else queues.set(student.classId, [student]);
  }

  const seated = new Set<string>();
  for (const bench of state.benches) {
    for (let seat = 0; seat < state.room.seatsPerBench; seat += 1) {
      if (bench.seats[seat] !== null) continue;
      let bestClassId: string | null = null;
      let bestRemaining = 0;
      for (const [classId, queue] of queues) {
        if (queue.length === 0 || bench.classIds.has(classId)) continue;
        if (queue.length > bestRemaining) {
          bestRemaining = queue.length;
          bestClassId = classId;
        }
      }
      // Every remaining grade is already represented on this bench (or the
      // pool is exhausted) — leave the rest of the bench empty rather than
      // break rule 1, and move on to the next bench.
      if (bestClassId === null) break;
      const student = queues.get(bestClassId)!.shift()!;
      bench.seats[seat] = student;
      bench.classIds.add(bestClassId);
      state.present.add(genderGroupOf(student.gender));
      state.freeSeats -= 1;
      seated.add(student.studentId);
    }
  }

  return pool.filter((s) => !seated.has(s.studentId));
}

/** Whether `student` may be seated in `state` without breaking the room's
 *  own restriction or, under the hard rule, mixing genders. */
function roomAccepts(state: RoomState, student: AllocatorStudent, rule: GenderRule, allowMixing: boolean): boolean {
  const group = genderGroupOf(student.gender);
  // The room's own restriction is absolute in both modes.
  if (state.room.genderRestriction && group !== "other" && group !== state.room.genderRestriction) return false;
  if (group === "other") return true;
  // Purity is judged on who is actually SEATED here, not on the label the
  // planner gave the room — an empty "girls" room can still take boys.
  const opposite: GenderGroup = group === "male" ? "female" : "male";
  const wouldMix = state.present.has(opposite);
  if (!wouldMix) return true;
  return rule === "best_effort" && allowMixing;
}

/**
 * Decides, before any seat is filled, which unrestricted room serves which
 * gender group. Greedy: hand the largest remaining room to whichever group
 * is furthest from being housed. Rooms left over once both groups are
 * covered stay unlabelled and act as spare capacity for the spill pass.
 */
function labelRooms(rooms: AllocatorRoom[], demand: Record<"male" | "female", number>): Map<string, "male" | "female" | null> {
  const labels = new Map<string, "male" | "female" | null>();
  const unmet = { male: demand.male, female: demand.female };

  for (const room of rooms) {
    if (room.genderRestriction) {
      labels.set(room.key, room.genderRestriction);
      unmet[room.genderRestriction] = Math.max(0, unmet[room.genderRestriction] - capacityOf(room));
    }
  }

  const unrestricted = rooms
    .filter((r) => !r.genderRestriction)
    .sort((a, b) => capacityOf(b) - capacityOf(a) || a.name.localeCompare(b.name));

  for (const room of unrestricted) {
    if (unmet.male <= 0 && unmet.female <= 0) {
      labels.set(room.key, null);
      continue;
    }
    const group: "male" | "female" = unmet.male >= unmet.female ? "male" : "female";
    labels.set(room.key, group);
    unmet[group] = Math.max(0, unmet[group] - capacityOf(room));
  }

  return labels;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * @param students Already in canonical roster order (stage -> grade ->
 *   division -> roll number) — the allocator preserves that order within
 *   each grade, so seat numbers read sensibly down a room.
 * @param rooms In the order they should appear in the printed chart.
 */
export function allocateSeats(
  students: AllocatorStudent[],
  rooms: AllocatorRoom[],
  rule: GenderRule
): AllocationResult {
  const totalSeats = rooms.reduce((sum, r) => sum + capacityOf(r), 0);

  if (rooms.length === 0) {
    throw new SeatingCapacityError("Select at least one room (or add an ad-hoc room) before generating a seating plan.", {
      studentCount: students.length, seatCount: 0, unseatedCount: students.length,
    });
  }
  if (students.length === 0) {
    throw new SeatingCapacityError(
      "No students are enrolled in the classes/divisions this examination covers — link the exam's classes on its detail page first.",
      { studentCount: 0, seatCount: totalSeats, unseatedCount: 0 }
    );
  }

  const byGroup: Record<GenderGroup, AllocatorStudent[]> = { male: [], female: [], other: [] };
  for (const student of students) byGroup[genderGroupOf(student.gender)].push(student);

  const states = new Map<string, RoomState>();
  for (const room of rooms) states.set(room.key, newRoomState(room));

  const labels = labelRooms(rooms, { male: byGroup.male.length, female: byGroup.female.length });

  // Pass 1 — seat boys and girls in the rooms planned for them. Rooms are
  // visited in chart order so the printed plan reads room 1, room 2, ...
  const unseated: AllocatorStudent[] = [];
  for (const group of ["male", "female"] as const) {
    let queue = byGroup[group];
    for (const room of rooms) {
      if (queue.length === 0) break;
      if (labels.get(room.key) !== group) continue;
      const state = states.get(room.key)!;
      const take = queue.slice(0, state.freeSeats);
      const rest = queue.slice(state.freeSeats);
      queue = [...fillRoom(state, take), ...rest];
    }
    unseated.push(...queue);
  }

  // Pass 2 — students with no recorded gender, into spare (unlabelled)
  // rooms first so they get their own space when there is any to give.
  const spareRooms = rooms.filter((r) => labels.get(r.key) === null);
  let others = byGroup.other;
  for (const room of spareRooms) {
    if (others.length === 0) break;
    const state = states.get(room.key)!;
    const take = others.slice(0, state.freeSeats);
    const rest = others.slice(state.freeSeats);
    others = [...fillRoom(state, take), ...rest];
  }
  unseated.push(...others);

  // Pass 3 — spill. Anyone still standing goes into whatever space is left:
  // first into rooms that stay pure for them (the only option under the
  // hard rule), then — best-effort only — into a room that will end up
  // mixed. Kept in roster order so the fallback is deterministic too.
  const stillUnseated: AllocatorStudent[] = [];
  const rosterIndex = new Map(students.map((s, i) => [s.studentId, i]));
  unseated.sort((a, b) => (rosterIndex.get(a.studentId) ?? 0) - (rosterIndex.get(b.studentId) ?? 0));
  for (const student of unseated) {
    let placed = false;
    for (const allowMixing of [false, true]) {
      if (allowMixing && rule !== "best_effort") break;
      for (const room of rooms) {
        const state = states.get(room.key)!;
        if (state.freeSeats === 0) continue;
        if (!roomAccepts(state, student, rule, allowMixing)) continue;
        if (placeInRoom(state, student)) { placed = true; break; }
      }
      if (placed) break;
    }
    if (!placed) stillUnseated.push(student);
  }

  if (stillUnseated.length > 0) {
    throw new SeatingCapacityError(buildShortfallMessage(students, stillUnseated, totalSeats, rule), {
      studentCount: students.length, seatCount: totalSeats, unseatedCount: stillUnseated.length,
    });
  }

  const seats: AllocatedSeat[] = [];
  const mixedRoomKeys: string[] = [];
  for (const room of rooms) {
    const state = states.get(room.key)!;
    if (state.present.has("male") && state.present.has("female")) mixedRoomKeys.push(room.key);
    state.benches.forEach((bench, benchIdx) => {
      bench.seats.forEach((student, seatIdx) => {
        if (!student) return;
        seats.push({ roomKey: room.key, benchNumber: benchIdx + 1, seatNumber: seatIdx + 1, student });
      });
    });
  }

  return {
    seats,
    mixedRoomKeys,
    unknownGenderCount: byGroup.other.length,
    totalSeats,
  };
}

/** One message that names the actual blocker, because "generation failed"
 *  is useless to an admin holding a room list: too few seats overall, or
 *  enough seats that the rules can't reach. */
function buildShortfallMessage(
  students: AllocatorStudent[],
  unseated: AllocatorStudent[],
  totalSeats: number,
  rule: GenderRule
): string {
  const boys = unseated.filter((s) => genderGroupOf(s.gender) === "male").length;
  const girls = unseated.filter((s) => genderGroupOf(s.gender) === "female").length;
  const breakdown = [boys > 0 ? plural(boys, "boy") : null, girls > 0 ? plural(girls, "girl") : null]
    .filter(Boolean)
    .join(", ");

  const head = `Not enough usable seats: ${plural(unseated.length, "student")} could not be seated${breakdown ? ` (${breakdown})` : ""}.`;
  const counts = `The selected rooms hold ${plural(totalSeats, "seat")} for ${plural(students.length, "student")}.`;

  if (totalSeats < students.length) {
    return `${head} ${counts} Add another room, or add an ad-hoc room for this exam.`;
  }

  const why =
    rule === "hard"
      ? "there are enough seats overall, but boys and girls may not share a room under the current \"hard\" rule, and no two students from the same grade may share a bench"
      : "there are enough seats overall, but no two students from the same grade may share a bench, so some seats can't be used";
  const fix =
    rule === "hard"
      ? " Add another room, add an ad-hoc room, or switch the boys/girls rule to \"best effort\" in Settings."
      : " Add another room, or add an ad-hoc room with more benches (more benches with fewer seats each seats a single large grade better).";

  return `${head} ${counts} However, ${why}.${fix}`;
}
