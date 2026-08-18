"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { loginAction, type LoginState } from "./actions";
import ThemeToggle from "../../components/ThemeToggle";

const INITIAL_STATE: LoginState = { error: null, info: null };

/**
 * §137 follow-up ("it should show an interface to login to mmp ... prompt
 * edu erp and prompt innovations can be seen just at the bottom"):
 * `institutionName`, when provided by the Server Component wrapper in
 * page.tsx (from the active-institution cookie middleware.ts sets from a
 * visit to that institution's own /<code> URL), replaces the generic
 * "PROMPT EDU ERP" heading as the primary, prominent identity on this
 * screen — "PROMPT EDU ERP" / "Prompt Innovations" move down to one small
 * credit line instead of appearing as the page's own title. With no
 * institution context (the plain, un-prefixed /login — e.g. the public
 * marketing entry point) this renders exactly as it always has.
 */
export default function LoginForm({ institutionName }: { institutionName?: string }) {
  const t = useTranslations("login");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, INITIAL_STATE);
  const credit = institutionName ? "PROMPT EDU ERP · Prompt Innovations" : "Prompt Innovations";
  const logoLetter = (institutionName ?? "P").trim().charAt(0).toUpperCase() || "P";
  // §137 follow-up ("their log in id (must be student name, password- phone
  // number of parent)") — the student-name login tab only makes sense once
  // we're already on a specific institution's own login screen (the
  // synthetic email it resolves to is scoped by institution code, from the
  // ACTIVE_INSTITUTION_COOKIE — see actions.ts's loginAction()); the
  // generic, un-prefixed /login has no institution to scope the lookup to.
  const [studentMode, setStudentMode] = useState(false);
  // "Add an option for seeing password while entering" follow-up — a plain
  // eye/eye-off toggle per password field, each independently controlled
  // (studentMode vs staff tab) since only one form is ever mounted at a
  // time but state shouldn't leak between them if the user switches tabs.
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10">
      {/* Ambient gradient backdrop — pure decoration, doesn't affect the
          Android-compat colour override (these are the same indigo/violet/
          fuchsia hex stops defined in globals.css, blurred). */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
      </div>

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/80 shadow-2xl shadow-black/40 backdrop-blur md:grid-cols-2">
        {/* Left: brand hero panel, hidden on small screens */}
        <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-10 text-white md:flex">
          <div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold backdrop-blur">
              {logoLetter}
            </span>
            <h2 className="mt-8 text-2xl font-semibold leading-snug">
              {institutionName ?? "Technology with Purpose."}
            </h2>
            <p className="mt-3 max-w-xs text-sm text-white/80">
              {institutionName
                ? "Sign in to your institution's console — academics, attendance, examinations, library, staff, and more, all in one place."
                : "One platform for academics, attendance, examinations, library, staff, and every institution you run — built for madrasas, schools, and colleges alike."}
            </p>
          </div>
          <div className="text-xs font-medium uppercase tracking-wide text-white/60">{credit}</div>
        </div>

        {/* Right: the actual sign-in form */}
        <div className="flex flex-col justify-center p-8 sm:p-10">
          <div className="mb-6">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 md:hidden">{credit}</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">{institutionName ?? t("title")}</h1>
            <p className="mt-1 text-sm text-zinc-400">{t("subtitle")}</p>
          </div>

          {institutionName ? (
            <div className="mb-4 flex rounded-lg border border-zinc-700 p-0.5 text-sm">
              <button
                type="button"
                onClick={() => setStudentMode(false)}
                className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${!studentMode ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {t("staffTab")}
              </button>
              <button
                type="button"
                onClick={() => setStudentMode(true)}
                className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${studentMode ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {t("studentTab")}
              </button>
            </div>
          ) : null}

          {studentMode ? (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="intent" value="student_signin" />
              <div>
                <label htmlFor="studentLoginId" className="block text-sm font-medium text-zinc-300">
                  {t("studentLoginId")}
                </label>
                <input
                  id="studentLoginId"
                  name="studentLoginId"
                  type="text"
                  required
                  placeholder={t("studentLoginIdPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label htmlFor="studentPassword" className="block text-sm font-medium text-zinc-300">
                  {t("password")}
                </label>
                <div className="relative mt-1">
                  <input
                    id="studentPassword"
                    name="password"
                    type={showStudentPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder={t("studentPasswordPlaceholder")}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pr-10 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <PasswordVisibilityToggle
                    visible={showStudentPassword}
                    onToggle={() => setShowStudentPassword((v) => !v)}
                  />
                </div>
              </div>
              {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
              {state.info ? <p className="text-sm text-emerald-400">{state.info}</p> : null}
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-violet-900/30 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t("signIn")}
              </button>
              <p className="text-center text-xs text-zinc-500">{t("studentTabNotice")}</p>
            </form>
          ) : (
            <form action={formAction} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
                  {t("email")}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
                  {t("password")}
                </label>
                <div className="relative mt-1">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pr-10 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <PasswordVisibilityToggle
                    visible={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                  />
                </div>
              </div>
              {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
              {state.info ? <p className="text-sm text-emerald-400">{state.info}</p> : null}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  name="intent"
                  value="signin"
                  disabled={pending}
                  className="flex-1 rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-violet-900/30 transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {t("signIn")}
                </button>
                <button
                  type="submit"
                  name="intent"
                  value="signup"
                  disabled={pending}
                  className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                >
                  {t("signUp")}
                </button>
              </div>
            </form>
          )}
          <p className="mt-6 text-center text-xs text-zinc-500">{t("firstTimeNotice")}</p>
        </div>
      </div>
    </div>
  );
}

/** Plain inline-SVG eye / eye-off toggle — no icon library dependency
 *  needed for one glyph pair. `tabIndex={-1}` keeps it out of the tab order
 *  between the password field and the submit button. */
function PasswordVisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={visible ? "Hide password" : "Show password"}
      className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-300"
    >
      {visible ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  );
}
