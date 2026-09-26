// ════════════════════════════════════════════════════════════
// ELINGU SMS SERVICE — Africa's Talking Integration (Kenya)
// Most cost-effective (KES 0.80/SMS), highest delivery in Kenya
// Native HTTPS implementation with automatic local/dev fallback
// ════════════════════════════════════════════════════════════

const https = require('https');
const querystring = require('querystring');
const authUtils = require('./authUtils');

const AT_USERNAME = process.env.AFRICASTALKING_USERNAME || 'sandbox';
const AT_API_KEY = process.env.AFRICASTALKING_API_KEY || '';
const AT_SENDER_ID = process.env.AFRICASTALKING_SENDER_ID || ''; // Optional Alphanumeric Sender ID (e.g. ELINGU)

/**
 * Send an SMS message using Africa's Talking API.
 * Falls back to console simulation if API key is not configured.
 * @param {string} to - Destination phone number (07..., 01..., or +254...)
 * @param {string} message - Message body
 * @returns {Promise<{ success: boolean, simulated?: boolean, id?: string, error?: string }>}
 */
async function sendSMS({ to, message }) {
  const normalizedTo = authUtils.normalizeKenyanPhone(to);
  if (!normalizedTo) {
    return { success: false, error: 'Invalid Kenyan phone number format.' };
  }

  // If no API key is set, log to console (development / test mode)
  if (!AT_API_KEY) {
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│ 📱 [SIMULATED SMS] Africa\'s Talking (Local Dev Mode)     │');
    console.log(`│ To:      ${normalizedTo.padEnd(46)}│`);
    console.log(`│ Message: ${message.slice(0, 44).padEnd(46)}│`);
    if (message.length > 44) {
      console.log(`│          ${message.slice(44).padEnd(46)}│`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');
    return { success: true, simulated: true, to: normalizedTo };
  }

  const isSandbox = AT_USERNAME.toLowerCase() === 'sandbox';
  const hostname = isSandbox ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';

  const payload = {
    username: AT_USERNAME,
    to: normalizedTo,
    message: message,
  };
  if (AT_SENDER_ID && !isSandbox) {
    payload.from = AT_SENDER_ID;
  }

  const postData = querystring.stringify(payload);

  return new Promise((resolve) => {
    const options = {
      hostname,
      port: 443,
      path: '/version1/messaging',
      method: 'POST',
      headers: {
        'apiKey': AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const recipients = parsed?.SMSMessageData?.Recipients || [];
          const recipient = recipients[0] || {};
          const status = recipient.status || 'Unknown';
          const success = status === 'Success' || res.statusCode === 201;

          if (success) {
            console.log(`[smsService] SMS sent via Africa's Talking to ${normalizedTo} (cost: ${recipient.cost || 'KES 0.80'})`);
            resolve({ success: true, id: recipient.messageId, cost: recipient.cost, status });
          } else {
            console.warn(`[smsService] Africa's Talking status: ${status}`, body);
            resolve({ success: false, error: status || 'Delivery failure', raw: body });
          }
        } catch (e) {
          resolve({ success: false, error: 'Unexpected response from Africa\'s Talking', raw: body });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[smsService] Africa\'s Talking network error:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Send an OTP code via SMS
 */
async function sendOTPSMS({ to, otpCode, purpose = 'reset your PIN' }) {
  const message = `Elingu Security: Your verification code is ${otpCode}. Valid for 10 mins. Use this to ${purpose}. Do not share this code.`;
  return sendSMS({ to, message });
}

/**
 * Send a notification to parent when a child's PIN has changed
 */
async function sendParentPinChangedSMS({ parentPhone, childHandle }) {
  const message = `Elingu Notice: Your learner ${childHandle} has reset their 4-digit PIN. If you did not authorize this, please sign in to elingu.app/parent/portal immediately.`;
  return sendSMS({ to: parentPhone, message });
}

module.exports = {
  sendSMS,
  sendOTPSMS,
  sendParentPinChangedSMS,
};
