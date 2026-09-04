import { requireRequestContext } from "../../../services/request-context";
import { requirePermission } from "../../../services/permissions/permission-service";
import { listMessagesForStaff } from "../../../modules/communication/service";
import MessageRow from "./MessageRow";

export default async function MessagesPage() {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  requirePermission(ctx.permissions, "messages.view");

  const messages = await listMessagesForStaff(institutionId, ctx.session.authUserId, ctx.userId);
  const unreadCount = messages.filter((m) => !m.read_at).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Messages from parents {unreadCount > 0 ? <span className="ml-2 rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-sm text-indigo-700 dark:text-indigo-300">{unreadCount} new</span> : null}
      </h1>
      <div className="space-y-3">
        {messages.map((m) => <MessageRow key={m.id} message={m} />)}
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No messages yet.</p>
        ) : null}
      </div>
    </div>
  );
}
