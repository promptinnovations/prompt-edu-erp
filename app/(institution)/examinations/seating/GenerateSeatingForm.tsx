"use client";

import { useActionState, useState } from "react";
import { generateSeatingPlanAction, type GenerateSeatingState } from "./actions";
import type { ExamRoomRecord } from "../../../../modules/examination/seating-service";

const INPUT = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400";

interface AdHocRoom { name: string; benchCount: number; seatsPerBench: number; genderRestriction: "" | "male" | "female" }

const BLANK_AD_HOC: AdHocRoom = { name: "", benchCount: 10, seatsPerBench: 2, genderRestriction: "" };

/**
 * Picks the rooms for one generation run: any number of rooms from the
 * master list, plus any number of ad-hoc rooms borrowed for this exam only
 * (an ad-hoc room is snapshotted into the plan and never added to the
 * master list — that is the whole point of it).
 *
 * The live seat/student counters below the room list are the difference
 * between "generate and read an error" and knowing before you click, which
 * matters most under the hard boys/girls rule where total capacity alone
 * doesn't guarantee success.
 */
export default function GenerateSeatingForm({
  examinationId, rooms, studentCount, boyCount, girlCount, genderRule, hasExistingPlan,
}: {
  examinationId: string;
  rooms: ExamRoomRecord[];
  studentCount: number;
  boyCount: number;
  girlCount: number;
  genderRule: "hard" | "best_effort";
  hasExistingPlan: boolean;
}) {
  const [state, formAction, pending] = useActionState<GenerateSeatingState, FormData>(
    generateSeatingPlanAction, { error: null, summary: null, warnings: [] }
  );
  const [selected, setSelected] = useState<string[]>(() => rooms.map((r) => r.id));
  const [adHoc, setAdHoc] = useState<AdHocRoom[]>([]);

  const selectedCapacity = rooms.filter((r) => selected.includes(r.id)).reduce((sum, r) => sum + r.capacity, 0);
  const adHocCapacity = adHoc.reduce((sum, r) => sum + (Number(r.benchCount) || 0) * (Number(r.seatsPerBench) || 0), 0);
  const totalCapacity = selectedCapacity + adHocCapacity;
  const shortfall = studentCount - totalCapacity;

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const updateAdHoc = (index: number, patch: Partial<AdHocRoom>) =>
    setAdHoc((prev) => prev.map((room, i) => (i === index ? { ...room, ...patch } : room)));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="examinationId" value={examinationId} />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Rooms from the master list</h3>
        {rooms.length === 0 ? (
          <p className="text-sm text-zinc-400">No rooms in the master list yet — add some above, or add an ad-hoc room below.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <label
                key={room.id}
                className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${
                  selected.includes(room.id)
                    ? "border-[var(--accent-teal)] bg-[var(--accent-teal)]/5"
                    : "border-zinc-200"
                }`}
              >
                <input
                  type="checkbox"
                  name="roomId"
                  value={room.id}
                  checked={selected.includes(room.id)}
                  onChange={() => toggle(room.id)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block font-medium text-zinc-800">{room.name}</span>
                  <span className="block text-xs text-zinc-500">
                    {room.bench_count} benches x {room.seats_per_bench} = {room.capacity} seats
                    {room.gender_restriction ? ` · ${room.gender_restriction === "male" ? "Boys only" : "Girls only"}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ad-hoc rooms (this exam only)</h3>
          <button
            type="button"
            onClick={() => setAdHoc((prev) => [...prev, { ...BLANK_AD_HOC }])}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
          >
            + Add ad-hoc room
          </button>
        </div>
        {adHoc.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Nothing extra. Add a hall or spare room borrowed just for this exam — it is used for this plan only and never saved to the master list.
          </p>
        ) : (
          <div className="space-y-2">
            {adHoc.map((room, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-zinc-300 p-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Room name</label>
                  <input
                    name="adHocName" value={room.name} required
                    onChange={(e) => updateAdHoc(index, { name: e.target.value })}
                    placeholder="e.g. Assembly Hall" className={`w-48 ${INPUT}`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Benches</label>
                  <input
                    name="adHocBenchCount" type="number" min={1} max={500} value={room.benchCount} required
                    onChange={(e) => updateAdHoc(index, { benchCount: Number(e.target.value) })}
                    className={`w-24 ${INPUT}`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Seats per bench</label>
                  <input
                    name="adHocSeatsPerBench" type="number" min={1} max={10} value={room.seatsPerBench} required
                    onChange={(e) => updateAdHoc(index, { seatsPerBench: Number(e.target.value) })}
                    className={`w-32 ${INPUT}`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Restriction</label>
                  <select
                    name="adHocGenderRestriction" value={room.genderRestriction}
                    onChange={(e) => updateAdHoc(index, { genderRestriction: e.target.value as AdHocRoom["genderRestriction"] })}
                    className={INPUT}
                  >
                    <option value="">No restriction</option>
                    <option value="male">Boys only</option>
                    <option value="female">Girls only</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setAdHoc((prev) => prev.filter((_, i) => i !== index))}
                  className="pb-2 text-sm text-red-600 underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-zinc-50 p-3 text-sm">
        <p className="text-zinc-700">
          <strong>{studentCount}</strong> student(s) to seat ({boyCount} boys, {girlCount} girls) ·{" "}
          <strong>{totalCapacity}</strong> seat(s) selected
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Boys/girls rule: <strong>{genderRule === "hard" ? "Hard — never mix in a room" : "Best effort — mix only if capacity is tight"}</strong>{" "}
          (change it in Settings). No two students from the same grade are ever placed on the same bench.
        </p>
        {shortfall > 0 ? (
          <p className="mt-1 text-xs text-amber-600">
            {shortfall} more seat(s) needed before this can possibly succeed.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || studentCount === 0}
          className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          {hasExistingPlan ? "Regenerate seating plan" : "Generate seating plan"}
        </button>
        {hasExistingPlan ? (
          <span className="text-xs text-zinc-500">Regenerating replaces the existing plan for this examination.</span>
        ) : null}
      </div>

      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.summary ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p>{state.summary}</p>
          {state.warnings.map((w) => (
            <p key={w} className="mt-1 text-amber-700">{w}</p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
