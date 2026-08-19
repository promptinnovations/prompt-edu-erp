"use client";

import { useActionState } from "react";
import { addTodoAction, toggleTodoAction, deleteTodoAction } from "./actions";

interface Todo { id: string; text: string; is_done: boolean; due_date: string | null }

function ToggleForm({ todo }: { todo: Todo }) {
  const [, formAction] = useActionState<{ error: string | null }, FormData>(toggleTodoAction, { error: null });
  return (
    <form action={formAction}>
      <input type="hidden" name="todoId" value={todo.id} />
      <button
        type="submit"
        aria-label={todo.is_done ? "Mark as not done" : "Mark as done"}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          todo.is_done ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-zinc-300 dark:border-zinc-600"
        }`}
      >
        {todo.is_done ? "✓" : ""}
      </button>
    </form>
  );
}

function DeleteForm({ todoId }: { todoId: string }) {
  const [, formAction] = useActionState<{ error: string | null }, FormData>(deleteTodoAction, { error: null });
  return (
    <form action={formAction}>
      <input type="hidden" name="todoId" value={todoId} />
      <button type="submit" className="text-xs text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400">✕</button>
    </form>
  );
}

export default function TodoWidget({ todos }: { todos: Todo[] }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(addTodoAction, { error: null });
  const pending_ = todos.filter((t) => !t.is_done);
  const done = todos.filter((t) => t.is_done);

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex gap-2">
        <input
          name="text" required maxLength={500} placeholder="Add a task…"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand)] focus:border-[var(--brand)]"
        />
        <button type="submit" disabled={pending} className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Add
        </button>
      </form>
      {state.error ? <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p> : null}

      {todos.length === 0 ? (
        <p className="text-sm text-zinc-400 dark:text-zinc-500">Nothing on your list yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {[...pending_, ...done].map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <ToggleForm todo={t} />
              <span className={`min-w-0 flex-1 truncate text-sm ${t.is_done ? "text-zinc-400 line-through dark:text-zinc-600" : "text-zinc-700 dark:text-zinc-300"}`}>
                {t.text}
              </span>
              <DeleteForm todoId={t.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
