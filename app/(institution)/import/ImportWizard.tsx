"use client";

/**
 * PROMPT EDU ERP — bulk import wizard (§Q.1): pick an entity type, download
 * its template, upload a filled file, review the preview (valid/invalid/
 * duplicate rows with per-row error messages), then confirm. Two chained
 * useActionState hooks mirror the two-step stage -> confirm server
 * pipeline; nothing about which rows get committed is decided client-side.
 */
import { useActionState, useState } from "react";
import { stageImportAction, confirmImportAction, type ImportActionState } from "./actions";

interface EntityOption { entityType: string; label: string }

// Defined here (a Client Component), not in actions.ts — a "use server"
// file may only export async functions; exporting this plain object
// alongside the server actions crashes the whole page in production
// ("A 'use server' file can only export async functions, found object.").
const importInitialState: ImportActionState = { error: null, staged: null, confirmed: null };

export default function ImportWizard({ entities }: { entities: EntityOption[] }) {
  const [entityType, setEntityType] = useState(entities[0]?.entityType ?? "");
  const [stageState, stageAction, staging] = useActionState<ImportActionState, FormData>(stageImportAction, importInitialState);
  const [confirmState, confirmAction, confirming] = useActionState<ImportActionState, FormData>(confirmImportAction, importInitialState);

  const staged = confirmState.confirmed ? null : stageState.staged; // hide the old preview once confirmed
  const invalidOrDuplicate = staged?.rows.filter((r) => r.status !== "valid") ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Entity type</label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
          >
            {entities.map((e) => (
              <option key={e.entityType} value={e.entityType}>{e.label}</option>
            ))}
          </select>
        </div>
        <a
          href={`/api/import-template/${entityType}`}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
        >
          Download template (.xlsx)
        </a>
      </div>

      <form action={stageAction} className="flex items-end gap-2">
        <input type="hidden" name="entityType" value={entityType} />
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Upload filled file (.xlsx or .csv)</label>
          <input type="file" name="file" accept=".xlsx,.csv" required className="text-sm" />
        </div>
        <button type="submit" disabled={staging} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {staging ? "Validating…" : "Preview"}
        </button>
      </form>
      {stageState.error ? <p className="text-sm text-red-600 dark:text-red-400">{stageState.error}</p> : null}

      {confirmState.confirmed ? (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-4 text-sm text-emerald-800 dark:text-emerald-300">
          Import confirmed: {confirmState.confirmed.importedRows} row(s) imported, {confirmState.confirmed.skippedRows} skipped.
        </div>
      ) : null}
      {confirmState.error ? <p className="text-sm text-red-600 dark:text-red-400">{confirmState.error}</p> : null}

      {staged ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm text-zinc-700 dark:text-zinc-300">
              {staged.totalRows} row(s) total — <span className="text-emerald-700 dark:text-emerald-400">{staged.validRows} valid</span>,{" "}
              <span className="text-red-700 dark:text-red-400">{staged.invalidRows} invalid</span>,{" "}
              <span className="text-amber-700 dark:text-amber-400">{staged.duplicateRows} duplicate</span>
            </div>
            {staged.validRows > 0 ? (
              <form action={confirmAction}>
                <input type="hidden" name="batchId" value={staged.batchId} />
                <button type="submit" disabled={confirming} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
                  {confirming ? "Importing…" : `Confirm import (${staged.validRows} row${staged.validRows === 1 ? "" : "s"})`}
                </button>
              </form>
            ) : null}
          </div>

          {invalidOrDuplicate.length > 0 ? (
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-400 dark:text-zinc-500">
                  <th className="pb-1 pr-2 font-medium">Row</th>
                  <th className="pb-1 pr-2 font-medium">Status</th>
                  <th className="pb-1 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {invalidOrDuplicate.map((r) => (
                  <tr key={r.rowNumber} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-2 text-zinc-500 dark:text-zinc-400">{r.rowNumber}</td>
                    <td className="py-1 pr-2">
                      <span className={r.status === "invalid" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}>{r.status}</span>
                    </td>
                    <td className="py-1 text-zinc-700 dark:text-zinc-300">{r.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
