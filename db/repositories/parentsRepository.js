// ══════════════════════════════════════════════════════════════
// PARENTS REPOSITORY (Data-Access Layer)
// ══════════════════════════════════════════════════════════════

const db = require('../client');

function mapParentRow(r, includePrivate = false) {
  if (!r) return null;
  const p = {
    id: r.id,
    email: r.email,
    phone: r.phone,
    verified: !!r.verified,
    children: db.fromJson(r.children, []),
    pendingChildren: db.fromJson(r.pending_children, []),
    subscriptionTier: r.subscription_tier || 'family_standard',
    studentSubscriptions: db.fromJson(r.student_subscriptions, {}),
    billingCycle: r.billing_cycle,
    tierUpdatedAt: r.tier_updated_at,
    failedLoginAttempts: r.failed_login_attempts || 0,
    lockedUntil: r.locked_until,
    createdAt: r.created_at,
    lastActive: r.last_active
  };

  if (includePrivate) {
    p.familyPinHash = r.family_pin_hash;
    p.verifyToken = r.verify_token;
    p.tokenExpiresAt = r.token_expires_at;
    p.otpHash = r.otp_hash;
    p.otpExpiresAt = r.otp_expires_at;
    p.otpVerified = !!r.otp_verified;
    p.otpRequestCount = r.otp_request_count || 0;
    p.otpCooldownUntil = r.otp_cooldown_until;
  }

  return p;
}

async function createParent(p) {
  await db.query(`
    INSERT INTO parents (
      id, email, phone, family_pin_hash, verified, verify_token,
      token_expires_at, children, pending_children, subscription_tier,
      student_subscriptions, billing_cycle, tier_updated_at, failed_login_attempts,
      locked_until, otp_hash, otp_expires_at, otp_verified, otp_request_count,
      otp_cooldown_until, created_at, last_active
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, $21, $22
    )
  `, [
    p.id,
    p.email || null,
    p.phone || null,
    p.familyPinHash || null,
    p.verified ? 1 : 0,
    p.verifyToken || null,
    p.tokenExpiresAt || null,
    db.toJson(p.children || []),
    db.toJson(p.pendingChildren || []),
    p.subscriptionTier || 'family_standard',
    db.toJson(p.studentSubscriptions || {}),
    p.billingCycle || null,
    p.tierUpdatedAt || null,
    p.failedLoginAttempts || 0,
    p.lockedUntil || null,
    p.otpHash || null,
    p.otpExpiresAt || null,
    p.otpVerified ? 1 : 0,
    p.otpRequestCount || 0,
    p.otpCooldownUntil || null,
    p.createdAt || new Date().toISOString(),
    p.lastActive || new Date().toISOString()
  ]);

  return getParentById(p.id);
}

async function getParentById(id, { includePrivate = false } = {}) {
  if (!id) return null;
  const res = await db.query('SELECT * FROM parents WHERE id = $1', [id]);
  return mapParentRow(res.rows[0], includePrivate);
}

async function getParentByEmail(email, { includePrivate = false } = {}) {
  if (!email) return null;
  const clean = String(email).trim().toLowerCase();
  const res = await db.query('SELECT * FROM parents WHERE LOWER(email) = $1 LIMIT 1', [clean]);
  return mapParentRow(res.rows[0], includePrivate);
}

async function getParentByPhone(phone, { includePrivate = false } = {}) {
  if (!phone) return null;
  const clean = String(phone).trim();
  const res = await db.query('SELECT * FROM parents WHERE phone = $1 LIMIT 1', [clean]);
  return mapParentRow(res.rows[0], includePrivate);
}

