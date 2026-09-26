# Examination Subsystem Specification

Status: **governing spec** for the examination/marks/result module in this
repo. This is a specification, not a description: it fixes the rules that
matter and leaves stack, styling and naming choices to the implementation.
Where a rule looks arbitrary, the reason is given in the original doc — keep
the reason if you ever need to adapt the rule for this school.

Drawn from a working system that has run real school examinations. Almost
every rule below exists because something went wrong once in that system.

Added requirement for this repo: **CE (Continuous Evaluation)** is an
institution-configurable option. When enabled, CE can be entered in one of two
modes, admin's choice per institution/exam:

1. **Total mode** — a single flat CE mark out of a configured maximum (e.g.
   "CE — out of 20").
2. **Component mode** — itemized `AssessmentComponent` rows (as in section 2 /
   7-8 below) that sum to the CE maximum.

Both modes must plug into the exact same absence/blank/denominator/grade rules
as every other subject component — CE is not a special case in the
computation function, only in how its marks are *collected*.

---

## 0. What to build

An examination subsystem with four parts:

1. **Exam setup** — define an exam, which classes sit it, and what is marked.
2. **Mark entry** — teachers type marks for their class and subject.
3. **Result computation** — turn marks into subject totals, percentages,
   grades and pass/fail.
4. **Analysis and reporting** — class, section, school, subject and teacher
   views; report cards; printable mark sheets.

Assumes an existing academic structure of **Section → Grade → Division
(class)**, a **Student** with an enrolment row per academic year, **Subject**,
**Teacher**, and a **TeacherAssignment** linking a teacher to a division and
subject for a year.

---

## 1. The decisions that matter most

**1.1 An absent student is not a zero.**
Absent, medical absence, exempted and not-applicable all mean the same thing
to the arithmetic: that subject leaves *both* the numerator and the
denominator. A child absent for one paper is judged on the papers they sat.
Never store 0 for an absence, and never let an absence drag a percentage down.
Show "Ab" in the UI, not "0".

**1.2 Blank is not the same as zero, and not the same as entered.**
A mark field left empty while the status is "Present" writes **nothing at
all** — no row. "Has this class been marked yet?" is answered by counting
rows; if a blank wrote a row, pressing Save on an untouched class would report
it as fully marked. The rule in code:

```
write a row only if (status is not PRESENT) or (a mark was actually typed)
```

A non-present status *is itself* the signal, so it writes a row with a null
mark.

**1.3 The denominator is the configured maximum, always.**
A subject's maximum is the sum of all its components, whether or not this
particular student has a row for each. Never shrink the denominator to "the
components they happened to sit".

**1.4 Every roster query must be filtered by academic year and by deleted
status.** A division usually is not year-scoped (the same "9 A" exists across
years), so a roster query without a year filter silently returns several
years of children. A student who has left keeps their enrolment row (so a
roll number can be restored), so every roster read needs
`enrolment.status <> DELETED AND student.status <> DELETED` — omitting the
second makes finished classes read "short 2" forever.

**1.5 Compute once, in one place.**
Result computation is a single pure function taking marks + configuration and
returning a result object. Every screen — marklist, report card, analysis,
export — calls that one function. The moment a second screen re-implements
"total for a subject", the two drift and a parent gets two different numbers
for the same child.

**1.6 Store what was awarded, don't recompute it later.**
A grade printed on a certificate must still read the same next year after
somebody edits the grade bands. Freeze the grade onto the result row when it
is finalised.

---

## 2. Data model

Names are suggestions; the shape is not.

