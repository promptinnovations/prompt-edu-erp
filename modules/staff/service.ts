/**
 * PROMPT EDU ERP — Staff module service.
 * ARCHITECTURE.md §D.4 (People — staff), §D.3 (teacher_assignments),
 * §D.12 (Staff performance: portion plans/completion, teacher observations),
 * Phase 10 (§AA.2).
 *
 * Staff LEAVE deliberately reuses modules/attendance/service.ts's
 * leave_applications workflow with applicantType='staff' instead of the
 * dedicated (but workflow-less) staff_leave table from migration 0006 — see
 * database/migrations/0012_staff.sql's header comment and docs/SETUP.md for
 * the full rationale. Staff ATTENDANCE has no such generic equivalent (the
 * student attendance grid is keyed off class/section, which staff don't
 * have), so it gets its own functions here against staff_attendance,
 * reusing the same institution-configured attendance_statuses catalogue
 * (§K — one config table serves both student and staff attendance).
 *
 * Every function requires an explicit institutionId and runs through
 * db.withInstitutionContext, so RLS (§E Gate 2) and this institutionId
 * (§E Gate 1) must independently agree.
 */
import { z } from "zod";
import { getDbClient } from "../../services/db/client";
import type { DbClient } from "../../services/db/client";
import { recordAudit } from "../../services/audit/audit-service";
import { assertBelowLimit } from "../../services/limits/limit-service";
import { getAuthService } from "../../services/auth/auth-service";
import {
  applyForLeave as applyForLeaveGeneric,
  listLeaveApplications as listLeaveApplicationsGeneric,
  reviewLeaveApplication as reviewLeaveApplicationGeneric,
  type LeaveApplicationRecord,
} from "../attendance/service";
import { getStaffSectionScope } from "../../services/scope/section-head-scope-service";
import { DEFAULT_OBSERVATION_CRITERIA } from "./observation-rubric-defaults";

export interface StaffRecord {
  id: string; user_id: string; staff_code: string; designation: string | null;
  department: string | null; joining_date: string | null; employment_status: string;
}
export interface StaffRow extends StaffRecord {
  full_name: string; email: string | null; has_login: boolean;
  // §Staff photo follow-up ("once photo is added it should be visible
  // everywhere"): listStaff()/getStaffMember() below now select this so
  // the Staff directory card grid can show the same photo the profile
  // page already does, instead of only ever rendering initials.
  photo_file_id: string | null;
}
export interface StaffAttendanceGridRow {
  staff_id: string; full_name: string; staff_code: string;
  record_id: string | null; status_id: string | null;
}
export interface StaffAttendanceSummary {
  staff_id: string; total_days: number; present_days: number; absent_days: number; present_percent: number;
}
export interface PortionPlanRow {
  id: string; class_id: string; class_name: string; subject_id: string; subject_name: string;
  teacher_id: string; teacher_name: string; chapter_name: string; planned_date: string | null;
  latest_completion_percent: number | null; latest_completed_date: string | null;
}
export interface PortionCompletionRecord {
  id: string; portion_plan_id: string; completed_date: string; completion_percent: number; notes: string | null;
}
export interface TeacherObservationRecord {
  id: string; teacher_id: string; observer_id: string; date: string;
  criteria_jsonb: unknown; overall_notes: string | null; follow_up_notes: string | null;
}
export interface TeacherAssignmentRecord {
  id: string; user_id: string; class_id: string; section_id: string | null;
  subject_id: string | null; academic_year_id: string; role_type: string;
}
export interface TeacherAssignmentRow extends TeacherAssignmentRecord {
  teacher_name: string; class_name: string; section_name: string | null; subject_name: string | null;
}

// ---------------------------------------------------------------------------
// Staff directory
// ---------------------------------------------------------------------------
const createStaffSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(200),
  staffCode: z.string().min(1).max(50),
  designation: z.string().max(150).nullable().optional(),
  department: z.string().max(150).nullable().optional(),
  joiningDate: z.string().nullable().optional(),
  employmentStatus: z.enum(["active", "on_leave", "resigned", "terminated"]).default("active"),
  roleCode: z.string().min(1).max(50).optional(),
});

/** Creates (or reuses, by email) a users row, links institution membership
 *  and an optional role, and creates the staff record — one call covers the
 *  "add a staff member" workflow end to end (§D.4). Mirrors
 *  database/scripts/seed.ts's seedDemoUser() but as a real service function
 *  usable from the /staff UI, not just a bootstrap script. */
export async function createStaffMember(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createStaffSchema>,
  scopedClient?: DbClient // §Q.1, see modules/academic/service.ts's createClass() for why
): Promise<StaffRecord> {
  const data = createStaffSchema.parse(input);
  const run = async (scoped: DbClient) => {
    // §W.2 — refuses the specific insert that would exceed the plan's
    // max_staff cap; existing staff are never affected.
    await assertBelowLimit(scoped, institutionId, "staff");
    // Two RLS subtleties collide here, so this is deliberately NOT a plain
    // `insert ... returning id`:
    //  1. INSERT ... ON CONFLICT DO UPDATE requires the UPDATE policy to also
    //     permit the row even when no conflict occurs (RLS validates the
    //     statement shape, not just the runtime path) — and users_write_self
    //     (migration 0001) only allows a user to update their OWN row, not
    //     one an institution_admin is creating on someone else's behalf. So
    //     this is a plain INSERT, no ON CONFLICT.
    //  2. INSERT ... RETURNING re-checks the SELECT policies on the row
    //     being returned (Postgres raises 42501 rather than silently
    //     omitting it, since silently returning nothing from a just-run
    //     INSERT would be misleading) — and at this exact moment the new
    //     user has no user_institution_memberships row yet (that's the next
    //     statement below), so neither users_select_self nor this
    //     migration's users_select_institution_colleague policy passes yet.
    //     Generating the id client-side and skipping RETURNING avoids that
    //     re-check entirely.
    const newUserId = crypto.randomUUID();
    try {
      await scoped.query(
        `insert into users (id, email, full_name, preferred_locale) values ($1, $2, $3, 'en')`,
        [newUserId, data.email, data.fullName]
      );
    } catch {
      throw new Error(`A user with email "${data.email}" already exists — reusing an existing account for a new staff member isn't supported yet.`);
    }

    await scoped.query(
      `insert into user_institution_memberships (user_id, institution_id, status, is_primary)
       values ($1, $2, 'active', false)
       on conflict (user_id, institution_id) do nothing`,
      [newUserId, institutionId]
    );

    if (data.roleCode) {
      const { rows: roleRows } = await scoped.query<{ id: string }>(
        `select id from roles where institution_id = $1 and code = $2`,
        [institutionId, data.roleCode]
      );
      if (roleRows.length > 0) {
        await scoped.query(
          `insert into user_roles (user_id, institution_id, role_id) values ($1, $2, $3) on conflict do nothing`,
          [newUserId, institutionId, roleRows[0].id]
        );
      }
    }

    const { rows } = await scoped.query<StaffRecord>(
      `insert into staff (institution_id, user_id, staff_code, designation, department, joining_date, employment_status)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, user_id, staff_code, designation, department, joining_date, employment_status`,
      [institutionId, newUserId, data.staffCode, data.designation ?? null, data.department ?? null, data.joiningDate ?? null, data.employmentStatus]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "staff", entityType: "staff", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  };
  if (scopedClient) return run(scopedClient);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, run);
}

