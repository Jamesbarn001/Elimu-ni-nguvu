// ══════════════════════════════════════════════════════════════
// ELINGU TEACHER & SCHOOL STORE
// Compliant with Kenya Data Protection Act 2019
// Manages: School Entities, Multi-Stream Architecture,
// Teacher Authentication & RBAC, Missions & Process Trails,
// Subject-Specific Answer Modes, and CBE Rubric Auto-Evaluation
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const authUtils = require('./authUtils');
const db = require('./db');

function syncDb(fn) {
  try {
    fn();
  } catch (err) {
    // Non-fatal sync fallback
  }
}

const DATA_DIR = path.join(__dirname, 'data');
const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');
const TEACHERS_FILE = path.join(DATA_DIR, 'teachers.json');
const MISSIONS_FILE = path.join(DATA_DIR, 'missions.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`[teacherStore] Error loading ${filePath}:`, err.message);
  }
  return defaultValue;
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    require('./persistentStore').persist(filePath, data);
  } catch (err) {
    console.error(`[teacherStore] Error saving ${filePath}:`, err.message);
  }
}

// Initialize files if they don't exist
if (!fs.existsSync(SCHOOLS_FILE)) saveJson(SCHOOLS_FILE, { schools: [] });
if (!fs.existsSync(TEACHERS_FILE)) saveJson(TEACHERS_FILE, { teachers: [] });
if (!fs.existsSync(MISSIONS_FILE)) saveJson(MISSIONS_FILE, { missions: [] });

// ══════════════════════════════════════════════════════════════
// SECTION 1 — SCHOOL & MULTI-STREAM ARCHITECTURE
// ══════════════════════════════════════════════════════════════

/**
 * Generate a unique school admin code (e.g. KUJ-ADMIN)
 */
function generateAdminCode(name) {
  const words = (name || 'Elingu School')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/);
  let prefix = '';
  if (words.length >= 2) {
    prefix = words.map(w => w[0].toUpperCase()).slice(0, 4).join('');
  } else if (words.length === 1 && words[0].length >= 3) {
    prefix = words[0].slice(0, 3).toUpperCase();
  } else {
    prefix = 'SCH';
  }

  const store = loadJson(SCHOOLS_FILE, { schools: [] });
  let candidate = `${prefix}-ADMIN`;
  let counter = 1;
  while (store.schools.some(s => s.adminCode === candidate)) {
    counter++;
    candidate = `${prefix}${counter}-ADMIN`;
  }
  return candidate;
}

/**
 * Generate a stream join code (e.g. KUJ-8E)
 */
function generateStreamCode(adminCode, grade, streamName) {
  const prefix = adminCode.replace('-ADMIN', '');
  const cleanGrade = parseInt(grade) || 7;
  const initial = (streamName || 'A').trim()[0].toUpperCase();
  return `${prefix}-${cleanGrade}${initial}`;
}

/**
 * Create a new school entity with multi-grade and multi-stream hierarchy
 */
