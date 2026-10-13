// ════════════════════════════════════════════════════════════
// ELINGU EMAIL SERVICE — Nodemailer (Gmail/SMTP) & Resend
// Free transactional emails with zero domain lock-in
// ════════════════════════════════════════════════════════════

const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const FROM_NAME = process.env.EMAIL_FROM_NAME || process.env.RESEND_FROM_NAME || 'Elingu';

// ── PROVIDER 1: Nodemailer (Gmail / Custom SMTP) ─────────────
// 100% FREE, up to 500 emails/day, no domain required!
const SMTP_USER = process.env.SMTP_USER || process.env.GMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';

let smtpTransporter = null;
if (SMTP_USER && SMTP_PASS) {
  const isGmail = (SMTP_HOST === 'smtp.gmail.com') || (SMTP_USER && SMTP_USER.endsWith('@gmail.com'));
  const transportConfig = isGmail
    ? {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Port 587 uses STARTTLS
        family: 4,     // Force IPv4 only (prevents ENETUNREACH in Linux cloud containers)
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
      }
    : {
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465 || SMTP_SECURE,
        family: 4,     // Force IPv4 only
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
      };

  smtpTransporter = nodemailer.createTransport(transportConfig);
  console.log(`📧 [emailService] Active provider: Nodemailer (${isGmail ? 'Gmail Service' : SMTP_HOST}: ${SMTP_USER})`);
}

// ── PROVIDER 0: Brevo REST API (HTTPS port 443 — Cloud Safe, 300 free/day) ──
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER || 'elingukenya@gmail.com';
const BREVO_SENDER_NAME = process.env.EMAIL_FROM_NAME || 'Elingu';

if (BREVO_API_KEY) {
  console.log(`📧 [emailService] Active provider: Brevo REST API (${BREVO_SENDER_EMAIL})`);
}

// ── PROVIDER 2: Resend API (Secondary / Fallback) ────────────
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const RESEND_FROM = `${FROM_NAME} <${process.env.RESEND_FROM || 'onboarding@resend.dev'}>`;
const DEV_FALLBACK_EMAIL = process.env.RESEND_DEV_FALLBACK_EMAIL || 'mutwirijamesbarn@gmail.com';
const IS_RESEND_SANDBOX = (process.env.RESEND_FROM || '').includes('resend.dev');

if (!BREVO_API_KEY && !smtpTransporter && resend) {
  console.log(`📧 [emailService] Active provider: Resend API (${process.env.RESEND_FROM || 'onboarding@resend.dev'})`);
} else if (!BREVO_API_KEY && !smtpTransporter && !resend) {
  console.warn('⚠️ [emailService] No SMTP, Brevo, or Resend credentials configured. Running in simulated console mode.');
}

function logSimulatedEmail(to, subject, extra = '') {
  console.log('\n┌────────────────────────────────────────────────────────┐');
  console.log('│ 📧 [SIMULATED EMAIL] Dev/No-Key Mode                   │');
  console.log(`│ To:      ${String(to || '').slice(0, 45).padEnd(46)}│`);
  console.log(`│ Subject: ${String(subject || '').slice(0, 45).padEnd(46)}│`);
  if (extra) {
    console.log(`│ Info:    ${String(extra || '').slice(0, 45).padEnd(46)}│`);
  }
  console.log('└────────────────────────────────────────────────────────┘\n');
}

