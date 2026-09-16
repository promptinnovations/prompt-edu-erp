import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRequestContext } from "../../../../../services/request-context";
import { requireModuleEnabledOrRedirect } from "../../../../../services/modules/module-service";
import { can } from "../../../../../services/permissions/permission-service";
import { getInstitution } from "../../../../../services/institution/institution-service";
import { getExamination } from "../../../../../modules/examination/service";
import { listSeatingStickers, type SeatingStickerRow } from "../../../../../modules/examination/seating-service";
import PrintButton from "../../../../components/PrintButton";
import PrintLetterhead from "../../../../components/PrintLetterhead";

/**
 * Printable bench stickers — one per seated student, carrying exactly what
 * the spec asks for (name, class + division, roll number) plus the
 * room/bench/seat that tells the student where to sit.
 *
 * Grouped by room, then bench, so a printed sheet can be cut apart and
 * carried room by room; a bench's stickers always sit next to each other.
 * Uses the shared `.print-area` / `.no-print` rules from app/globals.css
 * (the Print Center convention) rather than its own stylesheet, so the app
 * chrome disappears on Ctrl+P with no extra CSS.
 */
export default async function SeatingStickersPage({
  searchParams,
}: {
  searchParams: Promise<{ examinationId?: string }>;
}) {
  const ctx = await requireRequestContext();
  const institutionId = ctx.institutionId!;
  const authUserId = ctx.session.authUserId;
  await requireModuleEnabledOrRedirect(institutionId, authUserId, "examination");
  if (!can(ctx.permissions, "examinations.seating.manage")) redirect("/examinations");

  const { examinationId = "" } = await searchParams;
  if (!examinationId) redirect("/examinations/seating");

  const [examination, stickers, institution] = await Promise.all([
    getExamination(institutionId, authUserId, examinationId),
    listSeatingStickers(institutionId, authUserId, examinationId),
    getInstitution(institutionId, authUserId),
  ]);

  // listSeatingStickers() already returns room -> bench -> seat order, so
  // grouping is a single pass, not a sort.
  const byRoom: Array<{ roomName: string; benches: Array<{ benchNumber: number; seats: SeatingStickerRow[] }> }> = [];
  for (const row of stickers) {
    let room = byRoom[byRoom.length - 1];
    if (!room || room.roomName !== row.room_name) {
      room = { roomName: row.room_name, benches: [] };
      byRoom.push(room);
    }
    let bench = room.benches[room.benches.length - 1];
    if (!bench || bench.benchNumber !== row.bench_number) {
      bench = { benchNumber: row.bench_number, seats: [] };
      room.benches.push(bench);
    }
    bench.seats.push(row);
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/examinations/seating?examinationId=${examinationId}`} className="text-sm text-zinc-500 underline">
          ← Back to Seating Arrangement
        </Link>
        <PrintButton label="Print stickers" />
      </div>

      <h1 className="no-print text-2xl font-semibold text-[var(--heading)]">
        Bench stickers — {examination?.name ?? "Examination"}
      </h1>

      {stickers.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No seating plan has been generated for this examination yet.
        </p>
      ) : (
        <section className="print-area rounded-card border bg-white p-5">
          <PrintLetterhead
            institutionName={institution?.appName || institution?.name || "PROMPT EDU ERP"}
            logoCode={institution?.logoFileId ? institution.code : null}
          />
          <p className="mb-4 text-center text-xs text-zinc-500">
            {examination?.name} — bench stickers ({stickers.length})
          </p>

          {byRoom.map((room) => (
            <div key={room.roomName} className="mb-6">
              <h2 className="mb-2 border-b pb-1 text-sm font-semibold text-[var(--heading)]">
                {room.roomName}
              </h2>
              {room.benches.map((bench) => (
                <div key={bench.benchNumber} className="mb-3">
                  <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                    Bench {bench.benchNumber}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {bench.seats.map((seat) => (
                      <div
                        key={seat.id}
                        className="break-inside-avoid rounded-card border border-dashed border-zinc-400 p-2.5"
                      >
                        <p className="text-sm font-semibold leading-tight text-zinc-900">{seat.student_name}</p>
                        <p className="mt-0.5 text-xs text-zinc-700">
                          {seat.class_name}{seat.division_name ? ` — ${seat.division_name}` : ""}
                        </p>
                        <p className="text-xs text-zinc-700">
                          Roll No: <strong>{seat.roll_number ?? "—"}</strong>
                        </p>
                        <p className="mt-1 border-t pt-1 text-[11px] text-zinc-500">
                          {room.roomName} · Bench {seat.bench_number} · Seat {seat.seat_number}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
