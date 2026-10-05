// ══════════════════════════════════════════════════════════════
// ELINGU TARGETED DATA RESET UTILITY
// Safely resets or deletes specific database records.
//
// Usage examples:
//   node db/delete.js --student "JaneDoe"
//   node db/delete.js --parent "parent@example.com"
//   node db/delete.js --school "Nandi Hills"
//   node db/delete.js --teacher "teacher@example.com"
//   node db/delete.js --clear-sessions "Kimberly"
//   node db/delete.js --reset-turns "Kimberly"
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const db = require('./client');

const dataDir = path.resolve(__dirname, '../data');

function loadJson(file, fallback = {}) {
  const p = path.join(dataDir, file);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function saveJson(file, data) {
  const p = path.join(dataDir, file);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
══════════════════════════════════════════════════════════════
🗑️  ELINGU TARGETED DATA RESET TOOL
══════════════════════════════════════════════════════════════

Usage:
  node db/delete.js --student <id-or-handle>
      Permanently deletes a student profile, their chat sessions,
      and unlinks them from parent accounts.

  node db/delete.js --parent <id-or-email>
      Deletes a parent account.

  node db/delete.js --teacher <id-or-email>
      Deletes a teacher account.

  node db/delete.js --school <id-or-name>
      Deletes a school and its associated teacher links.

  node db/delete.js --clear-sessions <student-id-or-handle>
      Clears chat history for a learner while keeping their profile.

  node db/delete.js --reset-turns <student-id-or-handle>
      Resets daily turn counts to 0 for a learner.

Examples:
  node db/delete.js --student "TestStudent"
  node db/delete.js --parent "test@parent.com"
  node db/delete.js --clear-sessions "Kimberly"
══════════════════════════════════════════════════════════════
`);
  process.exit(0);
}

const command = args[0];
const target = args[1];

if (!target) {
  console.error(`❌ Error: Please specify a target value after ${command}. Example: node db/delete.js ${command} "target_name"`);
  process.exit(1);
}

// ── 1. DELETE STUDENT ─────────────────────────────────────────
if (command === '--student') {
  const sData = loadJson('students.json', { students: [] });
  const student = sData.students.find(s => s.id === target || (s.handle && s.handle.toLowerCase() === target.toLowerCase()));

  if (!student) {
    console.error(`❌ Student "${target}" not found.`);
    process.exit(1);
  }

  const studentId = student.id;
  sData.students = sData.students.filter(s => s.id !== studentId);
  saveJson('students.json', sData);

  // Clear sessions
  const sessions = loadJson('sessions.json', {});
  Object.keys(sessions).forEach(k => {
    if (k.startsWith(studentId + '_')) delete sessions[k];
  });
  saveJson('sessions.json', sessions);

  // Unlink from parents
  const pData = loadJson('parents.json', { parents: [] });
  pData.parents.forEach(p => {
    p.children = (p.children || []).filter(c => c !== studentId);
    p.pendingChildren = (p.pendingChildren || []).filter(c => c.studentId !== studentId);
    if (p.studentSubscriptions && p.studentSubscriptions[studentId]) {
      delete p.studentSubscriptions[studentId];
    }
  });
  saveJson('parents.json', pData);

  // Sync SQLite
  try {
    db.querySync('DELETE FROM sessions WHERE student_id = $1;', [studentId]);
    db.querySync('DELETE FROM students WHERE id = $1;', [studentId]);
  } catch (e) {}

  console.log(`✅ Student "${student.handle}" (${studentId}) and their sessions have been completely removed.`);
  process.exit(0);
}

// ── 2. DELETE PARENT ──────────────────────────────────────────
if (command === '--parent') {
  const pData = loadJson('parents.json', { parents: [] });
  const parent = pData.parents.find(p => p.id === target || (p.email && p.email.toLowerCase() === target.toLowerCase()));

  if (!parent) {
    console.error(`❌ Parent "${target}" not found.`);
    process.exit(1);
  }

  pData.parents = pData.parents.filter(p => p.id !== parent.id);
  saveJson('parents.json', pData);

  try {
    db.querySync('DELETE FROM parents WHERE id = $1 OR email = $2;', [parent.id, parent.email]);
  } catch (e) {}

  console.log(`✅ Parent "${parent.email}" (${parent.id}) has been removed.`);
  process.exit(0);
}

// ── 3. DELETE TEACHER ─────────────────────────────────────────
if (command === '--teacher') {
  const tData = loadJson('teachers.json', { teachers: [] });
  const teacher = tData.teachers.find(t => t.id === target || (t.email && t.email.toLowerCase() === target.toLowerCase()));

  if (!teacher) {
    console.error(`❌ Teacher "${target}" not found.`);
    process.exit(1);
  }

  tData.teachers = tData.teachers.filter(t => t.id !== teacher.id);
  saveJson('teachers.json', tData);

  try {
    db.querySync('DELETE FROM teachers WHERE id = $1 OR email = $2;', [teacher.id, teacher.email]);
  } catch (e) {}

  console.log(`✅ Teacher "${teacher.name || teacher.email}" (${teacher.id}) has been removed.`);
  process.exit(0);
}

// ── 4. DELETE SCHOOL ──────────────────────────────────────────
if (command === '--school') {
  const sData = loadJson('schools.json', { schools: [] });
  const school = sData.schools.find(s => s.id === target || (s.name && s.name.toLowerCase().includes(target.toLowerCase())));

  if (!school) {
    console.error(`❌ School "${target}" not found.`);
    process.exit(1);
  }

  sData.schools = sData.schools.filter(s => s.id !== school.id);
  saveJson('schools.json', sData);

  try {
    db.querySync('DELETE FROM schools WHERE id = $1;', [school.id]);
  } catch (e) {}

  console.log(`✅ School "${school.name}" (${school.id}) has been removed.`);
  process.exit(0);
}

// ── 5. CLEAR SESSIONS ─────────────────────────────────────────
if (command === '--clear-sessions') {
  const sData = loadJson('students.json', { students: [] });
  const student = sData.students.find(s => s.id === target || (s.handle && s.handle.toLowerCase() === target.toLowerCase()));

  if (!student) {
    console.error(`❌ Student "${target}" not found.`);
    process.exit(1);
  }

  const sessions = loadJson('sessions.json', {});
  let count = 0;
  Object.keys(sessions).forEach(k => {
    if (k.startsWith(student.id + '_')) {
      delete sessions[k];
      count++;
    }
  });
  saveJson('sessions.json', sessions);

  try {
    db.querySync('DELETE FROM sessions WHERE student_id = $1;', [student.id]);
  } catch (e) {}

  console.log(`✅ Cleared ${count} session histories for student "${student.handle}".`);
  process.exit(0);
}

// ── 6. RESET TURNS ────────────────────────────────────────────
if (command === '--reset-turns') {
  const sData = loadJson('students.json', { students: [] });
  const student = sData.students.find(s => s.id === target || (s.handle && s.handle.toLowerCase() === target.toLowerCase()));

  if (!student) {
    console.error(`❌ Student "${target}" not found.`);
    process.exit(1);
  }

  student.dailyTurnsCount = 0;
  student.dailyTurnDate = new Date().toISOString().slice(0, 10);
  saveJson('students.json', sData);

  try {
    db.querySync('UPDATE students SET daily_turns_count = 0 WHERE id = $1;', [student.id]);
  } catch (e) {}

  console.log(`✅ Reset daily turns to 0 for "${student.handle}".`);
  process.exit(0);
}

console.error(`❌ Unknown command "${command}". Run "node db/delete.js --help" for usage.`);
process.exit(1);
