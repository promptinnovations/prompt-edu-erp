import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../../services/request-context";
import { requirePermission } from "../../../../services/permissions/permission-service";
import { listClasses, listSections, listAcademicYears, getPromotionPreview } from "../../../../modules/academic/service";
import PromotionForm from "./PromotionForm";

/** §Page-2 follow-up "Promotion" — full bulk workflow: pick a class (+
 *  optional division), preview its current active roster with a suggested
 *  action per student (promote to the next class / repeat / graduate),
 *  let the admin override any of those before confirming — see
 *  PromotionForm.tsx and modules/academic/service.ts's promoteClass(). */
export default async function PromotionPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; sectionId?: string }>;
}) {
  const ctx = await requireRequestContext();
  requirePermission(ctx.permissions, "academic.promote");
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  const { classId, sectionId } = await searchParams;

  const [classes, sections, academicYears] = await Promise.all([
    listClasses(institutionId, authUserId),
    listSections(institutionId, authUserId),
    listAcademicYears(institutionId, authUserId),
  ]);

  async function pickClass(formData: FormData) {
    "use server";
    const chosenClassId = String(formData.get("classId") ?? "");
    const chosenSectionId = String(formData.get("sectionId") ?? "");
    const qs = new URLSearchParams();
    if (chosenClassId) qs.set("classId", chosenClassId);
    if (chosenSectionId) qs.set("sectionId", chosenSectionId);
    redirect(`/academic/promotion?${qs.toString()}`);
  }

  const preview = classId ? await getPromotionPreview(institutionId, authUserId, classId, sectionId || undefined) : [];
  const sectionsForChosenClass = sections.filter((s) => s.class_id === classId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/academic" className="text-sm text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">
          ← Academic Setup
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Promote a class</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Move a class&apos;s current roster into a new academic year — promote, repeat, graduate, transfer out, or mark a dropout, per student.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">1. Choose a class</h2>
        <form action={pickClass} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class</label>
            <select
              name="classId"
              defaultValue={classId ?? ""}
              required
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            >
              <option value="" disabled>Select a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Division (optional — all if blank)</label>
            <select
              name="sectionId"
              defaultValue={sectionId ?? ""}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
            >
              <option value="">All divisions</option>
              {sectionsForChosenClass.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)]">
            Load roster
          </button>
        </form>
      </section>

      {classId ? (
        preview.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            No active students found for this class — check that an academic year is marked current.
          </p>
        ) : (
          <PromotionForm
            fromClassId={classId}
            fromSectionId={sectionId || null}
            students={preview}
            classes={classes}
            sections={sections}
            academicYears={academicYears}
          />
        )
      ) : null}
    </div>
  );
}
