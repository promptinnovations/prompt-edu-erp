import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRequestContext } from "../../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../../services/modules/module-service";
import { can } from "../../../../../services/permissions/permission-service";
import {
  getBookDetail, listBookCopies, listAuthors, listPublishers, listBookCategories, listShelves, COPY_STATUSES,
} from "../../../../../modules/library/service";
import { PageHeader, Panel } from "../../../../components/portal/viz/blocks";
import { decorColor } from "../../../../components/portal/viz/palette";
import ActionForm from "../../../../components/ui/ActionForm";
import { inputClass, labelClass } from "../../../../components/ui/form-classes";
import { formatDateIST } from "../../../../../services/datetime/ist";
import { updateBookAction, addCopiesAction, setCopyStatusAction, withdrawBookAction } from "../../actions";

const COPY_LABEL: Record<string, string> = { available: "On the shelf", issued: "On loan", damaged: "Damaged", lost: "Lost", withdrawn: "Withdrawn" };
const COPY_STYLE: Record<string, string> = {
  available: "bg-[#15803d]/10 text-[#15803d]", issued: "bg-primary-100 text-primary-800", damaged: "bg-accent-100 text-accent-800",
  lost: "bg-[#b91c1c]/10 text-[#b91c1c]", withdrawn: "bg-zinc-100 text-zinc-600",
};

/**
 * §Library-gaps ("edit a book after it is added") — the librarian's page
 * for one title: correct its details, add copies, set a copy damaged /
 * lost / withdrawn (or back on the shelf), or withdraw the whole title.
 */
export default async function BookEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "library");
  if (!ctx.isSuperAdmin && !can(ctx.permissions, "library.manage")) redirect("/library");

  const [detail, copies, authors, publishers, categories, shelves] = await Promise.all([
    getBookDetail(institutionId, authUserId, id),
    listBookCopies(institutionId, authUserId, id),
    listAuthors(institutionId, authUserId),
    listPublishers(institutionId, authUserId),
    listBookCategories(institutionId, authUserId),
    listShelves(institutionId, authUserId),
  ]);
  if (!detail) notFound();
  const b = detail.book;

  const pickField = (label: string, idName: string, newName: string, value: string | null, options: Array<{ id: string; name: string }>) => (
    <div>
      <label className={labelClass} htmlFor={`bk-${idName}`}>{label}</label>
      <select id={`bk-${idName}`} name={idName} defaultValue={value ?? ""} className={`${inputClass} mb-1`}>
        <option value="">— None —</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <input name={newName} aria-label={`New ${label.toLowerCase()}`} placeholder={`…or a new ${label.toLowerCase()}`} className={inputClass} />
    </div>
  );
  const text = (label: string, name: string, value: string | number | null, extra: Record<string, string | number | boolean> = {}) => (
    <div>
      <label className={labelClass} htmlFor={`bk-${name}`}>{label}</label>
      <input id={`bk-${name}`} name={name} defaultValue={value ?? ""} className={inputClass} {...extra} />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={b.title} subtitle={`${b.author_name ?? "Unknown author"} · ${b.available_copies} of ${b.total_copies} copies on the shelf`} icon="📖" color={decorColor(3)}>
        <Link href="/library#catalogue" className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-1.5 text-sm font-medium text-[var(--brand)] hover:bg-primary-50">← Catalogue</Link>
      </PageHeader>

      <Panel title="Book details" color={decorColor(0)}>
        <ActionForm action={updateBookAction} submitLabel="Save details" className="space-y-4">
          <input type="hidden" name="bookId" value={b.id} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">{text("Title", "title", b.title, { required: true, maxLength: 300 })}</div>
            <div className="sm:col-span-2">{text("Subtitle", "subtitle", b.subtitle)}</div>
            {pickField("Author", "authorId", "newAuthorName", b.author_id, authors)}
            {pickField("Publisher", "publisherId", "newPublisherName", b.publisher_id, publishers)}
            {pickField("Category", "categoryId", "newCategoryName", b.category_id, categories)}
            {pickField("Shelf", "shelfId", "newShelfName", b.shelf_id, shelves)}
            {text("ISBN", "isbn", b.isbn)}
            {text("Language", "language", b.language)}
            {text("Edition", "edition", b.edition)}
            {text("Year published", "publicationYear", b.publication_year, { type: "number", min: 1000, max: 2200 })}
            {text("Original language", "originalLanguage", b.original_language)}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelClass} htmlFor="bk-description">Description</label>
              <textarea id="bk-description" name="description" defaultValue={b.description ?? ""} rows={3} maxLength={4000} className={inputClass} />
            </div>
          </div>
        </ActionForm>
      </Panel>

      <Panel title="Copies" subtitle="Each physical copy and where it is" color={decorColor(1)}>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.08em] text-zinc-500">
              <tr><th className="py-1.5 pr-3">Copy</th><th className="py-1.5 pr-3">Status</th><th className="py-1.5 pr-3">With</th><th className="py-1.5">Change</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {copies.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-3 font-mono text-xs text-zinc-600">{c.copy_code}</td>
                  <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COPY_STYLE[c.status] ?? ""}`}>{COPY_LABEL[c.status] ?? c.status}</span></td>
                  <td className="py-2 pr-3 text-zinc-600">{c.borrower_name ? `${c.borrower_name}${c.due_date ? ` · due ${formatDateIST(c.due_date)}` : ""}` : "—"}</td>
                  <td className="py-2">
                    {c.status === "issued" ? <span className="text-xs text-zinc-400">Return it first</span> : (
                      <ActionForm action={setCopyStatusAction} submitLabel="Set" variant="secondary" className="flex items-center gap-2">
                        <input type="hidden" name="copyId" value={c.id} />
                        {/* sized wrapper: the global "controls never exceed their box" rule overrides max-w on the control itself */}
                        <div className="w-40">
                          <select name="status" defaultValue={c.status} aria-label={`Status of copy ${c.copy_code}`} className={inputClass}>
                            {COPY_STATUSES.map((s) => <option key={s} value={s}>{COPY_LABEL[s]}</option>)}
                          </select>
                        </div>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
          <ActionForm action={addCopiesAction} submitLabel="Add copies" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="bookId" value={b.id} />
            <div>
              <label className={labelClass} htmlFor="bk-count">New copies</label>
              <div className="w-24"><input id="bk-count" name="count" type="number" min={1} max={200} defaultValue={1} className={inputClass} /></div>
            </div>
          </ActionForm>
          <p className="mt-2 text-xs text-zinc-500">A new copy goes straight to the next student waiting for this book, if any.</p>
        </div>
      </Panel>

      <Panel title="Withdraw this book" subtitle="Takes the title out of the catalogue. Its reading history and reviews stay." color={decorColor(4)}>
        <ActionForm action={withdrawBookAction} submitLabel="Withdraw book" variant="danger" confirm={`Withdraw "${b.title}" from the catalogue?`}>
          <input type="hidden" name="bookId" value={b.id} />
        </ActionForm>
      </Panel>
    </div>
  );
}
