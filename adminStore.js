// ══════════════════════════════════════════════════════════════
// ELINGU SUPER ADMIN STORE & TELEMETRY ENGINE
// Compliant with Kenya Data Protection Act 2019 (Section 33 & 40)
// Centralized Founder Operations, AI Token Telemetry, School Licensing,
// User Account Support & Safety Watchtower
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const authUtils = require('./authUtils');

const DATA_DIR = path.join(__dirname, 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const TEACHERS_FILE = path.join(DATA_DIR, 'teachers.json');
const SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');
const PARENTS_FILE = path.join(DATA_DIR, 'parents.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

const USD_TO_KES = 130.0; // Current market exchange rate

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
    console.error(`[adminStore] Error loading ${filePath}:`, err.message);
  }
  return defaultValue;
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[adminStore] Error saving ${filePath}:`, err.message);
  }
}

// ── INITIALIZATION & SEEDING ────────────────────────────────

function initAdminStore() {
  const defaultData = {
    admins: [],
    telemetry: {
      daily: {}
    },
    safetyLogs: [],
    settings: {
      socraticStrictness: 'balanced',
      primaryModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
      activeProvider: process.env.MODEL_PROVIDER || 'gemini',
      pilotMode: true,
      dailyTurnLimitFree: 15,
      maintenanceMode: false
    }
  };

  const store = loadJson(ADMIN_FILE, defaultData);
  if (!store.admins) store.admins = [];
  if (!store.telemetry) store.telemetry = { daily: {} };
  if (!store.safetyLogs) store.safetyLogs = [];
  if (!store.settings) store.settings = defaultData.settings;

  // If no superadmin exists, seed the default founder admin account
  if (store.admins.length === 0) {
    const defaultEmail = (process.env.ADMIN_EMAIL || 'admin@elingu.ke').toLowerCase().trim();
    const defaultPassword = process.env.ADMIN_PASSWORD || 'REDACTED_ADMIN_PASSWORD';
    const passwordHash = authUtils.hashCredentialSync(defaultPassword);

    store.admins.push({
      id: 'admin_root_1',
      name: 'Elingu Founder & Super Admin',
      email: defaultEmail,
      passwordHash,
      role: 'super_admin',
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
      lastLogin: null
    });

    saveJson(ADMIN_FILE, store);
    console.log(`🛡️ [adminStore] Default Super Admin initialized: ${defaultEmail}`);
  }

  return store;
}

// Run initial check
initAdminStore();

// ── ADMIN AUTHENTICATION ────────────────────────────────────

/**
 * Authenticate Super Admin by email and password
 */
async function authenticateAdmin(email, password) {
  const store = loadJson(ADMIN_FILE, initAdminStore());
  const cleanEmail = (email || '').toLowerCase().trim();
  const admin = store.admins.find(a => a.email.toLowerCase() === cleanEmail);

  if (!admin) {
    return { success: false, error: 'Invalid admin credentials.' };
  }

  // Check lockout
  const lockoutStatus = authUtils.checkLockout(admin, 5, 30);
  if (lockoutStatus.locked) {
    return {
      success: false,
      locked: true,
      error: `Account is temporarily locked. Please try again in ${lockoutStatus.minutesRemaining} minute(s).`
    };
  }

  const isValid = await authUtils.verifyCredential(password, admin.passwordHash);
  if (!isValid) {
    authUtils.recordFailedAttempt(admin, 5, 30);
    saveJson(ADMIN_FILE, store);
    return { success: false, error: 'Invalid admin credentials.' };
  }

  authUtils.clearFailedAttempts(admin);
  admin.lastLogin = new Date().toISOString();
  saveJson(ADMIN_FILE, store);

  const token = authUtils.generateAdminToken(admin);
  return {
    success: true,
    token,
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role
    }
  };
}

// ── AI TOKEN TELEMETRY & COST MONITORING ────────────────────

/**
 * Record real-time token usage from an LLM call
 */
function recordTokenUsage({ provider = 'gemini', model = '', inputTokens = 0, outputTokens = 0, costUsd = 0, subject = 'Mathematics', studentId = null }) {
  try {
    const store = loadJson(ADMIN_FILE, initAdminStore());
    const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (!store.telemetry) store.telemetry = { daily: {} };
    if (!store.telemetry.daily) store.telemetry.daily = {};
    if (!store.telemetry.daily[dateKey]) {
      store.telemetry.daily[dateKey] = {
        totalCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        subjects: {},
        models: {}
      };
    }

    const day = store.telemetry.daily[dateKey];
    day.totalCalls += 1;
    day.inputTokens += Math.max(0, parseInt(inputTokens) || 0);
    day.outputTokens += Math.max(0, parseInt(outputTokens) || 0);
    day.costUsd += Math.max(0, parseFloat(costUsd) || 0);

    // Subject breakdown
    const cleanSub = subject || 'General';
    day.subjects[cleanSub] = (day.subjects[cleanSub] || 0) + 1;

    // Model breakdown
    const cleanModel = model || provider;
    day.models[cleanModel] = (day.models[cleanModel] || 0) + 1;

    saveJson(ADMIN_FILE, store);
  } catch (err) {
    console.error('[adminStore] Failed to record token usage:', err.message);
  }
}

/**
 * Get aggregated metrics for the Command Center dashboard
 */
function getTelemetryMetrics() {
  const store = loadJson(ADMIN_FILE, initAdminStore());
  const studentsStore = loadJson(STUDENTS_FILE, { students: [] });
  const teachersStore = loadJson(TEACHERS_FILE, { teachers: [] });
  const schoolsStore = loadJson(SCHOOLS_FILE, { schools: [] });
  const parentsStore = loadJson(PARENTS_FILE, { parents: [] });
  const sessionsStore = loadJson(SESSIONS_FILE, { sessions: {} });

  const dateKey = new Date().toISOString().split('T')[0];
  const todayData = store.telemetry?.daily?.[dateKey] || {
    totalCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    subjects: {},
    models: {}
  };

  // Calculate 7-day totals
  const allDates = Object.keys(store.telemetry?.daily || {}).sort().reverse();
  const last7Dates = allDates.slice(0, 7);

  let weekCalls = 0;
  let weekTokens = 0;
  let weekCostUsd = 0;
  const aggregatedSubjects = {};

  last7Dates.forEach(d => {
    const entry = store.telemetry.daily[d];
    if (entry) {
      weekCalls += entry.totalCalls || 0;
      weekTokens += (entry.inputTokens || 0) + (entry.outputTokens || 0);
      weekCostUsd += entry.costUsd || 0;
      Object.entries(entry.subjects || {}).forEach(([sub, count]) => {
        aggregatedSubjects[sub] = (aggregatedSubjects[sub] || 0) + count;
      });
    }
  });

  // Calculate Active Students today (students with activity today)
  const activeStudentsToday = (studentsStore.students || []).filter(s => {
    return s.dailyTurnDate === dateKey && (s.dailyTurnsCount || 0) > 0;
  }).length;

  // Total turns across platform
  const totalTurnsAllTime = (studentsStore.students || []).reduce((acc, s) => acc + (s.totalTurns || 0), 0);

  // Unresolved safety alerts count
  const pendingSafetyCount = (store.safetyLogs || []).filter(l => !l.resolved).length;

  return {
    today: {
      date: dateKey,
      totalCalls: todayData.totalCalls,
      totalTokens: todayData.inputTokens + todayData.outputTokens,
      inputTokens: todayData.inputTokens,
      outputTokens: todayData.outputTokens,
      costUsd: parseFloat(todayData.costUsd.toFixed(4)),
      costKes: parseFloat((todayData.costUsd * USD_TO_KES).toFixed(2)),
      activeStudents: activeStudentsToday,
      subjects: todayData.subjects
    },
    week: {
      totalCalls: weekCalls,
      totalTokens: weekTokens,
      costUsd: parseFloat(weekCostUsd.toFixed(4)),
      costKes: parseFloat((weekCostUsd * USD_TO_KES).toFixed(2)),
      subjects: aggregatedSubjects
    },
    counts: {
      totalStudents: (studentsStore.students || []).length,
      totalTeachers: (teachersStore.teachers || []).length,
      totalSchools: (schoolsStore.schools || []).length,
      totalParents: (parentsStore.parents || []).length,
      totalTurnsAllTime,
      pendingSafetyCount
    },
    recentDays: last7Dates.map(d => ({
      date: d,
      ...store.telemetry.daily[d],
      costKes: parseFloat(((store.telemetry.daily[d]?.costUsd || 0) * USD_TO_KES).toFixed(2))
    }))
  };
}

// ── SAFETY WATCHTOWER & INCIDENT LOGGING ────────────────────

/**
 * Record a blocked phrase, prompt-injection, or distress keyword trigger
 */
function recordSafetyIncident({ studentId = null, handle = 'Learner', matchedWord = '', message = '', category = 'blocked_phrase', type = 'warning' }) {
  try {
    const store = loadJson(ADMIN_FILE, initAdminStore());
    if (!store.safetyLogs) store.safetyLogs = [];

    const incident = {
      id: 'inc_' + crypto.randomBytes(6).toString('hex'),
      timestamp: new Date().toISOString(),
      studentId,
      handle,
      matchedWord,
      messageSnippet: (message || '').slice(0, 120),
      category, // 'blocked_phrase' | 'jailbreak_attempt' | 'distress_keyword'
      type,     // 'high' | 'medium' | 'warning'
      resolved: false,
      resolvedAt: null,
      resolvedBy: null
    };

    store.safetyLogs.unshift(incident);
    // Keep max 500 incidents in store
    if (store.safetyLogs.length > 500) {
      store.safetyLogs = store.safetyLogs.slice(0, 500);
    }

    saveJson(ADMIN_FILE, store);
    console.log(`🛡️ [SafetyWatchtower] Incident logged [${category}]: "${matchedWord}" by ${handle}`);
    return incident;
  } catch (err) {
    console.error('[adminStore] Failed to record safety incident:', err.message);
  }
}

/**
 * Retrieve safety incidents with filtering
 */
function getSafetyLogs({ filter = 'all', limit = 50 }) {
  const store = loadJson(ADMIN_FILE, initAdminStore());
  let logs = store.safetyLogs || [];

  if (filter === 'pending') {
    logs = logs.filter(l => !l.resolved);
  } else if (filter === 'resolved') {
    logs = logs.filter(l => l.resolved);
  }

  return logs.slice(0, limit);
}

/**
 * Mark a safety incident as reviewed and resolved
 */
function resolveSafetyIncident(incidentId, adminEmail = 'superadmin') {
  const store = loadJson(ADMIN_FILE, initAdminStore());
  const incident = (store.safetyLogs || []).find(l => l.id === incidentId);
  if (!incident) return { success: false, error: 'Incident not found.' };

  incident.resolved = true;
  incident.resolvedAt = new Date().toISOString();
  incident.resolvedBy = adminEmail;

  saveJson(ADMIN_FILE, store);
  return { success: true, incident };
}

// ── USER MANAGEMENT & SUPPORT ACTIONS ───────────────────────

/**
 * Get unified list of all users across Students, Teachers, and Parents
 */
function getAllUsers({ role = 'all', search = '', page = 1, limit = 40 }) {
  const studentsStore = loadJson(STUDENTS_FILE, { students: [] });
  const teachersStore = loadJson(TEACHERS_FILE, { teachers: [] });
  const parentsStore = loadJson(PARENTS_FILE, { parents: [] });

  let combined = [];

  // 1. Format students
  if (role === 'all' || role === 'student') {
    (studentsStore.students || []).forEach(s => {
      combined.push({
        id: s.id,
        role: 'student',
        displayName: s.handle || 'Learner',
        identifier: s.handle || s.id,
        subInfo: `Grade ${s.grade || 7} • ${s.schoolName || 'Independent'}`,
        contact: s.parentPhone || s.parentEmail || '—',
        subscriptionTier: s.subscriptionTier || 'free',
        failedAttempts: s.failedLoginAttempts || 0,
        isLocked: s.lockedUntil && new Date(s.lockedUntil) > new Date(),
        turnsUsed: s.totalTurns || 0,
        createdAt: s.createdAt,
        lastActive: s.lastActive || s.createdAt
      });
    });
  }

  // 2. Format teachers
  if (role === 'all' || role === 'teacher') {
    (teachersStore.teachers || []).forEach(t => {
      combined.push({
        id: t.id,
        role: 'teacher',
        displayName: t.name || 'Mwalimu',
        identifier: t.email || t.phone || t.id,
        subInfo: `TSC/ID: ${t.idNumber || '—'} • ${t.schoolId || 'School'}`,
        contact: t.phone || t.email,
        subscriptionTier: 'institutional',
        failedAttempts: t.failedLoginAttempts || 0,
        isLocked: t.lockedUntil && new Date(t.lockedUntil) > new Date(),
        turnsUsed: (t.assignments || []).length + ' missions',
        createdAt: t.createdAt,
        lastActive: t.lastActive || t.createdAt
      });
    });
  }

  // 3. Format parents
  if (role === 'all' || role === 'parent') {
    (parentsStore.parents || []).forEach(p => {
      combined.push({
        id: p.id,
        role: 'parent',
        displayName: p.name || 'Parent/Guardian',
        identifier: p.phone || p.email || p.id,
        subInfo: `${(p.children || []).length} linked learner(s)`,
        contact: p.phone || p.email,
        subscriptionTier: p.subscriptionTier || 'free',
        failedAttempts: p.failedLoginAttempts || 0,
        isLocked: p.lockedUntil && new Date(p.lockedUntil) > new Date(),
        turnsUsed: '—',
        createdAt: p.createdAt,
        lastActive: p.lastActive || p.createdAt
      });
    });
  }

  // Filter by search query
  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    combined = combined.filter(u => 
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      (u.identifier && u.identifier.toLowerCase().includes(q)) ||
      (u.subInfo && u.subInfo.toLowerCase().includes(q)) ||
      (u.contact && u.contact.toLowerCase().includes(q))
    );
  }

  // Sort by recent activity
  combined.sort((a, b) => new Date(b.lastActive || 0) - new Date(a.lastActive || 0));

  const total = combined.length;
  const startIndex = (page - 1) * limit;
  const paginated = combined.slice(startIndex, startIndex + limit);

  return {
    users: paginated,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * 1-Click Unlock User Account (Student, Teacher, Parent)
 */
function unlockUser({ role, id }) {
  if (role === 'student') {
    const store = loadJson(STUDENTS_FILE, { students: [] });
    const student = store.students.find(s => s.id === id);
    if (!student) return { success: false, error: 'Student not found.' };
    student.failedLoginAttempts = 0;
    student.lockedUntil = null;
    saveJson(STUDENTS_FILE, store);
    return { success: true, message: `Learner ${student.handle} unlocked successfully.` };
  }

  if (role === 'teacher') {
    const store = loadJson(TEACHERS_FILE, { teachers: [] });
    const teacher = store.teachers.find(t => t.id === id);
    if (!teacher) return { success: false, error: 'Teacher not found.' };
    teacher.failedLoginAttempts = 0;
    teacher.lockedUntil = null;
    saveJson(TEACHERS_FILE, store);
    return { success: true, message: `Teacher ${teacher.name} unlocked successfully.` };
  }

  if (role === 'parent') {
    const store = loadJson(PARENTS_FILE, { parents: [] });
    const parent = store.parents.find(p => p.id === id);
    if (!parent) return { success: false, error: 'Parent not found.' };
    parent.failedLoginAttempts = 0;
    parent.lockedUntil = null;
    saveJson(PARENTS_FILE, store);
    return { success: true, message: 'Parent account unlocked successfully.' };
  }

  return { success: false, error: 'Invalid user role.' };
}

/**
 * Admin Override: Reset Student 4-digit PIN
 */
function resetStudentPin(studentId, newPin = '2026') {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) return { success: false, error: 'Student not found.' };

  const cleanPin = String(newPin).trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    return { success: false, error: 'PIN must be exactly 4 digits.' };
  }

  student.pinHash = authUtils.hashCredentialSync(cleanPin);
  student.failedLoginAttempts = 0;
  student.lockedUntil = null;
  saveJson(STUDENTS_FILE, store);

  return { success: true, message: `PIN for ${student.handle} reset to ${cleanPin}.` };
}

/**
 * Admin Override: Update Student Subscription Tier
 */
function updateStudentTier(studentId, newTier) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) return { success: false, error: 'Student not found.' };

  const validTiers = ['free', 'standard', 'premium', 'school_pilot'];
  if (!validTiers.includes(newTier)) {
    return { success: false, error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` };
  }

  student.subscriptionTier = newTier;
  saveJson(STUDENTS_FILE, store);
  return { success: true, message: `${student.handle} upgraded to ${newTier.toUpperCase()}.` };
}

