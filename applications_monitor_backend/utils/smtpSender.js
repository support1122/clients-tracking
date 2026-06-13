// SMTP sender using a Gmail App Password (or any SMTP provider).
//
// This is the preferred path because it uses a static username + app password
// instead of OAuth refresh tokens — so it never hits `invalid_grant` / token
// revocation. If the SMTP_* env vars are set, sendGmailEmail() uses this;
// otherwise it falls back to the Gmail OAuth API path.
//
// Required env to enable:
//   SMTP_USER  = the full Gmail address (e.g. support@flashfirejobs.com)
//   SMTP_PASS  = the 16-char Google App Password (NOT the normal password)
// Optional:
//   SMTP_HOST  = smtp.gmail.com   (default)
//   SMTP_PORT  = 465              (default; 587 also works)
//   SMTP_SECURE= true             (default true for 465; set false for 587)
//   SMTP_FROM_EMAIL = address shown in the From header (default SMTP_USER)
//   SMTP_FROM_NAME  = display name in the From header (e.g. "FlashFire Team")

import nodemailer from "nodemailer";

export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function smtpFromEmail() {
  return process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "";
}

// Singleton transporter — created once, reused for every send.
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  const port = Number(process.env.SMTP_PORT) || 465;
  // Default to implicit TLS on 465; STARTTLS on anything else (e.g. 587).
  const secure = process.env.SMTP_SECURE != null
    ? String(process.env.SMTP_SECURE).toLowerCase() === "true"
    : port === 465;
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _transporter;
}

/**
 * Send one email over SMTP.
 * @param {Object} a
 * @param {string} a.to
 * @param {string} a.subject
 * @param {string} [a.html]
 * @param {string} [a.text]
 * @param {Object} [a.attachment] - { filename, mimetype, content (Buffer) }
 * @returns {Promise<{ messageId: string }>}
 */
export async function sendViaSmtp({ to, subject, html, text, attachment }) {
  const fromEmail = smtpFromEmail();
  const fromName = process.env.SMTP_FROM_NAME || "";
  const from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

  const mail = { from, to, subject, html, text };
  if (attachment) {
    mail.attachments = [{
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.mimetype,
    }];
  }
  const info = await getTransporter().sendMail(mail);
  return { messageId: info?.messageId };
}
