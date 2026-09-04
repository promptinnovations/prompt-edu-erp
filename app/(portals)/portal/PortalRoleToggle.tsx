"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Phase D §3 "on the top give toggle for switching to parent or back to
 *  student" — only rendered when the signed-in user resolves BOTH a
 *  student id and a parent id (see modules/portal/service.ts's
 *  getOwnStudentId()/getOwnParentId(), and linkExisting*AccountToParent/
 *  Student() for how one login ends up holding both). Plain links, not
 *  client-side state — this app is server-rendered per route already, and
 *  neither /portal/student nor /portal/parent redirects the other role
 *  away, so a normal navigation is all a "toggle" needs to be. */
export default function PortalRoleToggle() {
  const pathname = usePathname();
  const isParent = pathname?.startsWith("/portal/parent");
  const isStudent = pathname?.startsWith("/portal/student");

  return (
    <div className="flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-0.5 text-xs">
      <Link
        href="/portal/student"
        className={`rounded-md px-2.5 py-1 font-medium transition-colors ${isStudent ? "bg-[var(--brand)] text-white" : "text-zinc-500 hover:text-zinc-700"}`}
      >
        Student
      </Link>
      <Link
        href="/portal/parent"
        className={`rounded-md px-2.5 py-1 font-medium transition-colors ${isParent ? "bg-[var(--brand)] text-white" : "text-zinc-500 hover:text-zinc-700"}`}
      >
        Parent
      </Link>
    </div>
  );
}
