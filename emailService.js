// ════════════════════════════════════════════════════════════
// ELINGU EMAIL SERVICE — Resend-powered transactional emails
// Clean, bulletproof table-based templates for 100% Gmail compatibility
// ════════════════════════════════════════════════════════════

const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = `${process.env.RESEND_FROM_NAME || 'Elingu'} <${process.env.RESEND_FROM || 'onboarding@resend.dev'}>`;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

if (!resend) {
  console.warn('⚠️ [emailService] RESEND_API_KEY not configured. Outbound emails will run in simulated console mode.');
}

function logSimulatedEmail(to, subject, extra = '') {
  console.log('\n┌────────────────────────────────────────────────────────┐');
  console.log('│ 📧 [SIMULATED EMAIL] Resend (Dev/No-Key Mode)          │');
  console.log(`│ To:      ${String(to || '').slice(0, 45).padEnd(46)}│`);
  console.log(`│ Subject: ${String(subject || '').slice(0, 45).padEnd(46)}│`);
  if (extra) {
    console.log(`│ Info:    ${String(extra || '').slice(0, 45).padEnd(46)}│`);
  }
  console.log('└────────────────────────────────────────────────────────┘\n');
}

// ── EMAIL 1: First child registered — parent must verify & set Family PIN ──

async function sendFirstChildVerificationEmail({ parentEmail, childHandle, verifyToken, childId }) {
  const link = `${BASE_URL}/parent/verify?token=${verifyToken}&child=${childId}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activate ${childHandle}'s Elingu Account</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: visible;">
          <!-- Header Banner -->
          <tr>
            <td align="center" style="background-color: #0D3A26; background: linear-gradient(135deg, #0D3A26 0%, #064E3B 100%); padding: 36px 24px; border-top-left-radius: 15px; border-top-right-radius: 15px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="font-size: 32px; line-height: 1;">🌳</span>
                    <h1 style="color: #FFFFFF; margin: 8px 0 4px 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">Elingu</h1>
                    <p style="color: #6EE7B7; margin: 0; font-size: 13px; font-weight: 500; letter-spacing: 0.5px;">ELIMU NI NGUVU — KNOWLEDGE IS POWER</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h2 style="color: #0F172A; font-size: 20px; font-weight: 700; margin: 0 0 16px 0; line-height: 1.3;">
                Your child wants to join Elingu! 🎉
              </h2>
              <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                <strong style="color: #0D3A26; font-size: 16px;">${childHandle}</strong> has registered on Elingu — Kenya's Socratic AI learning companion for CBE students.
              </p>
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                To activate their account, click the button below. You'll set a 6-digit <strong style="color: #0F172A;">Family PIN</strong> to manage and approve accounts for all your children.
              </p>

              <!-- CTA Button -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="border-radius: 10px; background-color: #00C896; background: linear-gradient(135deg, #00C896 0%, #0D3A26 100%);">
                          <a href="${link}" target="_blank" style="display: inline-block; padding: 15px 34px; font-size: 15px; font-weight: 700; color: #FFFFFF; text-decoration: none; border-radius: 10px; letter-spacing: 0.2px;">
                            Activate ${childHandle}'s Account 🚀
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Safety Note -->
              <p style="color: #64748B; font-size: 12.5px; line-height: 1.5; margin: 24px 0 0 0; padding-top: 18px; border-top: 1px solid #F1F5F9;">
                This link expires in 24 hours. If you did not expect this request, you can safely ignore this email — the account will not be activated without your consent.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 20px 36px; border-bottom-left-radius: 15px; border-bottom-right-radius: 15px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="color: #475569; font-size: 12.5px; margin: 0 0 10px 0;">
                👨‍👩‍👦 Access your family dashboard anytime via the <a href="${BASE_URL}/parent/portal?email=${encodeURIComponent(parentEmail)}" style="color: #0D3A26; font-weight: 700; text-decoration: underline;">Parent Portal</a>
              </p>
              <p style="color: #64748B; font-size: 12px; margin: 0 0 6px 0;">
                🛡️ <strong>Child Safety First:</strong> Fully compliant with Kenya Data Protection Act 2019
              </p>
              <p style="color: #94A3B8; font-size: 11px; margin: 0;">
                Elingu · Nairobi, Kenya · <a href="${BASE_URL}" style="color: #00C896; text-decoration: none;">elingu.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (!resend) {
    logSimulatedEmail(parentEmail, `Activate ${childHandle}'s Elingu account`, link);
    return { success: true, simulated: true };
  }

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: parentEmail,
      subject: `🌳 Activate ${childHandle}'s Elingu account`,
      html
    });
    console.log('[emailService] First-child verification sent:', result?.data?.id);
    return { success: true, id: result?.data?.id };
  } catch (err) {
    console.error('[emailService] Failed to send first-child email:', err.message);
    return { success: false, error: err.message };
  }
}

