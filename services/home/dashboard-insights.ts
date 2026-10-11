/**
 * PROMPT EDU ERP — extra read-only snapshots for the staff dashboard
 * (§Staff-dashboard-visual-redesign): the signed-in user's role names (for
 * the greeting), a library snapshot for librarians and a fee-collection
 * snapshot for accounts/fees roles. Each runs in one tenant-scoped
 * transaction. Pure reads — nothing here changes data.
 */
import { getDbClient } from "../db/client";

export async function getMyRoleNames(institutionId: string, authUserId: string, userId: string): Promise<string[]> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<{ name: string }>(
      `select distinct r.name from user_roles ur join roles r on r.id = ur.role_id
        where ur.user_id = $1 and ur.institution_id = $2 order by r.name`,
      [userId, institutionId]
    );
    return rows.map((r) => r.name);
  });
}

export interface LibrarySnapshot {
  issuedNow: number; overdue: number; holdsWaiting: number; holdsReady: number; reviewsPending: number;
  books: number; copiesAvailable: number;
  /** Last 6 months, oldest first: YYYY-MM + issues that month. */
  issuesByMonth: { month: string; issues: number }[];
}

export async function getLibrarySnapshot(institutionId: string, authUserId: string): Promise<LibrarySnapshot> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<Omit<LibrarySnapshot, "issuesByMonth">>(
      `select
         (select count(*)::int from book_issues where status = 'issued') as "issuedNow",
         (select count(*)::int from book_issues where status = 'issued' and due_date < current_date) as overdue,
         (select count(*)::int from book_holds where status = 'pending') as "holdsWaiting",
         (select count(*)::int from book_holds where status = 'notified') as "holdsReady",
         (select count(*)::int from reading_records where review_status = 'pending' and coalesce(review_text, '') <> '') as "reviewsPending",
         (select count(*)::int from books where status = 'active') as books,
         (select count(*)::int from book_copies where status = 'available') as "copiesAvailable"`
    );
    const { rows: months } = await scoped.query<{ month: string; issues: number }>(
      `select to_char(m, 'YYYY-MM') as month,
              (select count(*)::int from book_issues bi where date_trunc('month', bi.issue_date) = m) as issues
         from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') m
        order by m`
    );
    return { ...rows[0], issuesByMonth: months };
  });
}

export interface FeeSnapshot {
  yearName: string | null;
  due: number; collected: number;
  paid: number; partial: number; pending: number; overdue: number;
  /** Last 6 months, oldest first. */
  collectedByMonth: { month: string; amount: number }[];
}

export async function getFeeSnapshot(institutionId: string, authUserId: string): Promise<FeeSnapshot> {
  const db = await getDbClient();
  return db.withInstitutionContext({ institutionId, authUserId }, async (scoped) => {
    const { rows } = await scoped.query<Omit<FeeSnapshot, "collectedByMonth">>(
      `with yr as (select id, name from academic_years where is_current = true limit 1),
            inv as (
              select i.id, i.amount_due::float8 as due, i.status, i.due_date,
                     coalesce((select sum(p.amount) from fee_payments p where p.invoice_id = i.id), 0)::float8 as paid
                from student_fee_invoices i
               where i.academic_year_id = (select id from yr) and i.status <> 'waived'
            )
       select (select name from yr) as "yearName",
              coalesce(sum(due), 0)::float8 as due, coalesce(sum(paid), 0)::float8 as collected,
              count(*) filter (where status = 'paid')::int as paid,
              count(*) filter (where status = 'partial')::int as partial,
              count(*) filter (where status = 'pending')::int as pending,
              count(*) filter (where status <> 'paid' and due_date < current_date and paid < due)::int as overdue
         from inv`
    );
    const { rows: months } = await scoped.query<{ month: string; amount: number }>(
      `select to_char(m, 'YYYY-MM') as month,
              coalesce((select sum(p.amount) from fee_payments p where date_trunc('month', p.payment_date) = m), 0)::float8 as amount
         from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') m
        order by m`
    );
    return { ...rows[0], collectedByMonth: months };
  });
}