async function sendViaEmail({ to, subject, html, actionLink = null, description = 'Email' }) {
  if (!to) return { success: false, error: 'Recipient email required' };
  const cleanTo = to.trim().toLowerCase();

  // Airtight Test & Simulation Guard: Never hit external providers (Brevo, SMTP, Resend) for tests or mock domains
  const isTestDomain = /(@example\.com$|\.test$|\.local$|dummy|testfamily|mock|fixture)/i.test(cleanTo);
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.DISABLE_EXTERNAL_EMAIL === 'true';
  if (isTestDomain || isTestEnv) {
    logSimulatedEmail(to, subject, isTestEnv ? 'Test environment (mock dispatch)' : 'Test recipient domain');
    return { success: true, id: `mock_${Date.now()}`, provider: 'simulated' };
  }

  let lastError = null;

  // 1. Try Brevo REST API first if configured (HTTPS port 443, never blocked by cloud firewalls, sends to any recipient)
  if (BREVO_API_KEY) {
    try {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
          to: [{ email: to }],
          subject,
          htmlContent: html
        })
      });

      const brevoData = await brevoRes.json().catch(() => ({}));
      if (brevoRes.ok) {
        console.log(`✅ [emailService:Brevo] ${description} delivered to <${to}>:`, brevoData.messageId);
        return { success: true, id: brevoData.messageId, provider: 'brevo' };
      } else {
        lastError = brevoData.message || `Brevo HTTP ${brevoRes.status}`;
        console.error(`❌ [emailService:Brevo] Rejected "${subject}" to <${to}>:`, lastError);
      }
    } catch (brevoErr) {
      lastError = brevoErr.message;
      console.error(`❌ [emailService:Brevo] Network exception for ${description}:`, brevoErr.message);
    }
  }

  // 2. Try Nodemailer SMTP if credentials are present
  if (smtpTransporter) {
    try {
      const fromHeader = `"${FROM_NAME}" <${SMTP_USER}>`;
      const info = await smtpTransporter.sendMail({
        from: fromHeader,
        to,
        subject,
        html
      });
      console.log(`✅ [emailService:SMTP] ${description} delivered to <${to}>:`, info.messageId);
      return { success: true, id: info.messageId, provider: 'smtp' };
    } catch (smtpErr) {
      lastError = smtpErr.message;
      console.error(`❌ [emailService:SMTP] Failed to send via SMTP to <${to}>:`, smtpErr.message);
      // Fall through to Resend if available
    }
  }

  // 2. Try Resend if available
  if (resend) {
    try {
      const result = await resend.emails.send({
        from: RESEND_FROM,
        to,
        subject,
        html
      });

      if (result && result.error) {
        lastError = result.error.message;
        console.error(`❌ [emailService:Resend] Rejected "${subject}" to <${to}>:`, result.error.message);

        // Handle Resend Free Sandbox restriction:
        if (result.error.statusCode === 403 || result.error.name === 'validation_error') {
          console.log('\n┌────────────────────────────────────────────────────────────────────────┐');
          console.log('│ ⚠️  RESEND SANDBOX RESTRICTION DETECTED                                │');
          console.log(`│ Recipient: ${String(to).slice(0, 58).padEnd(60)}│`);
          console.log('│ Reason: In sandbox mode (onboarding@resend.dev), Resend only delivers │');
          console.log(`│ to the registered account owner (${DEV_FALLBACK_EMAIL}).             │`);
          if (actionLink) {
            console.log('│                                                                        │');
            console.log('│ 🔗 ONE-CLICK ACTION LINK (Use this in browser to continue):            │');
            console.log(`│ ${String(actionLink).slice(0, 70).padEnd(71)}│`);
          }
          console.log('└────────────────────────────────────────────────────────────────────────┘\n');

          if (to.toLowerCase() !== DEV_FALLBACK_EMAIL.toLowerCase()) {
            console.log(`📨 [emailService] Re-routing sandbox email to developer account <${DEV_FALLBACK_EMAIL}>...`);
            try {
              const devResult = await resend.emails.send({
                from: RESEND_FROM,
                to: DEV_FALLBACK_EMAIL,
                subject: `[SANDBOX FOR ${to}] ${subject}`,
                html: `
                  <div style="background:#FFFBEB; border:1px solid #FDE68A; padding:14px; margin-bottom:18px; border-radius:8px; font-family:-apple-system, sans-serif; font-size:13px; color:#92400E; line-height:1.5;">
                    <strong>⚠️ Resend Sandbox Mode Notice:</strong><br>
                    This transactional email was generated for <strong>${to}</strong>.<br>
                    Because Resend is currently in sandbox testing mode (<code>${RESEND_FROM}</code>), it can only be delivered to your verified developer address (<code>${DEV_FALLBACK_EMAIL}</code>).<br>
                    To send directly to actual parents for free without buying a domain, configure <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> in your .env file!
                  </div>
                  ${html}
                `
              });
              if (devResult && devResult.data) {
                console.log(`✅ [emailService] Delivered sandbox copy to developer <${DEV_FALLBACK_EMAIL}> (ID: ${devResult.data.id})`);
                return { success: true, id: devResult.data.id, redirectedToDev: true, actionLink, provider: 'resend-sandbox' };
              }
            } catch (devErr) {
              console.warn('[emailService] Sandbox dev fallback error:', devErr.message);
            }
          }
        }

        return { success: false, error: result.error.message, actionLink };
      }

      console.log(`✅ [emailService:Resend] ${description} delivered to <${to}>:`, result?.data?.id);
      return { success: true, id: result?.data?.id, provider: 'resend' };
    } catch (err) {
      lastError = err.message;
      console.error(`❌ [emailService:Resend] Network/SDK exception for ${description}:`, err.message);
      return { success: false, error: err.message, actionLink };
    }
  }

  // 3. Fallback to simulated console mode
  logSimulatedEmail(to, subject, actionLink);
  return { success: !lastError, simulated: true, actionLink, provider: 'simulated', error: lastError };
}