export async function listStaff(institutionId: string, authUserId: string, employmentStatus?: string): Promise<StaffRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = employmentStatus
      ? await scoped.query<StaffRow>(
          `select st.id, st.user_id, st.staff_code, st.designation, st.department, st.joining_date, st.employment_status,
                  st.photo_file_id, u.full_name, u.email, (u.auth_user_id is not null) as has_login
             from staff st join users u on u.id = st.user_id
            where st.employment_status = $1
            order by u.full_name`,
          [employmentStatus]
        )
      : await scoped.query<StaffRow>(
          `select st.id, st.user_id, st.staff_code, st.designation, st.department, st.joining_date, st.employment_status,
                  st.photo_file_id, u.full_name, u.email, (u.auth_user_id is not null) as has_login
             from staff st join users u on u.id = st.user_id
            order by u.full_name`
        );
    return rows;
  });
}

export async function getStaffMember(institutionId: string, authUserId: string, staffId: string): Promise<StaffRow | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<StaffRow>(
      `select st.id, st.user_id, st.staff_code, st.designation, st.department, st.joining_date, st.employment_status,
              st.photo_file_id, u.full_name, u.email, (u.auth_user_id is not null) as has_login
         from staff st join users u on u.id = st.user_id
        where st.id = $1`,
      [staffId]
    );
    return rows[0] ?? null;
  });
}

const updateStaffSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  staffCode: z.string().min(1).max(50).optional(),
  designation: z.string().max(150).nullable().optional(),
  department: z.string().max(150).nullable().optional(),
  employmentStatus: z.enum(["active", "on_leave", "resigned", "terminated"]).optional(),
});

/** Edits a staff member's own fields -- name (on `users`, since staff has no
 *  full_name column of its own -- see StaffRow's join), staff code,
 *  designation, department, employment status. Mirrors students'
 *  updateStudent()/EditStudentForm pattern (Student-edit follow-up), now
 *  extended to staff so both directories have an in-app "Edit details"
 *  option instead of requiring a re-import. */
export async function updateStaffMember(
  institutionId: string, authUserId: string, userId: string, staffId: string, input: z.infer<typeof updateStaffSchema>
): Promise<StaffRow | null> {
  const data = updateStaffSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: staffRows } = await scoped.query<StaffRecord & { photo_file_id: string | null }>(
      `update staff set
         staff_code = coalesce($1, staff_code),
         designation = coalesce($2, designation),
         department = coalesce($3, department),
         employment_status = coalesce($4, employment_status),
         updated_at = now()
       where id = $5
       returning id, user_id, staff_code, designation, department, joining_date, employment_status, photo_file_id`,
      [data.staffCode ?? null, data.designation ?? null, data.department ?? null, data.employmentStatus ?? null, staffId]
    );
    if (staffRows.length === 0) return null;
    const staffRow = staffRows[0];
    if (data.fullName) {
      await scoped.query(`update users set full_name = $1, updated_at = now() where id = $2`, [data.fullName, staffRow.user_id]);
    }
    const { rows: userRows } = await scoped.query<{ full_name: string; email: string | null; has_login: boolean }>(
      `select full_name, email, (auth_user_id is not null) as has_login from users where id = $1`,
      [staffRow.user_id]
    );
    const merged: StaffRow = { ...staffRow, full_name: userRows[0].full_name, email: userRows[0].email, has_login: userRows[0].has_login };
    await recordAudit(scoped, { institutionId, userId, action: "edit", module: "staff", entityType: "staff", entityId: staffId, after: merged });
    return merged;
  });
}

// ---------------------------------------------------------------------------
// Teacher Profile (§Teacher-Profile feature) — the full 6-section template
// the user supplied (Personal/Employment/Qualifications & Skills/
// Responsibilities/Professional Development/Achievements), stored as
// nullable text/date columns added in migration 0036. Deliberately kept OFF
// StaffRecord/StaffRow (same reasoning as students' StudentProfileRecord)
// so the many existing narrow-select callers (attendance grids, portion
// plans, assignment listings, etc.) never pay for two dozen columns they
// don't use — only the teacher's own Profile page reads/writes them.
//
// Per the user's own explicit choice (AskUserQuestion #3, "Teachers only"):
// this whole profile is scoped to staff who have at least one
// teacher_assignments row. getStaffProfile() itself doesn't enforce that
// (it's a generic staff-record reader, same shape as getStaffMember()) —
// the route/UI layer decides whether to render the Teacher Profile template
// or fall back to the plain staff record, by checking
// listAssignmentsForTeacher(...).length > 0.
// ---------------------------------------------------------------------------
export interface StaffProfileRecord extends StaffRow {
  photo_file_id: string | null;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  contact_phone: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  other_roles: string | null;
  previous_experience: string | null;
  documents_submitted: string | null;
  qualifications: string | null;
  certifications: string | null;
  specialisations: string | null;
  languages: string | null;
  skills: string | null;
  subject_coordinator_of: string | null;
  club_house_incharge: string | null;
  exam_event_duties: string | null;
  other_responsibilities: string | null;
  trainings_workshops: string | null;
  pd_certificates: string | null;
  training_history: string | null;
  awards_recognitions: string | null;
  publications_research: string | null;
  innovations: string | null;
  other_achievements: string | null;
}

