-- =============================================================================
-- PROMPT EDU ERP — Seed: platform permission catalogue + system role templates
-- Platform-level (institution_id = null) seed data, per ARCHITECTURE.md §F.
-- Institution-scoped roles (institution_admin, teacher, etc.) are created
-- per-institution at onboarding time by copying these system role templates
-- (see database/scripts/seed.ts: seedInstitutionDefaults()).
-- =============================================================================

insert into permissions (code, module, description) values
  ('student.view',        'students',     'View a student profile'),
  ('student.view_all',    'students',     'View all students in the institution'),
  ('student.create',      'students',     'Create a student record'),
  ('student.edit',        'students',     'Edit a student record'),
  ('student.delete',      'students',     'Soft-delete a student record'),

  ('marks.view',           'examination',  'View marks'),
  ('marks.enter',          'examination',  'Enter marks'),
  ('marks.verify',         'examination',  'Verify entered marks'),
  ('marks.approve',        'examination',  'Approve marks'),
  ('marks.lock',           'examination',  'Lock marks against further edits'),

  ('attendance.view',      'attendance',   'View attendance'),
  ('attendance.enter',     'attendance',   'Enter attendance'),
  ('attendance.edit',      'attendance',   'Edit attendance (unrestricted — any class)'),
  ('attendance.leave.apply', 'attendance', 'Apply for leave (own record, or own child as a parent)'),
  ('attendance.leave.review_own_class', 'attendance', 'Approve/reject leave applications for students in own assigned class(es) only'),

  ('library.view',         'library',      'View library catalogue/records'),
  ('library.issue',        'library',      'Issue a book'),
  ('library.return',       'library',      'Return a book'),
  ('library.manage',       'library',      'Manage catalogue/shelves/copies'),

  ('skills.submit',        'skills',       'Submit a skill activity'),
  ('skills.review',        'skills',       'Review a skill submission'),
  ('skills.approve',       'skills',       'Approve a skill submission'),

  ('achievements.submit',  'achievements', 'Submit an achievement'),
  ('achievements.verify',  'achievements', 'Verify an achievement'),
  ('achievements.approve', 'achievements', 'Approve an achievement'),

  ('mentoring.view_own',   'mentoring',    'View own mentoring records (as mentor)'),
  ('mentoring.view_all',   'mentoring',    'View all mentoring records (confidential)'),
  ('mentoring.create',     'mentoring',    'Create a mentoring record'),

  ('discipline.view',      'discipline',   'View discipline records'),
  ('discipline.record',    'discipline',   'Record a discipline entry'),

  ('portfolio.view_own',   'portfolio',    'View own/child portfolio'),
  ('portfolio.view_all',   'portfolio',    'View all student portfolios'),
  ('portfolio.submit',     'portfolio',    'Submit a portfolio item'),
  ('portfolio.approve',    'portfolio',    'Approve a portfolio item'),

  ('reports.view',         'reporting',    'View reports'),
  ('reports.export',       'reporting',    'Export reports (PDF/Excel)'),
  ('reports.build',        'reporting',    'Build custom reports'),

  ('data.import',          'bulk',         'Bulk import data from a file (students, staff, classes, etc.)'),
  ('data.export',          'bulk',         'Bulk export data to CSV/Excel'),

  ('announcements.publish', 'communication', 'Publish an announcement to a chosen audience'),
  ('announcements.view',    'communication', 'View published announcements'),

  ('staff.view',              'staff', 'View staff directory/profiles'),
  ('staff.create',            'staff', 'Create a staff member (and their user account)'),
  ('staff.edit',               'staff', 'Edit a staff member''s record'),
  ('staff.portion.manage',    'staff', 'Create portion plans and record portion completion'),
  ('staff.observation.manage','staff', 'Record and view teacher observations'),
  ('staff.assignment.manage', 'staff', 'Manage class/subject teacher assignments'),

  ('settings.manage',      'platform',     'Manage institution settings'),
  ('modules.manage',       'platform',     'Configure enabled modules'),
  ('users.manage',         'platform',     'Manage users'),
  ('roles.manage',         'platform',     'Manage roles and permissions'),
  ('audit.view',           'platform',     'View audit logs'),

  ('files.manage',         'storage',      'Manage institution file storage (view all files, trigger provider migration)'),

  ('calendar.view',        'calendar',      'View the academic calendar'),
  ('calendar.manage',      'calendar',      'Add/edit/delete academic calendar events, including bulk upload'),

  ('substitution.view',    'substitution',  'View staff substitutions and reports'),
  ('substitution.manage',  'substitution',  'Generate, edit, and confirm substitutions for an absent teacher'),
  ('substitution.timetable.manage', 'substitution', 'Configure the weekly timetable (class/section/period -> subject/teacher), including bulk upload'),

  ('academic.promote',     'academic',      'Bulk-promote a class roster to a new academic year (promote/repeat/graduate)'),

  ('platform.institutions.manage', 'super_admin', 'Create/edit/activate institutions'),
  ('platform.usage.view',          'super_admin', 'View platform usage metrics'),
  ('platform.audit.view',          'super_admin', 'View platform-wide audit logs')
on conflict (code) do nothing;

-- Platform role: Super Admin (institution_id is null)
insert into roles (institution_id, code, name, is_system_role)
values (null, 'super_admin', 'Super Admin', true)
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
where r.code = 'super_admin' and r.institution_id is null
  and p.code like 'platform.%'
on conflict do nothing;

-- Default subscription plan (placeholder limits — §AC.3 open question #2)
insert into subscription_plans (name, max_students, max_staff, max_users, max_storage_mb, max_modules, is_active)
values ('Starter', 500, 50, 600, 5120, 20, true)
on conflict (name) do nothing;

-- Core module catalogue (representative subset for Phase 1/2 — full catalogue
-- per ARCHITECTURE.md §24 is added incrementally as each module ships)
insert into modules (code, name, description, category, is_core, is_active) values
  ('academic',     'Academic Structure', 'Classes, sections, subjects, academic years', 'core', true, true),
  ('students',     'Student Management', 'Student profiles and enrollment',             'core', true, true),
  ('examination',  'Examination',        'Exams, marks, grades, results',               'academic', false, true),
  ('attendance',   'Attendance',         'Student attendance and leave',                'academic', false, true),
  ('library',      'Library',            'Catalogue, issue/return, reading history',    'academic-support', false, true),
  ('skills',       'Skills',             'Reading, writing, speaking, language activities', 'performance', false, true),
  ('achievements', 'Achievements',       'Student achievements and recognitions',       'performance', false, true),
  ('staff',        'Staff',              'Staff directory, attendance, leave, portion completion, teacher performance', 'core', false, true),
  ('discipline',   'Discipline',         'Discipline records and character assessments',   'wellbeing', false, true),
  ('mentoring',    'Mentoring',          'Mentor observations, goals, and action plans',    'wellbeing', false, true),
  ('calendar',     'Academic Calendar',  'Yearly/termly/monthly events and holidays',       'operations', false, true),
  ('substitution', 'Substitution',       'Day-level teacher substitution for absent staff', 'operations', false, true)
on conflict (code) do nothing;
