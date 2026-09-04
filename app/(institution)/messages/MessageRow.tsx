"use client";

import { useActionState, useState } from "react";
import { replyToParentMessageAction, markMessageReadAction } from "./actions";
import type { ParentMessageRow } from "../../../modules/communication/service";

function ReplyForm({ messageId, onDone }: { messageId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<{ error: string | null }, FormData>(replyToParentMessageAction, { error: null });
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2" onSubmit={() => onDone()}>
      <input type="hidden" name="messageId" value={messageId} />
      <textarea name="replyText" required rows={2} placeholder="Write a reply…" className="min-w-[240px] flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm" />
      <button type="submit" disabled={pending} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
        Send reply
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}

export default function MessageRow({ message }: { message: ParentMessageRow }) {
  const [replying, setReplying] = useState(false);
  const [markState, markAction] = useActionState<{ error: string | null }, FormData>(markMessageReadAction, { error: null });

  return (
    <div className={`rounded-xl border p-3 ${message.read_at ? "border-zinc-200 dark:border-zinc-800" : "border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{message.subject}</div>
        <div className="text-xs text-zinc-400 dark:text-zinc-500">{message.created_at}</div>
      </div>
      <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        From {message.parent_name}{message.student_name ? ` (parent of ${message.student_name})` : ""}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{message.body}</p>
      {message.reply_text ? (
        <div className="mt-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2 text-sm text-zinc-700 dark:text-zinc-300">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Your reply: </span>{message.reply_text}
        </div>
      ) : replying ? (
        <ReplyForm messageId={message.id} onDone={() => setReplying(false)} />
      ) : (
        <div className="mt-2 flex gap-3">
          <button type="button" onClick={() => setReplying(true)} className="text-xs text-indigo-600 dark:text-indigo-400 underline">
            Reply
          </button>
          {!message.read_at ? (
            <form action={markAction}>
              <input type="hidden" name="messageId" value={message.id} />
              <button type="submit" className="text-xs text-zinc-400 dark:text-zinc-500 underline">Mark as read</button>
            </form>
          ) : null}
        </div>
      )}
      {markState.error ? <div className="mt-1 text-xs text-red-600 dark:text-red-400">{markState.error}</div> : null}
    </div>
  );
}
