"use client";

import { useActionState } from "react";
import { saveHallTicketSettingsAction, type HallState } from "./actions";
import type { HallTicketSettings } from "../../../../modules/examination/hall-ticket-service";

const INPUT = "w-full rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

export default function HallTicketSettingsForm({ settings }: { settings: HallTicketSettings }) {
  const [state, action, pending] = useActionState<HallState, FormData>(saveHallTicketSettingsAction, { error: null, message: null });
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Ticket title</label>
        <input name="ticketTitle" defaultValue={settings.ticketTitle} required className={INPUT} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Address line (under the school name)</label>
        <input name="address" defaultValue={settings.address} placeholder="e.g. Manhappatta" className={INPUT} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">E-mail</label>
        <input name="email" defaultValue={settings.email} className={INPUT} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Phone numbers</label>
        <input name="phones" defaultValue={settings.phones} placeholder="+91-… | +91-…" className={INPUT} />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs text-zinc-500">Instructions — one per line. Edit, add or delete lines freely; clear the box to print no instructions.</label>
        <textarea name="instructions" rows={6} defaultValue={settings.instructions.join("\n")} className={INPUT} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showSignature" defaultChecked={settings.showSignature} /> Signature column (invigilator signs each paper)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="includeSeating" defaultChecked={settings.includeSeating} /> Print the student&apos;s seat (room, bench, seat) by default</label>
      <div className="flex items-center gap-3 md:col-span-2">
        <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">Save settings</button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
        {state.message ? <span className="text-sm text-zinc-600">{state.message}</span> : null}
      </div>
    </form>
  );
}
