// ══════════════════════════════════════════════════════════════
// SCHOOLS REPOSITORY (Data-Access Layer)
// ══════════════════════════════════════════════════════════════

const db = require('../client');

function mapSchoolRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    county: r.county,
    adminCode: r.admin_code,
    grades: db.fromJson(r.grades, [7, 8]),
    streams: db.fromJson(r.streams, {}),
    joinCodes: db.fromJson(r.join_codes, {}),
    createdBy: r.created_by,
    createdAt: r.created_at
  };
}

async function createSchool({ id, name, county, adminCode, grades, streams, joinCodes, createdBy, createdAt }) {
  await db.query(`
    INSERT INTO schools (id, name, county, admin_code, grades, streams, join_codes, created_by, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    id,
    name,
    county,
    adminCode,
    db.toJson(grades, [7, 8]),
    db.toJson(streams, {}),
    db.toJson(joinCodes, {}),
    createdBy || 'ops',
    createdAt || new Date().toISOString()
  ]);
  return getSchoolById(id);
}

async function getSchoolById(id) {
  if (!id) return null;
  const res = await db.query('SELECT * FROM schools WHERE id = $1', [id]);
  return mapSchoolRow(res.rows[0]);
}

async function getSchoolByAdminCode(adminCode) {
  if (!adminCode) return null;
  const clean = String(adminCode).trim().toUpperCase();
  const res = await db.query('SELECT * FROM schools WHERE admin_code = $1', [clean]);
  return mapSchoolRow(res.rows[0]);
}

async function getSchoolByJoinCode(joinCode) {
  if (!joinCode) return null;
  const clean = String(joinCode).trim().toUpperCase();
  // We query all schools and find matching join code key
  const res = await db.query('SELECT * FROM schools');
  for (const row of res.rows) {
    const codes = db.fromJson(row.join_codes, {});
    for (const [key, code] of Object.entries(codes)) {
      if (String(code).toUpperCase() === clean) {
        const [gradeStr, ...streamParts] = key.split('_');
        const school = mapSchoolRow(row);
        return {
          school,
          schoolId: school.id,
          schoolName: school.name,
          grade: parseInt(gradeStr),
          stream: streamParts.join('_'),
          joinCode: code
        };
      }
    }
  }
  return null;
}

async function getAllSchools() {
  const res = await db.query('SELECT * FROM schools ORDER BY created_at DESC');
  return res.rows.map(mapSchoolRow);
}

async function updateSchool(id, { name, county, adminCode, grades, streams, joinCodes }) {
  const school = await getSchoolById(id);
  if (!school) throw new Error('School not found.');

  const updatedGrades = grades !== undefined ? db.toJson(grades) : db.toJson(school.grades);
  const updatedStreams = streams !== undefined ? db.toJson(streams) : db.toJson(school.streams);
  const updatedJoinCodes = joinCodes !== undefined ? db.toJson(joinCodes) : db.toJson(school.joinCodes);

  await db.query(`
    UPDATE schools
    SET name = COALESCE($2, name),
        county = COALESCE($3, county),
        admin_code = COALESCE($4, admin_code),
        grades = $5,
        streams = $6,
        join_codes = $7
    WHERE id = $1
  `, [
    id,
    name || null,
    county || null,
    adminCode || null,
    updatedGrades,
    updatedStreams,
    updatedJoinCodes
  ]);

  return getSchoolById(id);
}

function getSchoolByIdSync(id) {
  if (!id) return null;
  const res = db.querySync('SELECT * FROM schools WHERE id = $1', [id]);
  return mapSchoolRow(res.rows[0]);
}

function getSchoolByAdminCodeSync(adminCode) {
  if (!adminCode) return null;
  const clean = String(adminCode).trim().toUpperCase();
  const res = db.querySync('SELECT * FROM schools WHERE admin_code = $1', [clean]);
  return mapSchoolRow(res.rows[0]);
}

module.exports = {
  createSchool,
  getSchoolById,
  findById: getSchoolById,
  getSchoolByIdSync,
  findByIdSync: getSchoolByIdSync,
  getSchoolByAdminCode,
  findByAdminCode: getSchoolByAdminCode,
  getSchoolByAdminCodeSync,
  findByAdminCodeSync: getSchoolByAdminCodeSync,
  getSchoolByJoinCode,
  findByJoinCode: getSchoolByJoinCode,
  getAllSchools,
  findAll: getAllSchools,
  updateSchool
};
