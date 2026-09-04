/**
 * PROMPT EDU ERP — canonical class & student ordering, applied everywhere a
 * class or student list/dropdown is shown app-wide: Users & Roles, the
 * Students directory, the Classes hub, every "select a student" dropdown
 * (attendance, exam marks entry, discipline, mentoring, fees, library,
 * Daily Assessment...), report cards, registers.
 *
 * User's own words: "student list always must follow class & roll number
 * order... in every dropdown where students name to be selected this
 * should be followed. section (KG, LP, UP, HS, HSS, GRADUATION, POST
 * GRADUATION) GRADE (1,2,3,4,5 ETC.) class (A,B,C,D ETC.) order MUST BE
 * FOLLOWED EVERYWHERE" + "ROLL NUMBER ORDER: FIRST MALE (ALPHABETIC),
 * FOLLOWED BY GIRL ALPHABETIC ORDER".
 *
 * Vocabulary mapping (the user's terms -> this app's schema, per the
 * existing "A, B, C, D are divisions, section is like LP, UP, HS, HSS"
 * precedent already documented in app/(institution)/classes/page.tsx):
 *   "section"  -> classes.stage        (KG/LP/UP/HS/HSS/GRADUATION/POST GRADUATION)
 *   "GRADE"    -> classes.name         (e.g. "1", "Grade 5", "LKG")
 *   "class"    -> sections.name        (the division: A, B, C, D — labelled
 *                                        "Division" throughout the UI)
 *
 * Three-level class ordering:
 *   1. Stage bucket — STAGE_ORDER below, in that fixed order. A class whose
 *      stage isn't one of these known tokens (an institution's own custom
 *      vocabulary) sorts alphabetically right after the known stages; a
 *      class with no stage set at all sorts last of all.
 *   2. Grade — the leading number in the class name, compared numerically
 *      (so "10" sorts after "2", not before it as plain string sort would).
 *      Names with no leading number (LKG, UKG, Nursery, ...) sort after
 *      every numbered grade in the same stage, alphabetically among
 *      themselves.
 *   3. Division — plain alphabetical (A, B, C, D...).
 *
 * Student ordering within one class+division:
 *   1. roll_number ascending, when set (student_enrollments.roll_number) —
 *      students with a roll number always sort before ones without.
 *   2. The definition of "roll number order" for students who don't have
 *      one yet (and the tie-break rule): gender rank — male first, then
 *      female, then anything else — then full_name alphabetically. This is
 *      the exact rule modules/students/service.ts's assignRollNumbers()
 *      already used to COMPUTE roll numbers (the "Recompute roll numbers"
 *      button on the class detail page), now reused here as the read-time
 *      ordering rule too so the two never drift apart.
 */

export const STAGE_ORDER = ["KG", "LP", "UP", "HS", "HSS", "GRADUATION", "POST GRADUATION"];

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

/** Position of a stage within the fixed bucket order, for known stages
 *  only — see compareClasses() for how unknown/blank stages are placed
 *  relative to this. */
export function stageRank(stage: string | null | undefined): number {
  return STAGE_ORDER.indexOf(normalize(stage));
}

function isKnownStage(stage: string | null | undefined): boolean {
  return stageRank(stage) !== -1;
}

/** [numeric grade, lowercase name] — a class name with no leading number
 *  sorts after every numbered one (Number.MAX_SAFE_INTEGER), alphabetically
 *  among themselves via the second element. */
export function gradeSortKey(className: string | null | undefined): [number, string] {
  const name = (className ?? "").trim();
  const match = name.match(/\d+/);
  return match ? [parseInt(match[0], 10), name.toLowerCase()] : [Number.MAX_SAFE_INTEGER, name.toLowerCase()];
}

/** 0 = male, 1 = female, 2 = anything else (blank, "other", unrecognized
 *  free text) — tolerant of the mixed casings/spellings real data has
 *  ("M", "male", "MALE", "F", "female", ...). */
