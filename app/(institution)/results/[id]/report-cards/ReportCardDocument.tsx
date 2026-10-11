import PrintLetterhead from "../../../../components/PrintLetterhead";
import { formatDateIST, todayIST } from "../../../../../services/datetime/ist";
import { formatMarks } from "../../../../../services/format/marks";
import type { ReportCardData, ReportCardContext } from "./report-card-data";

/** §Report-card-print-all — the printable card itself, extracted from
 *  [studentId]/page.tsx so the single-student route and the whole-class
 *  print route render byte-identical documents. Presentational only: every
 *  value is resolved by loadReportCards() before it gets here.
 *
 *  Columns are Subject, TE (terminal/written marks obtained), Total TE
 *  (that portion's max), CE/Total CE (only when this exam has CE
 *  components — a Daily Assessment register never does), Grade and
 *  Descriptor (grade_bands.description, institution-configurable in
 *  Settings > Grading, §K).
 *
 *  `print:break-after-page` on every card but the last is what makes a
 *  whole class print as one card per sheet. */
export default function ReportCardDocument({
  card,
  context,
  institutionName,
  logoCode,
  breakAfter = false,
}: {
  card: ReportCardData;
  context: ReportCardContext;
  institutionName: string;
  logoCode: string | null;
  breakAfter?: boolean;
}) {
  return (
    <section
      className={`print-area mx-auto max-w-3xl rounded-card border bg-white p-8 print:max-w-none print:w-full ${
        breakAfter ? "print:break-after-page" : ""
      }`}
    >
      <div className="print:rounded-none print:border-2 print:border-zinc-900 print:p-6">
        <div className="mb-6 print:mb-3">
          <PrintLetterhead
            institutionName={institutionName}
            logoCode={logoCode}
            titleLines={[context.isDailyAssessment ? "Daily Assessment Report Card" : "Report Card", context.examHeaderLine]}
          />
        </div>

        <div className="mb-6 flex items-start gap-4 rounded-xl border bg-zinc-50 p-4 print:mb-3 print:p-3">
          {card.photo_file_id ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from our own /api/files route
            <img src={`/api/files/${card.photo_file_id}`} alt="" className="h-20 w-20 rounded-xl border object-cover" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-xl border bg-white text-2xl font-semibold text-zinc-400">
              {card.student_name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="text-sm">
            <div className="text-base font-semibold text-zinc-900">{card.student_name}</div>
            <div className="text-zinc-500">Admission No: {card.admission_number}</div>
            <div className="text-zinc-500">
              Class: {card.class_name ?? "—"}{card.section_name ? ` - ${card.section_name}` : ""}
              {card.roll_number != null ? ` · Roll No: ${card.roll_number}` : ""}
            </div>
            {card.gender || card.date_of_birth ? (
              <div className="text-zinc-500">
                {card.gender ? `Gender: ${card.gender}` : ""}
                {card.gender && card.date_of_birth ? " · " : ""}
                {card.date_of_birth ? `DOB: ${formatDateIST(card.date_of_birth)}` : ""}
              </div>
            ) : null}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="py-1.5">Subject</th>
              <th className="py-1.5 text-right">TE</th>
              <th className="py-1.5 text-right">Total TE</th>
              {card.hasCe ? <th className="py-1.5 text-right">CE</th> : null}
              {card.hasCe ? <th className="py-1.5 text-right">Total CE</th> : null}
              <th className="py-1.5 text-right">Grade</th>
              <th className="py-1.5 pl-4 text-left">Descriptor</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {card.rows.map((r) => (
              <tr key={r.key}>
                <td className="py-1.5">
                  {r.subject_name}
                  {r.subject_note ? <div className="text-[11px] text-zinc-500">{r.subject_note}</div> : null}
                </td>
                <td className="py-1.5 text-right">{r.te}</td>
                <td className="py-1.5 text-right">{r.total_te}</td>
                {card.hasCe ? <td className="py-1.5 text-right">{r.ce}</td> : null}
                {card.hasCe ? <td className="py-1.5 text-right">{r.total_ce}</td> : null}
                <td className="py-1.5 text-right font-medium text-zinc-900">{r.grade_label ?? "—"}</td>
                <td className="py-1.5 pl-4 text-left text-zinc-500">{r.descriptor || "—"}</td>
              </tr>
            ))}
            {card.rows.length === 0 ? (
              <tr><td colSpan={card.hasCe ? 7 : 5} className="py-4 text-center text-zinc-500">No marks recorded.</td></tr>
            ) : null}
          </tbody>
        </table>

        {card.summary ? (
          <div className="mt-6 space-y-1.5 rounded-xl border bg-zinc-50 p-4 text-sm print:mt-3 print:p-3">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Total Marks</span>
              <span className="font-medium text-zinc-900">
                {formatMarks(card.summary.total_marks)} / {formatMarks(card.summary.max_total_marks)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Total Percentage</span>
              <span className="font-medium text-zinc-900">{card.summary.percentage.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Total Grade</span>
              <span className="font-medium text-zinc-900">{card.summary.grade_label ?? "—"}</span>
            </div>
            {card.attendance ? (
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Attendance</span>
                <span className="font-medium text-zinc-900">
                  {card.attendance.present_days} / {card.attendance.total_days} days ({card.attendance.present_percent}%)
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-500">
            {context.isDailyAssessment
              ? "No marks entered for this student in this month's register yet."
              : "Overall total/grade not computed yet — compute results from the examination’s detail page first."}
          </p>
        )}

        <div className="mt-16 grid grid-cols-2 gap-6 text-center text-xs text-zinc-500 print:mt-10">
          <div className="border-t pt-2">Class Teacher</div>
          <div className="border-t pt-2">Principal</div>
        </div>

        <p className="mt-8 flex items-center justify-between text-[10px] uppercase tracking-[0.08em] text-zinc-400 print:mt-4">
          <span>Printed on {formatDateIST(todayIST())}</span>
          <span>PROMPT EDU ERP · Prompt Innovations</span>
        </p>
      </div>
    </section>
  );
}
