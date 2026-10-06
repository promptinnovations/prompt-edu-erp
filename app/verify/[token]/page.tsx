import { parseRecordToken, getPublicRecordInfo } from "../../../services/learner-record/verification";

export const dynamic = "force-dynamic";

/** Public page a Learner Record's QR code points at. Confirms the record was
 *  really issued by the school — shows only name, school and issue date. */
export default async function VerifyRecordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = parseRecordToken(decodeURIComponent(token));
  const info = parsed ? await getPublicRecordInfo(parsed.studentId).catch(() => null) : null;
  const ok = !!(parsed && info);
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <div className="w-full rounded-2xl border bg-white p-8 text-center shadow-sm">
        {ok ? (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
            <h1 className="text-lg font-semibold text-zinc-900">Authentic Learner Record</h1>
            <p className="mt-3 text-sm text-zinc-600">
              This record was issued by <strong>{info!.institutionName}</strong> for <strong>{info!.studentName}</strong> (Admission No. {info!.admissionNumber}) on{" "}
              <strong>{new Date(parsed!.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</strong>.
            </p>
            <p className="mt-4 text-xs text-zinc-400">Only teacher-verified information appears on the record. Contact the school to confirm any detail.</p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl text-red-600">✕</div>
            <h1 className="text-lg font-semibold text-zinc-900">Could not verify this record</h1>
            <p className="mt-3 text-sm text-zinc-600">The code is invalid or has been altered. Please ask the school for a fresh copy.</p>
          </>
        )}
        <p className="mt-6 text-[10px] uppercase tracking-[0.08em] text-zinc-400">PROMPT EDU ERP · Prompt Innovations</p>
      </div>
    </main>
  );
}
