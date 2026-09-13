import Link from "next/link";
import PrintButton from "../../../components/PrintButton";
import PrintLetterhead from "../../../components/PrintLetterhead";
import type { SeatingPlanChart } from "../../../../modules/examination/seating-service";
import DeletePlanButton from "./DeletePlanButton";

/** The room-wise chart: one table per room, one row per bench, one column
 *  per seat on that bench. Wrapped in `.print-area` so the shared print
 *  rules in app/globals.css strip the app chrome on Ctrl+P — the same
 *  convention the Monthly Registers and Report Cards already use. */
export default function SeatingPlanChartView({
  chart, examinationName, examinationId, institutionName, logoCode,
}: {
  chart: SeatingPlanChart;
  examinationName: string;
  examinationId: string;
  institutionName: string;
  logoCode?: string | null;
}) {
  const { plan, rooms } = chart;
  const generatedOn = plan.created_at.slice(0, 10);

  return (
    <section className="print-area rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <PrintLetterhead institutionName={institutionName} logoCode={logoCode} />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Seating chart — {examinationName}</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {plan.student_count} student(s) · {rooms.length} room(s) · {plan.seat_count} seat(s) · generated {generatedOn} ·{" "}
            boys/girls rule at generation: {plan.gender_rule === "hard" ? "hard (no mixed rooms)" : "best effort"}
          </p>
          {plan.mixed_room_count > 0 ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              {plan.mixed_room_count} room(s) ended up mixed because capacity was tight.
            </p>
          ) : null}
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Link
            href={`/examinations/seating/stickers?examinationId=${examinationId}`}
            className="rounded-lg bg-[var(--accent-teal)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--accent-teal-hover)]"
          >
            Bench stickers
          </Link>
          <PrintButton label="Print chart" />
          <DeletePlanButton examinationId={examinationId} />
        </div>
      </div>

      <div className="space-y-6">
        {rooms.map((room) => (
          <div key={room.id}>
            <h3 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {room.name}
              <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                {room.seatedCount} / {room.bench_count * room.seats_per_bench} seats used
                {room.gender_restriction ? ` · ${room.gender_restriction === "male" ? "Boys only" : "Girls only"}` : ""}
                {room.is_ad_hoc ? " · ad-hoc room" : ""}
                {room.isMixed ? " · mixed" : ""}
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-zinc-500 dark:text-zinc-400">
                    <th className="border border-zinc-200 px-2 py-1 font-normal dark:border-zinc-800">Bench</th>
                    {Array.from({ length: room.seats_per_bench }, (_, i) => (
                      <th key={i} className="border border-zinc-200 px-2 py-1 font-normal dark:border-zinc-800">Seat {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {room.benches.map((bench) => (
                    <tr key={bench.benchNumber}>
                      <td className="border border-zinc-200 px-2 py-1 text-center font-medium dark:border-zinc-800">{bench.benchNumber}</td>
                      {bench.seats.map((seat, i) => (
                        <td key={i} className="border border-zinc-200 px-2 py-1 align-top dark:border-zinc-800">
                          {seat ? (
                            <>
                              <span className="block font-medium text-zinc-800 dark:text-zinc-100">{seat.student_name}</span>
                              <span className="block text-zinc-500 dark:text-zinc-400">
                                {seat.class_name}{seat.division_name ? `-${seat.division_name}` : ""}
                                {seat.roll_number !== null ? ` · Roll ${seat.roll_number}` : ""}
                              </span>
                            </>
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-600">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
