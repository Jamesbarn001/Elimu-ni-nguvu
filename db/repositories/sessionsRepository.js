// ══════════════════════════════════════════════════════════════
// SESSIONS REPOSITORY (Data-Access Layer)
// ══════════════════════════════════════════════════════════════

const db = require('../client');

function makeSessionKey(studentId, subject) {
  const canon = subject ? String(subject).trim() : 'general';
  return `${studentId}_${canon}`;
}

async function getSession(studentId, subject) {
  const key = makeSessionKey(studentId, subject);
  const res = await db.query('SELECT * FROM sessions WHERE LOWER(session_key) = LOWER($1)', [key]);
  if (!res.rows[0]) {
    return { messages: [], lastUpdated: null };
  }
  return {
    studentId: res.rows[0].student_id,
    subject: res.rows[0].subject,
    messages: db.fromJson(res.rows[0].messages, []),
    lastUpdated: res.rows[0].last_updated
  };
}

async function saveSession(studentId, subject, messages) {
  const key = makeSessionKey(studentId, subject);
  const now = new Date().toISOString();
  const trimmed = (messages || []).slice(-30);

  await db.query(`
    INSERT INTO sessions (session_key, student_id, subject, messages, last_updated)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(session_key) DO UPDATE SET
      messages = EXCLUDED.messages,
      last_updated = EXCLUDED.last_updated
  `, [
    key,
    studentId,
    subject || 'general',
    db.toJson(trimmed),
    now
  ]);

  return { studentId, subject, messages: trimmed, lastUpdated: now };
}

async function getAllSessions() {
  const res = await db.query('SELECT * FROM sessions');
  const result = {};
  for (const r of res.rows) {
    result[r.session_key] = {
      studentId: r.student_id,
      subject: r.subject,
      messages: db.fromJson(r.messages, []),
      lastUpdated: r.last_updated
    };
  }
  return result;
}

function getSessionSync(studentId, subject = 'general') {
  if (!studentId) return null;
  const key = makeSessionKey(studentId, subject);
  const res = db.querySync('SELECT * FROM sessions WHERE LOWER(session_key) = LOWER($1)', [key]);
  if (!res.rows || res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    studentId: r.student_id,
    subject: r.subject,
    messages: db.fromJson(r.messages, []),
    lastUpdated: r.last_updated
  };
}

module.exports = {
  getSession,
  getSessionSync,
  findByStudentId: getSession,
  findByStudentIdSync: getSessionSync,
  saveSession,
  getAllSessions,
  findAll: getAllSessions,
  makeSessionKey
};
