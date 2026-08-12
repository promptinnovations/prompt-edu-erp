import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { getInstitution, DEFAULT_BRAND_COLOR } from "../../../services/institution/institution-service";
import BrandingForm from "./BrandingForm";

export default async function SettingsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;

  // Full-page gate, same pattern as /users — not just hiding the form.
  if (!can(ctx.permissions, "settings.manage")) redirect("/dashboard");

  const institution = await getInstitution(institutionId, ctx.session.authUserId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700">Brand colour</h2>
        <p className="mb-3 text-sm text-zinc-500">
          Pick the colour used for buttons and accents across your institution&apos;s console and your students&apos;/
          parents&apos; portals. Only visible to your own institution — every other institution keeps its own colour
          (or the default) unaffected.
        </p>
        <BrandingForm currentColor={institution?.primaryColor ?? null} defaultColor={DEFAULT_BRAND_COLOR} />
      </section>
    </div>
  );
}
