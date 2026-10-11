import { getAttendanceInsights } from "../../../../../modules/portal/student-insights";
import { requireOwnStudentId, NotLinkedNotice } from "../_lib";
import AttendanceView from "../../../../components/portal/student/AttendanceView";

/** Attendance — §Student-portal-visual-redesign. The day-level picture for
 *  the current academic year: ring, day-type donut, streaks, calendar
 *  heatmap, month-by-month bars, missed-days-by-weekday and leave history.
 *  Visuals: app/components/portal/student/AttendanceView.tsx. */
export default async function StudentAttendancePage() {
  const { institutionId, authUserId, ownStudentId } = await requireOwnStudentId();
  if (!ownStudentId) return <NotLinkedNotice />;
  const data = await getAttendanceInsights(institutionId, authUserId, ownStudentId);
  return <AttendanceView data={data} />;
}
