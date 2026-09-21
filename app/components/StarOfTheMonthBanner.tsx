import { getCurrentStarOfTheMonth } from "../../modules/scoring/service";

/** §9 "the one wins this award must be shown in everyones log in with an
 *  attractive banner of Star of the month- with name and photo." Server
 *  component, rendered once at the top of each role's landing page
 *  (institution Dashboard, student portal, parent portal) -- renders
 *  nothing when no winner has been computed yet, so institutions that
 *  haven't set up a performance profile (or haven't run the monthly
 *  compute) see no gap. Multiple stage winners are shown side by side. */
export default async function StarOfTheMonthBanner({
  institutionId, authUserId,
}: {
  institutionId: string; authUserId: string;
}) {
  const winners = await getCurrentStarOfTheMonth(institutionId, authUserId);
  if (winners.length === 0) return null;

  return (
    <div className="rounded-card border border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl" aria-hidden="true">🌟</span>
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-amber-800">Star of the Month</h2>
      </div>
      <div className="flex flex-wrap gap-4">
        {winners.map((w) => (
          <div key={w.id} className="flex items-center gap-3 rounded-card bg-white/70 px-4 py-3 shadow-sm">
            {w.photo_file_id ? (
              // eslint-disable-next-line @next/next/no-img-element -- served from our own /api/files route
              <img
                src={`/api/files/${w.photo_file_id}`}
                alt=""
                className="h-14 w-14 rounded-full object-cover ring-2 ring-amber-300"
              />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-lg font-semibold text-amber-700 ring-2 ring-amber-300">
                {w.student_name.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <div className="text-base font-semibold text-zinc-900">{w.student_name}</div>
              <div className="text-xs text-zinc-500">
                {w.stage ? `${w.stage} stage` : "Whole institution"} · Score {w.score}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
