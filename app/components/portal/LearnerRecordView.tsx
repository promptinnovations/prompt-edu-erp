import { headers } from "next/headers";
import { formatDateIST, todayIST } from "../../../services/datetime/ist";
import { createRecordToken } from "../../../services/learner-record/verification";
import { SECTION_META } from "../../../modules/learner-record/meta";
import type { LearnerEntry, LearnerSection } from "../../../modules/learner-record/service";
import PrintLetterhead from "../PrintLetterhead";
import PrintButton from "../PrintButton";
import RecordQr from "./RecordQr";
import { StudentDetailsCard } from "./ProfileSections";
import { ACTIVITY_CATEGORY_RE, type LearnerRecord } from "./learner-record-data";
import type { AchievementRow } from "../../../modules/achievements/service";

const LEVEL_ORDER = ["International", "National", "State", "District", "Zone", "School"];

/** Every section below renders ONLY when it has data — the portals never show
 *  an empty box. Staff enter data on the student's Learner Record tab. */
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-card print:shadow-none">
      <h2 className="text-base font-semibold text-[var(--heading)]">{title}</h2>
      {subtitle ? <p className="mb-3 mt-0.5 text-xs text-zinc-500">{subtitle}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
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
                <>{" · "}<a href={`/api/files/${a.certificate_file_id}`} className="text-[var(--brand)] underline" target="_blank" rel="noreferrer">Evidence</a></>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 text-right font-semibold">{a.position ?? ""}</div>
        </li>
      ))}
    </ul>
  );
}

function EntryList({ items, ownDelete }: { items: LearnerEntry[]; ownDelete?: React.ReactNode }) {
  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.id} className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-[var(--foreground)]">{e.title}{e.value ? <span className="font-normal text-zinc-600"> — {e.value}</span> : null}</div>
              <div className="text-xs text-zinc-500">
                {formatDateIST(e.entry_date)}{e.period ? ` · ${e.period}` : ""}{e.level ? ` · ${e.level}` : ""}{e.hours ? ` · ${Number(e.hours)} hours` : ""}
                {e.evidence_file_id ? <>{" · "}<a href={`/api/files/${e.evidence_file_id}`} className="text-[var(--brand)] underline" target="_blank" rel="noreferrer">Evidence</a></> : null}
              </div>
              {e.detail ? <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">{e.detail}</p> : null}
            </div>
          </div>
        </li>
      ))}
      {ownDelete}
    </ul>
  );
}

