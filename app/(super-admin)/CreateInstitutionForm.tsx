"use client";

import { useActionState } from "react";
import { createInstitutionAction } from "./actions";

export default function CreateInstitutionForm() {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createInstitutionAction, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2">
      <div className="w-full sm:w-40">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Code (slug)</label>
        <input name="code" required placeholder="e.g. green-valley" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div className="w-full sm:w-56">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Name</label>
        <input name="name" required className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
      </div>
      <div className="w-full sm:w-auto">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Type</label>
        <select name="type" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm sm:w-auto focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          <option value="madrasa">Madrasa</option>
          <option value="islamic_school">Islamic School</option>
          <option value="school">School</option>
          <option value="college">College</option>
          <option value="dars">Dars</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="w-full sm:w-auto">
        <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Default locale</label>
        <select name="defaultLocale" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm sm:w-auto focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
          <option value="en">English</option>
          <option value="ml">Malayalam</option>
        </select>
      </div>

      <div className="w-full border-t border-zinc-100 dark:border-zinc-800 pt-3 sm:basis-full">
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Optional — create the institution&apos;s first admin login right now (fill in all three, or leave all
          three blank to add an admin later from that institution&apos;s own Users &amp; Roles page).
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <div className="w-full sm:w-48">
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Admin email</label>
            <input name="adminEmail" type="email" placeholder="admin@example.com" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
          </div>
          <div className="w-full sm:w-48">
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Admin full name</label>
            <input name="adminFullName" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
          </div>
          <div className="w-full sm:w-40">
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Admin password</label>
            <input name="adminPassword" type="password" minLength={8} placeholder="8+ characters" className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-50 sm:w-auto"
      >
        Create institution
      </button>
      {state.error ? <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
