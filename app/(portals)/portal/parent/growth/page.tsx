import { getParentPortalSections } from "../../../../../services/institution/institution-service";
import { getGrowthInsights } from "../../../../../modules/portal/student-insights";
import { listDisciplineRecords } from "../../../../../modules/discipline/service";
import { formatDateIST } from "../../../../../services/datetime/ist";
import { requireOwnParentContext, NotLinkedNotice, NotEnabledNotice } from "../_lib";
import ChildPicker from "../ChildPicker";
import GrowthView from "../../../../components/portal/student/GrowthView";
import { Panel } from "../../../../components/portal/viz/blocks";

/** Parent → Growth & conduct — §Parent-portal-visual-redesign. Character
 *  profile, teacher's summary, recognitions and mentoring for the selected
 *  child, each shown only if its section is shared with parents. When the
 *  discipline section is on, parents also get a plain, factual "Notes from
 *  school" list of incidents (kept out of the charts on purpose). */
export default async function ParentGrowthPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, children, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const s = await getParentPortalSections(institutionId, authUserId);
  if (!s.character && !s.mentoring && !s.portfolio && !s.discipline) return <NotEnabledNotice what="Growth & conduct" />;

  const [g, discipline] = await Promise.all([
    getGrowthInsights(institutionId, authUserId, selectedChildId),
    s.discipline ? listDisciplineRecords(institutionId, authUserId, selectedChildId) : Promise.resolve([]),
  ]);
  const data = {
    ...g,
    attributes: s.character ? g.attributes : [],
    periods: s.character ? g.periods : [],
    recognitions: s.discipline ? g.recognitions : [],
    summary: s.portfolio ? g.summary : null,
    mentoring: s.mentoring ? g.mentoring : [],
  };
  const incidents = discipline.filter((r) => !r.is_positive).slice(0, 12);

  return (
    <GrowthView
      data={data}
      headerExtra={<ChildPicker options={children} selectedChildId={selectedChildId} />}
      schoolNotes={incidents.length > 0 ? (
        <Panel title="Notes from school" subtitle="Matters the school has recorded and may want to discuss with you." color="#79839a">
          <ul className="divide-y divide-[var(--border-subtle)]">
            {incidents.map((d) => (
              <li key={d.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--foreground)]">{d.category_name}{d.severity ? ` · ${d.severity}` : ""}</span>
                  <span className="text-xs text-zinc-500">{formatDateIST(d.date)}</span>
                </div>
                {d.description ? <p className="mt-0.5 text-zinc-600">{d.description}</p> : null}
                {d.action_taken ? <p className="mt-0.5 text-xs text-zinc-500">Action taken: {d.action_taken}</p> : null}
                {d.evidence_photo_file_id ? (
                  <a href={`/api/files/${d.evidence_photo_file_id}`} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-xs text-zinc-500 underline">View photo</a>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : undefined}
    />
  );
}
