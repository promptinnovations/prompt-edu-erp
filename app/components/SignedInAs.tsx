/** Small "who's currently signed in" indicator shown at the top of every
 *  authenticated layout ((institution), (super-admin), (portals)/portal) —
 *  a plain Server Component (no client fetch needed, the caller already has
 *  this from services/tenant/tenant-service.ts's getUserDisplayInfo()). */
export default function SignedInAs({ fullName, email }: { fullName: string; email: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="hidden sm:inline">Signed in as</span>
      <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">{fullName}</span>
      {email ? <span className="hidden truncate text-zinc-400 dark:text-zinc-500 md:inline">({email})</span> : null}
    </div>
  );
}
