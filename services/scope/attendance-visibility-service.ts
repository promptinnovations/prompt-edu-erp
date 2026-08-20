/**
 * PROMPT EDU ERP — shared attendance-overview visibility resolver.
 *
 * §Attendance-follow-up-3 "Daily overview must be visible according to
 * roles — class for teacher, section wise for section heads, institution
 * wide - Principal, management". Every place that renders the Daily
 * overview table and/or the attendance trend chart(s) — the Attendance
 * page itself, the Dashboard widget, and the Analysis hub card — must agree
 * on exactly the same scoping rule, so this is resolved in ONE place and
 * imported everywhere rather than re-derived per page (the bug this
 * follow-up specifically called out: before this, the Dashboard/Analysis
 * widgets showed an institution-wide trend to EVERY role that could reach
 * the page, teacher included, while the Attendance page itself showed the
 * Daily overview only to attendance.edit holders — two different, silently
 * inconsistent rules for what should be one policy).
 */
import { can } from "../permissions/permission-service";
import { getTeacherClassScope } from "./teacher-scope-service";
import { getStaffSectionScope } from "./section-head-scope-service";
import type { AttendanceScope } from "../../modules/attendance/service";

export interface AttendanceVisibility {
  hasAccess: boolean;
  /** undefined = unrestricted (institution-wide); present = scoped. */
  scope?: AttendanceScope;
  label: string;
}

export async function resolveAttendanceVisibility(
  institutionId: string, authUserId: string, userId: string, permissions: Set<string>
): Promise<AttendanceVisibility> {
  const hasUnrestrictedEdit = can(permissions, "attendance.edit");
  if (hasUnrestrictedEdit) {
    return { hasAccess: true, scope: undefined, label: "Institution-wide" };
  }

  const hasSectionAccess = can(permissions, "attendance.view_section");
  const [teacherScope, sectionScope] = await Promise.all([
    getTeacherClassScope(institutionId, authUserId, userId),
    hasSectionAccess ? getStaffSectionScope(institutionId, authUserId, userId) : Promise.resolve(null),
  ]);

  if (sectionScope && sectionScope.stages.size > 0) {
    return { hasAccess: true, scope: { stages: [...sectionScope.stages] }, label: `Section: ${[...sectionScope.stages].join(", ")}` };
  }
  if (teacherScope.classIds.size > 0) {
    return { hasAccess: true, scope: { classIds: [...teacherScope.classIds] }, label: "Your class(es)" };
  }
  return { hasAccess: false, label: "" };
}