export function genderRank(gender: string | null | undefined): number {
  const g = normalize(gender);
  if (g === "M" || g === "MALE" || g === "BOY") return 0;
  if (g === "F" || g === "FEMALE" || g === "GIRL") return 1;
  return 2;
}

export interface ClassOrderFields {
  stage?: string | null;
  class_name?: string | null;
}

/** Compares two classes by stage bucket then numeric grade. Callers whose
 *  rows use different field names for stage/class-name should map to
 *  { stage, class_name } first. */
export function compareClasses(a: ClassOrderFields, b: ClassOrderFields): number {
  const aHasStage = (a.stage ?? "").trim() !== "";
  const bHasStage = (b.stage ?? "").trim() !== "";
  const aKnown = isKnownStage(a.stage);
  const bKnown = isKnownStage(b.stage);
  // Bucket 0: known stage (KG/LP/UP/.../POST GRADUATION), in that fixed
  // order. Bucket 1: institution's own custom stage text, alphabetically.
  // Bucket 2: no stage set at all, last of all.
  const aBucket = aKnown ? 0 : aHasStage ? 1 : 2;
  const bBucket = bKnown ? 0 : bHasStage ? 1 : 2;
  if (aBucket !== bBucket) return aBucket - bBucket;
  if (aBucket === 0) {
    const r = stageRank(a.stage) - stageRank(b.stage);
    if (r !== 0) return r;
  } else if (aBucket === 1) {
    const r = normalize(a.stage).localeCompare(normalize(b.stage));
    if (r !== 0) return r;
  }
  const [an, asName] = gradeSortKey(a.class_name);
  const [bn, bsName] = gradeSortKey(b.class_name);
  if (an !== bn) return an - bn;
  return asName.localeCompare(bsName);
}

export interface StudentOrderFields extends ClassOrderFields {
  /** The division (sections.name) — e.g. "A", "B". */
  section_name?: string | null;
  roll_number?: number | null;
  gender?: string | null;
  full_name: string;
}

/** The full roster ordering rule: class (stage -> grade -> division), then
 *  roll number, then (for students with no roll number yet) gender-then-
 *  name. Use this for every list of students spanning more than one class
 *  — plain sortByRollThenName() below is enough for a single-class roster. */
export function compareStudentRoster(a: StudentOrderFields, b: StudentOrderFields): number {
  const classCmp = compareClasses(a, b);
  if (classCmp !== 0) return classCmp;
  const aDiv = (a.section_name ?? "").trim();
  const bDiv = (b.section_name ?? "").trim();
  if (aDiv !== bDiv) {
    if (!aDiv) return 1; // no division assigned yet -> after divided students
    if (!bDiv) return -1;
    const r = aDiv.localeCompare(bDiv);
    if (r !== 0) return r;
  }
  return compareWithinDivision(a, b);
}

/** Roll-number-then-gender-then-name ordering for students already known
 *  to be in the same class+division (e.g. a single class's marks-entry
 *  grid) — skips the class comparison compareStudentRoster() does. */
export function compareWithinDivision(
  a: Pick<StudentOrderFields, "roll_number" | "gender" | "full_name">,
  b: Pick<StudentOrderFields, "roll_number" | "gender" | "full_name">
): number {
  const aRoll = a.roll_number ?? null;
  const bRoll = b.roll_number ?? null;
  if (aRoll !== null && bRoll !== null && aRoll !== bRoll) return aRoll - bRoll;
  if (aRoll !== null && bRoll === null) return -1;
  if (aRoll === null && bRoll !== null) return 1;
  const g = genderRank(a.gender) - genderRank(b.gender);
  if (g !== 0) return g;
  return a.full_name.localeCompare(b.full_name);
}

export function sortRoster<T extends StudentOrderFields>(rows: T[]): T[] {
  return [...rows].sort(compareStudentRoster);
}

export function sortWithinDivision<T extends Pick<StudentOrderFields, "roll_number" | "gender" | "full_name">>(rows: T[]): T[] {
  return [...rows].sort(compareWithinDivision);
}

export function sortClasses<T extends ClassOrderFields>(rows: T[]): T[] {
  return [...rows].sort(compareClasses);
}
