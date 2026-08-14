import { cookies } from "next/headers";
import LoginForm from "./LoginForm";
import { getInstitutionPublicSummaryByCode } from "../../../services/institution/institution-service";
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

  return <LoginForm institutionName={institutionName} />;
}
