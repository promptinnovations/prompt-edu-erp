import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdminContext } from "../../../../../services/request-context";
import { listInstitutions, getInstitutionWhatsAppConfig } from "../../../../../services/super-admin/super-admin-service";
import { listInstitutionModuleStatus } from "../../../../../services/modules/module-service";
import ModuleToggleForm from "./ModuleToggleForm";
import WhatsAppConfigForm from "./WhatsAppConfigForm";
import { openInstitutionAction } from "./actions";

export default async function InstitutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireSuperAdminContext();

  const [institutions, modules, whatsappConfig] = await Promise.all([
    listInstitutions(ctx.session.authUserId),
    listInstitutionModuleStatus(ctx.session.authUserId, id),
    getInstitutionWhatsAppConfig(ctx.session.authUserId, id),
  ]);
  const institution = institutions.find((i) => i.id === id);
  if (!institution) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/super-admin" className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600">
            ← All institutions
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{institution.name}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {institution.code} · {institution.type} · status: {institution.status}
          </p>
        </div>
        <form action={openInstitutionAction}>
          <input type="hidden" name="institutionId" value={id} />
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
          >
            Open this institution&apos;s console
          </button>
        </form>
      </div>
      <p className="-mt-4 text-xs text-zinc-400 dark:text-zinc-500">
        Opens the exact admin app any real user of this institution sees — every enabled module, fully functional
        (create, edit, approve, everything), so you can try it out or fix something. A banner while you&apos;re in
        there lets you exit back here at any time.
      </p>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Modules</h2>
        <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-500">
          Core modules (Academic Structure, Student Management) are always on — every institution needs them to
          function. Everything else can be turned on or off here; a disabled module disappears from that
          institution&apos;s navigation and its pages become unreachable.
        </p>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="py-1.5">Module</th>
              <th className="py-1.5">Category</th>
              <th className="py-1.5">Status</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {modules.map((m) => (
              <tr key={m.code}>
                <td className="py-2">
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">{m.name}</div>
                  {m.description ? <div className="text-xs text-zinc-400 dark:text-zinc-500">{m.description}</div> : null}
                </td>
                <td className="py-2 text-zinc-500 dark:text-zinc-400">{m.category ?? "—"}</td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      m.isEnabled ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {m.isEnabled ? "Enabled" : "Disabled"}
                  </span>
                  {m.isCore ? <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">(core)</span> : null}
                </td>
                <td className="py-2 text-right">
                  {m.isCore ? null : (
                    <ModuleToggleForm institutionId={id} moduleCode={m.code} isEnabled={m.isEnabled} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">WhatsApp (GREEN-API)</h2>
        <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-500">
          Each institution sends attendance alerts from its own WhatsApp number — enter the ID Instance and API
          Token Instance from this institution&apos;s own GREEN-API console. Leave both blank to disable WhatsApp
          sending for this institution (alerts still log to the console/notifications table as skipped).
        </p>
        <WhatsAppConfigForm
          institutionId={id}
          idInstance={whatsappConfig.idInstance}
          apiTokenInstance={whatsappConfig.apiTokenInstance}
        />
      </section>
    </div>
  );
}