```
Exam
  id, name, academicYearId, startDate, endDate, resultPublicationDate
  status          DRAFT | MARKS_ENTRY_OPEN | MARKS_ENTRY_CLOSED
                  | VERIFICATION | PUBLISHED | ARCHIVED
  templateCategory   snapshot of the template it came from; nullable
  termNumber         1 | 2 | 3 | null

ExamScope            which classes sit this exam
  id, examId, sectionId?, gradeId?, divisionId?
  -- all three nullable. NULL means "everything at that level".
  -- A whole-school exam is ONE row with all three null.

AssessmentComponent  one markable part of a subject within one exam
  id, examId, subjectId, name, maxMarks, passMarks?, displayOrder
  isAutoComputed     true = filled in by the system, read-only to teachers
  isTerminal         flag, not a name string, for a two-part (terminal / CE) split
  isCe               flag marking this component as part of the CE pool
                      (component mode only — see §CE below)

GradingScale         id, name, isDefault
GradeBand            id, gradingScaleId, minPct, maxPct, gradeLabel, gradePoint?
ExamGradingScale     examId (PK), gradingScaleId      -- optional per-exam override

MarkEntry            one row per (student, component)
  id, studentId, examId, subjectId, componentId?
  marksObtained?     null when not present
  qualitativeGrade?  for subjects marked with a letter, not a number
  status             PRESENT | ABSENT | MEDICAL_ABSENCE | EXEMPTED | NA
  enteredBy, enteredAt
  UNIQUE (studentId, examId, subjectId, componentId)

MarksSubmission      the task list and the progress tracker, in one table
  id, examId, divisionId, subjectId, teacherId?
  status             NOT_STARTED | IN_PROGRESS | SUBMITTED | VERIFIED | LOCKED
  submittedAt, submittedBy, verifiedAt, verifiedBy
  UNIQUE (examId, divisionId, subjectId)

InstitutionCeConfig  institution-level (or exam-level override) CE setting
  institutionId, examId?
  ceEnabled          boolean
  ceMode             TOTAL | COMPONENTS
  ceMaxMarks         used only when ceMode = TOTAL
```

**On the unique constraint for MarkEntry:** most databases treat
`NULL <> NULL`, so a unique index containing a nullable `componentId` will
not stop duplicate rows for letter-graded subjects. Always write through an
explicit select-then-insert-or-update, never a bare insert.

**Two derived concepts, not columns:**

- A subject is **examinable in this exam** if it has at least one
  `AssessmentComponent` row for that exam. There is no separate join table.
- A subject is **qualitative** (letter-graded, no marks) if its components sum
  to a maximum of zero — either no components at all, or one placeholder
  component with `maxMarks = 0`. Prefer the placeholder.

**CE (Continuous Evaluation), either mode:**

- **Total mode**: one `AssessmentComponent` row per subject with
  `name = "CE"`, `maxMarks = ceMaxMarks`, `isCe = true`. Marked exactly like
  any other component — one number, one max. Simplest, and correct by
  construction because it is not a special case anywhere downstream.
- **Components mode**: several `AssessmentComponent` rows per subject, each
  `isCe = true`, whose `maxMarks` sum to the subject's configured CE maximum.
  The subject's overall total still just sums every component (CE and
  non-CE) — CE components are ordinary components with a flag for *reporting*
  ("show CE breakdown on the report card"), never a separate arithmetic path.
- Switching modes for an institution changes how future components are
  *created*, never how existing `MarkEntry` rows are read — the result
  function only ever sees "components with marks", regardless of the `isCe`
  flag.

---

## 3. Exam setup

### 3.1 Creating an exam
Three paths: **Blank** (name, year, dates, type; status `DRAFT`, no scope, no
components), **From a template**, **Recurring, automated** (idempotent by
exact name; copy component configuration forward from the most recent
previous exam of the same series).

### 3.2 Templates
A template holds: name, category (`MONTHLY | MID_TERM | TERM | SPECIAL | …`),
which sections/grades it applies to, a default maximum mark, whether it
recurs. Creating from a template generates **scope rows only**, never
components (maximums vary per subject).

"Fill in default totals" action: walk every subject in scope, create a single
component at the template's default maximum **for subjects that have none**,
never touching subjects already configured. Safe to re-run.

Seed templates on first load by *name*, inserting only names that do not
already exist.

### 3.3 Subject eligibility
If parallel streams exist (a religious-studies stream alongside academic, or
subjects assessed only once a term), give `Subject` a category and write one
pure function answering "is this subject examinable in an exam of this
category?". Apply it both when writing components **and on every read**.
Include a `NONE` category meaning "never examinable".

### 3.4 Scope resolution
One resolver — `divisionsInScope(examId)` — every other feature calls. Per
scope row, narrow by precedence: division, else grade, else section, else
whole school. Union and de-duplicate by division id. Zero scope rows means
the exam applies to nobody — say so loudly, since marks entry cannot start.

