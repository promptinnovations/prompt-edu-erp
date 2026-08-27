import { requireSuperAdminContext } from "../../../../services/request-context";
import { getPlatformDefaultPalette } from "../../../../services/super-admin/super-admin-service";
import { updatePlatformPaletteAction } from "../../actions";
import PalettePicker from "../../../components/PalettePicker";

/**
 * "Never use dark ... give colour combination options, let them choose
 * best for them, even in Super Admin's console" follow-up — the
 * platform-wide default (migration 0040's platform_settings table)
 * governs the Super Admin console's own chrome AND the generic /login
 * screen reached with no institution context at all. Each individual
 * institution can still pick its own combination instead, on its own
 * Settings page (app/(institution)/settings/page.tsx) — this is only the
 * fallback for institutions that haven't.
 */
export default async function SuperAdminAppearancePage() {
  await requireSuperAdminContext();
  const currentId = await getPlatformDefaultPalette();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--foreground)]">Appearance</h1>
      <p className="text-sm text-zinc-500">
        Sets the colour combination for this Super Admin console and the generic sign-in screen (before anyone has
        opened a specific institution&apos;s own link). Individual institutions can still override this with their
        own choice on their own Settings page.
      </p>

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
        <PalettePicker currentId={currentId} action={updatePlatformPaletteAction} />
      </section>
    </div>
  );
}
