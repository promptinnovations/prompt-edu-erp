/**
 * PROMPT EDU ERP — dashboard onboarding checklist.
 *
 * Deliberately does NOT introduce a new "is this institution set up"
 * status column or workflow engine. Each item's "done" state is derived
 * live from whether real data already exists (a class, a student, a
 * staff member, ...) by calling the exact same list functions the actual
 * module pages already use — so the checklist can never drift out of
 * sync with reality by construction: add a class through /academic and
 * the "add a class" item disappears next render, with nothing extra to
 * maintain. The only new persisted state is "skipped" (database/
 * migrations/0021_onboarding_checklist.sql), for the explicit "not
 * applicable to us / do this later" case an auto-derived checklist can't
 * express on its own.
 */
import { getDbClient } from "../db/client";
import { getEnabledModuleCodes } from "../modules/module-service";
import { listClasses, listSubjects } from "../../modules/academic/service";
import { listStudents } from "../../modules/students/service";
import { listStaff } from "../../modules/staff/service";
import { listAnnouncements } from "../../modules/announcements/service";
import { listBooks } from "../../modules/library/service";
import { listInstitutionUsers } from "../users/user-management-service";

export interface ChecklistItem {
  code: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
  skipped: boolean;
}

type ItemDefinition = {
  code: string;
  label: string;
  description: string;
  href: string;
  moduleCode?: string; // only shown when this module is enabled for the institution
};

const ITEM_DEFINITIONS: ItemDefinition[] = [
  { code: "academic_structure", label: "Add your first class", description: "Set up at least one class and section.", href: "/academic" },
  { code: "subjects", label: "Add subjects", description: "List the subjects taught at your institution.", href: "/academic" },
  { code: "students", label: "Enroll a student", description: "Add your first student profile.", href: "/students" },
  { code: "staff", label: "Add a staff member", description: "Create your first staff account.", href: "/staff", moduleCode: "staff" },
  { code: "users", label: "Invite a colleague", description: "Generate a login for someone else on your team.", href: "/users" },
  { code: "announcements", label: "Publish an announcement", description: "Send your first announcement to staff or everyone.", href: "/announcements" },
  { code: "library", label: "Add a library book", description: "Start your library catalogue.", href: "/library", moduleCode: "library" },
];

export async function getOnboardingChecklist(institutionId: string, authUserId: string): Promise<ChecklistItem[]> {
  const db = await getDbClient();
  const enabledModules = await getEnabledModuleCodes(institutionId, authUserId);
  const definitions = ITEM_DEFINITIONS.filter((d) => !d.moduleCode || enabledModules.has(d.moduleCode));

  const [classes, subjects, students, staff, announcements, books, users, skipped] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSubjects(institutionId, authUserId),
    listStudents(institutionId, authUserId),
    enabledModules.has("staff") ? listStaff(institutionId, authUserId) : Promise.resolve([]),
    listAnnouncements(institutionId, authUserId, 1),
    enabledModules.has("library") ? listBooks(institutionId, authUserId) : Promise.resolve([]),
    listInstitutionUsers(institutionId, authUserId),
    db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      const { rows } = await scoped.query<{ item_code: string }>(
        "select item_code from onboarding_skips where institution_id = $1",
        [institutionId]
      );
      return new Set(rows.map((r) => r.item_code));
    }),
  ]);

  const doneByCode: Record<string, boolean> = {
    academic_structure: classes.length > 0,
    subjects: subjects.length > 0,
    students: students.length > 0,
    staff: staff.length > 0,
    // More than the one guaranteed self-membership — i.e. someone else
    // has actually been invited.
    users: users.length > 1,
    announcements: announcements.length > 0,
    library: books.length > 0,
  };

  return definitions.map((d) => ({
    code: d.code,
    label: d.label,
    description: d.description,
    href: d.href,
    done: doneByCode[d.code] ?? false,
    skipped: skipped.has(d.code),
  }));
}

export async function skipOnboardingItem(institutionId: string, authUserId: string, userId: string, itemCode: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query(
      `insert into onboarding_skips (institution_id, item_code, skipped_by)
       values ($1, $2, $3)
       on conflict (institution_id, item_code) do nothing`,
      [institutionId, itemCode, userId]
    );
  });
}

/** "Do it later" reactivation — removing the skip makes the item eligible
 *  to show again (still gated on `done` staying false). */
export async function unskipOnboardingItem(institutionId: string, authUserId: string, itemCode: string): Promise<void> {
  const db = await getDbClient();
  await db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    await scoped.query("delete from onboarding_skips where institution_id = $1 and item_code = $2", [institutionId, itemCode]);
  });
}