### 3.5 Status, and what it actually gates

- **`MARKS_ENTRY_OPEN` is the only status in which any mark may be written.**
  Check server-side on every write action, not only in the UI.
- `DRAFT`/`ARCHIVED` drop out of task lists, dashboards, report-card pickers.
- `PUBLISHED` drops off pending lists and removes the "provisional" banner.
- Decide deliberately whether results are visible before publication.
- Allow reopening from any later status back to `MARKS_ENTRY_OPEN`.

---

## 4. Mark entry

### 4.1 The grid
Rows: students in roll-number order (numeric sort — `"10"` after `"9"`).
Columns: components, then running total, then live grade, then status
selector.

Inputs are **uncontrolled native form fields** — do not hold marks in
component state (instant typing on a cheap Android tablet matters).

- `inputmode="decimal"`, decimal step, min 0, max the component's maximum.
- Suppress number-input spinners; arrow keys/scroll wheel silently change a
  focused number input — prefer a plain text input with numeric validation.
- Hidden student-id field per row; read the roster back from the submitted
  form, never trust row order.

### 4.2 The running total and live grade
Client-computed, no network request per keystroke. Send grade bands to the
page once; look up locally. **The live preview must use exactly the same
formula as the server** (including any rounding), or teachers see a mismatch
between preview and printed grade.

### 4.3 Absence
One status selector per row: Present / Absent / Medical / Exempted. Changing
away from Present discards typed marks for that row — decide this explicitly
and tell the user. Whitelist the status server-side; unrecognised → Present.

### 4.4 Saving
Explicit save of the whole grid, one form, one action — no autosave. Real
feedback on the save button (pending → saved). Errors are *data* the page
renders inline, never a thrown/redacted exception.

### 4.5 Working offline
On submit, if offline: prevent submit, keep typed values in the DOM, tell the
teacher, auto re-submit on `online`. Global connection banner: offline /
syncing / synced. This survives a dropped connection, not a closed tab.

---

## 5. Submission tracking

`MarksSubmission` is generated on demand from scope × teacher assignments,
never maintained by hand — one batched insert, not a loop.

- **Authorise against the live teacher assignment, not the stored `teacherId`
  snapshot** on the submission row.
- **"Has this student been marked?" must ignore auto-computed components.**

Decide deliberately whether per-class verification (`VERIFIED`/`LOCKED`) is
real — either build it properly or delete unused states; a status nothing
sets is a lie in the schema. "Submitted" must not lock editing — gate editing
on the exam's status alone.

---

## 6. Bulk entry by spreadsheet

Download-fill-upload path. Template: header row + one row per student,
pre-filled with existing marks. Columns: student id, roll number, name, one
per component (labelled with its maximum), status.

- Match columns **by position**, ignoring header text. Reject wrong column
  count, naming the row.
- Match students by id first, fall back to roll number.
- **Validate every row before writing any row.** First failure named by row
  number; nothing saved.
- Empty cell = "untouched", not zero.
- UTF-8 BOM on export if any name may be non-Latin.
- **Exclude auto-computed columns from upload** (including CE-if-auto-derived
  in future), or a stray value overwrites the computed one.
- "Nothing was saved" is only true if you mean it — wrap writes in a
  transaction, or don't promise atomicity.

---

## 7. Auto-computed components (optional)

Model as a normal component with `isAutoComputed = true` — a real stored
mark every downstream calculation simply sums.

- Define the source pool explicitly by `(academic year, term number)`, never
  inferred from names/dates.
- A missing/absent source assessment excluded from both sides of the ratio,
  never counted as zero.
- No usable sources at all → clear the value (blank, not zero).
- Subjects never sat in source assessments get the full mark outright — keep
  that list in one named constant.
- Stored snapshot, recomputed only on request. Build a small audit screen
  distinguishing *never recalculated* (fixable) from *absent in everything*
  (not fixable).
- Round by normalising to a fixed scale first, banding, then scaling back.

---

## 8. Result computation — the exact rules

One pure function: `buildStudentResult(student, examConfiguration, marks)`.

### Per subject

