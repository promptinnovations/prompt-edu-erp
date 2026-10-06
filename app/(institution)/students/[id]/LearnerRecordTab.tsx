import { formatDateIST } from "../../../../services/datetime/ist";
import { LEARNER_SECTIONS, SECTION_META, type LearnerEntry } from "../../../../modules/learner-record/service";
import LearnerEntryForm from "../LearnerEntryForm";
import { deleteLearnerEntryAction } from "../learner-record-actions";

/** Staff-side Learner Record tab: every section is always available for
 *  entry here, while the student/parent portals show a section only once it
 *  has at least one entry. */
export default function LearnerRecordTab({ studentId, entries, canEdit }: { studentId: string; entries: LearnerEntry[]; canEdit: boolean }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        Entries added here appear on the student&apos;s and parents&apos; Learner Record as soon as they are saved. A section that has no entries stays hidden from them.
      </p>
      {canEdit ? <LearnerEntryForm studentId={studentId} /> : <p className="text-sm text-zinc-500">You can view but not edit this student&apos;s Learner Record.</p>}
      {LEARNER_SECTIONS.map((sec) => {
        const rows = entries.filter((e) => e.section === sec);
        return (
          <section key={sec} className="rounded-xl border border-[var(--border-subtle)] p-4">
            <h3 className="text-sm font-semibold text-[var(--heading)]">{SECTION_META[sec].label} <span className="font-normal text-zinc-400">· {rows.length}</span></h3>
            {rows.length === 0 ? <p className="mt-1 text-xs text-zinc-400">Nothing entered yet — hidden from the portals.</p> : (
              <ul className="mt-2 divide-y divide-[var(--border-subtle)] text-sm">
                {rows.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <div className="font-medium">{e.title}{e.value ? <span className="font-normal text-zinc-600"> — {e.value}</span> : null}</div>
                      <div className="text-xs text-zinc-500">
                        {formatDateIST(e.entry_date)}{e.period ? ` · ${e.period}` : ""}{e.level ? ` · ${e.level}` : ""}{e.hours ? ` · ${Number(e.hours)} h` : ""}
                        {e.entered_by_role === "student" ? " · added by student" : ""}
                        {e.evidence_file_id ? <> · <a className="text-[var(--brand)] underline" href={`/api/files/${e.evidence_file_id}`} target="_blank" rel="noreferrer">Evidence</a></> : null}
                      </div>
                      {e.detail ? <p className="mt-0.5 whitespace-pre-line text-xs text-zinc-600">{e.detail}</p> : null}
                    </div>
                    {canEdit ? (
                      <form action={deleteLearnerEntryAction}>
                        <input type="hidden" name="studentId" value={studentId} />
                        <input type="hidden" name="entryId" value={e.id} />
                        <button type="submit" className="text-xs text-zinc-500 underline hover:text-red-600">Delete</button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
