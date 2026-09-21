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
import { listStudentFeeInvoices } from "../../../../modules/fees/service";
import { listStaff } from "../../../../modules/staff/service";
import Link from "next/link";
import ChildPicker from "./ChildPicker";
import ApplyLeaveForm from "./ApplyLeaveForm";
import PayFeeForm from "./PayFeeForm";
import SendMessageForm from "./SendMessageForm";
import SendKudosForm from "./SendKudosForm";
import StarOfTheWeekBanner from "../../../components/StarOfTheWeekBanner";

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
      <div className="rounded-card border bg-white p-6">
        <p className="text-sm text-zinc-500">
          Your account isn&apos;t linked to a parent/guardian record yet. Ask your institution admin to set this up.
        </p>
      </div>
    );
  }

  const children = await listChildrenForParent(institutionId, authUserId, ownParentId);
  if (children.length === 0) {
    return (
      <div className="rounded-card border bg-white p-6">
        <p className="text-sm text-zinc-500">No children are linked to your account yet.</p>
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

  const [summary, childLeaves, achievements, skillSubmissions, readingRecords, characterAssessments, ratingLabels, mentoringNotes, allInvoices, staffDirectory] = await Promise.all([
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
    can(ctx.permissions, "fees.pay_own")
      ? listStudentFeeInvoices(institutionId, authUserId, { studentId: selectedChildId })
      : Promise.resolve([]),
    can(ctx.permissions, "messages.send_to_staff") || can(ctx.permissions, "kudos.send")
      ? listStaff(institutionId, authUserId)
      : Promise.resolve([]),
  ]);
  const ratingLabelByValue = new Map(ratingLabels.map((r) => [r.rating, r.label]));
  const pendingInvoices = allInvoices.filter((i) => i.status === "pending" || i.status === "partial");
  const invoiceStatusBadge: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700",
    partial: "bg-amber-100 text-amber-700",
    pending: "bg-zinc-100 text-zinc-600",
    waived: "bg-sky-100 text-sky-700",
  };

  const selectedChild = children.find((c) => c.id === selectedChildId);

  return (
    <div className="space-y-6">
      <StarOfTheWeekBanner institutionId={institutionId} authUserId={authUserId} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {summary.student?.photo_file_id ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from our own /api/files route
            <img
              src={`/api/files/${summary.student.photo_file_id}`}
              alt=""
              className="h-14 w-14 rounded-full object-cover ring-2 ring-zinc-100"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-lg font-medium text-zinc-500 ring-2 ring-zinc-100">
              {(selectedChild?.full_name ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-[var(--heading)]">{selectedChild?.full_name ?? "My children"}</h1>
            {summary.student?.admission_number ? (
              <p className="mt-0.5 text-sm text-zinc-500">
                {summary.student.admission_number}{selectedChild?.relationship ? ` · ${selectedChild.relationship}` : ""}
              </p>
            ) : null}
          </div>
        </div>
        <ChildPicker options={children} selectedChildId={selectedChildId} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {sections.attendance ? (
          <Link
            href={`/portal/parent/attendance?childId=${selectedChildId}`}
            className="rounded-card border bg-white p-5 text-left transition-colors hover:border-[var(--brand)] hover:shadow-raised"
          >
            <div className="text-2xl font-semibold text-zinc-900">
              {summary.attendanceSummary ? `${summary.attendanceSummary.present_percent}%` : "—"}
            </div>
            <div className="mt-1 text-sm text-zinc-500">Attendance (this year)</div>
          </Link>
        ) : null}
        {sections.results ? (
          <Link
            href={`/portal/parent/results?childId=${selectedChildId}`}
            className="rounded-card border bg-white p-5 text-left transition-colors hover:border-[var(--brand)] hover:shadow-raised"
          >
            <div className="text-2xl font-semibold text-zinc-900">
              {summary.latestResult ? `${summary.latestResult.percentage}%` : "—"}
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              {summary.latestResult ? `Latest: ${summary.latestResult.examination_name}` : "No results yet"}
            </div>
          </Link>
        ) : null}
        {sections.portfolio ? (
          <>
            <Link
              href={`/portal/parent/results?childId=${selectedChildId}`}
              className="rounded-card border bg-white p-5 text-left transition-colors hover:border-[var(--brand)] hover:shadow-raised"
            >
              <div className="text-2xl font-semibold text-zinc-900">
                {summary.latestConsolidatedScore ? summary.latestConsolidatedScore.score : "—"}
              </div>
              <div className="mt-1 text-sm text-zinc-500">Consolidated score</div>
            </Link>
            <Link
              href={`/portal/parent/portfolio?childId=${selectedChildId}`}
              className="rounded-card border bg-white p-5 text-left transition-colors hover:border-[var(--brand)] hover:shadow-raised"
            >
              <div className="text-2xl font-semibold text-zinc-900">{summary.recentPortfolioEvents.length}</div>
              <div className="mt-1 text-sm text-zinc-500">Recent portfolio events</div>
            </Link>
          </>
        ) : null}
      </div>

      {sections.portfolio ? (
        <div className="rounded-card border bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Recent portfolio timeline</h2>
          <ul className="space-y-2 text-sm">
            {summary.recentPortfolioEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <span>{e.title}</span>
                <span className="text-zinc-500">{e.event_date}</span>
              </li>
            ))}
            {summary.recentPortfolioEvents.length === 0 ? <li className="text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.discipline && summary.activeDisciplineFlags ? (
        <div className="rounded-card border bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Discipline</h2>
          <ul className="space-y-2 text-sm">
            {summary.activeDisciplineFlags.map((d) => (
              <li key={d.id} className="border-b pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span>{d.category_name}{d.severity ? ` — ${d.severity}` : ""}</span>
                  <span className="text-zinc-500">{d.date}</span>
                </div>
                {d.action_taken ? <p className="mt-1 text-xs text-zinc-500">Action taken: {d.action_taken}</p> : null}
                {d.evidence_photo_file_id ? (
                  <a href={`/api/files/${d.evidence_photo_file_id}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-zinc-500 underline">View photo</a>
                ) : null}
              </li>
            ))}
            {summary.activeDisciplineFlags.length === 0 ? <li className="text-zinc-500">Nothing to flag.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.character ? (
        <div className="rounded-card border bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Character assessments</h2>
          <ul className="space-y-2 text-sm">
            {characterAssessments.map((c) => (
              <li key={c.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <span>{c.attribute_name} — {c.period}</span>
                <span className="text-zinc-500">{ratingLabelByValue.get(c.rating) ?? c.rating} ({c.rating}/5)</span>
              </li>
            ))}
            {characterAssessments.length === 0 ? <li className="text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.mentoring ? (
        <div className="rounded-card border bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Mentoring</h2>
          <ul className="space-y-2 text-sm">
            {mentoringNotes.map((m) => (
              <li key={m.id} className="border-b pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span>{m.mentor_name}</span>
                  <span className="text-zinc-500">{m.date}</span>
                </div>
                {m.goals ? <p className="mt-1 text-xs text-zinc-500">Goals: {m.goals}</p> : null}
                {m.action_plan ? <p className="mt-1 text-xs text-zinc-500">Action plan: {m.action_plan}</p> : null}
              </li>
            ))}
            {mentoringNotes.length === 0 ? <li className="text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.achievements ? (
        <div className="rounded-card border bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Achievements</h2>
          <ul className="space-y-2 text-sm">
            {achievements.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <span>{a.title} ({a.category_name})</span>
                <span className="text-zinc-500">{a.status}</span>
              </li>
            ))}
            {achievements.length === 0 ? <li className="text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.skills ? (
        <div className="rounded-card border bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Skills</h2>
          <ul className="space-y-2 text-sm">
            {skillSubmissions.map((s) => (
              <li key={s.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <span>{s.activity_name}</span>
                <span className="text-zinc-500">{s.status}</span>
              </li>
            ))}
            {skillSubmissions.length === 0 ? <li className="text-zinc-500">Nothing yet.</li> : null}
          </ul>
        </div>
      ) : null}

      {sections.library ? (
        <div className="rounded-card border bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Library — reading record</h2>
          <ul className="space-y-2 text-sm">
            {readingRecords.map((r) => (
              <li key={r.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <span>{r.book_title}</span>
                <span className="text-zinc-500">{r.review_status}</span>
              </li>
            ))}
            {readingRecords.length === 0 ? <li className="text-zinc-500">Nothing yet.</li> : null}
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

      {can(ctx.permissions, "fees.pay_own") ? (
        <div className="rounded-card border bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Fees</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-zinc-500">
                  <th className="py-1.5 pr-3">Category</th>
                  <th className="py-1.5 pr-3">Due date</th>
                  <th className="py-1.5 pr-3">Amount due</th>
                  <th className="py-1.5 pr-3">Paid</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {allInvoices.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="py-1.5 pr-3">{i.category_name}</td>
                    <td className="py-1.5 pr-3">{i.due_date ?? "—"}</td>
                    <td className="py-1.5 pr-3">₹{i.amount_due}</td>
                    <td className="py-1.5 pr-3">₹{i.amount_paid}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusBadge[i.status] ?? ""}`}>{i.status}</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <Link href={`/portal/parent/invoice/${i.id}?childId=${selectedChildId}`} className="text-xs text-[var(--brand)] hover:underline">
                        View / print invoice
                      </Link>
                    </td>
                  </tr>
                ))}
                {allInvoices.length === 0 ? <tr><td colSpan={6} className="py-3 text-center text-zinc-500">No fee invoices yet.</td></tr> : null}
              </tbody>
            </table>
          </div>

          <h3 className="mb-3 mt-6 text-sm font-semibold text-[var(--heading)]">Pay a pending fee</h3>
          <PayFeeForm
            invoices={pendingInvoices.map((i) => ({
              id: i.id,
              label: `${i.category_name} — ₹${(Number(i.amount_due) - Number(i.amount_paid)).toFixed(2)} pending (due ${i.due_date ?? "—"})`,
              balance: Number(i.amount_due) - Number(i.amount_paid),
            }))}
          />
        </div>
      ) : null}

      {can(ctx.permissions, "messages.send_to_staff") ? (
        <div className="rounded-card border bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Message a teacher or the principal</h2>
          <SendMessageForm
            studentId={selectedChildId}
            staffOptions={staffDirectory.map((s) => ({ userId: s.user_id, label: `${s.full_name}${s.designation ? ` — ${s.designation}` : ""}` }))}
          />
        </div>
      ) : null}

      {can(ctx.permissions, "kudos.send") ? (
        <div className="rounded-card border bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Send a flower or congratulations 🌸</h2>
          <SendKudosForm
            studentId={selectedChildId}
            studentName={children.find((c) => c.id === selectedChildId)?.full_name ?? "your child"}
            staffOptions={staffDirectory.map((s) => ({ id: s.id, full_name: s.full_name }))}
          />
        </div>
      ) : null}
    </div>
  );
}
