-- PROMPT EDU ERP — student portal login id (§137 follow-up: "their log in
-- id (must be student name, password- phone number of parent) ... should be
-- able edit, delete, search for institution admin").
--
-- `login_id` is the exact string a student's family types into the "Student
-- login" tab on the login screen — normally just the student's full name,
-- but kept as its OWN column (not a re-read of `full_name`) so a name
-- collision within one institution can be resolved by suffixing just the
-- login id ("Ahmed Basheer 2") without ever touching the student's real,
-- displayed name. Nullable: a student with no portal account yet (or one
-- provisioned the older email-based way, via provisionStudentPortalAccount)
-- simply has no login_id.
alter table students add column login_id text;

-- Scoped per institution (two different institutions may both have a
-- student named "Fathima"), case-insensitive (the login screen must resolve
-- regardless of how the family capitalizes it), and partial (many rows will
-- be null — a global unique index would otherwise reject a second null,
-- since standard btree unique indexes treat NULLs as distinct from each
-- other by default in Postgres, but the `where login_id is not null` is
-- kept explicit anyway for clarity and to avoid ever indexing the common
-- common case of "no login yet").
create unique index students_login_id_unique on students (institution_id, lower(login_id)) where login_id is not null;
