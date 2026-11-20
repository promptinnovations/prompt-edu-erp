import { cookies, headers } from "next/headers";
import LoginForm from "./LoginForm";
import { institutionShortLabel } from "../../../services/branding/short-label";
import { getInstitutionPublicSummaryByCode } from "../../../services/institution/institution-service";
import { resolveInstitutionPalette, paletteCssVars } from "../../../services/branding/palettes";
import { ACTIVE_INSTITUTION_COOKIE } from "../../../services/tenant/institution-cookie";

/**
 * Server Component wrapper — the only reason this isn't still a single
 * "use client" file (see LoginForm.tsx) is that reading the
 * active-institution cookie and looking up its display name both have to
 * happen server-side, before the interactive form ever renders. See
 * services/institution/institution-service.ts's
 * getInstitutionPublicSummaryByCode() for why this particular lookup is
 * safe to run pre-authentication.
 */
export default async function LoginPage() {
  const store = await cookies();
  const code = store.get(ACTIVE_INSTITUTION_COOKIE)?.value ?? null;
  const institution = code ? await getInstitutionPublicSummaryByCode(code).catch(() => null) : null;
  const institutionName = institution?.appName || institution?.name || undefined;
  const logoUrl = institution?.hasLogo ? `/api/institution-logo/${institution.code}` : undefined;
  // §Brand-kit: an institution's own login page wears its chosen colours;
  // the generic login uses the default (Scholar Teal).
  const palette = resolveInstitutionPalette(institution?.themePalette);
  // §Palette-picker follow-up ("colour palette is still not working"):
  // middleware.ts's CSP sends `style-src 'self' 'nonce-<value>'` in
  // production -- NOT 'unsafe-inline' -- so a bare <style> tag with no
  // `nonce` attribute is silently dropped by the browser (it never even
  // enters document.styleSheets, confirmed live via
  // getComputedStyle(...).getPropertyValue('--brand') still returning
  // globals.css's hardcoded default no matter what palette was saved).
  // middleware.ts already forwards the per-request nonce as an `x-nonce`
  // request header specifically so server-rendered tags like this one can
  // pick it up -- this was simply never wired up when the palette picker
  // (built after the CSP header) added this inline <style> tag.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <>
      <style nonce={nonce} dangerouslySetInnerHTML={{ __html: `:root{${paletteCssVars(palette)}}` }} />
      <LoginForm institutionName={institutionName} logoUrl={logoUrl} badgeText={institution ? institutionShortLabel(institution.code, institution.name) : undefined} />
    </>
  );
}