// Alias for backwards compatibility
const sendViaResend = sendViaEmail;

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

  return sendViaResend({
    to: parentEmail,
    subject: `🌳 Activate ${childHandle}'s Elingu account`,
    html,
    actionLink: link,
    description: `First-child verification for ${childHandle}`
  });
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

  return sendViaResend({
    to: parentEmail,
    subject: `👤 Does ${childHandle} belong to your family? — Elingu`,
    html,
    actionLink: link,
    description: `Child approval for ${childHandle}`
  });
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

  return sendViaResend({
    to: parentEmail,
    subject: `🔐 Your Elingu Verification Code`,
    html,
    actionLink: null,
    description: `OTP code for ${parentEmail}`
  });
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

  return sendViaResend({
    to: recipientEmail,
    subject: `🔑 ${otpCode} is your Elingu PIN reset code`,
    html,
    actionLink: null,
    description: `Student OTP for ${studentHandle}`
  });
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

  return sendViaResend({
    to: parentEmail,
    subject: `🛡️ Security Notice: ${childHandle}'s Elingu PIN was reset`,
    html,
    actionLink: null,
    description: `Parent PIN reset alert for ${childHandle}`
  });
}

async function sendParentNotification(parentEmail, subject, html) {
  return sendViaResend({
    to: parentEmail,
    subject: subject || 'Notification from Elingu',
    html,
    actionLink: null,
    description: `Parent notification`
  });
}

async function sendParentUpgradeRequestEmail({ parentEmail, childHandle, requestedSubject, pathway }) {
  const portalUrl = `${BASE_URL}/parent/portal?email=${encodeURIComponent(parentEmail)}&tab=billing`;
  const subjectName = requestedSubject || 'an extra subject';
  const pathwayText = pathway ? ` in the ${pathway} pathway` : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${childHandle} requested to unlock ${subjectName}</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: visible;">
          <tr>
            <td align="center" style="background-color: #0D3A26; background: linear-gradient(135deg, #0D3A26 0%, #064E3B 100%); padding: 36px 24px; border-top-left-radius: 15px; border-top-right-radius: 15px;">
              <span style="font-size: 32px; line-height: 1;">🌟 🎒</span>
              <h1 style="color: #FFFFFF; margin: 8px 0 4px 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">Elingu</h1>
              <p style="color: #6EE7B7; margin: 0; font-size: 13px; font-weight: 500; letter-spacing: 0.5px;">LEARNER SUBJECT REQUEST</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h2 style="color: #0F172A; font-size: 20px; font-weight: 700; margin: 0 0 16px 0; line-height: 1.3;">
                ${childHandle} wants to explore more subjects! 🚀
              </h2>
              <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                Your learner <strong style="color: #0D3A26; font-size: 16px;">${childHandle}</strong> requested to unlock <strong>${subjectName}</strong>${pathwayText} on Elingu.
              </p>
              <div style="background-color: #F0FDF4; border: 1px solid #86EFAC; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
                <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.5;">
                  💡 <strong>Did you know?</strong> With Elingu Premium, ${childHandle} gets unlimited access to all CBE subjects, interactive STEM labs, and personalized Socratic revision turns.
                </p>
              </div>
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                You can review your plan and unlock all subjects for ${childHandle} securely via M-PESA anytime from your Parent Portal:
              </p>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${portalUrl}" style="display: inline-block; background-color: #00C896; color: #0D3A26; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(0, 200, 150, 0.3);">
                      View Parent Portal &amp; Unlock 🔓
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #94A3B8; font-size: 12px; line-height: 1.5; margin: 24px 0 0 0; text-align: center;">
                No immediate action required. ${childHandle} can continue learning with their chosen free subjects!
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

  return sendViaResend({
    to: parentEmail,
    subject: `🌟 ${childHandle} would like to unlock ${subjectName} on Elingu!`,
    html,
    actionLink: portalUrl,
    description: `Subject unlock request for ${childHandle}`
  });
}

function getActiveProvider() {
  if (BREVO_API_KEY) return 'brevo';
  if (smtpTransporter) return 'smtp';
  if (resend) return 'resend';
  return 'simulated';
}

module.exports = {
  getActiveProvider,
  sendFirstChildVerificationEmail,
  sendChildApprovalEmail,
  sendOTPEmail,
  sendStudentOTPEmail,
  sendParentPinChangedAlert,
  sendParentNotification,
  sendParentUpgradeRequestEmail
};