export async function getStaffProfile(institutionId: string, authUserId: string, staffId: string): Promise<StaffProfileRecord | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<StaffProfileRecord>(
      `select st.id, st.user_id, st.staff_code, st.designation, st.department, st.joining_date, st.employment_status,
              u.full_name, u.email, (u.auth_user_id is not null) as has_login,
              st.photo_file_id, st.date_of_birth, st.gender, st.blood_group, st.contact_phone, st.address,
              st.emergency_contact_name, st.emergency_contact_phone, st.other_roles, st.previous_experience,
              st.documents_submitted, st.qualifications, st.certifications, st.specialisations, st.languages, st.skills,
              st.subject_coordinator_of, st.club_house_incharge, st.exam_event_duties, st.other_responsibilities,
              st.trainings_workshops, st.pd_certificates, st.training_history,
              st.awards_recognitions, st.publications_research, st.innovations, st.other_achievements
         from staff st join users u on u.id = st.user_id
        where st.id = $1`,
      [staffId]
    );
    return rows[0] ?? null; // RLS guarantees this is null for another institution's row (§E.3)
  });
}

const updateStaffProfileSchema = z.object({
  dateOfBirth: z.string().nullable().optional(),
  gender: z.string().max(30).nullable().optional(),
  bloodGroup: z.string().max(10).nullable().optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  emergencyContactName: z.string().max(200).nullable().optional(),
  emergencyContactPhone: z.string().max(30).nullable().optional(),
  otherRoles: z.string().max(500).nullable().optional(),
  previousExperience: z.string().max(2000).nullable().optional(),
  documentsSubmitted: z.string().max(1000).nullable().optional(),
  qualifications: z.string().max(2000).nullable().optional(),
  certifications: z.string().max(2000).nullable().optional(),
  specialisations: z.string().max(1000).nullable().optional(),
  languages: z.string().max(500).nullable().optional(),
  skills: z.string().max(1000).nullable().optional(),
  subjectCoordinatorOf: z.string().max(500).nullable().optional(),
  clubHouseIncharge: z.string().max(500).nullable().optional(),
  examEventDuties: z.string().max(1000).nullable().optional(),
  otherResponsibilities: z.string().max(1000).nullable().optional(),
  trainingsWorkshops: z.string().max(2000).nullable().optional(),
  pdCertificates: z.string().max(2000).nullable().optional(),
  trainingHistory: z.string().max(2000).nullable().optional(),
  awardsRecognitions: z.string().max(2000).nullable().optional(),
  publicationsResearch: z.string().max(2000).nullable().optional(),
  innovations: z.string().max(2000).nullable().optional(),
  otherAchievements: z.string().max(2000).nullable().optional(),
});

/** Partial-update, same "in data"/case-when pattern as students'
 *  updateStudentProfile() — only keys actually present in `input` are
 *  touched, so any one of the 6 template sections can be saved
 *  independently. No mandatory-ness is enforced here (per this feature's
 *  own template: "any blanks will not be there in the profile" is a
 *  render-time UI concern, not a write-time validation rule). */
export async function updateStaffProfile(
  institutionId: string, authUserId: string, userId: string, staffId: string,
  input: z.infer<typeof updateStaffProfileSchema>
): Promise<void> {
  const data = updateStaffProfileSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: before } = await scoped.query<{ id: string }>("select id from staff where id = $1", [staffId]);
    if (before.length === 0) throw new Error("Staff member not found.");
    await scoped.query(
      `update staff set
         date_of_birth = case when $1 then $2::date else date_of_birth end,
         gender = case when $3 then $4 else gender end,
         blood_group = case when $5 then $6 else blood_group end,
         contact_phone = case when $7 then $8 else contact_phone end,
         address = case when $9 then $10 else address end,
         emergency_contact_name = case when $11 then $12 else emergency_contact_name end,
         emergency_contact_phone = case when $13 then $14 else emergency_contact_phone end,
         other_roles = case when $15 then $16 else other_roles end,
         previous_experience = case when $17 then $18 else previous_experience end,
         documents_submitted = case when $19 then $20 else documents_submitted end,
         qualifications = case when $21 then $22 else qualifications end,
         certifications = case when $23 then $24 else certifications end,
         specialisations = case when $25 then $26 else specialisations end,
         languages = case when $27 then $28 else languages end,
         skills = case when $29 then $30 else skills end,
         subject_coordinator_of = case when $31 then $32 else subject_coordinator_of end,
         club_house_incharge = case when $33 then $34 else club_house_incharge end,
         exam_event_duties = case when $35 then $36 else exam_event_duties end,
         other_responsibilities = case when $37 then $38 else other_responsibilities end,
         trainings_workshops = case when $39 then $40 else trainings_workshops end,
         pd_certificates = case when $41 then $42 else pd_certificates end,
         training_history = case when $43 then $44 else training_history end,
         awards_recognitions = case when $45 then $46 else awards_recognitions end,
         publications_research = case when $47 then $48 else publications_research end,
         innovations = case when $49 then $50 else innovations end,
         other_achievements = case when $51 then $52 else other_achievements end,
         updated_at = now()
       where id = $53`,
      [
        "dateOfBirth" in data, data.dateOfBirth ?? null,
        "gender" in data, data.gender ?? null,
        "bloodGroup" in data, data.bloodGroup ?? null,
        "contactPhone" in data, data.contactPhone ?? null,
        "address" in data, data.address ?? null,
        "emergencyContactName" in data, data.emergencyContactName ?? null,
        "emergencyContactPhone" in data, data.emergencyContactPhone ?? null,
        "otherRoles" in data, data.otherRoles ?? null,
        "previousExperience" in data, data.previousExperience ?? null,
        "documentsSubmitted" in data, data.documentsSubmitted ?? null,
        "qualifications" in data, data.qualifications ?? null,
        "certifications" in data, data.certifications ?? null,
        "specialisations" in data, data.specialisations ?? null,
        "languages" in data, data.languages ?? null,
        "skills" in data, data.skills ?? null,
        "subjectCoordinatorOf" in data, data.subjectCoordinatorOf ?? null,
        "clubHouseIncharge" in data, data.clubHouseIncharge ?? null,
        "examEventDuties" in data, data.examEventDuties ?? null,
        "otherResponsibilities" in data, data.otherResponsibilities ?? null,
        "trainingsWorkshops" in data, data.trainingsWorkshops ?? null,
        "pdCertificates" in data, data.pdCertificates ?? null,
        "trainingHistory" in data, data.trainingHistory ?? null,
        "awardsRecognitions" in data, data.awardsRecognitions ?? null,
        "publicationsResearch" in data, data.publicationsResearch ?? null,
        "innovations" in data, data.innovations ?? null,
        "otherAchievements" in data, data.otherAchievements ?? null,
        staffId,
      ]
    );
    await recordAudit(scoped, { institutionId, userId, action: "edit", module: "staff", entityType: "staff_profile", entityId: staffId, after: data });
  });
}

