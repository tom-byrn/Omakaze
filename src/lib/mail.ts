import { env } from "@/lib/env";

/** Send an email when SMTP is configured. Returns false (and logs) when it is not. */
export async function sendMail(msg: { to: string; subject: string; text: string }): Promise<boolean> {
  const { SMTP_URL, SMTP_FROM } = env();
  if (!SMTP_URL) {
    console.info(`[mail] SMTP not configured; not sending "${msg.subject}" to ${msg.to}`);
    return false;
  }
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(SMTP_URL);
    await transport.sendMail({ from: SMTP_FROM, ...msg });
    return true;
  } catch (err) {
    console.error("[mail] failed to send", err);
    return false;
  }
}

export function mailEnabled(): boolean {
  return Boolean(env().SMTP_URL);
}
