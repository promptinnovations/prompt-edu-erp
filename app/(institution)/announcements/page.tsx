import { requireRequestContext } from "../../../services/request-context";
import { can } from "../../../services/permissions/permission-service";
import { listAnnouncements, listInstitutionRoles } from "../../../modules/announcements/service";
import PublishAnnouncementForm from "./PublishAnnouncementForm";
import { formatDateTimeIST } from "../../../services/datetime/ist";

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
      <h1 className="text-2xl font-semibold text-[var(--heading)]">Announcements (§D.13)</h1>

      {canPublish ? (
        <section className="rounded-card border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Publish a new announcement</h2>
          <PublishAnnouncementForm roles={roles} />
        </section>
      ) : null}

      <section className="rounded-card border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--heading)]">Recent announcements</h2>
        {announcements.length === 0 ? (
          <p className="text-sm text-zinc-500">No announcements published yet.</p>
        ) : (
          <ul className="space-y-4">
            {announcements.map((a) => (
              <li key={a.id} className="border-b pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[var(--heading)]">{a.title}</h3>
                  <span className="text-xs text-zinc-500">{formatDateTimeIST(a.published_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{a.body}</p>
                <p className="mt-1 text-xs text-zinc-500">
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