/** Points staff.photo_file_id at an already-uploaded file (or null to
 *  remove it) — mirrors updateStudentPhoto()'s exact ownership-check shape
 *  (modules/students/service.ts). The upload itself happens through
 *  FileService.uploadFile() in the calling server action; this function
 *  never touches file bytes. */
export async function updateStaffPhoto(
  institutionId: string, authUserId: string, userId: string, staffId: string, photoFileId: string | null
): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    if (photoFileId) {
      const { rows: owned } = await scoped.query<{ id: string }>("select id from files where id = $1", [photoFileId]);
      if (owned.length === 0) {
        throw new Error("That file does not belong to this institution — refusing to set it as the staff photo.");
      }
    }
    const { rows: before } = await scoped.query<{ photo_file_id: string | null }>(
      "select photo_file_id from staff where id = $1", [staffId]
    );
    await scoped.query("update staff set photo_file_id = $1, updated_at = now() where id = $2", [photoFileId, staffId]);
    await recordAudit(scoped, {
      institutionId, userId, action: "edit", module: "staff", entityType: "staff", entityId: staffId,
      before: { photoFileId: before[0]?.photo_file_id ?? null }, after: { photoFileId },
    });
  });
}

// ---------------------------------------------------------------------------
// Staff login provisioning (§137 follow-up: "mail id can be their user id
// and phone number as passwords") — mirrors modules/portal/service.ts's
// createStudentLoginAccount()/resetStudentLoginPassword() exactly, but
// uses the staff member's OWN real email as-is (createStaffMember() already
// required a real email up front — no synthetic address needed the way
// student logins need one, since students don't have their own email).
// The one deliberate exception to "nobody's password ever passes through
// this app's server" (§X, AuthService.adminCreateUser()'s own doc
// comment) this file adds: an admin explicitly setting a colleague's
// initial/reset password (typically their phone number, by this feature's
// own convention, not the staff member's own choice) — same narrow
// exception createInstitution()'s admin bundle and the student-login
// feature already both rely on. Editable anytime via
// resetStaffLoginPassword(), unlike createStaffMember()'s claimable
// placeholder path, which requires the person to sign up themselves.
// ---------------------------------------------------------------------------
const provisionStaffLoginSchema = z.object({
  staffId: z.string().uuid(),
  password: z.string().min(4).max(30),
});

export interface StaffLoginResult {
  userId: string;
}

/** Creates an immediately-usable login for an EXISTING staff member (added
 *  via createStaffMember(), which only creates a claimable placeholder) —
 *  a real Supabase Auth account using their already-on-file email and a
 *  server-set password. Throws if that staff member already has a login
 *  (use resetStaffLoginPassword() to change it) or already has a
 *  DIFFERENT real auth account with the same email elsewhere on the
 *  platform (adminCreateUser() enforces email uniqueness). On any failure
 *  after the auth account is created, it's torn back down (same
 *  best-effort compensation createStudentLoginAccount() uses). */
export async function createStaffLoginAccount(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof provisionStaffLoginSchema>
): Promise<StaffLoginResult> {
  const data = provisionStaffLoginSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ user_id: string; email: string | null; auth_user_id: string | null }>(
      `select st.user_id, u.email, u.auth_user_id from staff st join users u on u.id = st.user_id where st.id = $1`,
      [data.staffId]
    );
    if (rows.length === 0) throw new Error("Staff member not found.");
    if (rows[0].auth_user_id) throw new Error("This staff member already has a login — use \"Reset password\" instead.");
    if (!rows[0].email) throw new Error("This staff member has no email on file — add one first (edit their record).");

    const authService = await getAuthService();
    const authResult = await authService.adminCreateUser(rows[0].email, data.password);
    if ("error" in authResult) {
      throw new Error(`Could not create the login (${authResult.error}).`);
    }
    try {
      // Plain UPDATE would silently affect 0 rows here — users_write_self
      // (migration 0001) only allows a user to update their OWN row, not
      // one an admin is provisioning on a colleague's behalf. See
      // database/migrations/0025_admin_login_provisioning.sql for why this
      // narrowly-scoped SECURITY DEFINER function exists instead.
      const { rows: setRows } = await scoped.query<{ set_login_credentials: boolean }>(
        "select set_login_credentials($1, $2, $3) as set_login_credentials",
        [rows[0].user_id, authResult.authUserId, data.password]
      );
      if (!setRows[0]?.set_login_credentials) {
        throw new Error("Could not link the new login to this staff member's account.");
      }
      await recordAudit(scoped, {
        institutionId, userId, action: "provision_login", module: "staff", entityType: "staff", entityId: data.staffId,
      });
      return { userId: rows[0].user_id };
    } catch (err) {
      await authService.adminDeleteUser(authResult.authUserId).catch(() => {});
      throw err;
    }
  });
}

/** Resets an existing staff login's password (e.g. a mistyped phone number,
 *  or simply changing it later — "should be editable anytime"). Requires
 *  the login to already exist (use createStaffLoginAccount() for the
 *  first-time case). */
