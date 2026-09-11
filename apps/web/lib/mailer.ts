import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP_HOST/SMTP_USER/SMTP_PASS are not set — see .env.example (Brevo free tier works well).");
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends a login code by email via Nodemailer/SMTP (Brevo free tier or any
 * SMTP provider — see the plan's auth decision). If no SMTP env vars are
 * set and we're not in production, logs the code to the console instead of
 * failing, so local dev doesn't need real SMTP creds to exercise the flow.
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
    console.log(`[dev-mail] OTP for ${email}: ${code}`);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || "playloop <no-reply@playloop.app>",
    to: email,
    subject: `Your playloop code: ${code}`,
    text: `Your login code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your playloop login code is <b style="font-size:20px;letter-spacing:.1em">${code}</b>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  });
}
