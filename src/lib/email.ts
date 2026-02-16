import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // STARTTLS on port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const defaultFrom =
  process.env.SMTP_FROM || "noreply@efilo.ai";

interface SendEmailParams {
  to: string;
  toName?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Low-level email sender via SMTP (Google Workspace).
 */
export async function sendEmail(params: SendEmailParams) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("[email] SMTP_USER/SMTP_PASS not set — skipping email send");
    return;
  }

  const from = params.fromName
    ? `"${params.fromName}" <${params.from || defaultFrom}>`
    : params.from || defaultFrom;

  const to = params.toName
    ? `"${params.toName}" <${params.to}>`
    : params.to;

  await transporter.sendMail({
    from,
    to,
    replyTo: params.replyTo,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}

interface SendRfiEmailParams {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  to: string;
  toName?: string;
  rfiNumber: string;
  subject: string;
  question: string;
  projectName: string;
}

/**
 * Send an RFI email to the GC contact.
 */
export async function sendRfiEmail(params: SendRfiEmailParams) {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1C1917; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 3px solid #C67F17; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="margin: 0; color: #C67F17;">RFI ${params.rfiNumber}</h2>
    <p style="margin: 4px 0 0; color: #57534E; font-size: 14px;">Project: ${escapeHtml(params.projectName)}</p>
  </div>

  <p style="margin: 0 0 8px; font-weight: 600; font-size: 15px;">${escapeHtml(params.subject)}</p>

  <div style="background: #FAFAF8; border: 1px solid #E8E5DE; border-radius: 6px; padding: 16px; margin: 16px 0; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">
${escapeHtml(params.question)}
  </div>

  <p style="color: #57534E; font-size: 13px; margin-top: 24px;">
    Sent by ${escapeHtml(params.fromName)}
  </p>
  <p style="color: #57534E; font-size: 12px; margin-top: 8px;">
    Please reply directly to this email to respond.
  </p>
</body>
</html>`.trim();

  const text = `RFI ${params.rfiNumber} — ${params.subject}\nProject: ${params.projectName}\n\n${params.question}\n\nSent by ${params.fromName}\nPlease reply directly to this email to respond.`;

  await sendEmail({
    to: params.to,
    toName: params.toName,
    from: params.fromEmail,
    fromName: params.fromName,
    replyTo: params.replyTo,
    subject: `RFI ${params.rfiNumber}: ${params.subject}`,
    html,
    text,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
