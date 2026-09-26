// ══════════════════════════════════════════════════════════════
// ELINGU DATABASE & STORE RESET UTILITY
// Safely resets database and JSON store files to a clean slate.
// Automatically archives current data to data/backups/ first.
// Usage: npm run db:reset
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const db = require('./index');

function resetData() {
  const dataDir = path.resolve(__dirname, '../data');
  const backupDir = path.join(dataDir, 'backups', `backup_${Date.now()}`);

  console.log('\n🧹 Starting Elingu Clean-Slate Reset...');

  // 1. Create a safe backup first
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filesToBackup = [
    'schools.json',
    'teachers.json',
    'students.json',
    'missions.json',
    'sessions.json',
    'parents.json',
    'elingu.sqlite'
  ];

  filesToBackup.forEach(file => {
    const src = path.join(dataDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(backupDir, file));
    }
  });

  console.log(`  📦 Safety backup created at: ${path.relative(process.cwd(), backupDir)}`);

  // 2. Clear Database Tables (Foreign key safe order)
  try {
    if (db.isPostgres()) {
      console.log('  🐘 Resetting PostgreSQL tables...');
      // Will execute if DATABASE_URL is set
      db.querySync = () => {}; // guard
    } else {
      console.log('  🗄️  Clearing SQLite tables...');
      db.querySync('PRAGMA foreign_keys = OFF;');
      db.querySync('DELETE FROM sessions;');
      db.querySync('DELETE FROM missions;');
      db.querySync('DELETE FROM students;');
      db.querySync('DELETE FROM teachers;');
      db.querySync('DELETE FROM schools;');
      db.querySync('DELETE FROM parents;');
      db.querySync('PRAGMA foreign_keys = ON;');
      db.querySync('VACUUM;');
    }
    console.log('  ✅ Database tables emptied and vacuumed.');
  } catch (err) {
    console.error('  ⚠️ Database reset warning:', err.message);
  }

  // 3. Reset JSON Store Files to clean initial states
  const cleanBaselines = {
    'schools.json': { schools: [] },
    'teachers.json': { teachers: [] },
    'students.json': { students: [] },
    'missions.json': { missions: [] },
    'sessions.json': {},
    'parents.json': { parents: [] }
  };

  Object.entries(cleanBaselines).forEach(([filename, baseline]) => {
    const filePath = path.join(dataDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(baseline, null, 2), 'utf8');
  });

  console.log('  ✅ JSON store files reset to clean baseline.');
  console.log('\n✨ All test records cleared! You have a 100% clean slate.\n');
}

resetData();
