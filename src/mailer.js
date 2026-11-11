import nodemailer from 'nodemailer';

let smtpTransport = null;

function getTransport() {
  if (!smtpTransport) {
    const { SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_USER || !SMTP_PASS) throw new Error('Missing SMTP environment variables');

    smtpTransport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return smtpTransport;
}

/** Sends the confirmation email. TEST_EMAIL_OVERRIDE (if set) redirects all mail. */
export async function sendConfirmation({ to, subject, html }) {
  const recipient = process.env.TEST_EMAIL_OVERRIDE || to;

  return getTransport().sendMail({
    from: { name: process.env.MAIL_FROM_NAME || 'Active Ventilation Products', address: process.env.MAIL_FROM },
    to: recipient,
    subject,
    html,
  });
}
