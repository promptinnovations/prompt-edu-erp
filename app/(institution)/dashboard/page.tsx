import { getTranslations } from "next-intl/server";
import { requireRequestContext } from "../../../services/request-context";
import { getInstitution } from "../../../services/institution/institution-service";
import { listClasses, listSections, listSubjects } from "../../../modules/academic/service";
import { listStudents } from "../../../modules/students/service";
import { getOnboardingChecklist } from "../../../services/onboarding/onboarding-service";
import { can } from "../../../services/permissions/permission-service";
import OnboardingChecklist from "./OnboardingChecklist";

const CARD_ACCENTS = [
  "from-indigo-500 to-violet-500",
  "from-violet-500 to-fuchsia-500",
  "from-fuchsia-500 to-pink-500",
  "from-sky-500 to-indigo-500",
];

export default async function DashboardPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const t = await getTranslations("dashboard");
  // Setup checklist is about configuring the institution, so it's only
  // fetched/shown to whoever can already reach Settings — same gate, same
  // reasoning as that page.
  const canSeeChecklist = can(ctx.permissions, "settings.manage");

  const [institution, classes, sections, subjects, students, checklist] = await Promise.all([
    getInstitution(institutionId, ctx.session.authUserId),
    listClasses(institutionId, ctx.session.authUserId),
    listSections(institutionId, ctx.session.authUserId),
    listSubjects(institutionId, ctx.session.authUserId),
    listStudents(institutionId, ctx.session.authUserId),
    canSeeChecklist ? getOnboardingChecklist(institutionId, ctx.session.authUserId) : Promise.resolve([]),
  ]);

  const cards: Array<[string, number]> = [
    [t("classes"), classes.length],
    [t("sections"), sections.length],
    [t("subjects"), subjects.length],
    [t("students"), students.length],
  ];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg shadow-violet-900/20 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-black/10 blur-2xl" />
        <div className="relative">
          <div className="text-xs font-medium uppercase tracking-wide text-white/70">{t("institution")}</div>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{institution?.appName || institution?.name}</h1>
          <p className="mt-2 max-w-lg text-sm text-white/80">{t("title")}</p>
        </div>
      </div>

      {canSeeChecklist ? <OnboardingChecklist items={checklist} /> : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map(([label, value], i) => (
          <div
            key={label}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br ${CARD_ACCENTS[i % CARD_ACCENTS.length]} text-sm font-bold text-white`}>
              {value > 99 ? "99+" : value}
            </div>
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</div>
            <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
