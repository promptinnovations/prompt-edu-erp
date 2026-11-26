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
  // The school set-up path, in the order it is done: year → classes →
  // divisions → subjects → subjects per class → students → staff → who
  // teaches what → timetable. Each "done" is read from real data.
  { code: "academic_year", label: "Set the academic year", description: "The current year the classes and exams belong to.", href: "/academic#academic-years" },
  { code: "academic_structure", label: "Add your classes", description: "Grade 1, Grade 2 … up to the highest class you run.", href: "/academic#classes" },
  { code: "divisions", label: "Add divisions", description: "A, B, C … for each class.", href: "/academic#divisions" },
  { code: "subjects", label: "Add subjects", description: "List the subjects taught at your institution.", href: "/academic#subjects" },
  { code: "class_subjects", label: "Choose subjects for each class", description: "Which subjects each class studies.", href: "/academic#subjects-per-class" },
  { code: "students", label: "Enrol your students", description: "Add them one by one, or upload all at once from Import / Export.", href: "/students" },
  { code: "staff", label: "Add your staff", description: "Create staff accounts and logins.", href: "/staff", moduleCode: "staff" },
  { code: "teacher_assignments", label: "Say who teaches what", description: "Class teachers and subject teachers — teachers then see only their own classes.", href: "/staff#teacher-assignments", moduleCode: "staff" },
  { code: "timetable", label: "Add the timetable", description: "Needed for substitutions and each teacher's timetable.", href: "/substitution/timetable", moduleCode: "substitution" },
  { code: "branding", label: "Add your school logo", description: "Shown on report cards, hall tickets and printouts.", href: "/settings" },
  { code: "users", label: "Invite a colleague", description: "Generate a login for someone else on your team.", href: "/users" },
  { code: "announcements", label: "Publish an announcement", description: "Send your first announcement to staff or everyone.", href: "/announcements" },
  { code: "library", label: "Add a library book", description: "Start your library catalogue.", href: "/library", moduleCode: "library" },
];

export async function getOnboardingChecklist(institutionId: string, authUserId: string): Promise<ChecklistItem[]> {
  const db = await getDbClient();
  const enabledModules = await getEnabledModuleCodes(institutionId, authUserId);
  const definitions = ITEM_DEFINITIONS.filter((d) => !d.moduleCode || enabledModules.has(d.moduleCode));

  const [classes, subjects, students, staff, announcements, books, users, counts, skipped] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSubjects(institutionId, authUserId),
    listStudents(institutionId, authUserId),
    enabledModules.has("staff") ? listStaff(institutionId, authUserId) : Promise.resolve([]),
    listAnnouncements(institutionId, authUserId, 1),
    enabledModules.has("library") ? listBooks(institutionId, authUserId) : Promise.resolve([]),
    listInstitutionUsers(institutionId, authUserId),
    // One cheap query for the extra set-up steps (instead of loading whole lists).
    db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      const one = async (sql: string) => {
        try { return Number((await scoped.query<{ n: string }>(sql)).rows[0]?.n ?? 0) > 0; } catch { return false; }
      };
      return {
        academic_year: await one("select count(*) n from academic_years"),
        divisions: await one("select count(*) n from sections"),
        class_subjects: await one("select count(*) n from class_subjects"),
        teacher_assignments: await one("select count(*) n from teacher_assignments"),
        timetable: await one("select count(*) n from timetable_periods"),
        branding: await one("select count(*) n from institutions where logo_file_id is not null"),
      } as Record<string, boolean>;
    }),
    db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
      try {
        const { rows } = await scoped.query<{ item_code: string }>(
          "select item_code from onboarding_skips where institution_id = $1",
          [institutionId]
        );
        return new Set(rows.map((r) => r.item_code));
      } catch (err) {
        // Defensive only: a deployment whose migration 0021 hasn't been
        // applied yet (e.g. the brief window right after a deploy, before
        // `npm run db:migrate` is re-run against production) would
        // otherwise take the whole dashboard down on every load. Same
        // "degrade, don't crash" philosophy as the dual dev/prod auth and
        // storage providers elsewhere in this codebase — worst case here
        // is just "nothing shows as skipped yet".
        const message = err instanceof Error ? err.message : String(err);
        if (/relation .*onboarding_skips.* does not exist/i.test(message)) {
          return new Set<string>();
        }
        throw err;
      }
    }),
  ]);

  const doneByCode: Record<string, boolean> = {
    ...counts,
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
