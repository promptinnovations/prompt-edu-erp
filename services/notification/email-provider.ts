/**
 * PROMPT EDU ERP — EmailProvider abstraction (ARCHITECTURE.md §G.4
 * NotificationService, §R.4 "always also delivering in-app + email").
 *
 * Same provider-swap SHAPE as services/auth/auth-service.ts (pick an
 * implementation by which env vars are present), but with plain static
 * imports rather than auth's lazy require() — auth lazily requires because
 * the Supabase SDK may not even be installed/configured in an environment
 * that never sets Supabase env vars; nodemailer here is a normal, always-
 * installed dependency regardless of whether SMTP_HOST is set, so there's
 * nothing to gain by deferring the import (and a lazy CJS require() of a
 * relative TS module doesn't resolve reliably under Vitest's ESM
 * transform anyway — this static-import version is both simpler and the
 * one actually exercised by tests/integration/communication-flow.test.ts).
 *   - SmtpEmailProvider    — real delivery via nodemailer, used whenever
 *     SMTP_HOST is configured.
 *   - ConsoleEmailProvider — logs the email and marks it undelivered, used
 *     whenever SMTP_HOST is absent (this build's default — no real SMTP
 *     credentials are configured for local dev/this environment).
 */
import { createConsoleEmailProvider } from "./console-email-provider";
import { createSmtpEmailProvider } from "./smtp-email-provider";

export interface EmailProvider {
  /** false for the console/dev fallback — lets callers distinguish "we
   *  tried to send and it failed" from "there is nothing to try". */
  readonly isConfigured: boolean;
  sendEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }>;
}

export function getEmailProvider(): EmailProvider {
  const hasSmtpConfig = !!process.env.SMTP_HOST && !!process.env.SMTP_PORT;
  return hasSmtpConfig ? createSmtpEmailProvider() : createConsoleEmailProvider();
}