```
maxTotal = Σ maxMarks of every component of this subject in this exam

if maxTotal == 0:                          -- qualitative subject
    total = null, pct = null, pass = null
    grade = the letter typed, but only if the status is PRESENT
    → excluded from every numeric aggregate

else if no mark rows exist:
    total = null, status = ABSENT

else if every row has the same non-PRESENT status:
    total = null, status = that status     -- not zero; excluded from aggregates

else:                                      -- at least one PRESENT row
    total = Σ marksObtained of PRESENT rows only   (treat null as 0)
    pct   = total / maxTotal * 100
    grade = band where pct >= minPct and pct <= maxPct
    pass:
        if any component defines passMarks:
            required = Σ (passMarks or 0) across all components
        else:
            required = maxTotal * 0.5
        pass = total >= required
```

CE components (either mode) are just components here — no branch in this
function cares whether `isCe` is set. That flag only changes report-card
presentation (whether a "CE breakdown" sub-table is shown).

### Overall

```
graded          = subjects where total is not null
overallTotal    = Σ graded.total
overallMax      = Σ graded.maxTotal
overallPct      = overallMax > 0 ? overallTotal / overallMax * 100 : 0
overallGrade    = band for overallPct
failedSubjects  = count of subjects where pass == false
overallPass     = failedSubjects == 0 AND overallPct >= 50
```

**Resolve before building:** the per-subject rule honours configured pass
marks; the overall rule uses a flat 50%. Pick one rule and apply it in both
places, or make the overall threshold configurable per exam — do not ship
both disagreeing silently.

### Grade bands
Inclusive at both ends, first match wins, ordered by minimum descending.
Beware gaps (`[80–89.99]` + `[90–100]` leaves `89.995` matching nothing) —
either use half-open ranges or validate on save that bands tile 0–100 with no
gap/overlap. Grades are descriptive; **pass/fail is separate and must not be
derived from the grade.**

### Ranking
If ranks are needed: sort by percentage descending;
`rank = (this pct == previous pct) ? previous rank : index + 1` (competition
ranking, 1,1,3). Decide tie/skip behaviour, write it down, test it.

### Two-part mark (terminal + CE/continuous)
Split on a **flag** (`isTerminal`), never a component's *name* string — a
rename must not silently break the split, rounding, or report-card columns.
Any rounding rule (e.g. round the CE part up once, as a sum) lives in exactly
one function every caller uses, including the live client preview.

---

## 9. Analysis

Built on the one result function. For each view, be explicit about the
**population** — who is counted.

| View | Metric | Population |
|---|---|---|
| Class | average of student percentages; pass %; grade distribution | students with at least one graded subject |
| Class | score bands (90+, 80–89, …) | same — include a "below 50" band |
| Class | per-subject average, pass %, best/weakest subject | whole roster, per subject |
| Class | top 5 by percentage | graded students |
| Class | needs intervention — below 40% in any subject | distinct students, not rows |
| Section / School | average, pass % | student-count-weighted means of class figures |
| Subject | average, highest, lowest, pass %, fail %, absent count, grade spread, below-40 list | one row per subject across the exam |
| Teacher | per paper: count, average, median, pass %, full marks, grade spread | papers taught, from teacher assignments |
| Teacher | roll-up across papers | weighted by paper count; each student counted once |
| Trend | per-exam average and pass % over time | last ~12 exams, chronological |
| Student | history across exams | their own results |

- **State whether an average is weighted.** Plain mean of student percentages
  vs. mean of class averages are different numbers — mixing them silently
  produces two official pass rates.
- **Never reconstruct a count from a rounded percentage** — carry counts.
- **Guard aggregates against subjects that do not apply** across grades in a
  multi-grade context; scope per class or filter each subject to the grades
  that actually offer it before counting absences.

Cache trend queries; invalidate on every mark write.

---

## 10. Report cards and printing

Browser print dialog as the export mechanism.

- One student per page, fixed page size, zero page margin, own inner padding,
  forced page break after each card except the last.
- **Scale type to subject count** — five density steps (≤6, ≤9, ≤12, ≤15,
  more) so both a 6-row and 15-row card fill one page.
- Pin signatures to the bottom regardless of row count.
- Force grade pills to plain black text, no background, in print stylesheet
  (browsers drop background colours when printing).
