// ════════════════════════════════════════════════════════════
// ELINGU AUTH UTILITIES — Shared Authentication Helpers
// PIN strength validation, OTP generation, bcrypt wrappers,
// login lockout logic, and weak PIN blocklists
// ════════════════════════════════════════════════════════════

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 10;

// ── PIN / PASSWORD STRENGTH ─────────────────────────────────

// Common weak passwords (parents & teachers)
const WEAK_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234',
  '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyui',
  'abcdefgh', 'abcd1234', 'abc12345', 'letmein1', 'welcome1',
  'iloveyou', 'trustno1', 'sunshine1', 'princess1', 'football1',
  'monkey123', 'shadow12', 'master12', 'dragon12', 'michael1',
  'elingu123', 'elingu1234', 'teacher1', 'teacher123', 'parent123',
  'admin123', 'admin1234', 'school123', 'kenya123', 'nairobi1',
  'changeme', 'changeme1', 'temppass1', 'welcome123', 'letmein123',
  '11111111', '22222222', '00000000', 'aaaaaaaa', 'asdfghjk',
]);

// Weak 4-digit PINs (students)
const WEAK_4_DIGIT_PINS = new Set([
  '1234', '4321', '2345', '3456', '4567', '5678', '6789', '7890',
  '0123', '9876', '8765', '7654', '6543', '5432',
  '1111', '2222', '3333', '4444', '5555',
  '6666', '7777', '8888', '9999', '0000',
  '1212', '1122', '2121', '1221', '2112',
  '1010', '2020', '6969', '1313',
]);

/**
 * Validate a parent/teacher password for strength.
 * Rules: min 8 chars, max 64 chars, must contain at least 1 letter AND 1 number.
 * @param {string} password - The password to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePassword(password) {
  const clean = String(password || '').trim();
  if (clean.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (clean.length > 64) {
    return { valid: false, error: 'Password cannot exceed 64 characters.' };
  }
  if (!/[a-zA-Z]/.test(clean)) {
    return { valid: false, error: 'Password must contain at least one letter (a-z or A-Z).' };
  }
  if (!/[0-9]/.test(clean)) {
    return { valid: false, error: 'Password must contain at least one number (0-9).' };
  }
  if (WEAK_PASSWORDS.has(clean.toLowerCase())) {
    return { valid: false, error: 'This password is too common and easy to guess. Please choose something more unique.' };
  }
  // Check for all-same character
  if (new Set(clean.split('')).size <= 2) {
    return { valid: false, error: 'Password is too simple. Use a mix of different characters.' };
  }
  return { valid: true };
}

/**
 * Validate a 4-digit student PIN for strength.
 * @param {string} pin - The PIN to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateStudentPin(pin) {
  const clean = String(pin || '').trim();
  if (!/^\d{4}$/.test(clean)) {
    return { valid: false, error: 'Student PIN must be exactly 4 numeric digits.' };
  }
  if (new Set(clean.split('')).size === 1) {
    return { valid: false, error: 'PIN cannot be all the same digit. Try mixing your numbers!' };
  }
  if (WEAK_4_DIGIT_PINS.has(clean)) {
    return { valid: false, error: 'This PIN is too easy to guess. Avoid patterns like 1234 or 1111. Pick 4 digits that are special to you!' };
  }
  let ascending = true, descending = true;
  for (let i = 1; i < clean.length; i++) {
    if (parseInt(clean[i]) !== parseInt(clean[i - 1]) + 1) ascending = false;
    if (parseInt(clean[i]) !== parseInt(clean[i - 1]) - 1) descending = false;
  }
  if (ascending || descending) {
    return { valid: false, error: 'PIN cannot be a simple sequence like 1234 or 4321. Mix up your digits!' };
  }
  return { valid: true };
}

// ── BCRYPT HASHING ──────────────────────────────────────────

/**
 * Hash a PIN/password using bcrypt with random salt.
 * @param {string} plaintext
 * @returns {Promise<string>} bcrypt hash
 */
