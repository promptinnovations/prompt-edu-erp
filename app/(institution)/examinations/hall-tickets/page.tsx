import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../services/modules/module-service";
import { can } from "../../../../services/permissions/permission-service";
import { listExaminations } from "../../../../modules/examination/service";
import { listClasses, listSections, listSubjects } from "../../../../modules/academic/service";
import { getHallTicketSettings, listExamClasses, listExamTimetable } from "../../../../modules/examination/hall-ticket-service";
import ExamPicker from "../seating/ExamPicker";
import HallTicketSettingsForm from "./HallTicketSettingsForm";
import TimetableManager from "./TimetableManager";

/**
 * Examinations > Hall tickets: feed each grade's exam timetable, set how the
 * ticket looks, then print one ticket per student — with or without the seat.
 */
export default async function HallTicketsPage({ searchParams }: { searchParams: Promise<{ examinationId?: string; classId?: string }> }) {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");
  if (!can(ctx.permissions, "examinations.halltickets.manage")) redirect("/examinations");

  const { examinationId = "", classId = "" } = await searchParams;
  const [examinations, settings] = await Promise.all([listExaminations(institutionId, authUserId), getHallTicketSettings(institutionId, authUserId)]);
  const exam = examinations.find((e) => e.id === examinationId) ?? null;

  const [examClasses, allSections, subjects, timetable] = exam
    ? await Promise.all([
        listExamClasses(institutionId, authUserId, exam.id),
        listSections(institutionId, authUserId),
        listSubjects(institutionId, authUserId),
        listExamTimetable(institutionId, authUserId, exam.id),
      ])
    : [[], [], [], []];
  const classes = examClasses.length > 0 ? examClasses : [];
  const selectedClass = classes.find((c) => c.id === classId) ?? classes[0] ?? null;
  const countByClass = new Map<string, number>();
  for (const t of timetable) countByClass.set(t.classId, (countByClass.get(t.classId) ?? 0) + 1);
  void listClasses;

  const pill = (active: boolean) => `rounded-full border px-3 py-1 text-sm ${active ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[var(--border-subtle)] bg-white text-[var(--foreground)] hover:bg-primary-50"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--heading)]">Hall tickets</h1>
        <p className="mt-1 text-sm text-zinc-500">Feed each grade&apos;s examination timetable once; the system prints a ticket for every student — with or without the seat.</p>
      </div>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Examination</h2>
        <ExamPicker examinations={examinations} examinationId={exam?.id ?? ""} />
      </section>

      {exam && classes.length === 0 ? (
        <p className="text-sm text-amber-700">
          This examination has no grades yet — link its classes on the{" "}
          <Link href={`/examinations/${exam.id}`} className="underline">examination page</Link> first.
        </p>
      ) : null}

      {exam && selectedClass ? (
        <>
          <section className="rounded-card border bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">1 · Timetable of each grade</h2>
            <p className="mb-3 text-sm text-zinc-500">Pick a grade, then add its papers. Grades with a timetable show how many papers they have.</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {classes.map((c) => (
                <Link key={c.id} href={`/examinations/hall-tickets?examinationId=${exam.id}&classId=${c.id}`} className={pill(c.id === selectedClass.id)}>
                  {c.name}{countByClass.get(c.id) ? ` · ${countByClass.get(c.id)}` : " · —"}
                </Link>
              ))}
            </div>
            <TimetableManager
              key={`${exam.id}:${selectedClass.id}`}
              examinationId={exam.id}
              classId={selectedClass.id}
              className={selectedClass.name}
              entries={timetable.filter((t) => t.classId === selectedClass.id)}
              subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
              otherClasses={classes.filter((c) => c.id !== selectedClass.id).map((c) => ({ id: c.id, name: c.name }))}
            />
          </section>

          <section className="rounded-card border bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">2 · Print the tickets</h2>
            <p className="mb-3 text-sm text-zinc-500">
              Choose a grade (and division), and whether each ticket shows the student&apos;s seat from{" "}
              <Link href={`/examinations/seating?examinationId=${exam.id}`} className="underline">Seating Arrangement</Link>.
            </p>
            <form method="get" action="/examinations/hall-tickets/print" target="_blank" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="examinationId" value={exam.id} />
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Grade</label>
                <select name="classId" defaultValue={selectedClass.id} className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-sm">
                  <option value="">All grades of this examination</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Division</label>
                <select name="sectionId" defaultValue="" className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-sm">
                  <option value="">All divisions</option>
                  {classes.map((c) => (
                    <optgroup key={c.id} label={c.name}>
                      {allSections.filter((s) => s.class_id === c.id).map((s) => <option key={s.id} value={s.id}>{c.name} {s.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <fieldset className="flex items-center gap-4 pb-1.5 text-sm">
                <label className="flex items-center gap-1.5"><input type="radio" name="seating" value="0" defaultChecked={!settings.includeSeating} /> Without seat</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="seating" value="1" defaultChecked={settings.includeSeating} /> With seat</label>
              </fieldset>
              <button type="submit" className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]">Preview &amp; print</button>
            </form>
          </section>
        </>
      ) : null}

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Ticket settings</h2>
        <p className="mb-3 text-sm text-zinc-500">Title, contact lines under the school name, instructions and the signature column. Applies to every examination.</p>
        <HallTicketSettingsForm settings={settings} />
      </section>
    </div>
  );
}
