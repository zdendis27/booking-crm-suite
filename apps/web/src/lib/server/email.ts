import { Resend } from "resend";
import { brand } from "@repo/copy";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer }[];
  replyTo?: string;
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function fromAddress(): string {
  return process.env.EMAIL_FROM || `${brand.name} <onboarding@resend.dev>`;
}

export async function sendEmail(message: EmailMessage): Promise<{ id: string | null; transport: "resend" | "console" }> {
  if (!isEmailConfigured()) {
    console.info(`[e-mail:console] ${message.to} | ${message.subject}`);
    return { id: null, transport: "console" };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: fromAddress(),
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: message.replyTo,
    attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
  });
  if (error) {
    throw new Error(error.message);
  }
  return { id: data?.id ?? null, transport: "resend" };
}
