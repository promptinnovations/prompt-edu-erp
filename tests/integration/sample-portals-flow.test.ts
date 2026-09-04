/**
 * PROMPT EDU ERP — Super Admin "Sample Portals" follow-up. User's own
 * words: "For super admin - in the side panel, add different sample
 * portals, to see the updated version with full data, chosen from any
 * institution, not fake data. principal, management, class teacher,
 * parent- student portals."
 *
 * Covers: services/super-admin/sample-portal-service.ts's four candidate
 * listings (Principal/institution_admin, Management/management, Class
 * Teacher/teacher_assignments, Student+Parent pairing) — each gated to a
 * genuinely working login (auth_user_id is not null) — and
 * getSamplePortalTarget()'s re-verification (the same function
 * services/request-context.ts's "view as" cookie override calls on every
 * request), including that it refuses a userId from a DIFFERENT
 * institution and a userId with no real auth account.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
process.env.PGLITE_DATA_DIR = ":memory:";

import { getDbClient, __resetDbClientForTests } from "../../services/db/client";
import { applyMigrations } from "../../database/scripts/migrate";
import { applyPlatformSeeds, seedDemoInstitution, seedDemoUser, seedSuperAdminUser } from "../../database/scripts/seed";
import { createClass, createSection, getCurrentAcademicYear } from "../../modules/academic/service";
import { createStudent, enrollStudent, createParent, linkParentToStudent } from "../../modules/students/service";
import { createStudentLoginAccount } from "../../modules/portal/service";
import { createInstitutionUser } from "../../services/users/user-management-service";
import { createTeacherAssignment } from "../../modules/staff/service";
import {
  listSamplePrincipals, listSampleManagement, listSampleClassTeachers, listSampleStudentsWithParent,
  getSamplePortalTarget,
} from "../../services/super-admin/sample-portal-service";

let institutionA: string, institutionB: string;
let superAdminAuth: string;
let adminAuth: string, adminUserId: string;
let academicYearId: string;
let classId: string, sectionId: string;
let managementUserId: string;
let teacherUserId: string;
let studentNoParentAuthUserId: string;
let studentWithParentAuthUserId: string;
let parentAuthUserId: string;

beforeAll(async () => {
  __resetDbClientForTests();
  const db = await getDbClient();
  await applyMigrations(db);
  await applyPlatformSeeds(db);

  institutionA = await seedDemoInstitution(db, "sample-portals-a");
  institutionB = await seedDemoInstitution(db, "sample-portals-b");

  const admin = await seedDemoUser(db, institutionA, "admin@sample-portals-a.example", "SP Institution Admin", "institution_admin");
  adminAuth = admin.authUserId; adminUserId = admin.userId;

  const superAdmin = await seedSuperAdminUser(db, institutionA, "root@sample-portals.example", "Platform Root");
  superAdminAuth = superAdmin.authUserId;

  const year = await getCurrentAcademicYear(institutionA, adminAuth);
  academicYearId = year!.id;

  const cls = await createClass(institutionA, adminAuth, adminUserId, { name: "Sample Portals Grade", sortOrder: 1, stage: "UP" });
  classId = cls.id;
  const sec = await createSection(institutionA, adminAuth, adminUserId, { classId, name: "A" });
  sectionId = sec.id;

  // Management candidate — real login + 'management' role, same path the
  // real Users & Roles "Create a login" form uses.
  const management = await createInstitutionUser(institutionA, adminAuth, adminUserId, {
    email: "management@sample-portals-a.example", fullName: "SP Management Person", password: "mgmtpass1", roleCodes: ["management"],
  });
  managementUserId = management.userId;

  // Class Teacher candidate — real login + 'teacher' role, THEN a current-
  // year teacher_assignments row with role_type = 'class_teacher'.
  const teacher = await createInstitutionUser(institutionA, adminAuth, adminUserId, {
    email: "teacher@sample-portals-a.example", fullName: "SP Class Teacher", password: "teachpass1", roleCodes: ["teacher"],
  });
  teacherUserId = teacher.userId;
  await createTeacherAssignment(institutionA, adminAuth, adminUserId, {
    userId: teacherUserId, classId, sectionId, academicYearId, roleType: "class_teacher",
  });

  // Student with NO linked parent login at all.
  const s1 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "SP-1", fullName: "SP Student Amir", gender: "male" });
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: s1.id, academicYearId, classId, sectionId });
  const login1 = await createStudentLoginAccount(institutionA, adminAuth, adminUserId, { studentId: s1.id, parentPhone: "9100000001" });
  const { rows: r1 } = await db.query<{ auth_user_id: string }>("select auth_user_id from users where id = $1", [login1.userId]);
  studentNoParentAuthUserId = r1[0].auth_user_id;

  // Student WITH a primary-contact parent who has a genuinely working
  // login — provisionParentPortalAccount() doesn't set an auth account
  // (see roster-order-flow.test.ts's own note on this), so a real parent
  // login is created the same way any other login is (createInstitutionUser
  // + role 'parent'), then attached to the parent row directly — this
  // mirrors what a real "claimed" parent portal account looks like in the
  // one column that matters here (users.auth_user_id is not null).
  const s2 = await createStudent(institutionA, adminAuth, adminUserId, { admissionNumber: "SP-2", fullName: "SP Student Zoya", gender: "female" });
  await enrollStudent(institutionA, adminAuth, adminUserId, { studentId: s2.id, academicYearId, classId, sectionId });
  const login2 = await createStudentLoginAccount(institutionA, adminAuth, adminUserId, { studentId: s2.id, parentPhone: "9100000002" });
  const { rows: r2 } = await db.query<{ auth_user_id: string }>("select auth_user_id from users where id = $1", [login2.userId]);
  studentWithParentAuthUserId = r2[0].auth_user_id;

  const parentLogin = await createInstitutionUser(institutionA, adminAuth, adminUserId, {
    email: "parent@sample-portals-a.example", fullName: "SP Zoya's Parent", password: "parentpass1", roleCodes: ["parent"],
  });
  const { rows: rp } = await db.query<{ auth_user_id: string }>("select auth_user_id from users where id = $1", [parentLogin.userId]);
  parentAuthUserId = rp[0].auth_user_id;

  const parent = await createParent(institutionA, adminAuth, adminUserId, { fullName: "SP Zoya's Parent", phone: "9100000002" });
  await linkParentToStudent(institutionA, adminAuth, adminUserId, { studentId: s2.id, parentId: parent.id, isPrimaryContact: true });
  await db.query("update parents set user_id = $1 where id = $2", [parentLogin.userId, parent.id]);
});

afterAll(async () => {
  const db = await getDbClient();
  await db.close();
  __resetDbClientForTests();
});

describe("access control — every listing/lookup requires a genuine Super Admin", () => {
  it("rejects a full institution_admin (not a platform Super Admin)", async () => {
    await expect(listSamplePrincipals(adminAuth, institutionA)).rejects.toThrow(/Forbidden/);
    await expect(listSampleManagement(adminAuth, institutionA)).rejects.toThrow(/Forbidden/);
    await expect(listSampleClassTeachers(adminAuth, institutionA)).rejects.toThrow(/Forbidden/);
    await expect(listSampleStudentsWithParent(adminAuth, institutionA)).rejects.toThrow(/Forbidden/);
    await expect(getSamplePortalTarget(adminAuth, institutionA, adminUserId)).rejects.toThrow(/Forbidden/);
  });
});

describe("listSamplePrincipals() / listSampleManagement() — real role-code candidates only", () => {
  it("Principal lists the real institution_admin created for this institution", async () => {
    const principals = await listSamplePrincipals(superAdminAuth, institutionA);
    expect(principals.some((p) => p.userId === adminUserId && p.authUserId === adminAuth)).toBe(true);
  });

  it("Management lists the real 'management'-role login, not the institution_admin", async () => {
    const management = await listSampleManagement(superAdminAuth, institutionA);
    expect(management.some((m) => m.userId === managementUserId)).toBe(true);
    expect(management.some((m) => m.userId === adminUserId)).toBe(false);
  });
});

describe("listSampleClassTeachers() — current-year class_teacher assignments only", () => {
  it("lists the real class teacher, labeled with the class/division they lead", async () => {
    const classTeachers = await listSampleClassTeachers(superAdminAuth, institutionA);
    const mine = classTeachers.find((t) => t.userId === teacherUserId);
    expect(mine).toBeDefined();
    expect(mine!.detail).toContain("Sample Portals Grade");
    expect(mine!.detail).toContain("A");
  });

  it("does not list a teacher with no class_teacher assignment", async () => {
    const plainTeacher = await createInstitutionUser(institutionA, adminAuth, adminUserId, {
      email: "subject-teacher@sample-portals-a.example", fullName: "SP Subject Only Teacher", password: "subjpass1", roleCodes: ["teacher"],
    });
    const classTeachers = await listSampleClassTeachers(superAdminAuth, institutionA);
    expect(classTeachers.some((t) => t.userId === plainTeacher.userId)).toBe(false);
  });
});

describe("listSampleStudentsWithParent() — real logins only, parent attached when they also have one", () => {
  it("a student with no linked parent login shows parent: null", async () => {
    const students = await listSampleStudentsWithParent(superAdminAuth, institutionA);
    const amir = students.find((s) => s.authUserId === studentNoParentAuthUserId);
    expect(amir).toBeDefined();
    expect(amir!.parent).toBeNull();
  });

  it("a student whose primary-contact parent has a real login shows that parent, with their own real authUserId", async () => {
    const students = await listSampleStudentsWithParent(superAdminAuth, institutionA);
    const zoya = students.find((s) => s.authUserId === studentWithParentAuthUserId);
    expect(zoya).toBeDefined();
    expect(zoya!.parent).not.toBeNull();
    expect(zoya!.parent!.authUserId).toBe(parentAuthUserId);
    expect(zoya!.parent!.fullName).toBe("SP Zoya's Parent");
  });
});

describe("getSamplePortalTarget() — the same re-verification services/request-context.ts calls on every request", () => {
  it("resolves a real, in-institution, logged-in-capable user", async () => {
    const target = await getSamplePortalTarget(superAdminAuth, institutionA, managementUserId);
    expect(target).not.toBeNull();
    expect(target!.userId).toBe(managementUserId);
    expect(target!.fullName).toBe("SP Management Person");
  });

  it("refuses a userId that belongs to a DIFFERENT institution (cross-tenant safety)", async () => {
    const otherAdmin = await seedDemoUser(await getDbClient(), institutionB, "admin@sample-portals-b.example", "SP-B Admin", "institution_admin");
    const target = await getSamplePortalTarget(superAdminAuth, institutionA, otherAdmin.userId);
    expect(target).toBeNull();
  });

  it("refuses a person with no real auth account (nothing to genuinely view as)", async () => {
    const noAuthParent = await createParent(institutionA, adminAuth, adminUserId, { fullName: "No Auth Parent" });
    // parents.user_id stays null here -- getSamplePortalTarget looks up by
    // users.id, so pass a users row that has auth_user_id null instead: the
    // institution_admin seed itself always has one, so directly construct
    // a users row with no auth account to prove the null-guard works.
    const db = await getDbClient();
    const bareUserId: string = (
      await db.query<{ id: string }>(
        `insert into users (id, email, full_name) values (gen_random_uuid(), 'bare@sample-portals-a.example', 'Bare User') returning id`
      )
    ).rows[0].id;
    await db.query(
      `insert into user_institution_memberships (user_id, institution_id, status, is_primary) values ($1, $2, 'active', false)`,
      [bareUserId, institutionA]
    );
    const target = await getSamplePortalTarget(superAdminAuth, institutionA, bareUserId);
    expect(target).toBeNull();
    expect(noAuthParent.id).toBeTruthy(); // keep the unused-var lint happy / documents intent
  });
});
