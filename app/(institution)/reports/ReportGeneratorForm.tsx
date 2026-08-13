"use client";

/**
 * PROMPT EDU ERP — report parameter form (§P). This is a plain GET <form>
 * pointing at the /api/reports/[reportType] route handler so the browser
 * itself drives the file download — Server Actions can't cleanly stream
 * binary responses, so no client-side JS is required for the download
 * itself, only for showing/hiding the parameter fields relevant to the
 * currently selected report type.
 */
import { useState } from "react";

interface Props {
  definitions: { code: string; name: string; dataSource: string }[];
  classes: { id: string; name: string }[];
  sections: { id: string; classId: string; name: string }[];
  examinations: { id: string; name: string }[];
}

export default function ReportGeneratorForm({ definitions, classes, sections, examinations }: Props) {
  const [reportType, setReportType] = useState(definitions[0]?.code ?? "");
  const [classId, setClassId] = useState("");

  const filteredSections = sections.filter((s) => s.classId === classId);

  return (
    <form action={`/api/reports/${reportType}`} method="get" className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Report</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm"
          >
            {definitions.map((d) => (
              <option key={d.code} value={d.code}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Format</label>
          <select name="format" defaultValue="pdf" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm">
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </select>
        </div>
      </div>

      {reportType === "examination_results" ? (
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Examination</label>
          <select name="examinationId" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" required>
            <option value="">Select an examination…</option>
            {examinations.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {reportType === "attendance_summary" ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Class</label>
            <select
              name="classId"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm"
              required
            >
              <option value="">Select a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Section</label>
            <select name="sectionId" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" required>
              <option value="">Select a section…</option>
              {filteredSections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">From date</label>
            <input type="date" name="fromDate" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">To date</label>
            <input type="date" name="toDate" className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm" required />
          </div>
        </div>
      ) : null}

      {reportType === "consolidated_performance" ? (
        <div>
          <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">Period</label>
          <input
            type="text"
            name="period"
            placeholder="e.g. Term 1 2026"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-sm"
            required
          />
        </div>
      ) : null}

      <button type="submit" className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)]">
        Generate &amp; download
      </button>
    </form>
  );
}
