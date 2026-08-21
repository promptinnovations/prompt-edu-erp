"use client";

import { useActionState, useState } from "react";
import {
  createDisciplineCategoryAction, updateDisciplineCategoryAction, toggleDisciplineCategoryActiveAction, moveDisciplineCategoryAction,
  createCharacterAttributeAction, updateCharacterAttributeAction, toggleCharacterAttributeActiveAction, moveCharacterAttributeAction,
  updateCharacterRatingLabelAction,
} from "./actions";

const INIT = { error: null as string | null };

interface Category { id: string; name: string; is_positive: boolean; is_active: boolean; sort_order: number }
interface Attribute { id: string; name: string; is_active: boolean; sort_order: number }
interface RatingLabel { rating: number; label: string }

function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateDisciplineCategoryAction, INIT);
  const [, toggleAction] = useActionState(toggleDisciplineCategoryActiveAction, INIT);
  const [, moveAction] = useActionState(moveDisciplineCategoryAction, INIT);

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
        <form action={updateAction} className="flex flex-wrap items-center gap-2" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="categoryId" value={category.id} />
          <input name="name" defaultValue={category.name} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
          <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <input type="checkbox" name="isPositive" defaultChecked={category.is_positive} /> Positive/appreciation category
          </label>
          <button type="submit" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">Cancel</button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600 dark:text-red-400">{updateState.error}</span> : null}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className={category.is_active ? "" : "opacity-40"}>
        <strong className="text-zinc-900 dark:text-zinc-50">{category.name}</strong>{" "}
        <span className={category.is_positive ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
          {category.is_positive ? "(+)" : "(-)"}
        </span>
        {!category.is_active ? <span className="ml-2 text-xs text-zinc-400">Deactivated</span> : null}
      </span>
      <span className="flex items-center gap-2">
        <form action={moveAction}><input type="hidden" name="categoryId" value={category.id} /><input type="hidden" name="direction" value="up" />
          <button type="submit" className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" title="Move up">↑</button>
        </form>
        <form action={moveAction}><input type="hidden" name="categoryId" value={category.id} /><input type="hidden" name="direction" value="down" />
          <button type="submit" className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" title="Move down">↓</button>
        </form>
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">Edit</button>
        <form action={toggleAction}>
          <input type="hidden" name="categoryId" value={category.id} />
          <input type="hidden" name="isActive" value={category.is_active ? "false" : "true"} />
          <button type="submit" className={`text-xs underline ${category.is_active ? "text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300" : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300"}`}>
            {category.is_active ? "Deactivate" : "Reactivate"}
          </button>
        </form>
      </span>
    </li>
  );
}

function AttributeRow({ attribute }: { attribute: Attribute }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateCharacterAttributeAction, INIT);
  const [, toggleAction] = useActionState(toggleCharacterAttributeActiveAction, INIT);
  const [, moveAction] = useActionState(moveCharacterAttributeAction, INIT);

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
        <form action={updateAction} className="flex flex-wrap items-center gap-2" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="attributeId" value={attribute.id} />
          <input name="name" defaultValue={attribute.name} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
          <button type="submit" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">Cancel</button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600 dark:text-red-400">{updateState.error}</span> : null}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className={attribute.is_active ? "" : "opacity-40"}>
        <strong className="text-zinc-900 dark:text-zinc-50">{attribute.name}</strong>
        {!attribute.is_active ? <span className="ml-2 text-xs text-zinc-400">Deactivated</span> : null}
      </span>
      <span className="flex items-center gap-2">
        <form action={moveAction}><input type="hidden" name="attributeId" value={attribute.id} /><input type="hidden" name="direction" value="up" />
          <button type="submit" className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" title="Move up">↑</button>
        </form>
        <form action={moveAction}><input type="hidden" name="attributeId" value={attribute.id} /><input type="hidden" name="direction" value="down" />
          <button type="submit" className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" title="Move down">↓</button>
        </form>
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">Edit</button>
        <form action={toggleAction}>
          <input type="hidden" name="attributeId" value={attribute.id} />
          <input type="hidden" name="isActive" value={attribute.is_active ? "false" : "true"} />
          <button type="submit" className={`text-xs underline ${attribute.is_active ? "text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300" : "text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300"}`}>
            {attribute.is_active ? "Deactivate" : "Reactivate"}
          </button>
        </form>
      </span>
    </li>
  );
}

function RatingLabelRow({ ratingLabel }: { ratingLabel: RatingLabel }) {
  const [state, action] = useActionState(updateCharacterRatingLabelAction, INIT);
  return (
    <li className="flex items-center gap-2 py-1 text-sm">
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="rating" value={ratingLabel.rating} />
        <span className="w-6 text-xs text-zinc-400">{ratingLabel.rating}</span>
        <input name="label" defaultValue={ratingLabel.label} className="w-48 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
        <button type="submit" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">Save</button>
        {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
      </form>
    </li>
  );
}

export default function DisciplineConfigSection({
  categories, attributes, ratingLabels,
}: {
  categories: Category[]; attributes: Attribute[]; ratingLabels: RatingLabel[];
}) {
  const [createCatState, createCatAction] = useActionState(createDisciplineCategoryAction, INIT);
  const [createAttrState, createAttrAction] = useActionState(createCharacterAttributeAction, INIT);

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Discipline categories</h3>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {categories.map((c) => <CategoryRow key={c.id} category={c} />)}
        </ul>
        <form action={createCatAction} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-2">
          <input name="name" required placeholder="New category" className="w-32 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
          <label className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <input type="checkbox" name="isPositive" /> Positive
          </label>
          <button type="submit" className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-2 py-1 text-xs font-medium text-white hover:opacity-90">Add</button>
        </form>
        {createCatState.error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{createCatState.error}</p> : null}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Character attributes</h3>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {attributes.map((a) => <AttributeRow key={a.id} attribute={a} />)}
        </ul>
        <form action={createAttrAction} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-2">
          <input name="name" required placeholder="New attribute" className="w-32 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
          <button type="submit" className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-2 py-1 text-xs font-medium text-white hover:opacity-90">Add</button>
        </form>
        {createAttrState.error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{createAttrState.error}</p> : null}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">5-point rating scale</h3>
        <ul>
          {ratingLabels.slice().sort((a, b) => b.rating - a.rating).map((r) => <RatingLabelRow key={r.rating} ratingLabel={r} />)}
        </ul>
      </div>
    </div>
  );
}
