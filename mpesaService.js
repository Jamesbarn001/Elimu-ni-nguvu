// ════════════════════════════════════════════════════════════
// ELINGU M-PESA SERVICE — Safaricom Daraja STK Push Integration
// Direct Lipa Na M-Pesa Online (Express) prompt dispatch & callback
// ════════════════════════════════════════════════════════════

const https = require('https');
const authUtils = require('./authUtils');

const DARAJA_ENV = (process.env.DARAJA_ENVIRONMENT || 'sandbox').toLowerCase();
const DARAJA_BASE_URL = DARAJA_ENV === 'production'
  ? 'api.safaricom.co.ke'
  : 'sandbox.safaricom.co.ke';

const CONSUMER_KEY = process.env.DARAJA_CONSUMER_KEY || '';
const CONSUMER_SECRET = process.env.DARAJA_CONSUMER_SECRET || '';
const BUSINESS_SHORTCODE = process.env.DARAJA_BUSINESS_SHORTCODE || '174379';
const PASSKEY = process.env.DARAJA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
const CALLBACK_URL = process.env.DARAJA_CALLBACK_URL || `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/payment/mpesa-callback`;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getDarajaToken() {
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    return null;
  }

  if (cachedToken && Date.now() < (tokenExpiresAt - 60000)) {
    return cachedToken;
  }

  return new Promise((resolve) => {
    const authHeader = 'Basic ' + Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
    const req = https.request({
      hostname: DARAJA_BASE_URL,
      path: '/oauth/v1/generate?grant_type=client_credentials',
      method: 'GET',
      headers: { 'Authorization': authHeader }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.access_token) {
            cachedToken = data.access_token;
            const expiresIn = parseInt(data.expires_in, 10) || 3599;
            tokenExpiresAt = Date.now() + (expiresIn * 1000);
            resolve(cachedToken);
          } else {
            console.warn('[Daraja] Failed to obtain token:', body);
            resolve(null);
          }
        } catch (e) {
          console.error('[Daraja] Token parse error:', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Daraja] Token network error:', err.message);
      resolve(null);
    });

    req.end();
  });
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function initiateSTKPush({ phone, amount, accountReference = 'Elingu', transactionDesc = 'Elingu Subscription' }) {
  let norm = authUtils.normalizeKenyanPhone(phone);
  if (!norm) {
    return { success: false, error: 'Invalid Kenyan phone number format.' };
  }
  const cleanMsisdn = norm.replace(/^\+/, '');

  const token = await getDarajaToken();

  if (!token) {
    console.log('\n┌──────────────────────────────────────────────────────────────┐');
    console.log('│ 📲 [M-PESA STK PUSH SIMULATION]                              │');
    console.log(`│ To:         +${cleanMsisdn}                                    │`);
    console.log(`│ Amount:     KES ${amount}                                           │`);
    console.log(`│ Reference:  ${accountReference}                                     │`);
    console.log('│ Note: Set DARAJA_CONSUMER_KEY & DARAJA_CONSUMER_SECRET in    │');
    console.log('│       .env to trigger real live prompt on this handset.      │');
    console.log('└──────────────────────────────────────────────────────────────┘\n');

    return {
      success: true,
      simulated: true,
      checkoutRequestId: 'ws_CO_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6).toUpperCase(),
      transactionRef: 'MP' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      phone: cleanMsisdn,
      amount,
      currency: 'KES',
      message: `M-Pesa prompt sent to ${cleanMsisdn}. Enter M-Pesa PIN on your phone to approve KES ${amount}.`
    };
  }

  const timestamp = getTimestamp();
  const password = Buffer.from(`${BUSINESS_SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: BUSINESS_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.max(1, Math.round(amount)),
    PartyA: cleanMsisdn,
    PartyB: BUSINESS_SHORTCODE,
    PhoneNumber: cleanMsisdn,
    CallBackURL: CALLBACK_URL,
    AccountReference: accountReference.slice(0, 12),
    TransactionDesc: transactionDesc.slice(0, 13)
  };

  const postData = JSON.stringify(payload);

  return new Promise((resolve) => {
    const req = https.request({
      hostname: DARAJA_BASE_URL,
      path: '/mpesa/stkpush/v1/processrequest',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.ResponseCode === '0') {
            console.log(`[Daraja] STK Push sent successfully to +${cleanMsisdn} (CheckoutRequestId: ${data.CheckoutRequestID})`);
            resolve({
              success: true,
              simulated: false,
              checkoutRequestId: data.CheckoutRequestID,
              merchantRequestId: data.MerchantRequestID,
              phone: cleanMsisdn,
              amount,
              currency: 'KES',
              message: data.CustomerMessage || `STK Push prompt sent to ${cleanMsisdn}. Enter your PIN to complete.`
            });
          } else {
            console.error('[Daraja] STK Push error response:', data);
            resolve({
              success: false,
              error: data.errorMessage || data.ResponseDescription || 'M-Pesa prompt failed. Please check the number.'
            });
          }
        } catch (e) {
          console.error('[Daraja] Parse error on STK response:', body);
          resolve({ success: false, error: 'Invalid response from Safaricom.' });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[Daraja] Network error:', err.message);
      resolve({ success: false, error: 'Could not connect to Safaricom network.' });
    });

    req.write(postData);
    req.end();
  });
}

module.exports = {
  initiateSTKPush,
  getDarajaToken
};
