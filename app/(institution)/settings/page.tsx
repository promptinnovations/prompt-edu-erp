import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { getInstitution, getParentPortalSections } from "../../../services/institution/institution-service";
import LogoForm from "./LogoForm";
import AppearanceForm from "./AppearanceForm";
import { THEME_PALETTES, DEFAULT_PALETTE_ID, resolveInstitutionPalette } from "../../../services/branding/palettes";
import InstallAppButton from "./InstallAppButton";
import ParentPortalSectionsForm from "./ParentPortalSectionsForm";
import SeatingGenderRuleForm from "./SeatingGenderRuleForm";

export default async function SettingsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;

  // Full-page gate, same pattern as /users — not just hiding the form.
  if (!can(ctx.permissions, "settings.manage")) redirect("/dashboard");

  const [institution, parentPortalSections] = await Promise.all([
    getInstitution(institutionId, ctx.session.authUserId),
    getParentPortalSections(institutionId, ctx.session.authUserId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Settings</h1>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Institution</h2>
        <p className="text-sm text-zinc-500">{institution?.appName || institution?.name}</p>
      </section>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Logo</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Upload your institution&apos;s own logo — once set, it replaces the generated letter badge everywhere the
          app currently shows one.
        </p>
        <LogoForm logoUrl={institution?.logoFileId && institution.code ? `/api/institution-logo/${institution.code}` : null} />
      </section>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Appearance — app colours</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Choose the colours of your institution&apos;s app. Staff pages, the student and parent portals, the login
          screen, report cards and the installed app icon all follow this choice.
        </p>
        <AppearanceForm
          current={resolveInstitutionPalette(institution?.themePalette).id}
          defaultId={DEFAULT_PALETTE_ID}
          choices={THEME_PALETTES.map((p) => ({
            id: p.id,
            label: p.label,
            primary: p.vars.brand,
            accent: p.swatch[2],
            sidebar: p.vars.sidebarBg,
            ground: p.vars.background,
            darkSidebar: p.vars.sidebarBg.toLowerCase() !== "#ffffff",
          }))}
        />
      </section>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Install app</h2>
        <p className="mb-3 text-sm text-zinc-500">
          {institution?.name} has its own installable app, separate from every other institution — branded with your
          own name and logo, and kept independent on shared devices.
        </p>
        <InstallAppButton
          appName={institution?.appName || institution?.name || "This institution"}
          logoUrl={institution?.logoFileId && institution.code ? `/api/institution-logo/${institution.code}` : null}
        />
      </section>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Parent portal — what parents can see</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Choose which sections of a child&apos;s page show on the parent portal. Unchecked sections stay hidden from
          parents but remain fully visible to staff.
        </p>
        <ParentPortalSectionsForm sections={parentPortalSections} />
      </section>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Exam seating — boys/girls separation</h2>
        <p className="mb-3 text-sm text-zinc-500">
          How strictly Examinations → Seating Arrangement must keep boys and girls in separate rooms when it
          generates a seating plan. (No two students from the same grade ever share a bench, under either rule.)
        </p>
        <SeatingGenderRuleForm current={institution?.examSeatingGenderRule ?? "best_effort"} />
      </section>

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--heading)]">Grading &amp; points</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Define your own grading scale, scoring rule points, achievement categories/levels, and skill
          types/activities — every institution configures these independently.
        </p>
        <Link
          href="/settings/grading"
          className="inline-block rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
        >
          Manage grading &amp; points
        </Link>
      </section>
    </div>
  );
}
