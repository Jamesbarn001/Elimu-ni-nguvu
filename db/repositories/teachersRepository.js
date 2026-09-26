// ══════════════════════════════════════════════════════════════
// TEACHERS REPOSITORY (Data-Access Layer)
// ══════════════════════════════════════════════════════════════

const db = require('../client');

function mapTeacherRow(r, includePrivate = false) {
  if (!r) return null;
  const teacher = {
    id: r.id,
    name: r.name,
    idNumber: r.id_number,
    email: r.email,
    phone: r.phone,
    role: r.role,
    schoolId: r.school_id,
    schoolName: r.school_name,
    assignments: db.fromJson(r.assignments, []),
    failedLoginAttempts: r.failed_login_attempts || 0,
    lockedUntil: r.locked_until,
    createdAt: r.created_at,
    lastActive: r.last_active
  };
  if (includePrivate) {
    teacher.passwordHash = r.password_hash;
  }
  return teacher;
}

async function createTeacher(t) {
  await db.query(`
    INSERT INTO teachers (
      id, name, id_number, email, phone, password_hash, role,
      school_id, school_name, assignments, failed_login_attempts,
      locked_until, created_at, last_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `, [
    t.id,
    t.name,
    t.idNumber,
    t.email || null,
    t.phone || null,
    t.passwordHash,
    t.role || 'subject_teacher',
    t.schoolId,
    t.schoolName || null,
    db.toJson(t.assignments || []),
    t.failedLoginAttempts || 0,
    t.lockedUntil || null,
    t.createdAt || new Date().toISOString(),
    t.lastActive || new Date().toISOString()
  ]);
  return getTeacherById(t.id);
}

async function getTeacherById(id, { includePrivate = false } = {}) {
  if (!id) return null;
  const res = await db.query('SELECT * FROM teachers WHERE id = $1', [id]);
  return mapTeacherRow(res.rows[0], includePrivate);
}

async function getTeacherByIdentifier(identifier, { includePrivate = false } = {}) {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  const cleanId = String(identifier).trim().toUpperCase();

  const res = await db.query(`
    SELECT * FROM teachers
    WHERE LOWER(email) = $1
       OR phone = $1
       OR id_number = $2
    LIMIT 1
  `, [clean, cleanId]);

  return mapTeacherRow(res.rows[0], includePrivate);
}

async function getTeachersBySchool(schoolId) {
  if (!schoolId) return [];
  const res = await db.query('SELECT * FROM teachers WHERE school_id = $1 ORDER BY name ASC', [schoolId]);
  return res.rows.map(r => mapTeacherRow(r, false));
}

async function updateTeacher(id, fields = {}) {
  const current = await getTeacherById(id, { includePrivate: true });
  if (!current) throw new Error('Teacher not found.');

  const assignments = fields.assignments !== undefined ? db.toJson(fields.assignments) : db.toJson(current.assignments);

  await db.query(`
    UPDATE teachers
    SET name = COALESCE($2, name),
        id_number = COALESCE($3, id_number),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        password_hash = COALESCE($6, password_hash),
        role = COALESCE($7, role),
        school_name = COALESCE($8, school_name),
        assignments = $9,
        failed_login_attempts = COALESCE($10, failed_login_attempts),
        locked_until = $11,
        last_active = COALESCE($12, last_active)
    WHERE id = $1
  `, [
    id,
    fields.name || null,
    fields.idNumber || null,
    fields.email || null,
    fields.phone || null,
    fields.passwordHash || null,
    fields.role || null,
    fields.schoolName || null,
    assignments,
    fields.failedLoginAttempts !== undefined ? fields.failedLoginAttempts : null,
    fields.lockedUntil !== undefined ? fields.lockedUntil : current.lockedUntil,
    fields.lastActive || new Date().toISOString()
  ]);

  return getTeacherById(id, { includePrivate: !!fields.includePrivate });
}

function getTeacherByIdSync(id, { includePrivate = false } = {}) {
  if (!id) return null;
  const res = db.querySync('SELECT * FROM teachers WHERE id = $1', [id]);
  return mapTeacherRow(res.rows[0], includePrivate);
}

module.exports = {
  createTeacher,
  getTeacherById,
  findById: getTeacherById,
  getTeacherByIdSync,
  findByIdSync: getTeacherByIdSync,
  getTeacherByIdentifier,
  findByIdentifier: getTeacherByIdentifier,
  getTeachersBySchool,
  findBySchool: getTeachersBySchool,
  updateTeacher
};
