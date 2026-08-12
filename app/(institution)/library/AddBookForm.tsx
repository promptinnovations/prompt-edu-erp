"use client";

import { useActionState } from "react";
import { createBookAction } from "./actions";

export interface AddBookFormOption { id: string; name: string }

export default function AddBookForm({
  authors, publishers, categories, shelves,
}: {
  authors: AddBookFormOption[];
  publishers: AddBookFormOption[];
  categories: AddBookFormOption[];
  shelves: AddBookFormOption[];
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(createBookAction, { error: null });

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Title</label>
        <input name="title" required className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Subtitle</label>
        <input name="subtitle" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">ISBN</label>
        <input name="isbn" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Language</label>
        <input name="language" placeholder="en" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">Author</label>
        <select name="authorId" defaultValue="" className="mb-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">— Select existing —</option>
          {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input name="newAuthorName" placeholder="…or add a new author" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Publisher</label>
        <select name="publisherId" defaultValue="" className="mb-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">— Select existing —</option>
          {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input name="newPublisherName" placeholder="…or add a new publisher" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Category</label>
        <select name="categoryId" defaultValue="" className="mb-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">— Select existing —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input name="newCategoryName" placeholder="…or add a new category" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Shelf</label>
        <select name="shelfId" defaultValue="" className="mb-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">— Select existing —</option>
          {shelves.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input name="newShelfName" placeholder="…or add a new shelf" className="mb-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
        <input name="newShelfLocation" placeholder="Location (optional)" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-500">Copies</label>
        <input name="copyCount" type="number" min={1} defaultValue={1} className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={pending} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          Add book
        </button>
        {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
