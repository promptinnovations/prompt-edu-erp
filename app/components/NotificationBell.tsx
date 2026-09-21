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
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationReadAction, markAllNotificationsReadAction } from "./notification-actions";

export interface NotificationItem {
  id: string; title: string; body: string; read_at: string | null; created_at: string;
}

// §493 mobile follow-up ("Notifications ... mobile visibility / scrolling")
// -- the mobile panel used to be pinned at a hardcoded `top-16` (4rem) from
// the viewport top, on the assumption that's always just below the header.
// That assumption breaks the moment anything else occupies vertical space
// above the header -- the Super Admin "viewing as" banner, the Sample
// Portal banner, or any future banner -- reproduced live: with the Super
// Admin banner showing, the panel rendered UNDER the header/banner instead
// of below the bell button, effectively invisible/unreachable on a phone
// screen. Fixed by measuring the button's own actual position instead of
// guessing a fixed offset, so the panel always lands directly below
// whatever is actually above it. Only used below the `sm` breakpoint (640px,
// matching Tailwind's own `sm:` prefix already used for every other
// desktop/mobile split below) -- the sm+ layout already anchors correctly
// via `sm:absolute` relative to this component's own wrapper, which was
// never affected by this bug.
const MOBILE_BREAKPOINT_PX = 640;

export default function NotificationBell({ initialItems, initialUnreadCount }: { initialItems: NotificationItem[]; initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [mobileTop, setMobileTop] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const toggleOpen = () => {
    setOpen((wasOpen) => {
      const willOpen = !wasOpen;
      if (willOpen && buttonRef.current && window.innerWidth < MOBILE_BREAKPOINT_PX) {
        setMobileTop(buttonRef.current.getBoundingClientRect().bottom + 8);
      }
      return willOpen;
    });
  };

  // A device rotation or on-screen-keyboard resize while the panel is open
  // would otherwise leave it pointing at the button's stale position.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (buttonRef.current && window.innerWidth < MOBILE_BREAKPOINT_PX) {
        setMobileTop(buttonRef.current.getBoundingClientRect().bottom + 8);
      }
    };
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [open]);

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
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg text-sm text-zinc-600 hover:bg-zinc-100"
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
        <>
          <div className="fixed inset-0 z-10 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="fixed inset-x-3 z-20 max-h-[70vh] overflow-hidden rounded-lg border bg-white shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:z-10 sm:mt-1 sm:w-80 sm:max-h-none"
            style={mobileTop != null ? { top: mobileTop } : undefined}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-semibold text-zinc-500">Notifications</span>
              {initialUnreadCount > 0 ? (
                <button type="button" onClick={handleMarkAllRead} disabled={pending} className="text-xs text-zinc-500 underline hover:text-zinc-900 disabled:opacity-50">
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-[calc(70vh-2.5rem)] overflow-y-auto sm:max-h-80">
            {initialItems.length === 0 ? (
              <p className="px-3 py-4 text-sm text-zinc-500">No notifications yet.</p>
            ) : (
              initialItems.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleMarkRead(n.id)}
                  disabled={pending}
                  className={`block w-full border-b border-zinc-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-zinc-50 ${n.read_at ? "text-zinc-500" : "text-zinc-900"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{n.title}</span>
                    {!n.read_at ? <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500">{n.body}</div>
                </button>
              ))
            )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
