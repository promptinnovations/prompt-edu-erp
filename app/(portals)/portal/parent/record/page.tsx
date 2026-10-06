import { requireOwnParentContext, NotLinkedNotice } from "../_lib";
import { loadLearnerRecord } from "../../../../components/portal/learner-record-data";
import LearnerRecordView from "../../../../components/portal/LearnerRecordView";

/** Parent-portal Learner Record for whichever child is selected. */
export default async function ParentLearnerRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const { childId } = await searchParams;
  const { institutionId, authUserId, selectedChildId } = await requireOwnParentContext(childId);
  if (!selectedChildId) return <NotLinkedNotice />;
  const record = await loadLearnerRecord(institutionId, authUserId, selectedChildId);
  return <LearnerRecordView record={record} backHref={`/portal/parent?childId=${selectedChildId}`} />;
}
