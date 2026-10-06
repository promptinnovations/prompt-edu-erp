import { createHmac, timingSafeEqual } from "node:crypto";
import { getDbClient } from "../db/client";

/** Learner Record authenticity tokens. A printed record carries a QR code to
 *  /verify/<token>; the token is `<studentId>.<yyyymmdd>.<hmac>` so it can be
 *  checked without storing anything, and it binds the issue date so a record
 *  can't be re-dated. The public page only ever confirms name, school and
 *  issue date — never marks or other data. */
function secret(): string {
  return process.env.LEARNER_RECORD_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DATABASE_URL || "dev-only-learner-record-secret";
}
function sign(studentId: string, date: string): string {
  return createHmac("sha256", secret()).update(`${studentId}.${date}`).digest("hex").slice(0, 24);
}
export function createRecordToken(studentId: string, isoDate: string): string {
  const d = isoDate.replace(/-/g, "");
  return `${studentId}.${d}.${sign(studentId, d)}`;
}
export function parseRecordToken(token: string): { studentId: string; date: string } | null {
  const [studentId, date, sig] = token.split(".");
  if (!studentId || !date || !sig || !/^[0-9a-f-]{36}$/.test(studentId) || !/^\d{8}$/.test(date)) return null;
  const expected = Buffer.from(sign(studentId, date));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { studentId, date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` };
}

export interface PublicRecordInfo { studentName: string; admissionNumber: string; institutionName: string }
export async function getPublicRecordInfo(studentId: string): Promise<PublicRecordInfo | null> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId: null, isSuperAdmin: true }, async (scoped) => {
    const { rows } = await scoped.query<{ full_name: string; admission_number: string; name: string; app_name: string | null }>(
      `select s.full_name, s.admission_number, i.name, i.app_name
         from students s join institutions i on i.id = s.institution_id
        where s.id = $1`,
      [studentId]
    );
    if (!rows[0]) return null;
    return { studentName: rows[0].full_name, admissionNumber: rows[0].admission_number, institutionName: rows[0].app_name || rows[0].name };
  });
}
