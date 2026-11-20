import { notFound, redirect } from "next/navigation";
import { requireRequestContext } from "../../../../../services/request-context";
import { can } from "../../../../../services/permissions/permission-service";
import { getStudentProfile } from "../../../../../modules/students/service";
import { loadLearnerRecord } from "../../../../components/portal/learner-record-data";
import LearnerRecordView from "../../../../components/portal/LearnerRecordView";

/**
 * §Portfolio-years ("Portfolio: PDF / printable export") — the staff copy
 * of a student's Learner Record: the whole longitudinal portfolio on one
 * printable page (Print / Save as PDF), for every year or one year
 * (?year=). Same document the student and parents see in their portals.
 */
export default async function StaffLearnerRecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  const [{ id }, { year }] = await Promise.all([params, searchParams]);
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  if (!ctx.isSuperAdmin && !can(ctx.permissions, "student.view") && !can(ctx.permissions, "student.view_all")) redirect("/dashboard");
  const profile = await getStudentProfile(institutionId, authUserId, id);
  if (!profile) notFound();
  const record = await loadLearnerRecord(institutionId, authUserId, id, year ?? null);
  return <LearnerRecordView record={record} backHref={`/students/${id}?tab=portfolio`} />;
}
