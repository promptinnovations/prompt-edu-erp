import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireRequestContext } from "../../../../services/request-context";
import { can } from "../../../../services/permissions/permission-service";
import { getStudent, getCurrentEnrollment, listParentsForStudent } from "../../../../modules/students/service";
import { listClasses, listSections, getCurrentAcademicYear } from "../../../../modules/academic/service";
import EnrollForm from "../EnrollForm";
import ParentSection, { ProvisionStudentAccountForm } from "../ParentSection";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const t = await getTranslations("students");

  const student = await getStudent(institutionId, authUserId, id);
  if (!student) notFound(); // RLS already guarantees this is null for another institution's id (§E.3)

  const [enrollment, classes, sections, academicYear, parents] = await Promise.all([
    getCurrentEnrollment(institutionId, authUserId, id),
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    getCurrentAcademicYear(institutionId, authUserId),
    listParentsForStudent(institutionId, authUserId, id),
  ]);

  const classById = new Map(classes.map((c) => [c.id, c.name]));
  const sectionOptions = sections.map((s) => ({
    id: s.id,
    classId: s.class_id,
    label: `${classById.get(s.class_id) ?? "?"} — ${s.name}`,
  }));

  return (
    <div className="space-y-4">
      <Link href="/students" className="text-sm text-zinc-500 dark:text-zinc-400 underline">
        ← {t("backToList")}
      </Link>
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{student.full_name}</h1>
          <Link href={`/students/${student.id}/portfolio`} className="text-sm text-zinc-600 dark:text-zinc-400 underline">
            View Student 360°
          </Link>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">{t("admissionNumber")}</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{student.admission_number}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 dark:text-zinc-500">Status</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{student.status}</dd>
          </div>
          {student.date_of_birth ? (
            <div>
              <dt className="text-zinc-400 dark:text-zinc-500">Date of birth</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{student.date_of_birth}</dd>
            </div>
          ) : null}
          {student.gender ? (
            <div>
              <dt className="text-zinc-400 dark:text-zinc-500">Gender</dt>
              <dd className="mt-0.5 text-zinc-900 dark:text-zinc-50">{student.gender}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Class enrollment</h2>
        {enrollment ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Enrolled in {classById.get(enrollment.class_id) ?? "—"} for the current academic year.
          </p>
        ) : academicYear ? (
          <EnrollForm studentId={student.id} academicYearId={academicYear.id} sections={sectionOptions} />
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No current academic year configured.</p>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Parents / guardians (§D.4)</h2>
        <ParentSection studentId={student.id} parents={parents} canManage={can(ctx.permissions, "student.edit")} />
      </div>

      {can(ctx.permissions, "users.manage") ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Student portal account (§Z)</h2>
          <ProvisionStudentAccountForm
            studentId={student.id}
            defaultEmail={student.contact_email ?? ""}
            defaultName={student.full_name}
            alreadyLinked={!!student.user_id}
          />
        </div>
      ) : null}
    </div>
  );
}