// ── SCHOOLS & INSTITUTIONAL DIRECTORY ───────────────────────

/**
 * Retrieve master school directory with stream rosters and join codes
 */
function getAllSchoolsDirectory() {
  const schoolsStore = loadJson(SCHOOLS_FILE, { schools: [] });
  const teachersStore = loadJson(TEACHERS_FILE, { teachers: [] });
  const studentsStore = loadJson(STUDENTS_FILE, { students: [] });

  const schools = (schoolsStore.schools || []).map(sch => {
    // Count teachers assigned to this school
    const assignedTeachers = (teachersStore.teachers || []).filter(t => t.schoolId === sch.id);
    
    // Count students enrolled in this school
    const enrolledStudents = (studentsStore.students || []).filter(s => s.schoolId === sch.id || s.schoolName === sch.name);

    return {
      id: sch.id,
      name: sch.name,
      county: sch.county || 'Nairobi',
      subCounty: sch.subCounty || 'Central',
      adminCode: sch.adminCode,
      isPilot: sch.isPilot !== false, // default true in pilot
      pilotExpiresAt: sch.pilotExpiresAt || null,
      grades: sch.grades || [6, 7, 8, 9],
      streams: sch.streams || {},
      joinCodes: sch.joinCodes || {},
      teacherCount: assignedTeachers.length,
      studentCount: enrolledStudents.length,
      teachers: assignedTeachers.map(t => ({ id: t.id, name: t.name, phone: t.phone, email: t.email })),
      createdAt: sch.createdAt || new Date().toISOString()
    };
  });

  return schools;
}