function createSchool({ name, county, adminCode, grades, streams, createdBy = 'elingu_ops' }) {
  const store = loadJson(SCHOOLS_FILE, { schools: [] });
  const cleanName = (name || '').trim();
  if (!cleanName) throw new Error('School name is required.');

  const resolvedAdminCode = (adminCode || generateAdminCode(cleanName)).toUpperCase().trim();
  if (store.schools.some(s => s.adminCode === resolvedAdminCode)) {
    throw new Error(`School admin code ${resolvedAdminCode} is already registered / already in use.`);
  }

  const cleanCounty = (county || 'Nairobi').trim();
  const validGrades = Array.isArray(grades) && grades.length > 0
    ? grades.map(g => parseInt(g)).filter(g => Number.isInteger(g) && g >= 1 && g <= 12)
    : [6, 7, 8];

  // streams object: e.g. { "7": ["East", "West"], "8": ["East", "West", "North"] }
  const cleanStreams = {};
  const joinCodes = {};

  validGrades.forEach(g => {
    const rawList = (streams && streams[g]) || ['East', 'West'];
    const streamList = Array.isArray(rawList) ? rawList.map(s => String(s).trim()).filter(Boolean) : ['East', 'West'];
    cleanStreams[g] = streamList;

    streamList.forEach(sName => {
      const codeKey = `${g}_${sName}`;
      let code = generateStreamCode(resolvedAdminCode, g, sName);
      // Ensure join code uniqueness across all schools
      let suffix = 1;
      while (store.schools.some(s => Object.values(s.joinCodes || {}).includes(code))) {
        code = `${generateStreamCode(resolvedAdminCode, g, sName)}${suffix}`;
        suffix++;
      }
      joinCodes[codeKey] = code;
    });
  });

  const schoolId = 'sch_' + crypto.randomBytes(6).toString('hex');
  const newSchool = {
    id: schoolId,
    name: cleanName,
    county: cleanCounty,
    adminCode: resolvedAdminCode,
    grades: validGrades,
    streams: cleanStreams,
    joinCodes,
    createdBy,
    createdAt: new Date().toISOString()
  };

  store.schools.push(newSchool);
  saveJson(SCHOOLS_FILE, store);

  syncDb(() => {
    db.querySync(`
      INSERT INTO schools (id, name, county, admin_code, grades, streams, join_codes, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT(id) DO UPDATE SET
        name = EXCLUDED.name,
        county = EXCLUDED.county,
        admin_code = EXCLUDED.admin_code,
        grades = EXCLUDED.grades,
        streams = EXCLUDED.streams,
        join_codes = EXCLUDED.join_codes
    `, [
      newSchool.id,
      newSchool.name,
      newSchool.county,
      newSchool.adminCode,
      db.toJson(newSchool.grades),
      db.toJson(newSchool.streams),
      db.toJson(newSchool.joinCodes),
      newSchool.createdBy,
      newSchool.createdAt
    ]);
  });

  return newSchool;
}

function getSchoolById(schoolId) {
  if (!schoolId) return null;
  const store = loadJson(SCHOOLS_FILE, { schools: [] });
  return store.schools.find(s => s.id === schoolId) || null;
}

function getSchoolByAdminCode(adminCode) {
  if (!adminCode) return null;
  const clean = String(adminCode).trim().toUpperCase();
  const store = loadJson(SCHOOLS_FILE, { schools: [] });
  return store.schools.find(s => s.adminCode === clean) || null;
}

/**
 * Resolve a stream join code (e.g. "KUJ-8E") to school, grade, and stream name
 */
