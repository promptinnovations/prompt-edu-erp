"use client";

import { useActionState, useState } from "react";
import {
  createAchievementCategoryAction, updateAchievementCategoryAction, deleteAchievementCategoryAction,
  createAchievementLevelAction, updateAchievementLevelAction, deleteAchievementLevelAction,
  type GradingActionState,
} from "./actions";
import ConfirmSubmitButton from "../../../components/ui/ConfirmSubmitButton";

interface Category { id: string; name: string }
interface Level { id: string; name: string; sort_order: number }

const INIT: GradingActionState = { error: null };

function CategoryRow({ category, canManage }: { category: Category; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateAchievementCategoryAction, INIT);
  const [, deleteAction] = useActionState(deleteAchievementCategoryAction, INIT);

  if (editing) {
    return (
      <li className="py-1">
        <form action={updateAction} className="flex items-center gap-2" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="categoryId" value={category.id} />
          <input autoComplete="off" name="name" defaultValue={category.name} className="rounded-full border px-2 py-1 text-sm" />
          <button type="submit" className="rounded-full border px-2 py-1 text-xs hover:bg-zinc-100">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600">{updateState.error}</span> : null}
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-zinc-900">{category.name}</span>
      {canManage ? (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">Edit</button>
          <form action={deleteAction}>
            <input type="hidden" name="categoryId" value={category.id} />
            <ConfirmSubmitButton message={`Delete category "${category.name}"?`} className="text-xs text-red-600 underline hover:text-red-800">Delete</ConfirmSubmitButton>
          </form>
        </span>
      ) : null}
    </li>
  );
}

function LevelRow({ level, canManage }: { level: Level; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateAchievementLevelAction, INIT);
  const [, deleteAction] = useActionState(deleteAchievementLevelAction, INIT);

  if (editing) {
    return (
      <li className="py-1">
        <form action={updateAction} className="flex items-center gap-2" onSubmit={() => setEditing(false)}>
          <input type="hidden" name="levelId" value={level.id} />
          <input autoComplete="off" name="name" defaultValue={level.name} className="rounded-full border px-2 py-1 text-sm" />
          <input autoComplete="off" name="sortOrder" type="number" defaultValue={level.sort_order} className="w-16 rounded-full border px-2 py-1 text-sm" title="Sort order (higher = more prestigious)" />
          <button type="submit" className="rounded-full border px-2 py-1 text-xs hover:bg-zinc-100">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600">{updateState.error}</span> : null}
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-zinc-900">{level.name} <span className="text-xs text-zinc-500">(order {level.sort_order})</span></span>
      {canManage ? (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 underline hover:text-zinc-800">Edit</button>
          <form action={deleteAction}>
            <input type="hidden" name="levelId" value={level.id} />
            <ConfirmSubmitButton message={`Delete level "${level.name}"?`} className="text-xs text-red-600 underline hover:text-red-800">Delete</ConfirmSubmitButton>
          </form>
        </span>
      ) : null}
    </li>
  );
}

export default function AchievementConfigSection({
  categories, levels, canManage,
}: { categories: Category[]; levels: Level[]; canManage: boolean }) {
  const [, createCategoryAction] = useActionState(createAchievementCategoryAction, INIT);
  const [, createLevelAction] = useActionState(createAchievementLevelAction, INIT);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--heading)]">Categories</h3>
        <ul className="divide-y">
          {categories.length === 0 ? <li className="py-1 text-xs text-zinc-500">None yet.</li> : null}
          {categories.map((c) => <CategoryRow key={c.id} category={c} canManage={canManage} />)}
        </ul>
        {canManage ? (
          <form action={createCategoryAction} className="mt-2 flex items-center gap-2">
            <input autoComplete="off" name="name" required placeholder="e.g. Sports" className="rounded-full border px-2 py-1.5 text-sm" />
            <button type="submit" className="rounded-full bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Add</button>
          </form>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--heading)]">Levels</h3>
        <ul className="divide-y">
          {levels.length === 0 ? <li className="py-1 text-xs text-zinc-500">None yet.</li> : null}
          {levels.map((l) => <LevelRow key={l.id} level={l} canManage={canManage} />)}
        </ul>
        {canManage ? (
          <form action={createLevelAction} className="mt-2 flex items-center gap-2">
            <input autoComplete="off" name="name" required placeholder="e.g. District" className="rounded-full border px-2 py-1.5 text-sm" />
            <input autoComplete="off" name="sortOrder" type="number" defaultValue={0} className="w-16 rounded-full border px-2 py-1.5 text-sm" title="Sort order" />
            <button type="submit" className="rounded-full bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Add</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
