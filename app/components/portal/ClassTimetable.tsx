import { getCurrentEnrollment } from "../../../modules/students/service";
import { listTimetable } from "../../../modules/substitution/service";
import { todayIST } from "../../../services/datetime/ist";
import TimetableGrid from "../TimetableGrid";
import { Panel, EmptyNote } from "./viz/blocks";
import { decorColor } from "./viz/palette";

/** Student / parent portal → the student's own class timetable this year. */
export default async function ClassTimetable({ institutionId, authUserId, studentId }: { institutionId: string; authUserId: string; studentId: string }) {
  const enrollment = await getCurrentEnrollment(institutionId, authUserId, studentId);
  const periods = enrollment
    ? await listTimetable(institutionId, authUserId, { classId: enrollment.class_id, sectionId: enrollment.section_id })
    : [];
  const dow = new Date(`${todayIST()}T00:00:00Z`).getUTCDay();
  const label = periods[0] ? `${periods[0].className} ${periods[0].sectionName}` : "Class timetable";
  return (
    <Panel title={label} subtitle="This week's periods" color={decorColor(0)}>
      {periods.length === 0 ? <EmptyNote>The timetable for this class hasn&apos;t been shared yet.</EmptyNote> : <TimetableGrid periods={periods} show="teacher" today={dow === 0 ? 7 : dow} />}
    </Panel>
  );
}
