"use client";

/**
 * PROMPT EDU ERP — notification bell (§G.4 NotificationService, §D.13).
 * Receives its initial data as server-fetched props (already scoped to the
 * caller's OWN notifications, never client-supplied — see
 * services/notification/notification-service.ts's listMyNotifications())
 * and calls router.refresh() after any mark-read action so the surrounding
 * server layout re-fetches fresh counts/rows rather than the client trying
 * to keep its own copy in sync.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationReadAction, markAllNotificationsReadAction } from "./notification-actions";

export interface NotificationItem {
  id: string; title: string; body: string; read_at: string | null; created_at: string;
}

export default function NotificationBell({ initialItems, initialUnreadCount }: { initialItems: NotificationItem[]; initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleMarkRead = (id: string) => {
    startTransition(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  };
  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md px-2 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label="Notifications"
      >
        🔔
        {initialUnreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {initialUnreadCount > 99 ? "99+" : initialUnreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-10 mt-1 w-80 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-3 py-2">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Notifications</span>
            {initialUnreadCount > 0 ? (
              <button type="button" onClick={handleMarkAllRead} disabled={pending} className="text-xs text-zinc-500 dark:text-zinc-400 underline hover:text-zinc-900 dark:hover:text-white disabled:opacity-50">
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {initialItems.length === 0 ? (
              <p className="px-3 py-4 text-sm text-zinc-400 dark:text-zinc-500">No notifications yet.</p>
            ) : (
              initialItems.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleMarkRead(n.id)}
                  disabled={pending}
                  className={`block w-full border-b border-zinc-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-zinc-50 ${n.read_at ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-50"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{n.title}</span>
                    {!n.read_at ? <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{n.body}</div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
