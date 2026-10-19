import { env } from "@/lib/env";

export type MailMessage = { to: string; subject: string; text: string; html?: string; headers?: Record<string, string> };

export class MailNotConfiguredError extends Error {}

/** Send an email through SMTP_URL. Throws when SMTP is not configured or the server refuses it (callers that retry want that). */
export async function deliverMail(msg: MailMessage): Promise<void> {
  const { SMTP_URL, SMTP_FROM } = env();
  if (!SMTP_URL) throw new MailNotConfiguredError("SMTP is not configured");
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(SMTP_URL);
  await transport.sendMail({ from: SMTP_FROM, ...msg });
}

/** Send an email when SMTP is configured. Returns false (and logs) when it is not, or when sending fails. */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  if (!mailEnabled()) {
    console.info(`[mail] SMTP not configured; not sending "${msg.subject}" to ${msg.to}`);
    return false;
  }
  try {
    await deliverMail(msg);
    return true;
  } catch (err) {
    console.error("[mail] failed to send", err);
    return false;
  }
}

export function mailEnabled(): boolean {
  return Boolean(env().SMTP_URL);
}