- One renderer for single student / whole class / any export.
- CE breakdown (component mode) prints as its own labelled sub-section under
  the subject row when `isCe` components exist, using the same renderer.

For an editable download: an HTML document with Word namespaces is a
legitimate shortcut, but is a second renderer that can drift — drive both from
the same data structure and test them together.

Per subject: marks, maximum, grade. Overall: total, out of, percentage,
grade, attendance. Dash for missing value, "Ab" for absence — never zero.

---

## 11. Charts

No charting library needed — bars/ring via SVG stroke-dasharray, rendered
server-side, no shipped JS. Minimum visible bar height for a count of one;
fixed categorical palette for data (never the brand colour).

---

## 12. Permissions

```
canEditSubjectInDivision(user, division, subject, year) =
     user is school-wide (admin / principal / vice principal)
  or user heads this section
  or user is the class teacher of this division
  or user is assigned to teach this subject in this division this year
```

Never trust a form field for scope — re-derive server-side. Read access is
broader than write access.

---

## 13. Performance rules

- Fetch marks for a whole roster in one query, keyed in memory.
- Generate submission rows in one batched insert.
- Grade-scope bulk recomputation.
- Cache dashboard/trend figures with a tag; invalidate on every mark write.
- Count with a database aggregate, never by fetching rows.

---

## 14. Acceptance tests

**Computation**
1. Three components 20/30/50, marks 15/20/40 → total 75, 75%, pass.
2. Absent for one of five subjects → excluded from total/maximum; % over the
   other four, not 0%.
3. Absent for every subject → % null/zero, never division-by-zero, card
   prints "Ab" throughout.
4. Qualitative subject never changes total/max/pct/pass.
5. Component pass marks 8+12, scores 9+11 → total 20 vs required 20 → pass
   (sum rule, not per-component).
6. Grade bands: exactly 90 → 90+ band; 89.99 → band below; 89.995 →
   whichever the stated rule says, written down.
7. Tied percentages → ranks match the stated tie rule.
8. **CE total mode**: CE component max 20, mark 15 → contributes 15/20 to
   subject total/max exactly like any component.
9. **CE components mode**: CE split into 3 components (10/5/5), one absent →
   that CE component excluded from both sides, same as any component-level
   absence; subject total unaffected in kind, only in degree.

**Entry**
10. Open a class, type nothing, save → no rows written, still "not started".
11. Type a mark, then set Absent, save → one row, status absent, mark null.
12. Mark above component maximum → refused, row named, nothing saved.
13. Live grade while typing equals stored grade after saving (fractional
    marks case).

**Spreadsheet**
14. Download template unchanged, upload → nobody becomes "entered".
15. Row with missing column → refused by row number, nothing written.
16. Value in an auto-computed (or CE-auto, if ever added) column → ignored or
    refused, never stored.

**Scope and roster**
17. Division reused across two years → only current year's children.
18. Student marked left → not in roster; class no longer reads incomplete.
19. Subject offered only to grade 9 → no absences for grade 8 in a
    whole-school exam.

**Printing**
20. Card with 6 subjects and card with 15 both occupy exactly one page.
21. Class of 40 → 40 pages, no blank trailing page.

---

## 15. Things that go wrong — carry this list forward

1. Rounding applied in one place, not another → screens disagree by one mark.
2. Two-part mark identified by component *name* → rename breaks split.
3. Two pass rules coexisting → "passed every subject, failed overall".
4. Roster query missing academic-year filter → previous years' children leak in.
5. Auto-computed (or CE) values writable through the spreadsheet path.
6. Setting a student absent overwrites an auto-computed component, staying
   wrong until recalculated.
7. A status in the schema that no code ever writes.
8. A percentage rounded, then multiplied back out to reconstruct a count.
9. Live client preview computing differently from the server.
10. "Nothing was saved" printed by code that already saved half the rows.

---

## 16. How this applies here

Name the stack (already fixed: this repo's existing Next.js/TypeScript/
Postgres stack), grade bands (already configurable via `grade_scales`/
`grade_bands`), pass rule (must be reconciled per §8 above — see audit), and
the two-part mark (CE, both modes, per the addition above). The data model and
pure computation function come first; every screen is a view of that
function.
