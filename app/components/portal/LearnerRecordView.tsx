import { formatDateIST, todayIST } from "../../../services/datetime/ist";
import PrintLetterhead from "../PrintLetterhead";
import PrintButton from "../PrintButton";
import { StudentDetailsCard } from "./ProfileSections";
import { ACTIVITY_CATEGORY_RE, type LearnerRecord } from "./learner-record-data";
import type { AchievementRow } from "../../../modules/achievements/service";

const LEVEL_ORDER = ["International", "National", "State", "District", "Zone", "School"];

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-card print:shadow-none">
      <h2 className="text-base font-semibold text-[var(--heading)]">{title}</h2>
      {subtitle ? <p className="mb-3 mt-0.5 text-xs text-zinc-500">{subtitle}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-400">{children}</p>;
}

function TrendChart({ points }: { points: Array<{ label: string; value: number }> }) {
  if (points.length < 2) return null;
  const w = 320, h = 90, pad = 14;
  const xs = points.map((_, i) => pad + (i * (w - pad * 2)) / (points.length - 1));
  const ys = points.map((p) => h - pad - (Math.max(0, Math.min(100, p.value)) / 100) * (h - pad * 2));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full max-w-sm" role="img" aria-label="Percentage trend across exams">
      <polyline fill="none" stroke="var(--brand)" strokeWidth="2" points={xs.map((x, i) => `${x},${ys[i]}`).join(" ")} />
      {points.map((p, i) => (
        <g key={p.label + i}>
          <circle cx={xs[i]} cy={ys[i]} r="3.5" fill="var(--brand)" />
          <text x={xs[i]} y={ys[i] - 7} textAnchor="middle" fontSize="9" fill="currentColor">{Math.round(p.value)}</text>
        </g>
      ))}
    </svg>
  );
}

function AchievementList({ items }: { items: AchievementRow[] }) {
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="font-medium text-[var(--foreground)]">{a.title.split(" — ")[0]}</div>
            <div className="text-xs text-zinc-500">
              {a.category_name} · {a.level_name}
              {a.certificate_file_id ? (
                <>
                  {" · "}
                  <a href={`/api/files/${a.certificate_file_id}`} className="text-[var(--brand)] underline" target="_blank" rel="noreferrer">Evidence</a>
                </>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 text-right font-semibold">{a.position ?? ""}</div>
        </li>
      ))}
    </ul>
  );
}

