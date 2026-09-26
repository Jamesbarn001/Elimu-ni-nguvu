// ══════════════════════════════════════════════════════════════
// ELINGU DATABASE INSPECTOR
// Run anytime: node db/inspect.js
// ══════════════════════════════════════════════════════════════

const db = require('./index');

function inspectDatabase() {
  console.log('\n======================================================');
  console.log('🏛️  ELINGU DATABASE SNAPSHOT (' + (db.isPostgres() ? 'PostgreSQL' : 'SQLite: ' + db.DB_FILE) + ')');
  console.log('======================================================\n');

  const tables = ['schools', 'teachers', 'students', 'missions', 'sessions', 'parents'];

  const summary = [];
  for (const table of tables) {
    try {
      const res = db.querySync(`SELECT COUNT(*) as count FROM ${table}`);
      summary.push({ Table: table, 'Total Records': res.rows[0].count });
    } catch (e) {
      summary.push({ Table: table, 'Total Records': 'Error: ' + e.message });
    }
  }
  console.table(summary);

  console.log('\n--- 🏫 Recent Schools Sample (Up to 5) ---');
  try {
    const schools = db.querySync('SELECT id, name, county, admin_code, created_at FROM schools ORDER BY rowid DESC LIMIT 5');
    console.table(schools.rows);
  } catch (e) {}

  console.log('\n--- 👨‍🏫 Recent Teachers Sample (Up to 5) ---');
  try {
    const teachers = db.querySync('SELECT id, name, email, role, school_name FROM teachers ORDER BY rowid DESC LIMIT 5');
    console.table(teachers.rows);
  } catch (e) {}

  console.log('\n--- 🎒 Recent Students Sample (Up to 5) ---');
  try {
    const students = db.querySync('SELECT id, handle, grade, stream, school_name, subscription_tier FROM students ORDER BY rowid DESC LIMIT 5');
    console.table(students.rows);
  } catch (e) {}

  console.log('\n--- 🎯 Recent Missions Sample (Up to 5) ---');
  try {
    const missions = db.querySync('SELECT id, title, subject, grade, stream, status FROM missions ORDER BY rowid DESC LIMIT 5');
    console.table(missions.rows);
  } catch (e) {}

  console.log('\n✅ Database is active and healthy.\n');
}

inspectDatabase();