export async function resetStaffLoginPassword(
  institutionId: string, authUserId: string, userId: string, staffId: string, password: string
): Promise<void> {
  const newPassword = z.string().min(4).max(30).parse(password);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ user_id: string; auth_user_id: string | null }>(
      `select st.user_id, u.auth_user_id from staff st join users u on u.id = st.user_id where st.id = $1`,
      [staffId]
    );
    if (rows.length === 0) throw new Error("Staff member not found.");
    if (!rows[0].auth_user_id) throw new Error("This staff member doesn't have a login yet — use \"Create login\" instead.");

    const authService = await getAuthService();
    const result = await authService.adminUpdatePassword(rows[0].auth_user_id, newPassword);
    if (result && "error" in result) throw new Error(`Could not reset the login password (${result.error}).`);
    // See createStaffLoginAccount()'s comment above and
    // database/migrations/0025_admin_login_provisioning.sql — a plain
    // UPDATE here would silently affect 0 rows under RLS.
    await scoped.query("select set_login_credentials($1, null, $2)", [rows[0].user_id, newPassword]);
    await recordAudit(scoped, { institutionId, userId, action: "reset_password", module: "staff", entityType: "staff", entityId: staffId });
  });
}

// ---------------------------------------------------------------------------
// Staff attendance (staff_attendance, §D.6 — separate table from student
// attendance_records since staff aren't tied to a class/section)
// ---------------------------------------------------------------------------
export async function getStaffAttendanceGrid(
  institutionId: string, authUserId: string, date: string, period?: string
): Promise<StaffAttendanceGridRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<StaffAttendanceGridRow>(
      `select st.id as staff_id, u.full_name, st.staff_code,
              sa.id as record_id, sa.status_id
         from staff st
         join users u on u.id = st.user_id
         left join staff_attendance sa on sa.staff_id = st.id and sa.date = $1
                                       and coalesce(sa.period, '') = coalesce($2, '')
        where st.employment_status = 'active'
        order by u.full_name`,
      [date, period ?? null]
    );
    return rows;
  });
}

/** "Staff > Staff attendance > Monthly register" follow-up — mirrors
 *  modules/attendance/service.ts's getMonthlyAttendanceRegister() for
 *  students, over staff_attendance instead. Every active staff member is
 *  a row regardless of whether they have any records that month, so an
 *  all-absent or not-yet-marked staff member is still visible on the
 *  register (not silently dropped). */
export interface StaffMonthlyRegisterRow { staff_id: string; full_name: string; staff_code: string | null }
export interface StaffMonthlyRegisterEntry { staff_id: string; date: string; status_code: string }

export async function getMonthlyStaffAttendanceRegister(
  institutionId: string, authUserId: string, year: number, month: number
): Promise<{ staff: StaffMonthlyRegisterRow[]; entries: StaffMonthlyRegisterEntry[] }> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows: staff } = await scoped.query<StaffMonthlyRegisterRow>(
      `select st.id as staff_id, u.full_name, st.staff_code
         from staff st join users u on u.id = st.user_id
        where st.employment_status = 'active'
        order by u.full_name`
    );
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const { rows: entries } = await scoped.query<StaffMonthlyRegisterEntry>(
      `select sa.staff_id, to_char(sa.date, 'YYYY-MM-DD') as date, ast.code as status_code
         from staff_attendance sa
         join attendance_statuses ast on ast.id = sa.status_id
        where sa.date >= $1::date and sa.date < ($1::date + interval '1 month')`,
      [monthStart]
    );
    return { staff, entries };
  });
}

const markStaffAttendanceEntrySchema = z.object({ staffId: z.string().uuid(), statusId: z.string().uuid() });
const markStaffAttendanceSchema = z.object({
  date: z.string().min(1),
  period: z.string().max(50).nullable().optional(),
  entries: z.array(markStaffAttendanceEntrySchema),
});

/** Bulk upsert for one date(/period) — mirrors markAttendance()'s pattern
 *  in modules/attendance/service.ts for students. */
export async function markStaffAttendance(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof markStaffAttendanceSchema>
): Promise<{ marked: number }> {
  const data = markStaffAttendanceSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    let marked = 0;
    for (const e of data.entries) {
      await scoped.query(
        `insert into staff_attendance (institution_id, staff_id, date, period, status_id, marked_by)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (institution_id, staff_id, date, (coalesce(period, '')))
         do update set status_id = excluded.status_id, marked_by = excluded.marked_by`,
        [institutionId, e.staffId, data.date, data.period ?? null, e.statusId, userId]
      );
      marked++;
    }
    await recordAudit(scoped, {
      institutionId, userId, action: "mark", module: "staff", entityType: "staff_attendance",
      entityId: null, after: { date: data.date, period: data.period ?? null, count: marked },
    });
    return { marked };
  });
}

