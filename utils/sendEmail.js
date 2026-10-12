// utils/sendEmail.js
//
// Sends email through Brevo's HTTP API instead of SMTP.
// Render's free tier blocks outbound SMTP ports (25, 465, 587), so a normal
// nodemailer/SMTP setup times out in production. An HTTPS call works fine.
//
// Needs these environment variables (set them in Render, and in your local .env to test):
//   BREVO_API_KEY     your Brevo API key (starts with "xkeysib-")
//   MAIL_FROM_EMAIL   a sender address you have verified inside Brevo
//   MAIL_FROM_NAME    optional, defaults to "NaijaIntern"

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.MAIL_FROM_EMAIL;
  const fromName = process.env.MAIL_FROM_NAME || "NaijaIntern";

  if (!apiKey || !fromEmail) {
    throw new Error(
      "Email is not configured: BREVO_API_KEY and MAIL_FROM_EMAIL must both be set."
    );
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo responded ${res.status}: ${body}`);
  }
}

module.exports = sendEmail;