export default function LearnerRecordView({ record, backHref }: { record: LearnerRecord; backHref?: string }) {
  const { bundle } = record;
  const name = bundle.profile?.full_name ?? "Learner";
  const approved = bundle.achievements.filter((a) => a.status === "approved");
  const activities = approved.filter((a) => ACTIVITY_CATEGORY_RE.test(a.category_name));
  const awards = approved.filter((a) => !ACTIVITY_CATEGORY_RE.test(a.category_name));
  const byLevel = LEVEL_ORDER.map((lvl) => ({ lvl, items: awards.filter((a) => a.level_name === lvl) })).filter((g) => g.items.length > 0);
  const otherLevels = awards.filter((a) => !LEVEL_ORDER.includes(a.level_name));
  const podium = awards.filter((a) => a.position && /^(1st|2nd|3rd)$/i.test(a.position)).length;
  const trend = [...bundle.progress].reverse().map((e) => ({ label: e.examination_name, value: Number(e.percentage) }));
  const overallAvg = bundle.progress.length ? bundle.progress.reduce((a, e) => a + Number(e.percentage), 0) / bundle.progress.length : null;
  const reference = `${bundle.profile?.admission_number ?? "—"}-${todayIST().replace(/-/g, "")}`;

  return (
    <div className="space-y-5">
      <div className="no-print flex items-center justify-between">
        {backHref ? <a href={backHref} className="text-sm text-zinc-500 underline">← Back</a> : <span />}
        <PrintButton label="Print / Save as PDF" />
      </div>

      <div className="print-area space-y-5">
        <header className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-6 text-center shadow-card print:shadow-none">
          <PrintLetterhead institutionName={record.institutionName} logoCode={record.logoCode} />
          <p className="mt-2 text-lg font-semibold uppercase tracking-[0.1em] text-[var(--heading)]">Learner Record</p>
          <p className="text-sm text-zinc-500">
            {name}{record.academicYear ? ` · ${record.academicYear}` : ""} · Record ref. {reference}
          </p>
        </header>

        {/* At-a-glance summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { v: overallAvg != null ? `${overallAvg.toFixed(1)}%` : "—", l: `Average across ${bundle.progress.length} exam${bundle.progress.length === 1 ? "" : "s"}` },
            { v: record.attendance ? `${record.attendance.present_percent}%` : "—", l: "Attendance this year" },
            { v: String(approved.length), l: `Verified achievements · ${podium} on the podium` },
            { v: String(record.skills.length + activities.length), l: "Skills & activities logged" },
          ].map((s) => (
            <div key={s.l} className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-card print:shadow-none">
              <div className="text-xl font-semibold text-[var(--foreground)]">{s.v}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{s.l}</div>
            </div>
          ))}
        </div>

        {bundle.profile ? (
          <StudentDetailsCard student={bundle.profile} classLabel={bundle.classLabel} rollNumber={bundle.rollNumber} guardian={bundle.guardian} />
        ) : null}

        <Section title="Academic record" subtitle="Published exam results and subject strengths.">
          {bundle.progress.length === 0 ? <Empty>No published results yet.</Empty> : (
            <div className="space-y-4">
              <TrendChart points={trend} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                    <tr><th className="py-1 pr-4">Examination</th><th className="py-1 pr-4 text-right">Total</th><th className="py-1 pr-4 text-right">%</th><th className="py-1 pr-4">Grade</th><th className="py-1">Result</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {bundle.progress.map((e) => (
                      <tr key={e.examination_id}>
                        <td className="py-1.5 pr-4">{e.examination_name}</td>
                        <td className="py-1.5 pr-4 text-right">{Number(e.total_marks)} / {Number(e.max_total_marks)}</td>
                        <td className="py-1.5 pr-4 text-right">{Number(e.percentage).toFixed(1)}</td>
                        <td className="py-1.5 pr-4">{e.grade_label ?? "—"}</td>
                        <td className="py-1.5">{e.is_pass == null ? "—" : e.is_pass ? "Pass" : "Fail"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {record.strengths.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-zinc-600">Subject profile (average across exams)</h3>
                  <ul className="space-y-1.5">
                    {record.strengths.map((s) => (
                      <li key={s.subject} className="text-sm">
                        <div className="flex justify-between"><span>{s.subject}</span><span className="text-zinc-500">{s.average.toFixed(0)}%</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                          <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${Math.min(100, s.average)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-zinc-500">
                    Strongest: {record.strengths[0].subject}
                    {record.strengths.length > 1 ? ` · Focus area: ${record.strengths[record.strengths.length - 1].subject}` : ""}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </Section>

        <Section title="Awards & recognition" subtitle="Verified results, highest level first.">
          {awards.length === 0 ? <Empty>No verified awards yet.</Empty> : (
            <div className="space-y-4">
              {byLevel.map((g) => (
                <div key={g.lvl}>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">{g.lvl} level</h3>
                  <AchievementList items={g.items} />
                </div>
              ))}
              {otherLevels.length > 0 ? <AchievementList items={otherLevels} /> : null}
            </div>
          )}
        </Section>

        <Section title="Service, leadership & activities" subtitle="Community service, leadership roles, clubs and co-curricular involvement.">
          {activities.length === 0 && record.skills.length === 0 ? (
            <Empty>Nothing logged yet. Entries appear here once a teacher verifies them.</Empty>
          ) : (
            <div className="space-y-4">
              {activities.length > 0 ? <AchievementList items={activities} /> : null}
              {record.skills.length > 0 ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Skills &amp; competencies evidenced</h3>
                  <ul className="space-y-1.5 text-sm">
                    {record.skills.map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-muted)] px-3 py-2">
                        <span>{s.activity_name}</span>
                        <span className="text-xs text-zinc-500">
                          {s.submitted_at ? formatDateIST(s.submitted_at) : ""}
                          {s.evidence_file_id ? (
                            <> · <a href={`/api/files/${s.evidence_file_id}`} className="text-[var(--brand)] underline" target="_blank" rel="noreferrer">Evidence</a></>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </Section>

        <Section title="Character & values" subtitle="Teacher assessments by term.">
          {record.character.rows.length === 0 ? <Empty>No character assessments yet.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
                  <tr>
                    <th className="py-1 pr-4">Attribute</th>
                    {record.character.periods.map((p) => <th key={p} className="py-1 pr-4">{p}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {record.character.rows.map((r) => (
                    <tr key={r.attribute}>
                      <td className="py-1.5 pr-4">{r.attribute}</td>
                      {record.character.periods.map((p) => <td key={p} className="py-1.5 pr-4">{r.byPeriod[p]?.label ?? "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Teacher comments & goals" subtitle="Strengths, challenges and next-step goals from mentoring.">
          {record.mentoring.length === 0 ? <Empty>No mentoring notes yet.</Empty> : (
            <ul className="space-y-3">
              {record.mentoring.slice(0, 6).map((m) => (
                <li key={m.id} className="rounded-lg bg-[var(--surface-muted)] p-3 text-sm">
                  <div className="mb-1 text-xs text-zinc-500">{formatDateIST(m.date)} · {m.mentor_name}</div>
                  {m.strengths ? <p><span className="font-medium">Strengths:</span> {m.strengths}</p> : null}
                  {m.challenges ? <p><span className="font-medium">Areas to grow:</span> {m.challenges}</p> : null}
                  {m.goals ? <p><span className="font-medium">Goals:</span> {m.goals}</p> : null}
                  {m.action_plan ? <p><span className="font-medium">Action plan:</span> {m.action_plan}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Reading" subtitle={`${record.reading.length} book${record.reading.length === 1 ? "" : "s"} read`}>
          {record.reading.length === 0 ? <Empty>No books recorded yet.</Empty> : (
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {record.reading.slice(0, 20).map((r) => <li key={r.id} className="rounded-lg bg-[var(--surface-muted)] px-3 py-1.5">{r.book_title}</li>)}
            </ul>
          )}
        </Section>

        <footer className="flex items-center justify-between pt-2 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
          <span>Issued {formatDateIST(todayIST())} · Only teacher-verified entries are shown</span>
          <span>PROMPT EDU ERP · Prompt Innovations</span>
        </footer>
      </div>
    </div>
  );
}
