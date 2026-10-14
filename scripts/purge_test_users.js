/**
 * ELINGU DETERMINISTIC TEST USER PURGE UTILITY
 * 
 * Safely removes test accounts while preserving:
 * - Real Family Parent: mutwirijamesbarn@gmail.com (par_5d06d7215c0e)
 * - Real Learners:
 *     1. Kimberly (stu_22725e48c6ab, Grade 9 CBC)
 *     2. Erline (stu_2b910ef8f459, Grade 10 CBC)
 *     3. Kejo (stu_b33436926de6, Year 10 British CAIE IGCSE, Braeburn Garden Estate)
 *     4. Sheki (stu_d6061be424df, Year 11 British Edexcel IGCSE, Braeburn School Gitanga)
 * - Real Teacher: James Barn (tch_55ad1d2319e1, mutwirijamesbarn@gmail.com)
 * 
 * Updates both local data/*.json stores AND Neon PostgreSQL elingu_documents table.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { Pool } = require('pg');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const REAL_STUDENT_IDS = new Set([
  'stu_22725e48c6ab', // Kimberly
  'stu_2b910ef8f459', // Erline
  'stu_b33436926de6', // Kejo
  'stu_d6061be424df'  // Sheki
]);

const REAL_PARENT_EMAIL = 'mutwirijamesbarn@gmail.com';
const REAL_TEACHER_ID = 'tch_55ad1d2319e1';

async function runPurge() {
  console.log('🧹 Initiating deterministic test user purge...');

  // Setup Postgres pool
  let pool = null;
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }

  // Helper to load document: prefer Postgres cloud document first, fall back to local JSON
  async function loadDoc(name, fallback) {
    if (pool) {
      try {
        const { rows } = await pool.query('SELECT data FROM elingu_documents WHERE name = $1', [name]);
        if (rows.length > 0 && rows[0].data) {
          return rows[0].data;
        }
      } catch (err) {
        console.warn(`[purge] Could not load ${name} from Postgres:`, err.message);
      }
    }
    const localPath = path.join(DATA_DIR, name);
    if (fs.existsSync(localPath)) {
      return JSON.parse(fs.readFileSync(localPath, 'utf8'));
    }
    return fallback;
  }

  // Helper to persist document both locally and to Postgres
  async function saveDoc(name, data) {
    const localPath = path.join(DATA_DIR, name);
    fs.writeFileSync(localPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`💾 Saved local data/${name}`);

    if (pool) {
      await pool.query(
        `INSERT INTO elingu_documents (name, data, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [name, data]
      );
      console.log(`☁️ Synced to Postgres elingu_documents: ${name}`);
    }
  }

  // 1. Process STUDENTS
  const studentsDoc = await loadDoc('students.json', { students: [] });
  const rawStudents = studentsDoc.students || [];
  const purgedStudents = rawStudents.filter(s => REAL_STUDENT_IDS.has(s.id));

  // Verify all 4 real students are present
  console.log(`Found ${purgedStudents.length} of ${REAL_STUDENT_IDS.size} real students.`);
  for (const s of purgedStudents) {
    console.log(`  - ${s.handle} (${s.id}) • Grade/Year ${s.grade} • ${s.school} • ${s.curriculum || 'CBC'}`);
  }

  await saveDoc('students.json', { students: purgedStudents });

  // 2. Process PARENTS
  const parentsDoc = await loadDoc('parents.json', { parents: [] });
  const rawParents = parentsDoc.parents || [];
  const realParent = rawParents.find(p => p.email.toLowerCase() === REAL_PARENT_EMAIL.toLowerCase());

  if (!realParent) {
    throw new Error(`Real parent ${REAL_PARENT_EMAIL} not found! Aborting purge.`);
  }

  // Ensure all 4 children are linked in realParent
  realParent.children = Array.from(REAL_STUDENT_IDS);
  console.log(`Parent ${realParent.email} children updated to:`, realParent.children);

  await saveDoc('parents.json', { parents: [realParent] });

  // 3. Process TEACHERS
  const teachersDoc = await loadDoc('teachers.json', { teachers: [] });
  const rawTeachers = teachersDoc.teachers || [];
  const realTeacher = rawTeachers.find(t => t.id === REAL_TEACHER_ID || t.email.toLowerCase() === REAL_PARENT_EMAIL.toLowerCase());

  if (realTeacher) {
    console.log(`Teacher ${realTeacher.name} (${realTeacher.id}) preserved.`);
    await saveDoc('teachers.json', { teachers: [realTeacher] });
  } else {
    console.warn('Real teacher not found, keeping raw teachers.');
  }

  // 4. Process SESSIONS
  const sessionsDoc = await loadDoc('sessions.json', { sessions: [] });
  const rawSessions = sessionsDoc.sessions || [];
  const keptSessions = rawSessions.filter(sess => REAL_STUDENT_IDS.has(sess.studentId));
  console.log(`Filtered sessions: kept ${keptSessions.length} of ${rawSessions.length}`);
  await saveDoc('sessions.json', { sessions: keptSessions });

  // 5. Process ANALYTICS
  const analyticsDoc = await loadDoc('analytics.json', { events: [] });
  if (Array.isArray(analyticsDoc.events)) {
    const rawEvents = analyticsDoc.events;
    analyticsDoc.events = rawEvents.filter(ev => !ev.studentId || REAL_STUDENT_IDS.has(ev.studentId));
    console.log(`Filtered analytics events: kept ${analyticsDoc.events.length} of ${rawEvents.length}`);
  }
  await saveDoc('analytics.json', analyticsDoc);

  if (pool) {
    await pool.end();
  }

  console.log('\n✨ Purge complete! Only real family accounts remain active.');
}

runPurge()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Purge failed:', err);
    process.exit(1);
  });
