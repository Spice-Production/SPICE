import { Resend } from 'resend';

interface VerificationEmailInput {
  to: string;
  username: string;
  code: string;
  registrationId: string;
  sendCount: number;
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[SPICE email verification] ${input.to}: ${input.code}`);
      return;
    }
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const resend = new Resend(apiKey);
  const from = process.env.SPICE_EMAIL_FROM?.trim() || 'SPICE <accounts@spice-app.xyz>';
  const { error } = await resend.emails.send(
    {
      from,
      to: input.to,
      subject: `${input.code} is your SPICE verification code`,
      text: `Hi ${input.username},\n\nYour SPICE verification code is ${input.code}. It expires in 10 minutes.\n\nIf you did not request this account, you can ignore this email.`,
      html: verificationEmailHtml(input.username, input.code),
    },
    { idempotencyKey: `spice-verify-${input.registrationId}-${input.sendCount}` },
  );

  if (error) {
    throw new Error(`Verification email could not be sent: ${error.message}`);
  }
}

interface PasswordResetEmailInput {
  to: string;
  username: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[SPICE password reset] ${input.to}: ${input.resetUrl}`);
      return;
    }
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const resend = new Resend(apiKey);
  const from = process.env.SPICE_EMAIL_FROM?.trim() || 'SPICE <accounts@spice-app.xyz>';
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: 'Reset your SPICE password',
    text: `Hi ${input.username},\n\nSomeone requested a password reset for your SPICE account. Set a new password here (expires in 30 minutes):\n${input.resetUrl}\n\nIf that was not you, ignore this email — your password stays the same.`,
    html: passwordResetEmailHtml(input.username, input.resetUrl),
  });

  if (error) {
    throw new Error(`Password reset email could not be sent: ${error.message}`);
  }
}

function passwordResetEmailHtml(username: string, resetUrl: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#09070f;color:#f7f3ff;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <div style="font-size:13px;letter-spacing:.18em;color:#b794f6">SPICE</div>
    <h1 style="margin:14px 0 8px;font-size:28px">Reset your password</h1>
    <p style="color:#c7bdd8;line-height:1.6">Hi ${escapeHtml(username)}, use the button below to set a new password. It expires in 30 minutes.</p>
    <div style="margin:28px 0;text-align:center"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:14px 32px;border-radius:12px;background:#7c3aed;color:#fff;font-weight:800;text-decoration:none">Set a new password</a></div>
    <p style="color:#9d93ad;line-height:1.6">If that was not you, ignore this message — your password stays the same.</p>
  </div>
</body></html>`;
}

function verificationEmailHtml(username: string, code: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#09070f;color:#f7f3ff;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <div style="font-size:13px;letter-spacing:.18em;color:#b794f6">SPICE</div>
    <h1 style="margin:14px 0 8px;font-size:28px">Verify your email</h1>
    <p style="color:#c7bdd8;line-height:1.6">Hi ${escapeHtml(username)}, enter this code in SPICE to finish creating your account.</p>
    <div style="margin:28px 0;padding:22px;border:1px solid #4c1d95;border-radius:14px;background:#151022;text-align:center;font-size:34px;font-weight:800;letter-spacing:.22em;color:#d8b4fe">${code}</div>
    <p style="color:#9d93ad;line-height:1.6">This code expires in 10 minutes. If you did not request this account, ignore this message.</p>
  </div>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}