async function hashCredential(plaintext) {
  return bcrypt.hash(String(plaintext), BCRYPT_ROUNDS);
}

/**
 * Synchronous version for migration/startup contexts.
 */
function hashCredentialSync(plaintext) {
  return bcrypt.hashSync(String(plaintext), BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext PIN/password against a stored hash.
 * Supports both bcrypt hashes (start with '$2') and legacy SHA-256 hashes.
 * @param {string} plaintext
 * @param {string} storedHash
 * @param {string} legacySalt - Salt used in old SHA-256 hashing
 * @returns {Promise<boolean>}
 */
async function verifyCredential(plaintext, storedHash, legacySalt) {
  if (!storedHash || !plaintext) return false;
  // Detect bcrypt hash (starts with $2a$, $2b$, or $2y$)
  if (storedHash.startsWith('$2')) {
    return bcrypt.compare(String(plaintext), storedHash);
  }
  // Legacy SHA-256 fallback for existing accounts
  const legacyHash = crypto.createHash('sha256')
    .update(String(plaintext) + legacySalt)
    .digest('hex');
  return storedHash === legacyHash;
}

/**
 * Check if a hash is legacy (SHA-256) and needs migration to bcrypt.
 */
function isLegacyHash(hash) {
  if (!hash) return false;
  return !hash.startsWith('$2');
}

// ── OTP GENERATION & VERIFICATION ───────────────────────────

/**
 * Generate a cryptographically random 6-digit OTP.
 * @returns {string} 6-digit string
 */
function generateOTP() {
  // Generate random number 0-999999, pad to 6 digits
  const num = crypto.randomInt(0, 1000000);
  return String(num).padStart(6, '0');
}

/**
 * Hash an OTP for safe storage (we don't store OTPs in plaintext).
 * Uses SHA-256 since OTPs are short-lived and rate-limited.
 */
function hashOTP(otp) {
  return crypto.createHash('sha256')
    .update(String(otp) + 'elingu_otp_salt_2026')
    .digest('hex');
}

/**
 * Verify an OTP against a stored hash.
 */
function verifyOTP(otp, storedHash) {
  if (!otp || !storedHash) return false;
  return hashOTP(otp) === storedHash;
}

// ── PHONE NORMALIZATION (KENYA) ────────────────────────────

/**
 * Normalize a Kenyan phone number to E.164 (+254...).
 * Accepts 07..., 01..., 254..., +254...
 * Returns normalized string or null if invalid.
 */
function normalizeKenyanPhone(phone) {
  if (!phone) return null;
  let clean = String(phone).trim().replace(/[^0-9+]/g, '');
  if (clean.startsWith('+254')) clean = clean.slice(1);
  if (clean.startsWith('254') && clean.length === 12) {
    return '+' + clean;
  }
  if (clean.startsWith('0') && clean.length === 10) {
    return '+254' + clean.slice(1);
  }
  if ((clean.startsWith('7') || clean.startsWith('1')) && clean.length === 9) {
    return '+254' + clean;
  }
  return null;
}

// ── LOGIN LOCKOUT ───────────────────────────────────────────

const PARENT_MAX_ATTEMPTS = 5;
const PARENT_LOCKOUT_MINUTES = 15; // Updated to 15 minutes
const STUDENT_MAX_ATTEMPTS = 5;
const STUDENT_LOCKOUT_MINUTES = 10; // Updated to 10 minutes
const OTP_MAX_ATTEMPTS = 3;
const OTP_COOLDOWN_MINUTES = 15;
const OTP_TTL_MINUTES = 10;

/**
 * Check if an account is currently locked out.
 * @param {object} record - The parent or student record
 * @returns {{ locked: boolean, minutesRemaining?: number }}
 */
function checkLockout(record) {
  if (!record || !record.lockedUntil) return { locked: false };
  const lockExpiry = new Date(record.lockedUntil);
  const now = new Date();
  if (now < lockExpiry) {
    const minutesRemaining = Math.ceil((lockExpiry - now) / (60 * 1000));
    return { locked: true, minutesRemaining };
  }
  // Lockout expired — clear it
  return { locked: false, expired: true };
}

const TEACHER_MAX_ATTEMPTS = 5;
const TEACHER_LOCKOUT_MINUTES = 15;

/**
 * Record a failed login attempt and potentially trigger lockout.
 * @param {object} record - The parent, teacher, or student record (mutated in place)
 * @param {string} type - 'parent', 'teacher', or 'student'
 * @returns {{ locked: boolean, attemptsRemaining?: number }}
 */
function recordFailedAttempt(record, type = 'parent') {
  const isPrivileged = type === 'parent' || type === 'teacher';
  const maxAttempts = isPrivileged ? PARENT_MAX_ATTEMPTS : STUDENT_MAX_ATTEMPTS;
  const lockoutMinutes = isPrivileged ? PARENT_LOCKOUT_MINUTES : STUDENT_LOCKOUT_MINUTES;

  record.failedLoginAttempts = (record.failedLoginAttempts || 0) + 1;

  if (record.failedLoginAttempts >= maxAttempts) {
    record.lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000).toISOString();
    return { locked: true, attemptsRemaining: 0 };
  }

  return { locked: false, attemptsRemaining: maxAttempts - record.failedLoginAttempts };
}

/**
 * Clear failed attempts after successful login.
 */
function clearFailedAttempts(record) {
  record.failedLoginAttempts = 0;
  record.lockedUntil = null;
}

/**
 * Check if OTP requests are on cooldown.
 */
function checkOTPCooldown(record) {
  if (!record.otpCooldownUntil) return { coolingDown: false };
  const cooldownExpiry = new Date(record.otpCooldownUntil);
  if (new Date() < cooldownExpiry) {
    const minutesRemaining = Math.ceil((cooldownExpiry - new Date()) / (60 * 1000));
    return { coolingDown: true, minutesRemaining };
  }
  return { coolingDown: false };
}

/**
 * Record an OTP request and check if cooldown should trigger.
 */
function recordOTPRequest(record) {
  record.otpRequestCount = (record.otpRequestCount || 0) + 1;
  if (record.otpRequestCount >= OTP_MAX_ATTEMPTS) {
    record.otpCooldownUntil = new Date(Date.now() + OTP_COOLDOWN_MINUTES * 60 * 1000).toISOString();
    record.otpRequestCount = 0;
    return { coolingDown: true };
  }
  return { coolingDown: false };
}

/**
 * Store OTP data on a record.
 */
function storeOTPOnRecord(record, otp) {
  record.otpHash = hashOTP(otp);
  record.otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  record.otpVerified = false;
}

/**
 * Verify OTP from a record and mark as verified.
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyOTPFromRecord(record, otp) {
  if (!record.otpHash || !record.otpExpiresAt) {
    return { valid: false, error: 'No verification code (OTP) has been requested. Please request a new code first.' };
  }
  if (new Date() > new Date(record.otpExpiresAt)) {
    record.otpHash = null;
    record.otpExpiresAt = null;
    return { valid: false, error: 'This verification code has expired. Please request a new one.' };
  }
  if (!verifyOTP(otp, record.otpHash)) {
    return { valid: false, error: 'Incorrect verification code. Please check and try again.' };
  }
  // Mark as verified — single use
  record.otpVerified = true;
  record.otpHash = null;
  record.otpExpiresAt = null;
  return { valid: true };
}

// ══════════════════════════════════════════════════════════════
// TEACHER TOKEN AUTHENTICATION & MULTI-LAYER SANITIZATION
// ══════════════════════════════════════════════════════════════

const TEACHER_TOKEN_SECRET = process.env.SESSION_SECRET || 'REDACTED_SECRET';
const TEACHER_TOKEN_TTL_HOURS = 24;

/**
 * Generate a cryptographically signed HMAC token for teacher session authentication
 */
function generateTeacherToken(teacher) {
  if (!teacher || !teacher.id) return null;
  const payload = {
    id: teacher.id,
    role: teacher.role,
    schoolId: teacher.schoolId,
    assignments: teacher.assignments || [],
    ...(teacher.grade !== undefined ? { grade: teacher.grade } : {}),
    ...(teacher.stream !== undefined ? { stream: teacher.stream } : {}),
    exp: Date.now() + (TEACHER_TOKEN_TTL_HOURS * 60 * 60 * 1000)
  };
  const jsonStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', TEACHER_TOKEN_SECRET).update(jsonStr).digest('base64url');
  return `${jsonStr}.${signature}`;
}

/**
 * Verify HMAC token and return decoded teacher payload if valid and unexpired
 */
function verifyTeacherToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [jsonStr, signature] = parts;

  const expectedSig = crypto.createHmac('sha256', TEACHER_TOKEN_SECRET).update(jsonStr).digest('base64url');
  
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
  } catch (e) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(jsonStr, 'base64url').toString('utf8'));
    if (!payload || !payload.id || !payload.exp) return null;
    if (Date.now() > payload.exp) return null; // Expired
    return payload;
  } catch (e) {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// SUPER ADMIN TOKEN AUTHENTICATION
// ══════════════════════════════════════════════════════════════

const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || process.env.SUPERADMIN_SECRET_KEY || 'REDACTED_SECRET';
const ADMIN_TOKEN_TTL_HOURS = 12;

/**
 * Generate a cryptographically signed HMAC token for Super Admin session authentication
 */
function generateAdminToken(admin) {
  if (!admin || !admin.id) return null;
  const payload = {
    id: admin.id,
    email: admin.email,
    role: admin.role || 'super_admin',
    name: admin.name || 'Platform Admin',
    exp: Date.now() + (ADMIN_TOKEN_TTL_HOURS * 60 * 60 * 1000)
  };
  const jsonStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(jsonStr).digest('base64url');
  return `${jsonStr}.${signature}`;
}

/**
 * Verify HMAC token and return decoded admin payload if valid and unexpired
 */
function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [jsonStr, signature] = parts;

  const expectedSig = crypto.createHmac('sha256', ADMIN_TOKEN_SECRET).update(jsonStr).digest('base64url');
  
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
  } catch (e) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(jsonStr, 'base64url').toString('utf8'));
    if (!payload || !payload.id || !payload.exp) return null;
    if (Date.now() > payload.exp) return null; // Expired
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Strict Defense-in-Depth HTML Entity Sanitizer to prevent XSS in reports and UI
 */
function sanitizeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/`/g, '&#x60;');
}

module.exports = {
  // Password & PIN strength
  validatePassword,
  validateStudentPin,
  normalizeKenyanPhone,
  WEAK_PASSWORDS,
  WEAK_4_DIGIT_PINS,
  // Bcrypt
  hashCredential,
  hashCredentialSync,
  verifyCredential,
  isLegacyHash,
  // OTP
  generateOTP,
  hashOTP,
  verifyOTP,
  storeOTPOnRecord,
  verifyOTPFromRecord,
  // Lockout
  checkLockout,
  recordFailedAttempt,
  clearFailedAttempts,
  checkOTPCooldown,
  recordOTPRequest,
  // Teacher Session Auth
  generateTeacherToken,
  verifyTeacherToken,
  // Super Admin Auth
  generateAdminToken,
  verifyAdminToken,
  sanitizeHtml,
  // Constants
  PARENT_MAX_ATTEMPTS,
  PARENT_LOCKOUT_MINUTES,
  STUDENT_MAX_ATTEMPTS,
  STUDENT_LOCKOUT_MINUTES,
  TEACHER_MAX_ATTEMPTS,
  TEACHER_LOCKOUT_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_COOLDOWN_MINUTES,
  OTP_TTL_MINUTES,
};
