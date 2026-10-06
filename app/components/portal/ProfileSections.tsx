import Link from "next/link";
import { formatDateIST } from "../../../services/datetime/ist";
import { formatMarks } from "../../../services/format/marks";
import type { StudentProfileRecord, ParentLinkRow } from "../../../modules/students/service";
import type { AchievementRow } from "../../../modules/achievements/service";
import type { StudentProgressExam } from "./progress-data";

/** Shared by the student and parent portals so both show the same profile
 *  layout: Student Details card, Events & Competitions, Progress Card. */

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      {value ? (
        <div className="mt-0.5 text-sm font-medium text-[var(--foreground)]">{value}</div>
      ) : (
        <div className="mt-0.5 text-sm text-zinc-300">Not recorded</div>
      )}
    </div>
  );
}

function ageFrom(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

export function StudentDetailsCard({
  student, classLabel, rollNumber, guardian,
}: {
  student: StudentProfileRecord;
  classLabel: string | null;
  rollNumber: number | null;
  guardian: ParentLinkRow | null;
}) {
  const dob = student.date_of_birth ? String(student.date_of_birth).slice(0, 10) : null;
  return (
    <section className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-card">
      <h2 className="mb-4 text-base font-semibold text-[var(--heading)]">Student Details</h2>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Class" value={classLabel} />
        <Field label="Roll No." value={rollNumber != null ? String(rollNumber) : null} />
        <Field label="Admission No." value={student.admission_number} />
        <Field label="Date of Birth" value={dob ? `${formatDateIST(dob)} (${ageFrom(dob)} years)` : null} />
        <Field label="Gender" value={student.gender ? ({ m: "Male", f: "Female" } as Record<string, string>)[student.gender.toLowerCase()] ?? student.gender.charAt(0).toUpperCase() + student.gender.slice(1) : null} />
        <Field label="Admission Date" value={student.created_at ? formatDateIST(student.created_at) : null} />
        <Field label="Guardian" value={guardian?.full_name} />
        <Field label="Guardian Phone" value={guardian?.phone} />
        <Field label="Student Phone" value={student.contact_phone} />
        <Field label="Guardian Email" value={guardian?.email} />
        <Field label="Blood Group" value={student.blood_group} />
      </div>
      <div className="mt-4">
        <Field label="Address" value={student.address} />
      </div>
    </section>
  );
}

const PLACE_ICON: Record<string, string> = { "1st": "🏆", "2nd": "🥈", "3rd": "🥉" };

/** Titles imported from festival sheets look like
 *  "Pencil Drawing (Junior Girls) — House Ithqan, Grade A"; split the
 *  trailing house/grade off so it can be shown as its own detail. */
function splitTitle(title: string): { main: string; house: string | null; grade: string | null } {
  const [main, rest] = title.split(" — ");
  if (!rest) return { main: title, house: null, grade: null };
  const house = /House\s+([^,]+)/i.exec(rest)?.[1]?.trim() ?? null;
  const grade = /Grade\s+(.+)$/i.exec(rest)?.[1]?.trim() ?? null;
  return { main, house, grade };
}

export function EventsCompetitions({ achievements }: { achievements: AchievementRow[] }) {
  const approved = achievements.filter((a) => a.status === "approved");
  const podium = approved.filter((a) => a.position && /^(1st|2nd|3rd)$/i.test(a.position)).length;
  const groups = new Map<string, AchievementRow[]>();
  for (const a of approved) {
    const key = `${a.category_name} · ${a.level_name}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return (
    <section className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--heading)]">Events &amp; Competitions</h2>
        <span className="text-xs text-zinc-500">
          {approved.length} entr{approved.length === 1 ? "y" : "ies"} · {podium} on the podium
        </span>
      </div>
      {approved.length === 0 ? <p className="text-sm text-zinc-500">No events or competitions yet.</p> : null}
      <div className="space-y-4">
        {[...groups.entries()].map(([group, items]) => (
          <div key={group}>
            <h3 className="mb-2 text-sm text-zinc-600">{group}</h3>
            <ul className="space-y-2">
              {items.map((a) => {
                const t = splitTitle(a.title);
                const onPodium = !!a.position && /^(1st|2nd|3rd)$/i.test(a.position);
                return (
                  <li
                    key={a.id}
                    className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${onPodium ? "bg-amber-50" : "bg-[var(--surface-muted)]"}`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--foreground)]">{t.main}</div>
                      {t.house || t.grade ? (
                        <div className="text-xs text-zinc-500">
                          {t.house ? `House ${t.house}` : ""}{t.house && t.grade ? " · " : ""}{t.grade ? `Grade ${t.grade}` : ""}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold text-[var(--foreground)]">
                      {a.position ? <>{PLACE_ICON[a.position.toLowerCase()] ?? ""} {a.position}{onPodium ? " place" : ""}</> : <span className="text-zinc-400">Participated</span>}
                      {a.points ? <div className="text-xs font-normal text-zinc-500">{a.points} pts</div> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const GRADE_COLOR: Record<string, string> = {
  "A+": "#16a34a", A: "#22c55e", "B+": "#84cc16", B: "#facc15", "C+": "#f59e0b", C: "#f97316", "D+": "#ea580c", D: "#dc2626", E: "#b91c1c", F: "#b91c1c",
};

export function ProgressCard({ exams, reportCardHref }: { exams: StudentProgressExam[]; reportCardHref: (examinationId: string) => string }) {
  return (
    <section className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-card">
      <h2 className="text-base font-semibold text-[var(--heading)]">Progress Card</h2>
      <p className="mb-3 mt-0.5 text-xs text-zinc-500">Consolidated result per exam — tap an exam to see its subject-wise breakdown.</p>
      <div className="space-y-2">
        {exams.map((e) => (
          <details key={e.examination_id} className="group rounded-lg border border-[var(--border-subtle)]">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="text-xs text-zinc-400 transition-transform group-open:rotate-90">▸</span>
              <span className="font-medium text-[var(--foreground)]">{e.examination_name}</span>
              <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">Published</span>
              <span className="ml-auto flex items-center gap-3">
                <span className="text-zinc-600">{formatMarks(e.total_marks)} / {formatMarks(e.max_total_marks)}</span>
                <span className="text-zinc-600">{Number(e.percentage).toFixed(1)}%</span>
                {e.grade_label ? (
                  <span
                    className="rounded px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: GRADE_COLOR[e.grade_label] ?? "#71717a" }}
                  >
                    {e.grade_label}
                  </span>
                ) : null}
                {e.is_pass != null ? (
                  <span className={`text-sm font-medium ${e.is_pass ? "text-emerald-600" : "text-red-600"}`}>{e.is_pass ? "Pass" : "Fail"}</span>
                ) : null}
                <Link
                  href={reportCardHref(e.examination_id)}
                  className="text-xs text-[var(--brand)] hover:underline"
                  onClick={undefined}
                >
                  Report Card
                </Link>
              </span>
            </summary>
            <div className="overflow-x-auto border-t border-[var(--border-subtle)] px-4 py-3">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                  <tr>
                    <th className="py-1 pr-4">Subject</th>
                    <th className="py-1 pr-4 text-right">Marks</th>
                    <th className="py-1 pr-4 text-right">Out of</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {e.subjects.map((s) => (
                    <tr key={s.subject_name}>
                      <td className="py-1.5 pr-4">{s.subject_name}</td>
                      <td className="py-1.5 pr-4 text-right">{s.absent ? "Absent" : s.obtained != null ? formatMarks(s.obtained) : "—"}</td>
                      <td className="py-1.5 pr-4 text-right text-zinc-500">{formatMarks(s.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {exams.length === 0 ? <p className="text-sm text-zinc-500">No published results yet.</p> : null}
      </div>
    </section>
  );
}
