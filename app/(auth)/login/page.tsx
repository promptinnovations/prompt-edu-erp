"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { loginAction, type LoginState } from "./actions";
import ThemeToggle from "../../components/ThemeToggle";

const INITIAL_STATE: LoginState = { error: null, info: null };

export default function LoginPage() {
  const t = useTranslations("login");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, INITIAL_STATE);

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
              P
            </span>
            <h2 className="mt-8 text-2xl font-semibold leading-snug">
              Technology with Purpose.
            </h2>
            <p className="mt-3 max-w-xs text-sm text-white/80">
              One platform for academics, attendance, examinations, library, staff, and every institution you run —
              built for madrasas, schools, and colleges alike.
            </p>
          </div>
          <div className="text-xs font-medium uppercase tracking-wide text-white/60">
            Prompt Innovations
          </div>
        </div>

        {/* Right: the actual sign-in form */}
        <div className="flex flex-col justify-center p-8 sm:p-10">
          <div className="mb-6">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 md:hidden">Prompt Innovations</div>
            <h1 className="mt-1 text-2xl font-semibold text-white">{t("title")}</h1>
            <p className="mt-1 text-sm text-zinc-400">{t("subtitle")}</p>
          </div>
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
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
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
                className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                {t("signUp")}
              </button>
            </div>
          </form>
          <p className="mt-6 text-center text-xs text-zinc-500">{t("firstTimeNotice")}</p>
        </div>
      </div>
    </div>
  );
}
