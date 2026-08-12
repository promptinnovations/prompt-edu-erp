"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { loginAction, type LoginState } from "./actions";

const INITIAL_STATE: LoginState = { error: null, info: null };

export default function LoginPage() {
  const t = useTranslations("login");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, INITIAL_STATE);

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-sm font-medium text-zinc-500">Prompt Innovations</div>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
        </div>
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
              {t("email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
              {t("password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
          {state.info ? <p className="text-sm text-emerald-600">{state.info}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              name="intent"
              value="signin"
              disabled={pending}
              className="flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {t("signIn")}
            </button>
            <button
              type="submit"
              name="intent"
              value="signup"
              disabled={pending}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              {t("signUp")}
            </button>
          </div>
        </form>
        <p className="mt-6 text-center text-xs text-zinc-400">{t("firstTimeNotice")}</p>
      </div>
    </div>
  );
}