export default async function LearnerRecordView({
  record, backHref, studentForm,
}: {
  record: LearnerRecord; backHref?: string;
  /** Student portal only: node rendered after the record (add a reflection/goal). */
  studentForm?: React.ReactNode;
}) {
  const { bundle } = record;
  const name = bundle.profile?.full_name ?? "Learner";
  const by = (s: LearnerSection) => record.entries.filter((e) => e.section === s);

  const approved = bundle.achievements.filter((a) => a.status === "approved");
  const activityAchievements = approved.filter((a) => ACTIVITY_CATEGORY_RE.test(a.category_name));
  const awards = approved.filter((a) => !ACTIVITY_CATEGORY_RE.test(a.category_name));
  const byLevel = LEVEL_ORDER.map((lvl) => ({ lvl, items: awards.filter((a) => a.level_name === lvl) })).filter((g) => g.items.length > 0);
  const otherLevels = awards.filter((a) => !LEVEL_ORDER.includes(a.level_name));
  const podium = awards.filter((a) => a.position && /^(1st|2nd|3rd)$/i.test(a.position)).length;
  const activityEntries = by("activity");
  const serviceHours = activityEntries.reduce((a, e) => a + Number(e.hours ?? 0), 0);

  const trend = [...bundle.progress].reverse().map((e) => ({ label: e.examination_name, value: Number(e.percentage) }));
  const overallAvg = bundle.progress.length ? bundle.progress.reduce((a, e) => a + Number(e.percentage), 0) / bundle.progress.length : null;
  const today = todayIST();
  const reference = `${bundle.profile?.admission_number ?? "—"}-${today.replace(/-/g, "")}`;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const verifyUrl = bundle.profile && host ? `${proto}://${host}/verify/${createRecordToken(bundle.profile.id, today)}` : null;

  const tiles = [
    overallAvg != null ? { v: `${overallAvg.toFixed(1)}%`, l: `Average across ${bundle.progress.length} exam${bundle.progress.length === 1 ? "" : "s"}` } : null,
    record.attendance && record.attendance.total_days > 0 ? { v: `${record.attendance.present_percent}%`, l: "Attendance this year" } : null,
    approved.length > 0 ? { v: String(approved.length), l: `Verified achievements · ${podium} on the podium` } : null,
    serviceHours > 0 ? { v: `${serviceHours}`, l: "Service & activity hours" } : null,
  ].filter((t): t is { v: string; l: string } => !!t);

  const hasActivities = activityAchievements.length > 0 || activityEntries.length > 0 || record.skills.length > 0;
  const comments = by("teacher_comment");
  const goals = by("goal");
  const reflections = by("reflection");
  const hasTeacherNotes = record.mentoring.length > 0 || comments.length > 0;

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

        {tiles.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.l} className="rounded-card border border-[var(--border-subtle)] bg-[var(--surface)] p-4 shadow-card print:shadow-none">
                <div className="text-xl font-semibold text-[var(--foreground)]">{t.v}</div>
                <div className="mt-0.5 text-xs text-zinc-500">{t.l}</div>
              </div>
            ))}
          </div>
        ) : null}

        {bundle.profile ? (
          <StudentDetailsCard student={bundle.profile} classLabel={bundle.classLabel} rollNumber={bundle.rollNumber} guardian={bundle.guardian} />
        ) : null}

        {bundle.progress.length > 0 ? (
          <Section title="Academic record" subtitle="Published exam results and subject strengths.">
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
          </Section>
        ) : null}

        {by("quran").length > 0 ? (
          <Section title={SECTION_META.quran.label} subtitle={SECTION_META.quran.hint}><EntryList items={by("quran")} /></Section>
        ) : null}

        {by("language").length > 0 || by("certification").length > 0 ? (
          <Section title="Languages & certificates">
            <div className="space-y-4">
              {by("language").length > 0 ? <div><h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Languages</h3><EntryList items={by("language")} /></div> : null}
              {by("certification").length > 0 ? <div><h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Certificates</h3><EntryList items={by("certification")} /></div> : null}
            </div>
          </Section>
        ) : null}

        {awards.length > 0 ? (
          <Section title="Awards & recognition" subtitle="Verified results, highest level first.">
            <div className="space-y-4">
              {byLevel.map((g) => (
                <div key={g.lvl}>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">{g.lvl} level</h3>
                  <AchievementList items={g.items} />
                </div>
              ))}
              {otherLevels.length > 0 ? <AchievementList items={otherLevels} /> : null}
            </div>
          </Section>
        ) : null}

        {hasActivities ? (
          <Section title="Service, leadership & activities" subtitle="Community service, leadership roles, clubs and co-curricular involvement.">
            <div className="space-y-4">
              {activityAchievements.length > 0 ? <AchievementList items={activityAchievements} /> : null}
              {activityEntries.length > 0 ? <EntryList items={activityEntries} /> : null}
              {record.skills.length > 0 ? (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Skills &amp; competencies evidenced</h3>
                  <ul className="space-y-1.5 text-sm">
                    {record.skills.map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-muted)] px-3 py-2">
                        <span>{s.activity_name}</span>
                        <span className="text-xs text-zinc-500">
                          {s.submitted_at ? formatDateIST(s.submitted_at) : ""}
                          {s.evidence_file_id ? <> · <a href={`/api/files/${s.evidence_file_id}`} className="text-[var(--brand)] underline" target="_blank" rel="noreferrer">Evidence</a></> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {record.character.rows.length > 0 ? (
          <Section title="Character & values" subtitle="Teacher assessments by term.">
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
          </Section>
        ) : null}

        {by("house_points").length > 0 ? (
          <Section title={SECTION_META.house_points.label} subtitle={SECTION_META.house_points.hint}><EntryList items={by("house_points")} /></Section>
        ) : null}

        {by("health").length > 0 ? (
          <Section title={SECTION_META.health.label}><EntryList items={by("health")} /></Section>
        ) : null}

        {hasTeacherNotes ? (
          <Section title="Teacher comments & goals" subtitle="Narrative comments, strengths and next-step goals.">
            <div className="space-y-3">
              {comments.length > 0 ? <EntryList items={comments} /> : null}
              {record.mentoring.slice(0, 6).map((m) => (
                <div key={m.id} className="rounded-lg bg-[var(--surface-muted)] p-3 text-sm">
                  <div className="mb-1 text-xs text-zinc-500">{formatDateIST(m.date)} · {m.mentor_name}</div>
                  {m.strengths ? <p><span className="font-medium">Strengths:</span> {m.strengths}</p> : null}
                  {m.challenges ? <p><span className="font-medium">Areas to grow:</span> {m.challenges}</p> : null}
                  {m.goals ? <p><span className="font-medium">Goals:</span> {m.goals}</p> : null}
                  {m.action_plan ? <p><span className="font-medium">Action plan:</span> {m.action_plan}</p> : null}
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {goals.length > 0 ? <Section title="Goals" subtitle={SECTION_META.goal.hint}><EntryList items={goals} /></Section> : null}
        {reflections.length > 0 ? <Section title="Student reflections" subtitle={SECTION_META.reflection.hint}><EntryList items={reflections} /></Section> : null}

        {record.reading.length > 0 ? (
          <Section title="Reading" subtitle={`${record.reading.length} book${record.reading.length === 1 ? "" : "s"} read`}>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {record.reading.slice(0, 20).map((r) => <li key={r.id} className="rounded-lg bg-[var(--surface-muted)] px-3 py-1.5">{r.book_title}</li>)}
            </ul>
          </Section>
        ) : null}

        <footer className="flex items-end justify-between gap-4 pt-2 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
          <div>
            <div>Issued {formatDateIST(today)} · Only teacher-verified entries are shown</div>
            <div className="mt-1">PROMPT EDU ERP · Prompt Innovations</div>
          </div>
          {verifyUrl ? (
            <div className="flex items-center gap-2 text-right normal-case tracking-normal">
              <span className="max-w-[9rem] text-[10px] leading-tight text-zinc-500">Scan to verify this record is genuine</span>
              <RecordQr url={verifyUrl} size={72} />
            </div>
          ) : null}
        </footer>
      </div>

      {studentForm}
    </div>
  );
}