/**
 * Toggle or update school pilot licensing status
 */
function updateSchoolPilotStatus(schoolId, { isPilot = true, pilotExpiresAt = null }) {
  const store = loadJson(SCHOOLS_FILE, { schools: [] });
  const school = store.schools.find(s => s.id === schoolId);
  if (!school) return { success: false, error: 'School not found.' };

  school.isPilot = Boolean(isPilot);
  if (pilotExpiresAt) school.pilotExpiresAt = pilotExpiresAt;

  saveJson(SCHOOLS_FILE, store);
  return { success: true, school };
}

// ── SUBSCRIPTIONS & M-PESA RECONCILIATION ────────────────────

/**
 * Retrieve M-Pesa payments and account subscriptions ledger
 */
function getSubscriptionsLedger() {
  const analyticsStore = loadJson(ANALYTICS_FILE, { mpesaTransactions: [] });
  const parentsStore = loadJson(PARENTS_FILE, { parents: [] });
  const studentsStore = loadJson(STUDENTS_FILE, { students: [] });

  const transactions = analyticsStore.mpesaTransactions || [];

  // Group accounts by subscription tier
  const tierCounts = {
    free: 0,
    standard: 0,
    premium: 0,
    school_pilot: 0
  };

  (studentsStore.students || []).forEach(s => {
    const tier = s.subscriptionTier || 'free';
    if (tierCounts[tier] !== undefined) tierCounts[tier]++;
    else tierCounts.free++;
  });

  return {
    tierCounts,
    totalSubscribers: tierCounts.standard + tierCounts.premium + tierCounts.school_pilot,
    transactions: transactions.slice(0, 50)
  };
}

module.exports = {
  authenticateAdmin,
  recordTokenUsage,
  getTelemetryMetrics,
  recordSafetyIncident,
  getSafetyLogs,
  resolveSafetyIncident,
  getAllUsers,
  unlockUser,
  resetStudentPin,
  updateStudentTier,
  getAllSchoolsDirectory,
  updateSchoolPilotStatus,
  getSubscriptionsLedger
};
