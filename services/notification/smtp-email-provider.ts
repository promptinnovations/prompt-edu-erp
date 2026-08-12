/**
 * PROMPT EDU ERP — SmtpEmailProvider (real delivery via nodemailer — see
 * services/notification/email-provider.ts for when this is selected).
 *
 * Untested against a real mailbox in this build's environment (no SMTP
 * credentials configured here, same situation as
 * services/auth/supabase-auth-provider.ts before real Supabase credentials
 * were connected) — but it is real, standard nodemailer SMTP transport
 * code, ready for MAIL_FROM/SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS to be
 * set on a real deployment.
 */
import nodemailer from "nodemailer";
import type { EmailProvider } from "./email-provider";

export function createSmtpEmailProvider(): EmailProvider {
  return {
    isConfigured: true,
    async sendEmail(to, subject, body) {
      try {
        const transport = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === "true",
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        });
        await transport.sendMail({
          from: process.env.MAIL_FROM ?? "no-reply@prompt-edu-erp.local",
          to, subject, text: body,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "SMTP send failed." };
      }
    },
  };
}