function getSchoolByJoinCode(joinCode) {
  if (!joinCode) return null;
  const clean = String(joinCode).trim().toUpperCase();
  const store = loadJson(SCHOOLS_FILE, { schools: [] });

  for (const school of store.schools) {
    if (!school.joinCodes) continue;
    for (const [key, code] of Object.entries(school.joinCodes)) {
      if (code.toUpperCase() === clean) {
        const [gradeStr, ...streamParts] = key.split('_');
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

function getAllSchools() {
  const store = loadJson(SCHOOLS_FILE, { schools: [] });
  return store.schools;
}

/**
 * Add or expand streams for a specific grade in a school
 */
function addStreamsToSchool(schoolId, grade, streamNames) {
  const store = loadJson(SCHOOLS_FILE, { schools: [] });
  const school = store.schools.find(s => s.id === schoolId);
  if (!school) throw new Error('School not found.');

  const cleanGrade = parseInt(grade);
  if (isNaN(cleanGrade) || cleanGrade < 1 || cleanGrade > 12) throw new Error('Invalid grade level (1-12).');
  if (!school.grades.includes(cleanGrade)) school.grades.push(cleanGrade);

  if (!school.streams) school.streams = {};
  if (!school.streams[cleanGrade]) school.streams[cleanGrade] = [];
  if (!school.joinCodes) school.joinCodes = {};

  const existing = school.streams[cleanGrade];
  const newStreams = Array.isArray(streamNames) ? streamNames : [streamNames];

  newStreams.forEach(sName => {
    const clean = String(sName).trim();
    if (clean && !existing.includes(clean)) {
      existing.push(clean);
      const codeKey = `${cleanGrade}_${clean}`;
      let code = generateStreamCode(school.adminCode, cleanGrade, clean);
      let suffix = 1;
      while (
        store.schools.some(s => Object.values(s.joinCodes || {}).includes(code)) ||
        Object.entries(school.joinCodes).some(([k, v]) => k !== codeKey && v === code)
      ) {
        code = `${generateStreamCode(school.adminCode, cleanGrade, clean)}${suffix}`;
        suffix++;
      }
      school.joinCodes[codeKey] = code;
    }
  });

  saveJson(SCHOOLS_FILE, store);

  syncDb(() => {
    db.querySync(`
      UPDATE schools
      SET grades = $2,
          streams = $3,
          join_codes = $4
      WHERE id = $1
    `, [
      school.id,
      db.toJson(school.grades),
      db.toJson(school.streams),
      db.toJson(school.joinCodes)
    ]);
  });

  return school;
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — TEACHER AUTHENTICATION & RBAC
// ══════════════════════════════════════════════════════════════

/**
 * Register a teacher or school admin
 */
async function createTeacher({ name, idNumber, email, phone, password, role = 'subject_teacher', schoolId, assignments = [] }) {
  const store = loadJson(TEACHERS_FILE, { teachers: [] });

  const cleanName = (name || '').trim();
  const cleanIdNumber = (idNumber || '').trim().toUpperCase();
  const cleanEmail = (email || '').trim().toLowerCase();
  const normPhone = authUtils.normalizeKenyanPhone(phone);

  if (!cleanName) throw new Error('Teacher full name is required.');
  if (!cleanIdNumber) throw new Error('National ID or Passport number is required for institutional accreditation.');
  if (!cleanEmail && !normPhone) throw new Error('Teacher email or Kenyan mobile number is required.');

  if (cleanEmail) {
    const emailCheck = authUtils.isValidEmail(cleanEmail);
    if (!emailCheck.valid) {
      throw new Error(emailCheck.error);
    }
  }

  // Validate ID number uniqueness
  if (store.teachers.some(t => t.idNumber === cleanIdNumber)) {
    throw new Error('A teacher account with this ID/Passport number already exists.');
  }

  // Validate email / phone uniqueness
  if (cleanEmail && store.teachers.some(t => t.email === cleanEmail)) {
    throw new Error('A teacher account with this email already exists.');
  }
  if (normPhone && store.teachers.some(t => t.phone === normPhone)) {
    throw new Error('A teacher account with this phone number already exists.');
  }

  // Password validation
  const passCheck = authUtils.validatePassword(password);
  if (!passCheck.valid) {
    throw new Error(passCheck.error || 'Password does not meet strength requirements.');
  }

  // Verify school exists
  const school = getSchoolById(schoolId);
  if (!school) throw new Error('Valid school association required.');

  // Role validation: school_admin (headteacher), subject_teacher, class_teacher
  const validRoles = ['school_admin', 'subject_teacher', 'class_teacher'];
  const cleanRole = validRoles.includes(role) ? role : 'subject_teacher';

  // For school_admin (headteacher), assignments are empty (they have full access across the school)
  const cleanAssignments = cleanRole === 'school_admin'
    ? []
    : Array.isArray(assignments) ? assignments : [];

  const passwordHash = await authUtils.hashCredential(password);
  const teacherId = 'tch_' + crypto.randomBytes(6).toString('hex');

  const newTeacher = {
    id: teacherId,
    name: cleanName,
    idNumber: cleanIdNumber,
    email: cleanEmail || `${normPhone}@teacher.elingu.local`,
    phone: normPhone || null,
    passwordHash,
    role: cleanRole,
    schoolId,
    schoolName: school.name,
    assignments: cleanAssignments,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    failedLoginAttempts: 0,
    lockedUntil: null
  };

  store.teachers.push(newTeacher);
  saveJson(TEACHERS_FILE, store);

  syncDb(() => {
    db.querySync(`
      INSERT INTO teachers (
        id, name, id_number, email, phone, password_hash, role,
        school_id, school_name, assignments, failed_login_attempts,
        locked_until, created_at, last_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT(id) DO UPDATE SET
        failed_login_attempts = EXCLUDED.failed_login_attempts,
        locked_until = EXCLUDED.locked_until,
        last_active = EXCLUDED.last_active
    `, [
      newTeacher.id,
      newTeacher.name,
      newTeacher.idNumber,
      newTeacher.email,
      newTeacher.phone,
      newTeacher.passwordHash,
      newTeacher.role,
      newTeacher.schoolId,
      newTeacher.schoolName,
      db.toJson(newTeacher.assignments),
      newTeacher.failedLoginAttempts,
      newTeacher.lockedUntil,
      newTeacher.createdAt,
      newTeacher.lastActive
    ]);
  });

  // Return sanitized object (no hash)
  const { passwordHash: _, ...sanitized } = newTeacher;
  return sanitized;
}

function getTeacherById(teacherId, includePrivate = false) {
  if (!teacherId) return null;
  const store = loadJson(TEACHERS_FILE, { teachers: [] });
  const teacher = store.teachers.find(t => t.id === teacherId);
  if (!teacher) return null;
  if (includePrivate) return teacher;
  const { passwordHash: _, ...safe } = teacher;
  return safe;
}

function getTeacherByIdentifier(identifier, includePrivate = false) {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  const normPhone = authUtils.normalizeKenyanPhone(identifier);
  const store = loadJson(TEACHERS_FILE, { teachers: [] });

  const teacher = store.teachers.find(t =>
    t.email === clean ||
    (t.phone && normPhone && t.phone === normPhone) ||
    t.idNumber === clean.toUpperCase()
  );
  if (!teacher) return null;
  if (includePrivate) return teacher;
  const { passwordHash: _, ...safe } = teacher;
  return safe;
}

/**
 * Authenticate teacher login with lockout protection
 */
async function verifyTeacherLogin(identifier, password) {
  const teacher = getTeacherByIdentifier(identifier, true);
  if (!teacher) {
    return { success: false, error: 'Invalid credentials. Please check your email, phone, or ID.' };
  }

  // Lockout check
  const lockout = authUtils.checkLockout(teacher);
  if (lockout.locked) {
    return {
      success: false,
      locked: true,
      error: `Account is temporarily locked due to multiple failed attempts. Try again in ${lockout.minutesRemaining} minutes.`
    };
  }

  const isValid = await authUtils.verifyCredential(password, teacher.passwordHash, 'elingu_salt_2026');
  const store = loadJson(TEACHERS_FILE, { teachers: [] });
  const liveRecord = store.teachers.find(t => t.id === teacher.id);

  if (!isValid) {
    const failed = authUtils.recordFailedAttempt(liveRecord, 'teacher');
    saveJson(TEACHERS_FILE, store);
    if (failed.locked) {
      return { success: false, locked: true, error: 'Too many incorrect attempts. Account locked for 15 minutes.' };
    }
    return {
      success: false,
      error: `Invalid credentials: Incorrect password. ${failed.attemptsRemaining} attempt(s) remaining.`
    };
  }

  // Success
  authUtils.clearFailedAttempts(liveRecord);
  liveRecord.lastActive = new Date().toISOString();
  saveJson(TEACHERS_FILE, store);

  const { passwordHash: _, ...sanitized } = liveRecord;
  return { success: true, teacher: sanitized };
}

function getTeachersBySchool(schoolId) {
  if (!schoolId) return [];
  const store = loadJson(TEACHERS_FILE, { teachers: [] });
  return store.teachers
    .filter(t => t.schoolId === schoolId)
    .map(({ passwordHash, ...safe }) => safe);
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — MISSIONS (LIVE ASSIGNMENTS) & ANSWER MODES
// ══════════════════════════════════════════════════════════════

/**
 * Supported Answer Modes across CBC subjects:
 * - Mathematics: numeric, step_by_step, mcq, true_false
 * - English: free_text, comprehension_mcq, fill_blank, grammar_correction
 * - Science & Tech: mcq, short_answer, diagram_label, true_false
 * - Social Studies: mcq, short_answer, map_identification
 * - Kiswahili: translation, fill_blank, comprehension, insha
 */
const SUPPORTED_ANSWER_MODES = [
  'numeric', 'step_by_step', 'mcq', 'true_false',
  'free_text', 'comprehension_mcq', 'fill_blank', 'grammar_correction',
  'short_answer', 'diagram_label', 'map_identification',
  'translation', 'comprehension', 'insha'
];

/**
 * Create a new Mission (Live Assignment) pushed to a specific stream
 */
function createMission({
  teacherId,
  teacherName,
  schoolId,
  grade,
  stream,
  subject,
  strand,
  title,
  hintMode = 'open', // 'open' | 'closed' | 'timed'
  hintDelayMinutes = null,
  displayMode = 'sequential',
  items = [],
  deadline = null
}) {
  const store = loadJson(MISSIONS_FILE, { missions: [] });

  const cleanGrade = parseInt(grade);
  const cleanStream = String(stream || '').trim();
  const cleanSubject = String(subject || '').trim();
  const cleanTitle = String(title || `${cleanSubject} Mission`).trim();

  if (!cleanGrade || !cleanStream || !cleanSubject) {
    throw new Error('Grade, Stream, and Subject are required for mission dispatch.');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Mission must contain at least 1 assessment question item.');
  }

  // Validate items
  const validatedItems = items.map((item, idx) => {
    const qId = item.id || `q${idx + 1}`;
    const questionText = String(item.question || '').trim();
    if (!questionText) throw new Error(`Question ${idx + 1} text is missing.`);

    const mode = SUPPORTED_ANSWER_MODES.includes(item.answerMode) ? item.answerMode : 'short_answer';
    const expected = String(item.expectedAnswer || '').trim();
    const variants = Array.isArray(item.acceptableVariants)
      ? item.acceptableVariants.map(v => String(v).trim().toLowerCase())
      : [expected.toLowerCase()];

    return {
      id: qId,
      question: questionText,
      answerMode: mode,
      expectedAnswer: expected,
      acceptableVariants: variants,
      mcqOptions: Array.isArray(item.mcqOptions) ? item.mcqOptions : null,
      mcqCorrectIndex: item.mcqCorrectIndex !== undefined ? parseInt(item.mcqCorrectIndex) : null,
      diagramUrl: item.diagramUrl || null,
      passage: item.passage || null,
      hintSequence: Array.isArray(item.hintSequence) ? item.hintSequence : [],
      difficulty: ['EE', 'ME', 'AE', 'BE'].includes(item.difficulty) ? item.difficulty : 'ME'
    };
  });

  const missionId = 'msn_' + crypto.randomBytes(6).toString('hex');
  const newMission = {
    id: missionId,
    teacherId,
    teacherName: teacherName || 'Mwalimu',
    schoolId,
    grade: cleanGrade,
    stream: cleanStream,
    subject: cleanSubject,
    strand: strand || 'General Competency',
    title: cleanTitle,
    hintMode: ['open', 'closed', 'timed'].includes(hintMode) ? hintMode : 'open',
    hintDelayMinutes: hintMode === 'timed' ? (parseInt(hintDelayMinutes) || 3) : null,
    displayMode: displayMode === 'all_at_once' ? 'all_at_once' : 'sequential',
    items: validatedItems,
    pushedAt: new Date().toISOString(),
    deadline: deadline || null,
    status: 'active',
    submissions: {},
    createdAt: new Date().toISOString()
  };

  store.missions.push(newMission);
  saveJson(MISSIONS_FILE, store);

  syncDb(() => {
    db.querySync(`
      INSERT INTO missions (
        id, teacher_id, teacher_name, school_id, grade, stream, subject,
        strand, sub_strand, title, hint_mode, hint_delay_minutes,
        display_mode, items, submissions, pushed_at, deadline, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT(id) DO UPDATE SET
        submissions = EXCLUDED.submissions,
        status = EXCLUDED.status
    `, [
      newMission.id,
      newMission.teacherId,
      newMission.teacherName,
      newMission.schoolId,
      newMission.grade,
      newMission.stream,
      newMission.subject,
      newMission.strand,
      newMission.subStrand || null,
      newMission.title,
      newMission.hintMode,
      newMission.hintDelayMinutes,
      newMission.displayMode,
      db.toJson(newMission.items),
      db.toJson(newMission.submissions),
      newMission.pushedAt,
      newMission.deadline,
      newMission.status,
      newMission.createdAt
    ]);
  });

  return newMission;
}

function getMissionById(missionId) {
  if (!missionId) return null;
  const store = loadJson(MISSIONS_FILE, { missions: [] });
  return store.missions.find(m => m.id === missionId) || null;
}

/**
 * Get active missions for a student's stream and subject
 */
function getActiveMissionsForStudent(schoolId, grade, stream, subject) {
  if (!schoolId || !grade || !stream) return [];
  const store = loadJson(MISSIONS_FILE, { missions: [] });
  const cleanGrade = parseInt(grade);
  const cleanStream = String(stream).trim().toLowerCase();
  const cleanSubject = (subject || '').trim().toLowerCase();

  return store.missions.filter(m =>
    m.schoolId === schoolId &&
    m.grade === cleanGrade &&
    m.stream.trim().toLowerCase() === cleanStream &&
    m.status === 'active' &&
    (!cleanSubject || m.subject.toLowerCase() === cleanSubject)
  );
}

/**
 * Get all missions created by a teacher
 */
function getMissionsByTeacher(teacherId) {
  if (!teacherId) return [];
  const store = loadJson(MISSIONS_FILE, { missions: [] });
  return store.missions.filter(m => m.teacherId === teacherId);
}

/**
 * Get all missions for a school
 */
function getMissionsBySchool(schoolId) {
  if (!schoolId) return [];
  const store = loadJson(MISSIONS_FILE, { missions: [] });
  return store.missions.filter(m => m.schoolId === schoolId);
}

/**
 * Get all missions for a specific stream
 */
function getMissionsByStream(schoolId, grade, stream) {
  if (!schoolId || !grade || !stream) return [];
  const store = loadJson(MISSIONS_FILE, { missions: [] });
  const cleanGrade = parseInt(grade);
  const cleanStream = String(stream).trim().toLowerCase();
  return store.missions.filter(m =>
    m.schoolId === schoolId &&
    m.grade === cleanGrade &&
    m.stream.trim().toLowerCase() === cleanStream
  );
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — PROCESS TRAIL TRACKING & EVALUATION (8 DIMENSIONS)
// ══════════════════════════════════════════════════════════════

/**
 * Normalize an answer for comparison
 */
function normalizeAnswer(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s/.-]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Evaluate student answer against expected answer and acceptable variants
 */
function evaluateAnswer(item, studentAnswer) {
  const normInput = normalizeAnswer(studentAnswer);
  if (!normInput) return false;

  // MCQ index or text match
  if (item.answerMode === 'mcq' || item.answerMode === 'comprehension_mcq') {
    if (item.mcqOptions && item.mcqCorrectIndex !== null && item.mcqCorrectIndex !== undefined) {
      const correctText = normalizeAnswer(item.mcqOptions[item.mcqCorrectIndex]);
      if (normInput === correctText) return true;
      // Also match option letters: "A", "B", "C", "D" or index
      const letterIdx = ['a', 'b', 'c', 'd'].indexOf(normInput);
      if (letterIdx === item.mcqCorrectIndex) return true;
      if (parseInt(normInput) === item.mcqCorrectIndex + 1) return true;
    }
  }

  // Exact or variant match
  const normExpected = normalizeAnswer(item.expectedAnswer);
  if (normInput === normExpected) return true;

  if (Array.isArray(item.acceptableVariants)) {
    return item.acceptableVariants.some(v => normalizeAnswer(v) === normInput);
  }

  return false;
}

/**
 * Classify reasoning quality of a wrong attempt
 */
function classifyReasoningQuality(item, answer) {
  const clean = normalizeAnswer(answer);
  // Common math fractions slip: 1/3 + 1/4 = 2/7 (adding numerators and denominators)
  if (item.answerMode === 'numeric' && clean.includes('/')) {
    const [num, den] = clean.split('/').map(n => parseInt(n));
    if (num && den) {
      return 'common_misconception'; // e.g. added tops and bottoms directly
    }
  }
  if (clean.length < 2) return 'rushed_guess';
  return 'conceptual_gap';
}

/**
 * Determine the Answer Evolution Arc (Dimension 8)
 */
function determineEvolutionArc(attempts, hintsUsed) {
  if (!attempts || attempts.length === 0) return 'abandoned';
  const firstCorrect = attempts.length === 1 && attempts[0].correct;
  if (firstCorrect) return 'immediate_mastery';

  const lastAttempt = attempts[attempts.length - 1];
  const eventuallyCorrect = lastAttempt && lastAttempt.correct;

  if (eventuallyCorrect) {
    if (hintsUsed && hintsUsed.length > 0) {
      return 'hint_guided_recovery';
    }
    return 'self_corrected';
  }

  return 'persistent_struggle';
}

/**
 * Map process trail to Kenya CBC Rubric Level:
 * - EE (Exceeding): Correct on 1st attempt, 0 hints
 * - ME (Meeting): Correct within 2 attempts, 0 hints
 * - AE (Approaching): Correct after 1+ hints, or 3 attempts
 * - BE (Below): Not solved / persistent struggle
 */
function calculateCBELevel(itemResult) {
  const arc = itemResult.evolutionArc;
  if (arc === 'immediate_mastery') return 'EE';
  if (arc === 'self_corrected') return 'ME';
  if (arc === 'hint_guided_recovery') return 'AE';
  return 'BE';
}

/**
 * Record a student's answer attempt or hint interaction in a mission
 */
function recordMissionInteraction({
  missionId,
  studentId,
  studentHandle,
  itemId,
  answer,
  timeSpentSec = 0,
  hintRequested = false,
  hintIndex = null,
  hintReadingTimeMs = 0
}) {
  const store = loadJson(MISSIONS_FILE, { missions: [] });
  const mission = store.missions.find(m => m.id === missionId);
  if (!mission) throw new Error('Mission not found.');

  // Cross-school and stream authorization check (C2)
  const studentStore = require('./studentStore');
  const student = studentStore.getStudentById(studentId);
  if (!student) {
    const err = new Error('Student account not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const studentSchoolId = student.schoolId;
  const studentGrade = parseInt(student.grade);
  const studentStream = String(student.stream || '').trim().toLowerCase();
  const missionStream = String(mission.stream || '').trim().toLowerCase();

  if (studentSchoolId !== mission.schoolId || studentGrade !== mission.grade || studentStream !== missionStream) {
    const err = new Error('FORBIDDEN_STREAM: Learner is not enrolled in this school stream.');
    err.code = 'FORBIDDEN_STREAM';
    throw err;
  }

  if (!mission.submissions) mission.submissions = {};
  if (!mission.submissions[studentId]) {
    mission.submissions[studentId] = {
      studentHandle: studentHandle || 'Learner',
      startedAt: new Date().toISOString(),
      completedAt: null,
      items: {},
      overallCBE: 'BE',
      engagementPace: 'thoughtful'
    };
  }

  const sub = mission.submissions[studentId];
  if (!sub.items[itemId]) {
    sub.items[itemId] = {
      attempts: [],
      hintsUsed: [],
      timeToFirstAttemptSec: timeSpentSec,
      totalTimeSpentSec: 0,
      rushScore: false,
      skippedAndReturned: false,
      evolutionArc: 'in_progress',
      cbeLevel: 'BE'
    };
  }

  const itemRecord = sub.items[itemId];
  const itemDef = mission.items.find(i => i.id === itemId);

  // If this was a hint request
  if (hintRequested && hintIndex !== null) {
    itemRecord.hintsUsed.push({
      hintIndex,
      requestedAt: new Date().toISOString(),
      timeSpentReadingMs: hintReadingTimeMs,
      approachChangedAfter: false
    });
    saveJson(MISSIONS_FILE, store);
    return {
      success: true,
      hint: itemDef ? itemDef.hintSequence[hintIndex] : null,
      hintsUsedCount: itemRecord.hintsUsed.length
    };
  }

  // Answer attempt
  const isCorrect = itemDef ? evaluateAnswer(itemDef, answer) : false;
  const reasoningQuality = isCorrect ? null : classifyReasoningQuality(itemDef, answer);

  itemRecord.attempts.push({
    answer: String(answer || '').trim(),
    correct: isCorrect,
    reasoningQuality,
    at: new Date().toISOString()
  });

  itemRecord.totalTimeSpentSec += Math.max(1, parseInt(timeSpentSec) || 5);
  itemRecord.rushScore = (itemRecord.timeToFirstAttemptSec < 8);

  // Mark if approach changed after last hint
  if (itemRecord.hintsUsed.length > 0) {
    const lastHint = itemRecord.hintsUsed[itemRecord.hintsUsed.length - 1];
    lastHint.approachChangedAfter = true;
  }

  // Update Evolution Arc & CBE Level
  itemRecord.evolutionArc = determineEvolutionArc(itemRecord.attempts, itemRecord.hintsUsed);
  itemRecord.cbeLevel = calculateCBELevel(itemRecord);

  // Check if mission complete
  const allItemIds = mission.items.map(i => i.id);
  const completedItemCount = allItemIds.filter(id => {
    const rec = sub.items[id];
    return rec && rec.attempts.some(a => a.correct);
  }).length;

  // Calculate Overall CBE
  const cbeScores = { EE: 4, ME: 3, AE: 2, BE: 1 };
  let totalScore = 0;
  let evaluatedCount = 0;

  allItemIds.forEach(id => {
    const rec = sub.items[id];
    if (rec && rec.cbeLevel) {
      totalScore += cbeScores[rec.cbeLevel] || 1;
      evaluatedCount++;
    }
  });

  const avgScore = evaluatedCount > 0 ? totalScore / evaluatedCount : 1;
  if (avgScore >= 3.5) sub.overallCBE = 'EE';
  else if (avgScore >= 2.5) sub.overallCBE = 'ME';
  else if (avgScore >= 1.7) sub.overallCBE = 'AE';
  else sub.overallCBE = 'BE';

  if (completedItemCount === allItemIds.length && !sub.completedAt) {
    sub.completedAt = new Date().toISOString();
  }

  saveJson(MISSIONS_FILE, store);

  syncDb(() => {
    db.querySync(`
      UPDATE missions
      SET submissions = $2
      WHERE id = $1
    `, [mission.id, db.toJson(mission.submissions)]);
  });

  return {
    success: true,
    evaluated: true,
    correct: isCorrect,
    isCorrect,
    attemptsCount: itemRecord.attempts.length,
    evolutionArc: itemRecord.evolutionArc,
    cbeLevel: itemRecord.cbeLevel,
    isComplete: !!sub.completedAt,
    overallCBE: sub.overallCBE
  };
}

/**
 * Get comprehensive analytics for a Mission (Teacher View)
 * Generates Stacked CBE Distribution (EE/ME/AE/BE), common roadblocks, and student process trails
 */
function getMissionAnalytics(missionId) {
  const mission = getMissionById(missionId);
  if (!mission) return null;

  const submissions = Object.values(mission.submissions || {});
  const totalSubmissions = submissions.length;

  // CBE Distribution
  const cbeCounts = { EE: 0, ME: 0, AE: 0, BE: 0 };
  submissions.forEach(s => {
    const lvl = s.overallCBE || 'BE';
    if (cbeCounts[lvl] !== undefined) cbeCounts[lvl]++;
  });

  const cbeDistribution = {
    EE: totalSubmissions > 0 ? Math.round((cbeCounts.EE / totalSubmissions) * 100) : 0,
    ME: totalSubmissions > 0 ? Math.round((cbeCounts.ME / totalSubmissions) * 100) : 0,
    AE: totalSubmissions > 0 ? Math.round((cbeCounts.AE / totalSubmissions) * 100) : 0,
    BE: totalSubmissions > 0 ? Math.round((cbeCounts.BE / totalSubmissions) * 100) : 0,
    counts: cbeCounts,
    total: totalSubmissions
  };

  // Analyze Common Roadblocks across questions
  const roadblocks = [];
  mission.items.forEach(item => {
    const wrongAnswers = [];
    submissions.forEach(sub => {
      const itemRec = sub.items && sub.items[item.id];
      if (itemRec && itemRec.attempts) {
        itemRec.attempts.filter(a => !a.correct).forEach(a => wrongAnswers.push(a.answer));
      }
    });

    if (wrongAnswers.length > 0) {
      // Find most frequent wrong answer
      const freq = {};
      wrongAnswers.forEach(ans => {
        const norm = normalizeAnswer(ans);
        if (norm) freq[norm] = (freq[norm] || 0) + 1;
      });
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0 && sorted[0][1] >= 2) {
        roadblocks.push({
          itemId: item.id,
          question: item.question,
          commonWrongAnswer: sorted[0][0],
          frequency: sorted[0][1],
          percentage: totalSubmissions > 0 ? Math.round((sorted[0][1] / totalSubmissions) * 100) : 0,
          pedagogicalNote: item.answerMode === 'numeric'
            ? 'Frequent confusion with common denominators or arithmetic signs.'
            : 'Conceptual misunderstanding of the core definition.'
        });
      }
    }
  });

  return {
    missionId: mission.id,
    title: mission.title,
    grade: mission.grade,
    stream: mission.stream,
    subject: mission.subject,
    strand: mission.strand,
    hintMode: mission.hintMode,
    totalQuestions: mission.items.length,
    pushedAt: mission.pushedAt,
    deadline: mission.deadline,
    totalSubmissions,
    cbeDistribution,
    roadblocks,
    studentTrails: submissions.map(s => ({
      studentHandle: s.studentHandle,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      overallCBE: s.overallCBE,
      items: s.items
    }))
  };
}

module.exports = {
  // School & Stream Management
  createSchool,
  getSchoolById,
  getSchoolByAdminCode,
  getSchoolByJoinCode,
  getAllSchools,
  addStreamsToSchool,
  generateAdminCode,
  generateStreamCode,

  // Teacher Authentication & RBAC
  createTeacher,
  getTeacherById,
  getTeacherByIdentifier,
  verifyTeacherLogin,
  getTeachersBySchool,

  // Missions & Assessment Engine
  createMission,
  getMissionById,
  getActiveMissionsForStudent,
  getMissionsByTeacher,
  getMissionsBySchool,
  getMissionsByStream,
  recordMissionInteraction,
  getMissionAnalytics,
  evaluateAnswer,
  SUPPORTED_ANSWER_MODES
};
