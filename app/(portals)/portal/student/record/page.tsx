import { requireOwnStudentId, NotLinkedNotice } from "../_lib";
import { loadLearnerRecord } from "../../../../components/portal/learner-record-data";
import OwnLearnerEntryForm from "../OwnLearnerEntryForm";
import LearnerRecordView from "../../../../components/portal/LearnerRecordView";

/** Learner Record — the student's consolidated, printable portfolio
 *  (academics, verified awards, service & activities, skills, character,
 *  teacher goals, reading). */
export default async function StudentLearnerRecordPage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;
  const record = await loadLearnerRecord(institutionId, authUserId, ownStudentId);
  return <LearnerRecordView record={record} backHref="/portal/student" studentForm={<OwnLearnerEntryForm />} />;
}
