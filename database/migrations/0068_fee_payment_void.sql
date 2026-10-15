-- =============================================================================
-- PROMPT EDU ERP — Migration 0068: deleting (voiding) a fee payment.
--
-- §Fee-payment-delete ("there should be an option for deleting payment — it
-- may be required because of false entries"). fee_payments is a financial
-- ledger, so a wrong entry is VOIDED rather than erased: it stops counting
-- everywhere (every total already sums only status = 'confirmed'), the
-- invoice status is recalculated, the matching auto-posted Accounts income
-- row is removed, and the row itself stays with who voided it, when and
-- why — visible as "Deleted" on the invoice and in the audit log.
-- =============================================================================

alter table fee_payments drop constraint if exists fee_payments_status_check;
alter table fee_payments add constraint fee_payments_status_check
  check (status in ('confirmed', 'pending_confirmation', 'rejected', 'voided'));

alter table fee_payments
  add column if not exists voided_by   uuid references users(id),
  add column if not exists voided_at   timestamptz,
  add column if not exists void_reason text;
