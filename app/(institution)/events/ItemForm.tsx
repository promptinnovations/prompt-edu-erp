import type { ItemRecord } from "../../../modules/events/service";
import ActionForm from "../../components/ui/ActionForm";
import { saveItemAction } from "./actions";
import { inputClass, labelClass } from "../../components/ui/form-classes";

/** Add / edit an item (competition). Server component around ActionForm. */
export default function ItemForm({ eventId, classes, item }: { eventId: string; classes: Array<{ id: string; name: string }>; item?: ItemRecord }) {
  const f = (k: string) => `${item?.id ?? "new"}-${k}`;
  const num = (label: string, name: string, value: number | null | undefined, extra: Record<string, string | number> = {}) => (
    <div>
      <label className={labelClass} htmlFor={f(name)}>{label}</label>
      <input id={f(name)} name={name} type="number" defaultValue={value ?? ""} className={inputClass} {...extra} />
    </div>
  );
  return (
    <ActionForm action={saveItemAction} submitLabel={item ? "Save item" : "Add item"} resetOnSuccess={!item} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor={f("name")}>Item name</label>
          <input id={f("name")} name="name" required maxLength={120} defaultValue={item?.name} placeholder="e.g. Elocution — Senior" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={f("category")}>Category (optional)</label>
          <input id={f("category")} name="category" maxLength={60} defaultValue={item?.category ?? ""} placeholder="e.g. Stage, Writing, Track" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor={f("participation")}>Entry</label>
          <select id={f("participation")} name="participation" defaultValue={item?.participation ?? "individual"} className={inputClass}>
            <option value="individual">Individual</option>
            <option value="group">Group / team</option>
          </select>
        </div>
        {num("Largest team (group items)", "teamSizeMax", item?.team_size_max, { min: 2, max: 100 })}
        <div>
          <label className={labelClass} htmlFor={f("gender")}>Open to</label>
          <select id={f("gender")} name="gender" defaultValue={item?.gender ?? ""} className={inputClass}>
            <option value="">Boys and girls</option>
            <option value="male">Boys only</option>
            <option value="female">Girls only</option>
          </select>
        </div>
        {num("Entries per house", "maxEntriesPerHouse", item?.max_entries_per_house, { min: 1, max: 100, placeholder: "No limit" })}
        <div>
          <label className={labelClass} htmlFor={f("criteria")}>Judging criteria</label>
          <input id={f("criteria")} name="criteria" defaultValue={item?.criteria.join(", ") ?? "Overall"} placeholder="e.g. Content, Delivery, Language" className={inputClass} />
        </div>
        {num("Marks per criterion", "maxMarkPerCriterion", item?.max_mark_per_criterion ?? 10, { min: 1, max: 1000, step: "0.5" })}
      </div>

      <fieldset>
        <legend className={labelClass}>Classes that can enter (none ticked = every class)</legend>
        <div className="flex flex-wrap gap-1.5">
          {classes.map((c) => (
            <label key={c.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs has-[:checked]:border-[var(--brand)] has-[:checked]:bg-primary-50 has-[:checked]:text-primary-800">
              <input type="checkbox" name="eligibleClassIds" value={c.id} defaultChecked={item?.eligible_class_ids?.includes(c.id) ?? false} className="accent-[var(--brand)]" />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelClass}>Points to the house</legend>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {num("1st", "pointsFirst", item?.points_first ?? 5, { min: 0, step: "0.5" })}
          {num("2nd", "pointsSecond", item?.points_second ?? 3, { min: 0, step: "0.5" })}
          {num("3rd", "pointsThird", item?.points_third ?? 1, { min: 0, step: "0.5" })}
          {num("Grade A", "pointsGradeA", item?.points_grade_a ?? 5, { min: 0, step: "0.5" })}
          {num("Grade B", "pointsGradeB", item?.points_grade_b ?? 3, { min: 0, step: "0.5" })}
          {num("Grade C", "pointsGradeC", item?.points_grade_c ?? 1, { min: 0, step: "0.5" })}
        </div>
      </fieldset>
    </ActionForm>
  );
}
