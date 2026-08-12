import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listAnnouncements, listInstitutionRoles } from "../../../modules/announcements/service";
import PublishAnnouncementForm from "./PublishAnnouncementForm";

export default async function AnnouncementsPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;

  const canPublish = can(ctx.permissions, "announcements.publish");
  const [announcements, roles] = await Promise.all([
    listAnnouncements(institutionId, authUserId),
    canPublish ? listInstitutionRoles(institutionId, authUserId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Announcements (§D.13)</h1>

      {canPublish ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">Publish a new announcement</h2>
          <PublishAnnouncementForm roles={roles} />
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Recent announcements</h2>
        {announcements.length === 0 ? (
          <p className="text-sm text-zinc-400">No announcements published yet.</p>
        ) : (
          <ul className="space-y-4">
            {announcements.map((a) => (
              <li key={a.id} className="border-b border-zinc-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-zinc-900">{a.title}</h3>
                  <span className="text-xs text-zinc-400">{new Date(a.published_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{a.body}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  By {a.published_by_name ?? "—"} · Audience: {a.audience_jsonb.type === "all" ? "Everyone" : `Role(s): ${a.audience_jsonb.roleCodes.join(", ")}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
