"use client";

import { useActionState, useState } from "react";
import {
  createAchievementCategoryAction, updateAchievementCategoryAction, deleteAchievementCategoryAction,
  createAchievementLevelAction, updateAchievementLevelAction, deleteAchievementLevelAction,
  type GradingActionState,
} from "./actions";

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
          <input name="name" defaultValue={category.name} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
          <button type="submit" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">Cancel</button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600 dark:text-red-400">{updateState.error}</span> : null}
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-zinc-900 dark:text-zinc-50">{category.name}</span>
      {canManage ? (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">Edit</button>
          <form action={deleteAction} onSubmit={(e) => { if (!confirm(`Delete category "${category.name}"?`)) e.preventDefault(); }}>
            <input type="hidden" name="categoryId" value={category.id} />
            <button type="submit" className="text-xs text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300">Delete</button>
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
          <input name="name" defaultValue={level.name} className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" />
          <input name="sortOrder" type="number" defaultValue={level.sort_order} className="w-16 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-sm" title="Sort order (higher = more prestigious)" />
          <button type="submit" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">Cancel</button>
        </form>
        {updateState.error ? <span className="text-xs text-red-600 dark:text-red-400">{updateState.error}</span> : null}
      </li>
    );
  }
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="text-zinc-900 dark:text-zinc-50">{level.name} <span className="text-xs text-zinc-400 dark:text-zinc-500">(order {level.sort_order})</span></span>
      {canManage ? (
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-800 dark:hover:text-zinc-100">Edit</button>
          <form action={deleteAction} onSubmit={(e) => { if (!confirm(`Delete level "${level.name}"?`)) e.preventDefault(); }}>
            <input type="hidden" name="levelId" value={level.id} />
            <button type="submit" className="text-xs text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300">Delete</button>
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
        <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">Categories</h3>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {categories.length === 0 ? <li className="py-1 text-xs text-zinc-400 dark:text-zinc-500">None yet.</li> : null}
          {categories.map((c) => <CategoryRow key={c.id} category={c} canManage={canManage} />)}
        </ul>
        {canManage ? (
          <form action={createCategoryAction} className="mt-2 flex items-center gap-2">
            <input name="name" required placeholder="e.g. Sports" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
            <button type="submit" className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Add</button>
          </form>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">Levels</h3>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {levels.length === 0 ? <li className="py-1 text-xs text-zinc-400 dark:text-zinc-500">None yet.</li> : null}
          {levels.map((l) => <LevelRow key={l.id} level={l} canManage={canManage} />)}
        </ul>
        {canManage ? (
          <form action={createLevelAction} className="mt-2 flex items-center gap-2">
            <input name="name" required placeholder="e.g. District" className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" />
            <input name="sortOrder" type="number" defaultValue={0} className="w-16 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" title="Sort order" />
            <button type="submit" className="rounded-lg bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Add</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
