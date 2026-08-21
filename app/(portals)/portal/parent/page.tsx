import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { getOwnParentId, listChildrenForParent, isOwnChild } from "../../../../modules/portal/service";
import { getStudent360 } from "../../../../modules/portfolio/service";
import { listLeaveApplicationsForStudent } from "../../../../modules/attendance/service";
import { getParentPortalSections } from "../../../../services/institution/institution-service";
import { listAchievements } from "../../../../modules/achievements/service";
import { listSkillSubmissions } from "../../../../modules/skills/service";
import { listReadingRecords } from "../../../../modules/library/service";
import { listCharacterAssessments, listCharacterRatingLabels } from "../../../../modules/discipline/service";
import { listMentoringRecordsForPortal } from "../../../../modules/mentoring/service";
import ChildPicker from "./ChildPicker";
import ApplyLeaveForm from "./ApplyLeaveForm";

export default async function ParentPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const { childId } = await searchParams;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const ownParentId = await getOwnParentId(institutionId, authUserId, ctx.userId);
  if (!ownParentId) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Your account isn&apos;t linked to a parent/guardian record yet. Ask your institution admin to set this up.
        </p>
      </div>
    );
  }

  const children = await listChildrenForParent(institutionId, authUserId, ownParentId);
  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No children are linked to your account yet.</p>
      </div>
    );
  }

  // §Z portal identity rule: a requested childId is only ever honoured if
  // isOwnChild() confirms it — never trust the query string to pick
  // WHICH child, only to pick AMONG this parent's own already-resolved set.
  const selectedChildId =
    childId && (await isOwnChild(institutionId, authUserId, ownParentId, childId))
      ? childId
      : children.find((c) => c.is_primary_contact)?.id ?? children[0].id;

  // §Page-3 follow-up "Student Portfolio Management — designing children's
  // page, what should be shown in the Parent portal" — one admin-controlled
  // toggle per section (institutions.parent_portal_sections, migration
  // 0032). canViewDiscipline is driven by THIS toggle, not the institution-
  // wide discipline.view permission — a parent seeing their OWN child's
  // discipline record is a different question from a staff member seeing
  // every student's.
  const sections = await getParentPortalSections(institutionId, authUserId);

  const [summary, childLeaves, achievements, skillSubmissions, readingRecords, characterAssessments, ratingLabels, mentoringNotes] = await Promise.all([
    getStudent360(institutionId, authUserId, selectedChildId, 10, { canViewDiscipline: sections.discipline }),
    can(ctx.permissions, "attendance.leave.apply")
      ? listLeaveApplicationsForStudent(institutionId, authUserId, selectedChildId)
      : Promise.resolve([]),
    sections.achievements ? listAchievements(institutionId, authUserId, undefined, undefined, selectedChildId) : Promise.resolve([]),
    sections.skills ? listSkillSubmissions(institutionId, authUserId, undefined, undefined, selectedChildId) : Promise.resolve([]),
    sections.library ? listReadingRecords(institutionId, authUserId, undefined, undefined, selectedChildId) : Promise.resolve([]),
    sections.character ? listCharacterAssessments(institutionId, authUserId, selectedChildId) : Promise.resolve([]),
    sections.character ? listCharacterRatingLabels(institutionId, authUserId) : Promise.resolve([]),
    sections.mentoring ? listMentoringRecordsForPortal(institutionId, authUserId, selectedChildId) : Promise.resolve([]),
  ]);
  const ratingLabelByValue = new Map(ratingLabels.map((r) => [r.rating, r.label]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My children</h1>
      <ChildPicker options={children} selectedChildId={selectedChildId} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {sections.attendance ? (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {summary.attendanceSummary ? `${summary.attendanceSummary.present_percent}%` : "—"}
            </div>
            <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Attendance (this year)</div>
          </div>
        ) : null}
        {sections.results ? (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {summary.latestResult ? `${summary.latestResult.percentage}%` : "—"}
            </div>
            <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {summary.latestResult ? `Latest: ${summary.latestResult.examination_name}` : "No results yet"}
            </div>
          </div>
        ) : null}
        {sections.portfolio ? (
          <>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                {summary.latestConsolidatedScore ? summary.latestConsolidatedScore.score : "—"}
              </div>
              <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Consolidated score</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{summary.recentPortfolioEvents.length}</div>
              <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Recent portfolio events</div>
            </div>
          </>
        ) : null}
      </div>

      {sections.portfolio ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Recent portfolio timeline</h2>
          <ul className="space-y-2 text-sm">
            {summary.recentPortfolioEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
                <span>{e.title}</span>
                <span className="text-zinc-400 dark:text-zinc-500">{e.event_date}</span>
              </li>
            ))}
            {summary.recentPortfolioEvents.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.discipline && summary.activeDisciplineFlags ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Discipline</h2>
          <ul className="space-y-2 text-sm">
            {summary.activeDisciplineFlags.map((d) => (
              <li key={d.id} className="border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span>{d.category_name}{d.severity ? ` — ${d.severity}` : ""}</span>
                  <span className="text-zinc-400 dark:text-zinc-500">{d.date}</span>
                </div>
                {d.action_taken ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Action taken: {d.action_taken}</p> : null}
                {d.evidence_photo_file_id ? (
                  <a href={`/api/files/${d.evidence_photo_file_id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-zinc-500 dark:text-zinc-400 underline">View photo</a>
                ) : null}
              </li>
            ))}
            {summary.activeDisciplineFlags.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing to flag.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.character ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Character assessments</h2>
          <ul className="space-y-2 text-sm">
            {characterAssessments.map((c) => (
              <li key={c.id} className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
                <span>{c.attribute_name} — {c.period}</span>
                <span className="text-zinc-400 dark:text-zinc-500">{ratingLabelByValue.get(c.rating) ?? c.rating} ({c.rating}/5)</span>
              </li>
            ))}
            {characterAssessments.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.mentoring ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Mentoring</h2>
          <ul className="space-y-2 text-sm">
            {mentoringNotes.map((m) => (
              <li key={m.id} className="border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span>{m.mentor_name}</span>
                  <span className="text-zinc-400 dark:text-zinc-500">{m.date}</span>
                </div>
                {m.goals ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Goals: {m.goals}</p> : null}
                {m.action_plan ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Action plan: {m.action_plan}</p> : null}
              </li>
            ))}
            {mentoringNotes.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.achievements ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Achievements</h2>
          <ul className="space-y-2 text-sm">
            {achievements.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
                <span>{a.title} ({a.category_name})</span>
                <span className="text-zinc-400 dark:text-zinc-500">{a.status}</span>
              </li>
            ))}
            {achievements.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.skills ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Skills</h2>
          <ul className="space-y-2 text-sm">
            {skillSubmissions.map((s) => (
              <li key={s.id} className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
                <span>{s.activity_name}</span>
                <span className="text-zinc-400 dark:text-zinc-500">{s.status}</span>
              </li>
            ))}
            {skillSubmissions.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.library ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Library — reading record</h2>
          <ul className="space-y-2 text-sm">
            {readingRecords.map((r) => (
              <li key={r.id} className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
                <span>{r.book_title}</span>
                <span className="text-zinc-400 dark:text-zinc-500">{r.review_status}</span>
              </li>
            ))}
            {readingRecords.length === 0 ? <li className="text-zinc-400 dark:text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {can(ctx.permissions, "attendance.leave.apply") ? (
        <ApplyLeaveForm
          studentId={selectedChildId}
          studentName={children.find((c) => c.id === selectedChildId)?.full_name ?? "your child"}
          leaves={childLeaves}
        />
      ) : null}
    </div>
  );
}
