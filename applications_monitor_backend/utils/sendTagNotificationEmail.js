import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY_1 || process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@flashfirehq.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'FlashFire Dashboard';
const PORTAL_URL = process.env.PORTAL_URL || process.env.CORS_ORIGIN || 'https://hq.flashfirejobs.com';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

/**
 * Send email notification when a user is tagged in an onboarding comment.
 */
export async function sendTagNotificationEmail({ toEmail, recipientName, authorName, commentSnippet, jobNumber, clientName, clientNumber, jobId }) {
  if (!SENDGRID_API_KEY) {
    console.log(`[Tag Email] ${toEmail} (SendGrid not configured)`);
    return;
  }
  console.log(`[Tag Email] Sending tag notification to ${toEmail} for job #${jobNumber}`);

  const displayName = recipientName || (toEmail && toEmail.split('@')[0]) || 'User';
  const clientLabel = clientNumber != null ? `${clientNumber} - ${clientName || ''}` : (clientName || '');
  const ticketLink = `${PORTAL_URL.replace(/\/$/, '')}/client-onboarding`;
  const linkWithJob = jobId ? `${ticketLink}?job=${jobId}` : ticketLink;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;">
  <div style="max-width:480px;margin:0 auto;padding:24px;">
    <div style="background:#1f2937;border-radius:12px 12px 0 0;padding:20px 24px;">
      <div style="color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">FLASHFIRE ONBOARDING</div>
      <div style="color:#fff;font-size:20px;font-weight:700;margin-top:4px;">You were tagged</div>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi ${displayName},</p>
      <p style="margin:0 0 16px;color:#374151;font-size:16px;"><strong>${authorName || 'Someone'}</strong> tagged you in a comment on onboarding ticket <strong>#${jobNumber || ''}</strong> (${clientLabel || 'Client'}).</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0;color:#4b5563;font-size:14px;font-style:italic;">"${(commentSnippet || '').replace(/"/g, '&quot;')}"</p>
      </div>
      <a href="${linkWithJob}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View in Onboarding</a>
      <p style="margin:20px 0 0;color:#6b7280;font-size:14px;">Log in to the Client Tracking Portal to respond and mark the issue as resolved.</p>
    </div>
    <div style="text-align:center;padding:16px 0;">
      <span style="color:#9ca3af;font-size:12px;">© 2026 FlashFire</span>
    </div>
  </div>
</body>
</html>
`;

  const msg = {
    to: toEmail,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `${authorName || 'Someone'} tagged you in onboarding #${jobNumber || ''}`,
    html
  };

  try {
    await sgMail.send(msg);
    console.log(`[Tag Email] Sent successfully to ${toEmail}`);
  } catch (err) {
    console.error(`[Tag Email] SendGrid error for ${toEmail}:`, err?.response?.body || err.message);
    throw err;
  }
}