async function updateParent(id, fields = {}) {
  const current = await getParentById(id, { includePrivate: true });
  if (!current) throw new Error('Parent not found.');

  const children = fields.children !== undefined ? db.toJson(fields.children) : db.toJson(current.children);
  const pendingChildren = fields.pendingChildren !== undefined ? db.toJson(fields.pendingChildren) : db.toJson(current.pendingChildren);
  const studentSubscriptions = fields.studentSubscriptions !== undefined ? db.toJson(fields.studentSubscriptions) : db.toJson(current.studentSubscriptions);

  await db.query(`
    UPDATE parents
    SET email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        family_pin_hash = COALESCE($4, family_pin_hash),
        verified = COALESCE($5, verified),
        verify_token = COALESCE($6, verify_token),
        token_expires_at = COALESCE($7, token_expires_at),
        children = $8,
        pending_children = $9,
        subscription_tier = COALESCE($10, subscription_tier),
        student_subscriptions = $11,
        billing_cycle = COALESCE($12, billing_cycle),
        tier_updated_at = COALESCE($13, tier_updated_at),
        failed_login_attempts = COALESCE($14, failed_login_attempts),
        locked_until = $15,
        otp_hash = COALESCE($16, otp_hash),
        otp_expires_at = COALESCE($17, otp_expires_at),
        otp_verified = COALESCE($18, otp_verified),
        otp_request_count = COALESCE($19, otp_request_count),
        otp_cooldown_until = COALESCE($20, otp_cooldown_until),
        last_active = COALESCE($21, last_active)
    WHERE id = $1
  `, [
    id,
    fields.email || null,
    fields.phone || null,
    fields.familyPinHash || null,
    fields.verified !== undefined ? (fields.verified ? 1 : 0) : null,
    fields.verifyToken || null,
    fields.tokenExpiresAt || null,
    children,
    pendingChildren,
    fields.subscriptionTier || null,
    studentSubscriptions,
    fields.billingCycle || null,
    fields.tierUpdatedAt || null,
    fields.failedLoginAttempts !== undefined ? fields.failedLoginAttempts : null,
    fields.lockedUntil !== undefined ? fields.lockedUntil : current.lockedUntil,
    fields.otpHash || null,
    fields.otpExpiresAt || null,
    fields.otpVerified !== undefined ? (fields.otpVerified ? 1 : 0) : null,
    fields.otpRequestCount !== undefined ? fields.otpRequestCount : null,
    fields.otpCooldownUntil || null,
    fields.lastActive || new Date().toISOString()
  ]);

  return getParentById(id, { includePrivate: !!fields.includePrivate });
}

async function getAllParents() {
  const res = await db.query('SELECT * FROM parents ORDER BY created_at DESC');
  return res.rows.map(r => mapParentRow(r, false));
}

async function upsertParent(p) {
  const existing = p.id ? await getParentById(p.id) : (p.email ? await getParentByEmail(p.email) : null);
  if (existing) {
    return updateParent(existing.id, p);
  }
  const id = p.id || 'prt_' + require('crypto').randomBytes(6).toString('hex');
  return createParent({ ...p, id });
}

function getParentByIdSync(id, { includePrivate = false } = {}) {
  if (!id) return null;
  const res = db.querySync('SELECT * FROM parents WHERE id = $1', [id]);
  return mapParentRow(res.rows[0], includePrivate);
}

function getParentByEmailSync(email, { includePrivate = false } = {}) {
  if (!email) return null;
  const clean = String(email).trim().toLowerCase();
  const res = db.querySync('SELECT * FROM parents WHERE LOWER(email) = $1 LIMIT 1', [clean]);
  return mapParentRow(res.rows[0], includePrivate);
}

module.exports = {
  createParent,
  getParentById,
  findById: getParentById,
  getParentByIdSync,
  findByIdSync: getParentByIdSync,
  getParentByEmail,
  findByEmail: getParentByEmail,
  getParentByEmailSync,
  findByEmailSync: getParentByEmailSync,
  getParentByPhone,
  updateParent,
  upsertParent,
  upsert: upsertParent,
  getAllParents,
  findAll: getAllParents
};
