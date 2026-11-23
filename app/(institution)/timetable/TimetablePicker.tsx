"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { inputClass } from "../../components/ui/form-classes";

export interface PickerOption { key: string; label: string }

/** Type-to-search box for a class or a teacher: start typing a name, pick a
 *  suggestion, and that timetable opens. */
export default function TimetablePicker({ options, selectedKey }: { options: PickerOption[]; selectedKey: string }) {
  const router = useRouter();
  const listId = useId();
  const selected = options.find((o) => o.key === selectedKey)?.label ?? "";
  return (
    <div className="w-64">
      <label className="sr-only" htmlFor={`${listId}-in`}>Search a class or teacher</label>
      <input
        id={`${listId}-in`}
        list={listId}
        key={selectedKey}
        defaultValue={selected}
        placeholder="Search class or teacher…"
        className={inputClass}
        autoComplete="off"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const hit = options.find((o) => o.label.toLowerCase() === e.target.value.trim().toLowerCase());
          if (hit && hit.key !== selectedKey) router.push(`/timetable?show=${encodeURIComponent(hit.key)}`);
        }}
      />
      <datalist id={listId}>{options.map((o) => <option key={o.key} value={o.label} />)}</datalist>
    </div>
  );
}
