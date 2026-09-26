// ══════════════════════════════════════════════════════════════
// STUDENTS REPOSITORY (Data-Access Layer)
// ══════════════════════════════════════════════════════════════

const db = require('../client');

function mapStudentRow(r, includePrivate = false) {
  if (!r) return null;
  const s = {
    id: r.id,
    handle: r.handle,
    grade: r.grade,
    county: r.county,
    schoolId: r.school_id,
    school: r.school_name,
    stream: r.stream,
    streamJoinCode: r.stream_join_code,
    email: r.email,
    studentEmail: r.student_email,
    studentPhone: r.student_phone,
    parentPhone: r.parent_phone,
    avatar: r.avatar || '🦁',
    age: r.age,
    subscriptionTier: r.subscription_tier || 'free',
    tierUpdatedAt: r.tier_updated_at,
    quests: db.fromJson(r.quests, ['Mathematics', 'Science & Technology', 'English']),
    freeSubjects: db.fromJson(r.free_subjects, ['Mathematics', 'Science & Technology']),
    parentConsent: !!r.parent_consent,
    parentVerified: !!r.parent_verified,
    pilotCode: r.pilot_code,
    pilotType: r.pilot_type,
    pilotCohortName: r.pilot_cohort_name,
    pilotActivatedAt: r.pilot_activated_at,
    pilotExpiresAt: r.pilot_expires_at,
    streak: r.streak || 1,
    totalTurns: r.total_turns || 0,
    dailyTurnsCount: r.daily_turns_count || 0,
    dailyTurnDate: r.daily_turn_date,
    failedLoginAttempts: r.failed_login_attempts || 0,
    lockedUntil: r.locked_until,
    createdAt: r.created_at,
    lastActive: r.last_active
  };

  if (includePrivate) {
    s.pinHash = r.pin_hash;
    s.otpHash = r.otp_hash;
    s.otpExpiresAt = r.otp_expires_at;
    s.otpVerified = !!r.otp_verified;
    s.otpRequestCount = r.otp_request_count || 0;
  }

  return s;
}

async function createStudent(s) {
  await db.query(`
    INSERT INTO students (
      id, handle, grade, county, school_id, school_name, stream,
      stream_join_code, email, student_email, student_phone, parent_phone,
      avatar, age, pin_hash, subscription_tier, tier_updated_at, quests,
      free_subjects, parent_consent, parent_verified, pilot_code, pilot_type,
      pilot_cohort_name, pilot_activated_at, pilot_expires_at, streak,
      total_turns, daily_turns_count, daily_turn_date, failed_login_attempts,
      locked_until, otp_hash, otp_expires_at, otp_verified, otp_request_count,
      created_at, last_active
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
      $29, $30, $31, $32, $33, $34, $35, $36, $37, $38
    )
  `, [
    s.id,
    s.handle,
    parseInt(s.grade) || 7,
    s.county || 'Nairobi',
    s.schoolId || null,
    s.school || s.schoolName || null,
    s.stream || null,
    s.streamJoinCode || null,
    s.email || null,
    s.studentEmail || null,
    s.studentPhone || null,
    s.parentPhone || null,
    s.avatar || '🦁',
    s.age ? parseInt(s.age) : null,
    s.pinHash || null,
    s.subscriptionTier || 'free',
    s.tierUpdatedAt || null,
    db.toJson(s.quests || ['Mathematics', 'Science & Technology', 'English']),
    db.toJson(s.freeSubjects || ['Mathematics', 'Science & Technology']),
    s.parentConsent ? 1 : 0,
    s.parentVerified ? 1 : 0,
    s.pilotCode || null,
    s.pilotType || null,
    s.pilotCohortName || null,
    s.pilotActivatedAt || null,
    s.pilotExpiresAt || null,
    s.streak || 1,
    s.totalTurns || 0,
    s.dailyTurnsCount || 0,
    s.dailyTurnDate || null,
    s.failedLoginAttempts || 0,
    s.lockedUntil || null,
    s.otpHash || null,
    s.otpExpiresAt || null,
    s.otpVerified ? 1 : 0,
    s.otpRequestCount || 0,
    s.createdAt || new Date().toISOString(),
    s.lastActive || new Date().toISOString()
  ]);

  return getStudentById(s.id);
}

async function getStudentById(id, { includePrivate = false } = {}) {
  if (!id) return null;
  const res = await db.query('SELECT * FROM students WHERE id = $1', [id]);
  return mapStudentRow(res.rows[0], includePrivate);
}

async function getStudentByHandle(handle, { includePrivate = false } = {}) {
  if (!handle) return null;
  const clean = String(handle).trim().toLowerCase();
  const res = await db.query('SELECT * FROM students WHERE LOWER(handle) = $1 LIMIT 1', [clean]);
  return mapStudentRow(res.rows[0], includePrivate);
}

async function getStudentsByStream(schoolId, grade, stream) {
  if (!schoolId) return [];
  const cleanGrade = parseInt(grade) || 7;
  const cleanStream = String(stream || '').trim().toLowerCase();

  const res = await db.query(`
    SELECT * FROM students
    WHERE school_id = $1
      AND grade = $2
      AND LOWER(stream) = $3
    ORDER BY handle ASC
  `, [schoolId, cleanGrade, cleanStream]);

  return res.rows.map(r => mapStudentRow(r, false));
}

