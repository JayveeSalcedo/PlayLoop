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
 * SMTP provider — see the plan's auth decision). If SMTP_USER/SMTP_PASS
 * aren't set and we're not in production, logs the code to the console
 * instead of failing, so local dev doesn't need real SMTP creds to exercise
 * the flow. Checking the credentials (not just SMTP_HOST) matters because
 * .env.example ships a real default host — only the credentials are blank
 * until you actually set up a provider.
 */
export async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (process.env.NODE_ENV !== "production" && (!process.env.SMTP_USER || !process.env.SMTP_PASS)) {
    console.log(`[dev-mail] OTP for ${email}: ${code}`);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || "playloop <no-reply@playloop.app>",
    to: email,
    subject: `Your playloop code: ${code}`,
    text: `Your login code is ${code}. It expires in 10 minutes.`,
    html: otpEmailHtml(code),
  });
}

/**
 * Inline-styled (no <style> block — Gmail and some clients strip it) to
 * echo the app's own look: thick ink border, rounded corners, the lemon
 * accent used for its primary CTAs. Kept to widely-supported properties;
 * border-radius/box-shadow just degrade to square corners on the handful
 * of clients (old Outlook desktop) that don't support them.
 */
function otpEmailHtml(code: string): string {
  return `
<div style="background:#f0ecff;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:420px;margin:0 auto;background:#ffffff;border:3px solid #18123f;border-radius:20px;padding:32px 28px;text-align:center;">
    <p style="margin:0 0 24px;font-size:22px;font-weight:800;color:#18123f;letter-spacing:-0.02em;">playloop</p>
    <p style="margin:0 0 8px;font-size:15px;color:#5e5885;">Your login code</p>
    <div style="display:inline-block;background:#ffdd3c;border:3px solid #18123f;border-radius:14px;padding:14px 22px;margin:8px 0 20px;">
      <span style="font-size:32px;font-weight:800;letter-spacing:0.3em;color:#18123f;">${code}</span>
    </div>
    <p style="margin:0;font-size:13px;color:#5e5885;">Expires in 10 minutes. If you didn&rsquo;t request this, you can ignore this email.</p>
  </div>
</div>`.trim();
}