export async function getStaffAttendanceSummary(
  institutionId: string, authUserId: string, staffId: string, fromDate: string, toDate: string
): Promise<StaffAttendanceSummary> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ total: string; present: string; absent: string }>(
      `select count(*) as total,
              count(*) filter (where ast.counts_as_present) as present,
              count(*) filter (where not ast.counts_as_present) as absent
         from staff_attendance sa
         join attendance_statuses ast on ast.id = sa.status_id
        where sa.staff_id = $1 and sa.date between $2 and $3`,
      [staffId, fromDate, toDate]
    );
    const total = Number(rows[0]?.total ?? 0);
    const present = Number(rows[0]?.present ?? 0);
    return {
      staff_id: staffId, total_days: total, present_days: present,
      absent_days: Number(rows[0]?.absent ?? 0),
      present_percent: total > 0 ? Math.round((present / total) * 10000) / 100 : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Staff leave — thin wrappers around the generic leave_applications
// workflow (modules/attendance/service.ts), applicantType fixed to 'staff'.
// ---------------------------------------------------------------------------
export async function applyForStaffLeave(
  institutionId: string, authUserId: string, userId: string,
  input: { staffId: string; startDate: string; endDate: string; reason?: string | null }
): Promise<LeaveApplicationRecord> {
  return applyForLeaveGeneric(institutionId, authUserId, userId, {
    applicantType: "staff", applicantId: input.staffId,
    startDate: input.startDate, endDate: input.endDate, reason: input.reason ?? null,
  });
}

export async function listStaffLeaveApplications(
  institutionId: string, authUserId: string, status?: string
): Promise<LeaveApplicationRecord[]> {
  const all = await listLeaveApplicationsGeneric(institutionId, authUserId, status);
  return all.filter((l) => l.applicant_type === "staff");
}

export async function reviewStaffLeave(
  institutionId: string, authUserId: string, userId: string, leaveId: string, decision: "approved" | "rejected"
): Promise<LeaveApplicationRecord | null> {
  return reviewLeaveApplicationGeneric(institutionId, authUserId, userId, leaveId, decision);
}

// ---------------------------------------------------------------------------
// Portion plans / completion (§D.12 — curriculum coverage tracking)
// ---------------------------------------------------------------------------
const createPortionPlanSchema = z.object({
  academicYearId: z.string().uuid(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid(),
  chapterName: z.string().min(1).max(300),
  plannedDate: z.string().nullable().optional(),
});

export async function createPortionPlan(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createPortionPlanSchema>
): Promise<{ id: string }> {
  const data = createPortionPlanSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ id: string }>(
      `insert into portion_plans (institution_id, academic_year_id, class_id, subject_id, teacher_id, chapter_name, planned_date)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [institutionId, data.academicYearId, data.classId, data.subjectId, data.teacherId, data.chapterName, data.plannedDate ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "staff", entityType: "portion_plans", entityId: rows[0].id, after: { chapterName: data.chapterName } });
    return rows[0];
  });
}

/** Lists portion plans with each plan's most recent completion record
 *  (if any), via a lateral join — the plan itself never stores a mutable
 *  percent column (§D.12 migration header). */
export async function listPortionPlans(
  institutionId: string, authUserId: string, filters?: { classId?: string; subjectId?: string; teacherId?: string }
): Promise<PortionPlanRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters?.classId) { params.push(filters.classId); conditions.push(`pp.class_id = $${params.length}`); }
    if (filters?.subjectId) { params.push(filters.subjectId); conditions.push(`pp.subject_id = $${params.length}`); }
    if (filters?.teacherId) { params.push(filters.teacherId); conditions.push(`pp.teacher_id = $${params.length}`); }
    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const { rows } = await scoped.query<PortionPlanRow>(
      `select pp.id, pp.class_id, c.name as class_name, pp.subject_id, sub.name as subject_name,
              pp.teacher_id, u.full_name as teacher_name, pp.chapter_name, pp.planned_date,
              pc.completion_percent as latest_completion_percent, pc.completed_date as latest_completed_date
         from portion_plans pp
         join classes c on c.id = pp.class_id
         join subjects sub on sub.id = pp.subject_id
         join staff st on st.id = pp.teacher_id
         join users u on u.id = st.user_id
         left join lateral (
           select completion_percent, completed_date from portion_completion
            where portion_plan_id = pp.id order by completed_date desc, created_at desc limit 1
         ) pc on true
        ${where}
        order by pp.planned_date nulls last, pp.created_at desc`,
      params
    );
    return rows;
  });
}

const recordCompletionSchema = z.object({
  portionPlanId: z.string().uuid(),
  completedDate: z.string().min(1),
  completionPercent: z.number().int().min(0).max(100),
  notes: z.string().max(1000).nullable().optional(),
});

export async function recordPortionCompletion(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof recordCompletionSchema>
): Promise<PortionCompletionRecord> {
  const data = recordCompletionSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<PortionCompletionRecord>(
      `insert into portion_completion (institution_id, portion_plan_id, completed_date, completion_percent, notes, recorded_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, portion_plan_id, completed_date, completion_percent, notes`,
      [institutionId, data.portionPlanId, data.completedDate, data.completionPercent, data.notes ?? null, userId]
    );
    await recordAudit(scoped, { institutionId, userId, action: "record", module: "staff", entityType: "portion_completion", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

export async function listPortionCompletionHistory(
  institutionId: string, authUserId: string, portionPlanId: string
): Promise<PortionCompletionRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<PortionCompletionRecord>(
      `select id, portion_plan_id, completed_date, completion_percent, notes
         from portion_completion where portion_plan_id = $1 order by completed_date desc, created_at desc`,
      [portionPlanId]
    );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Teacher observations (§D.12 — "teacher performance")
// ---------------------------------------------------------------------------
const recordObservationSchema = z.object({
  teacherId: z.string().uuid(),
  date: z.string().min(1),
  criteriaJsonb: z.record(z.unknown()).optional(),
  overallNotes: z.string().max(2000).nullable().optional(),
  followUpNotes: z.string().max(2000).nullable().optional(),
});

export async function recordTeacherObservation(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof recordObservationSchema>
): Promise<TeacherObservationRecord> {
  const data = recordObservationSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<TeacherObservationRecord>(
      `insert into teacher_observations (institution_id, teacher_id, observer_id, date, criteria_jsonb, overall_notes, follow_up_notes)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, teacher_id, observer_id, date, criteria_jsonb, overall_notes, follow_up_notes`,
      [institutionId, data.teacherId, userId, data.date, data.criteriaJsonb ? JSON.stringify(data.criteriaJsonb) : null, data.overallNotes ?? null, data.followUpNotes ?? null]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "staff", entityType: "teacher_observations", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

export async function listTeacherObservations(
  institutionId: string, authUserId: string, teacherId?: string
): Promise<TeacherObservationRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = teacherId
      ? await scoped.query<TeacherObservationRecord>(
          `select id, teacher_id, observer_id, date, criteria_jsonb, overall_notes, follow_up_notes
             from teacher_observations where teacher_id = $1 order by date desc`,
          [teacherId]
        )
      : await scoped.query<TeacherObservationRecord>(
          `select id, teacher_id, observer_id, date, criteria_jsonb, overall_notes, follow_up_notes
             from teacher_observations order by date desc`
        );
    return rows;
  });
}

// ---------------------------------------------------------------------------
// Classroom-observation rubric (observation_criteria, migration 0036) +
// rubric-driven Term-wise Performance Observation recording.
//
// Access rule mirrors resolveAttendanceVisibility()'s two-tier pattern
// (services/scope/attendance-visibility-service.ts) exactly: an unrestricted
// staff.observation.manage holder may observe any teacher; a
// staff.observation.manage_section holder (Section Head) may only observe a
// teacher whose OWN teacher_assignments intersect the Section Head's own
// assigned stage(s). The caller (server action) already knows, via can(),
// which tier the current user holds and passes options.scopedToOwnSection
// accordingly — this module only re-verifies the stage intersection itself,
// same division of responsibility getStaffSectionScope()'s own doc comment
// describes ("this helper only answers... it does not check permissions").
// ---------------------------------------------------------------------------
export interface ObservationCriterionLevel { score: number; descriptor: string; explanation: string }
export interface ObservationCriterionRecord {
  id: string; domain: string; criteria_text: string; sort_order: number;
  levels_jsonb: ObservationCriterionLevel[];
}

/** Lazily provisions the PDF-sourced default 20-criteria rubric
 *  (modules/staff/observation-rubric-defaults.ts) the first time an
 *  institution has zero observation_criteria rows — one single source of
 *  truth, also reused by createInstitution() for brand-new institutions
 *  (see migration 0036's header comment for why this data isn't embedded as
 *  literal SQL). Never re-applied once an institution has ANY rows, even a
 *  partial/edited set, so an admin's own edits are never silently
 *  overwritten by a later call. */
export async function listObservationCriteria(institutionId: string, authUserId: string): Promise<ObservationCriterionRecord[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ObservationCriterionRecord>(
      `select id, domain, criteria_text, sort_order, levels_jsonb from observation_criteria
        where institution_id = $1 order by sort_order`,
      [institutionId]
    );
    if (rows.length > 0) return rows;
    for (const c of DEFAULT_OBSERVATION_CRITERIA) {
      await scoped.query(
        `insert into observation_criteria (institution_id, domain, criteria_text, sort_order, levels_jsonb)
         values ($1, $2, $3, $4, $5)`,
        [institutionId, c.domain, c.criteriaText, c.sortOrder, JSON.stringify(c.levels)]
      );
    }
    const { rows: seeded } = await scoped.query<ObservationCriterionRecord>(
      `select id, domain, criteria_text, sort_order, levels_jsonb from observation_criteria
        where institution_id = $1 order by sort_order`,
      [institutionId]
    );
    return seeded;
  });
}

const upsertCriterionSchema = z.object({
  domain: z.string().min(1).max(150),
  criteriaText: z.string().min(1).max(500),
  sortOrder: z.number().int().default(0),
  levels: z.array(z.object({
    score: z.number().int().min(1).max(5),
    descriptor: z.string().min(1).max(200),
    explanation: z.string().min(1).max(1000),
  })).length(5),
});

/** Admin-only rubric CRUD (§Teacher-Profile AskUserQuestion #1, "Editable by
 *  admin"). Touches listObservationCriteria() first so an admin adding ONE
 *  criterion to a brand-new institution gets the other 20 lazily seeded too,
 *  rather than ending up with a single orphan row. */
export async function createObservationCriterion(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof upsertCriterionSchema>
): Promise<ObservationCriterionRecord> {
  const data = upsertCriterionSchema.parse(input);
  await listObservationCriteria(institutionId, authUserId);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ObservationCriterionRecord>(
      `insert into observation_criteria (institution_id, domain, criteria_text, sort_order, levels_jsonb)
       values ($1, $2, $3, $4, $5)
       returning id, domain, criteria_text, sort_order, levels_jsonb`,
      [institutionId, data.domain, data.criteriaText, data.sortOrder, JSON.stringify(data.levels)]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "staff", entityType: "observation_criteria", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

export async function updateObservationCriterion(
  institutionId: string, authUserId: string, userId: string, criterionId: string, input: z.infer<typeof upsertCriterionSchema>
): Promise<ObservationCriterionRecord | null> {
  const data = upsertCriterionSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<ObservationCriterionRecord>(
      `update observation_criteria set
         domain = $1, criteria_text = $2, sort_order = $3, levels_jsonb = $4, updated_at = now()
       where id = $5
       returning id, domain, criteria_text, sort_order, levels_jsonb`,
      [data.domain, data.criteriaText, data.sortOrder, JSON.stringify(data.levels), criterionId]
    );
    if (rows.length === 0) return null;
    await recordAudit(scoped, { institutionId, userId, action: "edit", module: "staff", entityType: "observation_criteria", entityId: criterionId, after: rows[0] });
    return rows[0];
  });
}

export async function deleteObservationCriterion(
  institutionId: string, authUserId: string, userId: string, criterionId: string
): Promise<void> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query("delete from observation_criteria where id = $1", [criterionId]);
    await recordAudit(scoped, { institutionId, userId, action: "delete", module: "staff", entityType: "observation_criteria", entityId: criterionId });
  });
}

/** Every distinct classes.stage this teacher (a staff.id) currently has a
 *  teacher_assignments row against — the same "stage" grouping
 *  section_head_assignments.stage uses, so it can be intersected directly
 *  against getStaffSectionScope()'s result. */
async function getTeacherStages(institutionId: string, authUserId: string, teacherStaffId: string): Promise<Set<string>> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ stage: string | null }>(
      `select distinct c.stage
         from teacher_assignments ta
         join staff st on st.user_id = ta.user_id
         join classes c on c.id = ta.class_id
        where st.id = $1 and c.stage is not null and c.stage <> ''`,
      [teacherStaffId]
    );
    return new Set(rows.map((r) => r.stage as string));
  });
}

const recordObservationWithRubricSchema = z.object({
  teacherId: z.string().uuid(), // staff.id being observed
  date: z.string().min(1),
  term: z.string().max(100).nullable().optional(),
  classDiv: z.string().max(100).nullable().optional(),
  content: z.string().max(500).nullable().optional(),
  items: z.array(z.object({ criteriaId: z.string().uuid(), score: z.number().int().min(1).max(5) })).min(1),
  overallNotes: z.string().max(2000).nullable().optional(),  // "Strengths observed"
  followUpNotes: z.string().max(2000).nullable().optional(), // "Areas to improve"
});

/** Records one Term-wise classroom observation against the institution's own
 *  rubric (listObservationCriteria()), computing a totalScore out of 100
 *  from the submitted per-criterion scores (§Teacher-Profile "give total
 *  score out of 100") — scaled by the rubric's actual max-possible
 *  (criteria.length * 5) rather than hard-coded /100, so an admin-edited
 *  rubric with a different criteria count still yields a correct percentage.
 *  Everything is shaped into teacher_observations.criteria_jsonb (no schema
 *  change needed — that column was already designed flexible enough,
 *  migration 0012); "Strengths observed"/"Areas to improve" reuse the
 *  existing overall_notes/follow_up_notes columns. One observation per term
 *  is a UI/workflow convention, not enforced here as a uniqueness
 *  constraint (an institution may legitimately want to redo one). */
export async function recordTeacherObservationWithRubric(
  institutionId: string, authUserId: string, userId: string,
  input: z.infer<typeof recordObservationWithRubricSchema>,
  options?: { scopedToOwnSection?: boolean }
): Promise<TeacherObservationRecord> {
  const data = recordObservationWithRubricSchema.parse(input);

  if (options?.scopedToOwnSection) {
    const [scope, teacherStages] = await Promise.all([
      getStaffSectionScope(institutionId, authUserId, userId),
      getTeacherStages(institutionId, authUserId, data.teacherId),
    ]);
    const inScope = [...teacherStages].some((s) => scope.stages.has(s));
    if (!inScope) {
      throw new Error("You can only record observations for teachers within your own assigned section(s).");
    }
  }

  const criteria = await listObservationCriteria(institutionId, authUserId);
  const byId = new Map(criteria.map((c) => [c.id, c]));
  let rawSum = 0;
  const items = data.items.map((it) => {
    const criterion = byId.get(it.criteriaId);
    if (!criterion) throw new Error("Unknown observation criterion — the rubric may have changed; reload and try again.");
    const level = criterion.levels_jsonb.find((l) => l.score === it.score);
    if (!level) throw new Error(`Invalid score ${it.score} for "${criterion.criteria_text}".`);
    rawSum += it.score;
    return { criteriaId: it.criteriaId, score: it.score };
  });
  const maxPossible = criteria.length * 5;
  const totalScore = maxPossible > 0 ? Math.round((rawSum / maxPossible) * 10000) / 100 : 0;

  return recordTeacherObservation(institutionId, authUserId, userId, {
    teacherId: data.teacherId,
    date: data.date,
    criteriaJsonb: {
      term: data.term ?? null,
      classDiv: data.classDiv ?? null,
      content: data.content ?? null,
      items,
      totalScore,
    },
    overallNotes: data.overallNotes ?? null,
    followUpNotes: data.followUpNotes ?? null,
  });
}

// ---------------------------------------------------------------------------
// Teacher assignments (§D.3 — class/subject teacher mapping; table existed
// since migration 0001 but had no service/UI until this phase)
// ---------------------------------------------------------------------------
const createAssignmentSchema = z.object({
  userId: z.string().uuid(), // the teacher's users.id (teacher_assignments.user_id per §D.3)
  classId: z.string().uuid(),
  sectionId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  academicYearId: z.string().uuid(),
  roleType: z.enum(["class_teacher", "subject_teacher"]),
});

export async function createTeacherAssignment(
  institutionId: string, authUserId: string, userId: string, input: z.infer<typeof createAssignmentSchema>
): Promise<TeacherAssignmentRecord> {
  const data = createAssignmentSchema.parse(input);
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<TeacherAssignmentRecord>(
      `insert into teacher_assignments (institution_id, user_id, class_id, section_id, subject_id, academic_year_id, role_type)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, user_id, class_id, section_id, subject_id, academic_year_id, role_type`,
      [institutionId, data.userId, data.classId, data.sectionId ?? null, data.subjectId ?? null, data.academicYearId, data.roleType]
    );
    await recordAudit(scoped, { institutionId, userId, action: "create", module: "staff", entityType: "teacher_assignments", entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

export async function listTeacherAssignments(
  institutionId: string, authUserId: string, filters?: { academicYearId?: string; subjectId?: string }
): Promise<TeacherAssignmentRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters?.academicYearId) { params.push(filters.academicYearId); conditions.push(`ta.academic_year_id = $${params.length}`); }
    if (filters?.subjectId) { params.push(filters.subjectId); conditions.push(`ta.subject_id = $${params.length}`); }
    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const { rows } = await scoped.query<TeacherAssignmentRow>(
      `select ta.id, ta.user_id, ta.class_id, ta.section_id, ta.subject_id, ta.academic_year_id, ta.role_type,
              u.full_name as teacher_name, c.name as class_name, sec.name as section_name, sub.name as subject_name
         from teacher_assignments ta
         join users u on u.id = ta.user_id
         join classes c on c.id = ta.class_id
         left join sections sec on sec.id = ta.section_id
         left join subjects sub on sub.id = ta.subject_id
        ${where}
        order by u.full_name`,
      params
    );
    return rows;
  });
}

/** "My assigned subjects" for the subject-performance-indicator attribution
 *  the Phase 5 analytics follow-up flagged as deferred (§N.5) — a teacher's
 *  own user_id resolves their subject_teacher rows directly. */
export async function listAssignmentsForTeacher(
  institutionId: string, authUserId: string, teacherUserId: string
): Promise<TeacherAssignmentRow[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<TeacherAssignmentRow>(
      `select ta.id, ta.user_id, ta.class_id, ta.section_id, ta.subject_id, ta.academic_year_id, ta.role_type,
              u.full_name as teacher_name, c.name as class_name, sec.name as section_name, sub.name as subject_name
         from teacher_assignments ta
         join users u on u.id = ta.user_id
         join classes c on c.id = ta.class_id
         left join sections sec on sec.id = ta.section_id
         left join subjects sub on sub.id = ta.subject_id
        where ta.user_id = $1
        order by c.name`,
      [teacherUserId]
    );
    return rows;
  });
}