async function getStudentsBySchool(schoolId) {
  if (!schoolId) return [];
  const res = await db.query('SELECT * FROM students WHERE school_id = $1 ORDER BY grade ASC, stream ASC, handle ASC', [schoolId]);
  return res.rows.map(r => mapStudentRow(r, false));
}

async function getAllStudents() {
  const res = await db.query('SELECT * FROM students ORDER BY created_at DESC');
  return res.rows.map(r => mapStudentRow(r, false));
}

async function updateStudent(id, fields = {}) {
  const current = await getStudentById(id, { includePrivate: true });
  if (!current) throw new Error('Student not found.');

  const quests = fields.quests !== undefined ? db.toJson(fields.quests) : db.toJson(current.quests);
  const freeSubjects = fields.freeSubjects !== undefined ? db.toJson(fields.freeSubjects) : db.toJson(current.freeSubjects);

  await db.query(`
    UPDATE students
    SET handle = COALESCE($2, handle),
        grade = COALESCE($3, grade),
        county = COALESCE($4, county),
        school_id = COALESCE($5, school_id),
        school_name = COALESCE($6, school_name),
        stream = COALESCE($7, stream),
        stream_join_code = COALESCE($8, stream_join_code),
        email = COALESCE($9, email),
        student_email = COALESCE($10, student_email),
        student_phone = COALESCE($11, student_phone),
        parent_phone = COALESCE($12, parent_phone),
        avatar = COALESCE($13, avatar),
        age = COALESCE($14, age),
        pin_hash = COALESCE($15, pin_hash),
        subscription_tier = COALESCE($16, subscription_tier),
        tier_updated_at = COALESCE($17, tier_updated_at),
        quests = $18,
        free_subjects = $19,
        parent_consent = COALESCE($20, parent_consent),
        parent_verified = COALESCE($21, parent_verified),
        pilot_code = COALESCE($22, pilot_code),
        pilot_type = COALESCE($23, pilot_type),
        pilot_cohort_name = COALESCE($24, pilot_cohort_name),
        pilot_activated_at = COALESCE($25, pilot_activated_at),
        pilot_expires_at = COALESCE($26, pilot_expires_at),
        streak = COALESCE($27, streak),
        total_turns = COALESCE($28, total_turns),
        daily_turns_count = COALESCE($29, daily_turns_count),
        daily_turn_date = COALESCE($30, daily_turn_date),
        failed_login_attempts = COALESCE($31, failed_login_attempts),
        locked_until = $32,
        otp_hash = COALESCE($33, otp_hash),
        otp_expires_at = COALESCE($34, otp_expires_at),
        otp_verified = COALESCE($35, otp_verified),
        otp_request_count = COALESCE($36, otp_request_count),
        last_active = COALESCE($37, last_active)
    WHERE id = $1
  `, [
    id,
    fields.handle || null,
    fields.grade !== undefined ? parseInt(fields.grade) : null,
    fields.county || null,
    fields.schoolId !== undefined ? fields.schoolId : null,
    fields.school || fields.schoolName || null,
    fields.stream !== undefined ? fields.stream : null,
    fields.streamJoinCode !== undefined ? fields.streamJoinCode : null,
    fields.email || null,
    fields.studentEmail || null,
    fields.studentPhone || null,
    fields.parentPhone || null,
    fields.avatar || null,
    fields.age !== undefined ? parseInt(fields.age) : null,
    fields.pinHash || null,
    fields.subscriptionTier || null,
    fields.tierUpdatedAt || null,
    quests,
    freeSubjects,
    fields.parentConsent !== undefined ? (fields.parentConsent ? 1 : 0) : null,
    fields.parentVerified !== undefined ? (fields.parentVerified ? 1 : 0) : null,
    fields.pilotCode || null,
    fields.pilotType || null,
    fields.pilotCohortName || null,
    fields.pilotActivatedAt || null,
    fields.pilotExpiresAt || null,
    fields.streak !== undefined ? fields.streak : null,
    fields.totalTurns !== undefined ? fields.totalTurns : null,
    fields.dailyTurnsCount !== undefined ? fields.dailyTurnsCount : null,
    fields.dailyTurnDate || null,
    fields.failedLoginAttempts !== undefined ? fields.failedLoginAttempts : null,
    fields.lockedUntil !== undefined ? fields.lockedUntil : current.lockedUntil,
    fields.otpHash || null,
    fields.otpExpiresAt || null,
    fields.otpVerified !== undefined ? (fields.otpVerified ? 1 : 0) : null,
    fields.otpRequestCount !== undefined ? fields.otpRequestCount : null,
    fields.lastActive || new Date().toISOString()
  ]);

  return getStudentById(id, { includePrivate: !!fields.includePrivate });
}

function getStudentByIdSync(id, { includePrivate = false } = {}) {
  if (!id) return null;
  const res = db.querySync('SELECT * FROM students WHERE id = $1', [id]);
  return mapStudentRow(res.rows[0], includePrivate);
}

module.exports = {
  createStudent,
  getStudentById,
  findById: getStudentById,
  getStudentByIdSync,
  findByIdSync: getStudentByIdSync,
  getStudentByHandle,
  findByHandle: getStudentByHandle,
  getStudentsByStream,
  findByStream: getStudentsByStream,
  getStudentsBySchool,
  findBySchool: getStudentsBySchool,
  getAllStudents,
  findAll: getAllStudents,
  updateStudent
};
