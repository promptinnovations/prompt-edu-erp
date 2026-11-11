import Link from "next/link";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { listClasses, listSections } from "../../../../modules/academic/service";
import { sortClasses } from "../../../../services/academic/roster-order";
import {
  getClassTeacherCoverage, coverageIncludes, listDetailsRoster, missingDetails, isValidPhone,
  DETAIL_FIELD_LABELS, PLACEHOLDER_VALUES,
} from "../../../../modules/student-details/service";
import DetailsForm, { type DetailsFormRow } from "./DetailsForm";

/** §Student-details ("incomplete details — class teachers must be able to
 *  fill them"). A class teacher sees only the classes/divisions they are
 *  class teacher of this academic year; admins (student.edit / super admin)
 *  see every class. Opens on students with missing details; "Show all"
 *  lists the whole division. */
export default async function CompleteStudentDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; sectionId?: string; show?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const unrestricted = ctx.isSuperAdmin || can(ctx.permissions, "student.edit");
  const [coverage, allClasses, allSections] = await Promise.all([
    unrestricted ? Promise.resolve(null) : getClassTeacherCoverage(institutionId, authUserId, ctx.userId),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
  ]);

  const classes = sortClasses(
    (coverage ? allClasses.filter((c) => coverage.byClass.has(c.id)) : allClasses)
      .map((c) => ({ ...c, class_name: c.name }))
  );
  const heading = (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Complete student details</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Fill in what is missing for your students — date of birth, gender, father&rsquo;s name and mobile number,
        and optionally the mother&rsquo;s details and address. A blank box keeps what is already saved.
      </p>
    </div>
  );

  if (classes.length === 0) {
    return (
      <div className="space-y-4">
        {heading}
        <p className="rounded-card border bg-white p-5 text-sm text-zinc-600">
          Student details are completed by each class&rsquo;s class teacher. You aren&rsquo;t assigned as class teacher
          of any class this academic year — ask an admin to add the assignment under Staff → Teacher assignments.
        </p>
      </div>
    );
  }

  const classId = classes.some((c) => c.id === sp.classId) ? sp.classId! : classes[0].id;
  const sections = allSections
    .filter((s) => s.class_id === classId)
    .filter((s) => !coverage || coverageIncludes(coverage, classId, s.id));
  const sectionId = sections.some((s) => s.id === sp.sectionId)
    ? sp.sectionId!
    : coverage && sections.length === 1 ? sections[0].id : "";
  const showAll = sp.show === "all";

  const roster = (await listDetailsRoster(institutionId, authUserId, classId, sectionId || null))
    .filter((r) => !coverage || coverageIncludes(coverage, r.class_id, r.section_id));

  const clean = (v: string | null) => (v && !PLACEHOLDER_VALUES.includes(v.trim().toLowerCase()) ? v : "");
  const genderValue = (g: string | null) => {
    const t = (g ?? "").trim().toLowerCase();
    if (t === "m" || t === "male" || t === "boy") return "male";
    if (t === "f" || t === "female" || t === "girl") return "female";
    return "";
  };
  const all: DetailsFormRow[] = roster.map((r) => {
    const keys = missingDetails(r);
    return {
      student_id: r.student_id,
      full_name: r.full_name,
      admission_number: r.admission_number,
      roll_number: r.roll_number,
      section_name: r.section_name,
      date_of_birth: r.date_of_birth ?? "",
      gender: genderValue(r.gender),
      address: clean(r.address),
      father_name: clean(r.father_name),
      // Keep a wrong number visible so the teacher can correct it; hide placeholders.
      father_phone: clean(r.father_phone),
      mother_name: clean(r.mother_name),
      mother_phone: clean(r.mother_phone),
      missing: keys.map((k) => (k === "fatherPhone" && clean(r.father_phone) && !isValidPhone(r.father_phone)
        ? "Mobile No looks wrong" : DETAIL_FIELD_LABELS[k])),
      missingKeys: keys,
    };
  });
  const incomplete = all.filter((r) => r.missingKeys.length > 0);
  const rows = showAll ? all : incomplete;
  const selectedClass = classes.find((c) => c.id === classId)!;
  const selectedSection = sections.find((s) => s.id === sectionId);
  const today = new Date().toISOString().slice(0, 10);
  const qs = (show: string) =>
    `/students/details?classId=${classId}${sectionId ? `&sectionId=${sectionId}` : ""}${show ? `&show=${show}` : ""}`;

  return (
    <div className="space-y-4">
      {heading}

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border bg-white p-4">
        <label className="text-xs font-medium text-zinc-600">
          Class
          <select name="classId" defaultValue={classId} className="mt-1 block rounded-full border px-3 py-1.5 text-sm">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Division
          <select name="sectionId" defaultValue={sectionId} className="mt-1 block rounded-full border px-3 py-1.5 text-sm">
            {!coverage || sections.length > 1 ? <option value="">All divisions</option> : null}
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {showAll ? <input type="hidden" name="show" value="all" /> : null}
        <button type="submit" className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-700">Load</button>
        <span className="text-xs text-zinc-500">
          {selectedClass.name}{selectedSection ? ` - ${selectedSection.name}` : ""}
        </span>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border bg-white px-4 py-3">
        <p className="text-sm text-zinc-700">
          {all.length === 0
            ? "No students are enrolled here this academic year."
            : incomplete.length === 0
              ? <>All <b>{all.length}</b> students have complete details.</>
              : <><b>{incomplete.length}</b> of {all.length} students still have missing details.</>}
        </p>
        {all.length > 0 ? (
          <div className="flex gap-1 rounded-full bg-zinc-100 p-1 text-xs">
            <Link href={qs("")} className={`rounded-full px-3 py-1 ${!showAll ? "bg-white font-medium shadow-sm" : "text-zinc-600"}`}>
              Missing details ({incomplete.length})
            </Link>
            <Link href={qs("all")} className={`rounded-full px-3 py-1 ${showAll ? "bg-white font-medium shadow-sm" : "text-zinc-600"}`}>
              All students ({all.length})
            </Link>
          </div>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <DetailsForm key={`${classId}:${sectionId}:${showAll}`} rows={rows} today={today} />
      ) : null}
    </div>
  );
}
