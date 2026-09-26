// ══════════════════════════════════════════════════════════════
// MISSIONS REPOSITORY (Data-Access Layer)
// ══════════════════════════════════════════════════════════════

const db = require('../client');

function mapMissionRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    teacherId: r.teacher_id,
    teacherName: r.teacher_name,
    schoolId: r.school_id,
    grade: r.grade,
    stream: r.stream,
    subject: r.subject,
    strand: r.strand,
    subStrand: r.sub_strand,
    title: r.title,
    hintMode: r.hint_mode || 'open',
    hintDelayMinutes: r.hint_delay_minutes || 0,
    displayMode: r.display_mode || 'sequential',
    items: db.fromJson(r.items, []),
    submissions: db.fromJson(r.submissions, {}),
    pushedAt: r.pushed_at,
    deadline: r.deadline,
    status: r.status || 'active',
    createdAt: r.created_at
  };
}

async function createMission(m) {
  await db.query(`
    INSERT INTO missions (
      id, teacher_id, teacher_name, school_id, grade, stream, subject,
      strand, sub_strand, title, hint_mode, hint_delay_minutes,
      display_mode, items, submissions, pushed_at, deadline, status, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
  `, [
    m.id,
    m.teacherId || null,
    m.teacherName || null,
    m.schoolId,
    parseInt(m.grade) || 7,
    m.stream,
    m.subject,
    m.strand || null,
    m.subStrand || null,
    m.title,
    m.hintMode || 'open',
    m.hintDelayMinutes || 0,
    m.displayMode || 'sequential',
    db.toJson(m.items || []),
    db.toJson(m.submissions || {}),
    m.pushedAt || new Date().toISOString(),
    m.deadline || null,
    m.status || 'active',
    m.createdAt || new Date().toISOString()
  ]);

  return getMissionById(m.id);
}

async function getMissionById(id) {
  if (!id) return null;
  const res = await db.query('SELECT * FROM missions WHERE id = $1', [id]);
  return mapMissionRow(res.rows[0]);
}

async function getMissionsByStream(schoolId, grade, stream) {
  if (!schoolId) return [];
  const cleanGrade = parseInt(grade) || 7;
  const cleanStream = String(stream || '').trim().toLowerCase();

  const res = await db.query(`
    SELECT * FROM missions
    WHERE school_id = $1
      AND grade = $2
      AND LOWER(stream) = $3
    ORDER BY created_at DESC
  `, [schoolId, cleanGrade, cleanStream]);

  return res.rows.map(mapMissionRow);
}

async function getActiveMissionsForStudent(schoolId, grade, stream, subject = null) {
  if (!schoolId) return [];
  const cleanGrade = parseInt(grade) || 7;
  const cleanStream = String(stream || '').trim().toLowerCase();

  let sql = `
    SELECT * FROM missions
    WHERE school_id = $1
      AND grade = $2
      AND LOWER(stream) = $3
      AND status = 'active'
  `;
  const params = [schoolId, cleanGrade, cleanStream];

  if (subject) {
    sql += ` AND LOWER(subject) = $4`;
    params.push(String(subject).trim().toLowerCase());
  }

  sql += ` ORDER BY created_at DESC`;

  const res = await db.query(sql, params);
  return res.rows.map(mapMissionRow);
}

async function updateMissionSubmissions(missionId, submissions) {
  await db.query(`
    UPDATE missions
    SET submissions = $2
    WHERE id = $1
  `, [missionId, db.toJson(submissions, {})]);

  return getMissionById(missionId);
}

async function getAllMissions() {
  const res = await db.query('SELECT * FROM missions ORDER BY created_at DESC');
  return res.rows.map(mapMissionRow);
}

function getMissionByIdSync(id) {
  if (!id) return null;
  const res = db.querySync('SELECT * FROM missions WHERE id = $1', [id]);
  return mapMissionRow(res.rows[0]);
}

module.exports = {
  createMission,
  getMissionById,
  findById: getMissionById,
  getMissionByIdSync,
  findByIdSync: getMissionByIdSync,
  getMissionsByStream,
  findByStream: getMissionsByStream,
  getActiveMissionsForStudent,
  updateMissionSubmissions,
  getAllMissions,
  findAll: getAllMissions
};
