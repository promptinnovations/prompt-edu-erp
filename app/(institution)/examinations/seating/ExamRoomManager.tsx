"use client";

import { useActionState, useEffect, useState } from "react";
import { createExamRoomAction, updateExamRoomAction, deleteExamRoomAction, type UpdateExamRoomState } from "./actions";
import type { ExamRoomRecord } from "../../../../modules/examination/seating-service";

const INPUT = "rounded-full border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400";

const GENDER_LABEL: Record<string, string> = { male: "Boys only", female: "Girls only" };

/** The reusable classroom master list — set up once, reused by every
 *  examination's seating plan. Editing or deleting a room here never
 *  disturbs a plan already generated from it: each plan keeps its own
 *  snapshot of the room (migration 0049's exam_seating_plan_rooms). */
export default function ExamRoomManager({ rooms }: { rooms: ExamRoomRecord[] }) {
  const [createState, createAction, creating] = useActionState<{ error: string | null }, FormData>(createExamRoomAction, { error: null });
  const [deleteState, deleteAction] = useActionState<{ error: string | null }, FormData>(deleteExamRoomAction, { error: null });
  const [editingId, setEditingId] = useState<string | null>(null);

  const totalCapacity = rooms.reduce((sum, r) => sum + r.capacity, 0);

  return (
    <div className="space-y-4">
      <form action={createAction} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Room name</label>
          <input name="name" required placeholder="e.g. Room 12" className={`w-44 ${INPUT}`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Benches</label>
          <input name="benchCount" type="number" min={1} max={500} defaultValue={15} required className={`w-24 ${INPUT}`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Seats per bench</label>
          <input name="seatsPerBench" type="number" min={1} max={10} defaultValue={2} required className={`w-32 ${INPUT}`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Restriction</label>
          <select name="genderRestriction" defaultValue="" className={INPUT}>
            <option value="">No restriction</option>
            <option value="male">Boys only</option>
            <option value="female">Girls only</option>
          </select>
        </div>
        <button type="submit" disabled={creating} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Add room
        </button>
        {createState.error ? <span className="text-sm text-red-600">{createState.error}</span> : null}
      </form>

      {deleteState.error ? <p className="text-sm text-red-600">{deleteState.error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
            <tr>
              <th className="px-3 py-2">Room</th>
              <th className="px-3 py-2">Benches</th>
              <th className="px-3 py-2">Seats / bench</th>
              <th className="px-3 py-2">Capacity</th>
              <th className="px-3 py-2">Restriction</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rooms.map((room) =>
              editingId === room.id ? (
                <tr key={room.id}>
                  <td colSpan={6} className="px-3 py-2">
                    <EditRoomRow room={room} onDone={() => setEditingId(null)} />
                  </td>
                </tr>
              ) : (
                <tr key={room.id}>
                  <td className="px-3 py-2 font-medium text-zinc-800">{room.name}</td>
                  <td className="px-3 py-2">{room.bench_count}</td>
                  <td className="px-3 py-2">{room.seats_per_bench}</td>
                  <td className="px-3 py-2">{room.capacity}</td>
                  <td className="px-3 py-2">{room.gender_restriction ? GENDER_LABEL[room.gender_restriction] : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => setEditingId(room.id)} className="text-sm text-zinc-600 underline">
                        Edit
                      </button>
                      <form action={deleteAction}>
                        <input type="hidden" name="roomId" value={room.id} />
                        <button type="submit" className="text-sm text-red-600 underline">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
              )
            )}
            {rooms.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  No rooms yet — add the classrooms you use for examinations, once, and reuse them for every exam.
                </td>
              </tr>
            ) : (
              <tr className="bg-zinc-50">
                <td className="px-3 py-2 text-xs uppercase tracking-[0.08em] text-zinc-500" colSpan={3}>Total capacity</td>
                <td className="px-3 py-2 font-semibold text-zinc-800">{totalCapacity}</td>
                <td className="px-3 py-2" colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditRoomRow({ room, onDone }: { room: ExamRoomRecord; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<UpdateExamRoomState, FormData>(updateExamRoomAction, { error: null, savedAt: null });
  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="roomId" value={room.id} />
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Room name</label>
        <input name="name" defaultValue={room.name} required className={`w-44 ${INPUT}`} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Benches</label>
        <input name="benchCount" type="number" min={1} max={500} defaultValue={room.bench_count} required className={`w-24 ${INPUT}`} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Seats per bench</label>
        <input name="seatsPerBench" type="number" min={1} max={10} defaultValue={room.seats_per_bench} required className={`w-32 ${INPUT}`} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Restriction</label>
        <select name="genderRestriction" defaultValue={room.gender_restriction ?? ""} className={INPUT}>
          <option value="">No restriction</option>
          <option value="male">Boys only</option>
          <option value="female">Girls only</option>
        </select>
      </div>
      <label className="flex items-center gap-1.5 pb-2 text-sm text-zinc-600">
        <input type="checkbox" name="isActive" value="true" defaultChecked={room.is_active} className="h-4 w-4" />
        Available
      </label>
      {/* Unchecked checkboxes are simply absent from FormData, so this
          companion field is what tells the action "the box was cleared"
          rather than "the field was never rendered". */}
      <input type="hidden" name="isActive" value="false" />
      <button type="submit" disabled={pending} className="rounded-full bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Save
      </button>
      <button type="button" onClick={onDone} className="rounded-full border px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">
        Cancel
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
