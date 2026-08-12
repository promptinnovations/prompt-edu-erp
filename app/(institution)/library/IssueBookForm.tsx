"use client";

import { useActionState, useState } from "react";
import { issueBookAction } from "./actions";

interface BookOption { id: string; title: string; available_copies: number }
interface CopyOption { id: string; book_id: string; copy_code: string }

export default function IssueBookForm({
  students,
  books,
  copiesByBook,
}: {
  students: Array<{ id: string; full_name: string }>;
  books: BookOption[];
  copiesByBook: Record<string, CopyOption[]>;
}) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(issueBookAction, { error: null });
  const issuableBooks = books.filter((b) => b.available_copies > 0);
  const [bookId, setBookId] = useState(issuableBooks[0]?.id ?? "");
  const copies = copiesByBook[bookId] ?? [];

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Student</label>
        <select name="studentId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Book</label>
        <select
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        >
          {issuableBooks.map((b) => (
            <option key={b.id} value={b.id}>{b.title} ({b.available_copies} available)</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Copy</label>
        <select name="bookCopyId" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          {copies.map((c) => (
            <option key={c.id} value={c.id}>{c.copy_code}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending || issuableBooks.length === 0} className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Issue
      </button>
      {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
    </form>
  );
}