// ── EMAIL 2: Subsequent child — parent approves with Family PIN ──

async function sendChildApprovalEmail({ parentEmail, childHandle, approveToken, childId }) {
  const link = `${BASE_URL}/parent/approve?token=${approveToken}&child=${childId}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Approve ${childHandle} on Elingu</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: visible;">
          <!-- Header Banner -->
          <tr>
            <td align="center" style="background-color: #0D3A26; background: linear-gradient(135deg, #0D3A26 0%, #064E3B 100%); padding: 36px 24px; border-top-left-radius: 15px; border-top-right-radius: 15px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="font-size: 32px; line-height: 1;">🌳</span>
                    <h1 style="color: #FFFFFF; margin: 8px 0 4px 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">Elingu</h1>
                    <p style="color: #6EE7B7; margin: 0; font-size: 13px; font-weight: 500; letter-spacing: 0.5px;">FAMILY ACCOUNT SECURITY</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h2 style="color: #0F172A; font-size: 20px; font-weight: 700; margin: 0 0 16px 0; line-height: 1.3;">
                Does ${childHandle} belong to your family? 👤
              </h2>
              <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                A learner with the nickname <strong style="color: #0D3A26; font-size: 16px;">${childHandle}</strong> has registered on Elingu using your email address.
              </p>
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                <strong style="color: #0F172A;">Do you recognise this child?</strong> If yes, click the button below and enter your 6-digit Family PIN to approve their account. If you don't know who this is, simply ignore this message.
              </p>

              <!-- CTA Button -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="border-radius: 10px; background-color: #00C896; background: linear-gradient(135deg, #00C896 0%, #0D3A26 100%);">
                          <a href="${link}" target="_blank" style="display: inline-block; padding: 15px 34px; font-size: 15px; font-weight: 700; color: #FFFFFF; text-decoration: none; border-radius: 10px; letter-spacing: 0.2px;">
                            Approve ${childHandle} 👤
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Safety Note -->
              <p style="color: #64748B; font-size: 12.5px; line-height: 1.5; margin: 24px 0 0 0; padding-top: 18px; border-top: 1px solid #F1F5F9;">
                This link expires in 48 hours. Your Family PIN protects your family account so unauthorized accounts cannot attach to your profile.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 20px 36px; border-bottom-left-radius: 15px; border-bottom-right-radius: 15px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="color: #475569; font-size: 12.5px; margin: 0 0 10px 0;">
                👨‍👩‍👦 Access your family dashboard anytime via the <a href="${BASE_URL}/parent/portal?email=${encodeURIComponent(parentEmail)}" style="color: #0D3A26; font-weight: 700; text-decoration: underline;">Parent Portal</a>
              </p>
              <p style="color: #64748B; font-size: 12px; margin: 0 0 6px 0;">
                🛡️ <strong>Child Safety First:</strong> Fully compliant with Kenya Data Protection Act 2019
              </p>
              <p style="color: #94A3B8; font-size: 11px; margin: 0;">
                Elingu · Nairobi, Kenya · <a href="${BASE_URL}" style="color: #00C896; text-decoration: none;">elingu.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (!resend) {
    logSimulatedEmail(parentEmail, `Does ${childHandle} belong to your family?`, link);
    return { success: true, simulated: true };
  }

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: parentEmail,
      subject: `👤 Does ${childHandle} belong to your family? — Elingu`,
      html
    });
    console.log('[emailService] Child approval email sent:', result?.data?.id);
    return { success: true, id: result?.data?.id };
  } catch (err) {
    console.error('[emailService] Failed to send approval email:', err.message);
    return { success: false, error: err.message };
  }
}

// ── EMAIL 3: OTP Verification Code for Parent PIN Reset/Change ──

async function sendOTPEmail({ parentEmail, otpCode, purpose = 'reset your Family PIN' }) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elingu Verification Code</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: visible;">
          <!-- Header Banner -->
          <tr>
            <td align="center" style="background-color: #0D3A26; background: linear-gradient(135deg, #0D3A26 0%, #064E3B 100%); padding: 36px 24px; border-top-left-radius: 15px; border-top-right-radius: 15px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="font-size: 32px; line-height: 1;">🔐</span>
                    <h1 style="color: #FFFFFF; margin: 8px 0 4px 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">Elingu</h1>
                    <p style="color: #6EE7B7; margin: 0; font-size: 13px; font-weight: 500; letter-spacing: 0.5px;">FAMILY ACCOUNT SECURITY</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h2 style="color: #0F172A; font-size: 20px; font-weight: 700; margin: 0 0 16px 0; line-height: 1.3;">
                Your Verification Code 🔑
              </h2>
              <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                You requested a code to <strong style="color: #0D3A26;">${purpose}</strong>. Enter this code in the Elingu Parent Portal:
              </p>

              <!-- OTP Code Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="background-color: #F0FDF4; border: 2px solid #0D3A26; border-radius: 14px; padding: 20px 48px;">
                          <span style="font-size: 36px; font-weight: 800; color: #0D3A26; letter-spacing: 12px; font-family: 'Courier New', Courier, monospace;">${otpCode}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 8px 0;">
                ⏱️ This code expires in <strong>10 minutes</strong>.
              </p>

              <!-- Safety Note -->
              <p style="color: #DC2626; font-size: 13px; line-height: 1.5; margin: 24px 0 0 0; padding-top: 18px; border-top: 1px solid #F1F5F9; font-weight: 600;">
                ⚠️ If you did not request this code, someone may be trying to access your account. Do NOT share this code with anyone. You can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 20px 36px; border-bottom-left-radius: 15px; border-bottom-right-radius: 15px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="color: #64748B; font-size: 12px; margin: 0 0 6px 0;">
                🛡️ <strong>Child Safety First:</strong> Fully compliant with Kenya Data Protection Act 2019
              </p>
              <p style="color: #94A3B8; font-size: 11px; margin: 0;">
                Elingu · Nairobi, Kenya · <a href="${BASE_URL}" style="color: #00C896; text-decoration: none;">elingu.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (!resend) {
    logSimulatedEmail(parentEmail, 'Your Elingu Verification Code', `Code: ${otpCode} (for ${purpose})`);
    return { success: true, simulated: true };
  }

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: parentEmail,
      subject: `🔐 Your Elingu Verification Code`,
      html
    });
    console.log('[emailService] OTP email sent:', result?.data?.id);
    return { success: true, id: result?.data?.id };
  } catch (err) {
    console.error('[emailService] Failed to send OTP email:', err.message);
    return { success: false, error: err.message };
  }
}

// ── EMAIL 4: Student PIN Reset Verification Code ─────────────

async function sendStudentOTPEmail({ recipientEmail, studentHandle, otpCode }) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Elingu PIN Reset Code</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #0D3A26 0%, #047857 100%); padding: 32px 24px; border-top-left-radius: 15px; border-top-right-radius: 15px;">
              <span style="font-size: 36px;">🌳</span>
              <h1 style="color: #FFFFFF; margin: 8px 0 0 0; font-size: 24px; font-weight: 700;">Elingu Learning</h1>
              <p style="color: #A7F3D0; margin: 4px 0 0 0; font-size: 13px;">PIN RESET VERIFICATION</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="color: #0F172A; font-size: 19px; font-weight: 700; margin: 0 0 12px 0;">
                Habari ${studentHandle}! 🔑
              </h2>
              <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                Here is your 6-digit code to reset your 4-digit Elingu PIN:
              </p>
              <div style="text-align: center; margin: 24px 0;">
                <div style="display: inline-block; background-color: #ECFDF5; border: 2px solid #059669; border-radius: 12px; padding: 16px 36px;">
                  <span style="font-size: 32px; font-weight: 800; color: #065F46; letter-spacing: 10px; font-family: 'Courier New', monospace;">${otpCode}</span>
                </div>
              </div>
              <p style="color: #64748B; font-size: 13.5px; margin: 0;">⏱️ This code expires in <strong>10 minutes</strong>.</p>
              <p style="color: #94A3B8; font-size: 12px; margin-top: 20px; border-top: 1px solid #F1F5F9; padding-top: 16px;">
                If you didn't ask to reset your PIN, tell your parent right away.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8FAFC; padding: 16px 32px; border-bottom-left-radius: 15px; border-bottom-right-radius: 15px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="color: #94A3B8; font-size: 11px; margin: 0;">Elingu · Nairobi, Kenya · KDPA 2019 Protected</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (!resend) {
    logSimulatedEmail(recipientEmail, `${otpCode} is your Elingu PIN reset code`, `Learner: ${studentHandle} | OTP: ${otpCode}`);
    return { success: true, simulated: true };
  }

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: recipientEmail,
      subject: `🔑 ${otpCode} is your Elingu PIN reset code`,
      html
    });
    console.log('[emailService] Student OTP email sent to', recipientEmail, result?.data?.id);
    return { success: true, id: result?.data?.id };
  } catch (err) {
    console.error('[emailService] Student OTP email error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── EMAIL 5: Parent Alert on Student PIN Change ──────────────

async function sendParentPinChangedAlert({ parentEmail, childHandle }) {
  if (!parentEmail) return { success: false, error: 'No parent email provided' };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Security Alert: PIN Updated</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0;">
          <tr>
            <td style="background-color: #0D3A26; padding: 28px 24px; text-align: center; border-top-left-radius: 15px; border-top-right-radius: 15px;">
              <span style="font-size: 32px;">🛡️</span>
              <h1 style="color: #FFFFFF; margin: 6px 0 0 0; font-size: 22px; font-weight: 700;">Security Notification</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="color: #0F172A; font-size: 18px; margin: 0 0 12px 0;">
                Your child's PIN was updated
              </h2>
              <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                This is a confirmation that <strong>${childHandle}</strong> has successfully reset their 4-digit Elingu PIN on ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}.
              </p>
              <div style="background-color: #F0FDF4; border: 1px solid #86EFAC; border-radius: 10px; padding: 14px 16px; margin: 20px 0;">
                <p style="color: #166534; font-size: 13.5px; margin: 0; font-weight: 600;">
                  ✅ If you or your child performed this change, no further action is needed.
                </p>
              </div>
              <p style="color: #DC2626; font-size: 13px; line-height: 1.5; margin: 20px 0 0 0; border-top: 1px solid #F1F5F9; padding-top: 14px;">
                ⚠️ If you did NOT authorize this change, please sign in to the <a href="${BASE_URL}/parent/portal" style="color: #DC2626; font-weight: 700;">Parent Portal</a> immediately to reset your child's PIN.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8FAFC; padding: 16px 32px; border-bottom-left-radius: 15px; border-bottom-right-radius: 15px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="color: #94A3B8; font-size: 11px; margin: 0;">Elingu · Nairobi, Kenya · KDPA 2019 Protected</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (!resend) {
    logSimulatedEmail(parentEmail, `Security Notice: ${childHandle}'s Elingu PIN was reset`);
    return { success: true, simulated: true };
  }

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: parentEmail,
      subject: `🛡️ Security Notice: ${childHandle}'s Elingu PIN was reset`,
      html
    });
    console.log('[emailService] Parent PIN reset alert sent:', result?.data?.id);
    return { success: true, id: result?.data?.id };
  } catch (err) {
    console.error('[emailService] Parent PIN reset alert error:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendParentNotification(parentEmail, subject, html) {
  if (!resend) {
    logSimulatedEmail(parentEmail, subject || 'Notification from Elingu');
    return { success: true, simulated: true };
  }

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: parentEmail,
      subject: subject || 'Notification from Elingu',
      html
    });
    console.log('[emailService] Parent notification sent:', result?.data?.id);
    return { success: true, id: result?.data?.id };
  } catch (err) {
    console.error('[emailService] Parent notification error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendFirstChildVerificationEmail,
  sendChildApprovalEmail,
  sendOTPEmail,
  sendStudentOTPEmail,
  sendParentPinChangedAlert,
  sendParentNotification
};


