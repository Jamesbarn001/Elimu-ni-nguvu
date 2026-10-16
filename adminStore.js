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

// Market forex exchange rate (Safaricom M-Pesa / CBK indicative rate: ~129.50 KES per USD)
const USD_TO_KES = parseFloat(process.env.FOREX_USD_TO_KES || '129.50');

// Comprehensive Per-Model Token Pricing Table ($ USD per 1 token)
// Sourced from official Google Gemini, OpenAI, Groq, and Anthropic pricing
const MODEL_PRICING_TABLE = {
  // Google Gemini Models
  'gemini-flash-lite-latest': { input: 0.075 / 1e6, output: 0.300 / 1e6, provider: 'gemini', displayName: 'Gemini 2.0 Flash Lite' },
  'gemini-2.0-flash-lite':    { input: 0.075 / 1e6, output: 0.300 / 1e6, provider: 'gemini', displayName: 'Gemini 2.0 Flash Lite' },
  'gemini-2.5-flash':         { input: 0.100 / 1e6, output: 0.400 / 1e6, provider: 'gemini', displayName: 'Gemini 2.5 Flash' },
  'gemini-2.0-flash':         { input: 0.100 / 1e6, output: 0.400 / 1e6, provider: 'gemini', displayName: 'Gemini 2.0 Flash' },
  'gemini-1.5-flash':         { input: 0.075 / 1e6, output: 0.300 / 1e6, provider: 'gemini', displayName: 'Gemini 1.5 Flash' },
  'gemini-3.7-flash':         { input: 1.250 / 1e6, output: 5.000 / 1e6, provider: 'gemini', displayName: 'Gemini 3.7 Flash' },
  'gemini-1.5-pro':           { input: 1.250 / 1e6, output: 5.000 / 1e6, provider: 'gemini', displayName: 'Gemini 1.5 Pro' },

  // OpenAI Models
  'gpt-4o-mini':              { input: 0.150 / 1e6, output: 0.600 / 1e6, provider: 'openai', displayName: 'OpenAI GPT-4o Mini' },
  'gpt-4o':                   { input: 2.500 / 1e6, output: 10.00 / 1e6, provider: 'openai', displayName: 'OpenAI GPT-4o' },

  // Groq Accelerated Open-Weights
  'llama-3.3-70b-versatile':  { input: 0.590 / 1e6, output: 0.790 / 1e6, provider: 'groq', displayName: 'Groq Llama 3.3 70B' },
  'llama3-70b-8192':          { input: 0.590 / 1e6, output: 0.790 / 1e6, provider: 'groq', displayName: 'Groq Llama 3 70B' },
  'qwen-2.5-32b':             { input: 0.060 / 1e6, output: 0.060 / 1e6, provider: 'groq', displayName: 'Groq Qwen 2.5 32B' },
  'llama-3.1-8b-instant':     { input: 0.050 / 1e6, output: 0.080 / 1e6, provider: 'groq', displayName: 'Groq Llama 3.1 8B' },

  // Anthropic Claude (Pedagogical Safety & Crisis Escalation)
  'claude-3-5-haiku-20241022': { input: 0.800 / 1e6, output: 4.000 / 1e6, provider: 'anthropic', displayName: 'Claude 3.5 Haiku' },
  'claude-haiku':              { input: 0.800 / 1e6, output: 4.000 / 1e6, provider: 'anthropic', displayName: 'Claude Haiku' },
  'claude-sonnet-4-6':         { input: 3.000 / 1e6, output: 15.00 / 1e6, provider: 'anthropic', displayName: 'Claude Sonnet 4.6 (Crisis)' },
  'claude-3-5-sonnet-20241022':{ input: 3.000 / 1e6, output: 15.00 / 1e6, provider: 'anthropic', displayName: 'Claude 3.5 Sonnet' },
  'claude-3-7-sonnet':         { input: 3.000 / 1e6, output: 15.00 / 1e6, provider: 'anthropic', displayName: 'Claude 3.7 Sonnet' }
};

const PROVIDER_DEFAULTS = {
  gemini:    { input: 0.075 / 1e6, output: 0.300 / 1e6, displayName: 'Google Gemini' },
  openai:    { input: 0.150 / 1e6, output: 0.600 / 1e6, displayName: 'OpenAI' },
  groq:      { input: 0.060 / 1e6, output: 0.060 / 1e6, displayName: 'Groq LPU' },
  anthropic: { input: 0.800 / 1e6, output: 4.000 / 1e6, displayName: 'Anthropic Claude' }
};

function getModelInfo(modelName, provider = 'gemini') {
  const cleanName = (modelName || '').toLowerCase().trim();
  if (MODEL_PRICING_TABLE[cleanName]) {
    return MODEL_PRICING_TABLE[cleanName];
  }
  for (const [key, val] of Object.entries(MODEL_PRICING_TABLE)) {
    if (cleanName.includes(key) || key.includes(cleanName)) {
      return val;
    }
  }
  if (cleanName.includes('qwen')) {
    return { ...MODEL_PRICING_TABLE['qwen-2.5-32b'], provider: 'groq', displayName: modelName || 'Groq Qwen' };
  }
  if (cleanName.includes('llama')) {
    return { ...MODEL_PRICING_TABLE['llama-3.3-70b-versatile'], provider: 'groq', displayName: modelName || 'Groq Llama 3.3' };
  }
  if (cleanName.includes('claude') || cleanName.includes('sonnet') || cleanName.includes('haiku')) {
    const isSonnet = cleanName.includes('sonnet');
    return isSonnet ? MODEL_PRICING_TABLE['claude-sonnet-4-6'] : MODEL_PRICING_TABLE['claude-haiku'];
  }
  if (cleanName.includes('gpt')) {
    return cleanName.includes('4o-mini') ? MODEL_PRICING_TABLE['gpt-4o-mini'] : MODEL_PRICING_TABLE['gpt-4o'];
  }
  if (cleanName.includes('gemini')) {
    const isHeavy = cleanName.includes('3.7') || cleanName.includes('pro');
    return isHeavy ? MODEL_PRICING_TABLE['gemini-3.7-flash'] : MODEL_PRICING_TABLE['gemini-flash-lite-latest'];
  }

  const cleanProvider = (provider || 'gemini').toLowerCase().trim();
  const def = PROVIDER_DEFAULTS[cleanProvider] || PROVIDER_DEFAULTS.gemini;
  return {
    ...def,
    provider: cleanProvider,
    displayName: modelName || def.displayName
  };
}

function calculateModelCost(modelName, provider, inputTokens, outputTokens) {
  const info = getModelInfo(modelName, provider);
  const cost = (Math.max(0, inputTokens) * info.input) + (Math.max(0, outputTokens) * info.output);
  return cost;
}

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
    require('./persistentStore').persist(filePath, data);
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

  // Seed founder superadmin accounts
  const founderEmails = [
    'admin@elingu.ke',
    'mutwirijamesbam@gmail.com',
    'mutwirijamesbarn@gmail.com',
    (process.env.ADMIN_EMAIL || '').toLowerCase().trim()
  ].filter(Boolean);

  const defaultPassword = (process.env.ADMIN_PASSWORD || '').trim();
  const defaultHash = defaultPassword ? authUtils.hashCredentialSync(defaultPassword) : null;

  let updated = false;
  founderEmails.forEach((email, idx) => {
    let existing = store.admins.find(a => a.email.toLowerCase() === email);
    if (!existing) {
      if (defaultHash) {
        store.admins.push({
          id: `admin_founder_${idx + 1}`,
          name: email.includes('mutwiri') ? 'James Mutwiri (Founder)' : 'Elingu Founder & Super Admin',
          email,
          passwordHash: defaultHash,
          role: 'super_admin',
          failedLoginAttempts: 0,
          lockedUntil: null,
          createdAt: new Date().toISOString(),
          lastLogin: null
        });
        updated = true;
      } else {
        console.warn(`[adminStore] Warning: ADMIN_PASSWORD environment variable not set. Cannot seed admin ${email}`);
      }
    } else if (defaultHash) {
      // Sync password hash from ADMIN_PASSWORD environment variable if provided
      existing.passwordHash = defaultHash;
      existing.failedLoginAttempts = 0;
      existing.lockedUntil = null;
      updated = true;
    }
  });

  if (updated) {
    saveJson(ADMIN_FILE, store);
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
  const cleanPass = String(password || '').trim();
  const configuredAdminPass = process.env.ADMIN_PASSWORD;

  // Check if admin exists
  let admin = store.admins.find(a => a.email.toLowerCase() === cleanEmail);

  // If it's a recognized founder email that wasn't found, auto-add
  const isFounder = ['admin@elingu.ke', 'mutwirijamesbam@gmail.com', 'mutwirijamesbarn@gmail.com'].includes(cleanEmail);
  if (!admin && isFounder && configuredAdminPass) {
    const defaultHash = authUtils.hashCredentialSync(configuredAdminPass);
    admin = {
      id: 'admin_founder_' + crypto.randomBytes(3).toString('hex'),
      name: 'James Mutwiri (Founder)',
      email: cleanEmail,
      passwordHash: defaultHash,
      role: 'super_admin',
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };
    store.admins.push(admin);
    saveJson(ADMIN_FILE, store);
  }

  if (!admin) {
    return { success: false, error: 'Invalid admin credentials. Please check your email and password.' };
  }

  // Clear lockout if master password is provided directly by founder
  if (configuredAdminPass && cleanPass === configuredAdminPass) {
    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;
  } else {
    // Check lockout
    const lockoutStatus = authUtils.checkLockout(admin, 10, 30);
    if (lockoutStatus.locked) {
      return {
        success: false,
        locked: true,
        error: `Account temporarily locked. Please try again in ${lockoutStatus.minutesRemaining} minute(s).`
      };
    }
  }

  const isValid = (configuredAdminPass && cleanPass === configuredAdminPass) || await authUtils.verifyCredential(cleanPass, admin.passwordHash);
  if (!isValid) {
    authUtils.recordFailedAttempt(admin, 10, 30);
    saveJson(ADMIN_FILE, store);
    return { success: false, error: 'Invalid admin credentials. Please check your email and password.' };
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
    if (!day.models) day.models = {};
    if (!day.subjects) day.subjects = {};

    const inTok = Math.max(0, parseInt(inputTokens) || 0);
    const outTok = Math.max(0, parseInt(outputTokens) || 0);

    const cleanModel = (model || provider || 'gemini-flash-lite-latest').trim();
    const info = getModelInfo(cleanModel, provider);
    const resolvedCostUsd = (parseFloat(costUsd) > 0) ? parseFloat(costUsd) : calculateModelCost(cleanModel, provider, inTok, outTok);

    day.totalCalls += 1;
    day.inputTokens += inTok;
    day.outputTokens += outTok;
    day.costUsd += resolvedCostUsd;

    // Subject breakdown
    const cleanSub = subject || 'General';
    day.subjects[cleanSub] = (day.subjects[cleanSub] || 0) + 1;

    // Granular Per-Model Telemetry & Spend Breakdown
    if (typeof day.models[cleanModel] === 'number') {
      const priorCalls = day.models[cleanModel];
      day.models[cleanModel] = {
        model: cleanModel,
        displayName: info.displayName,
        provider: info.provider || provider,
        calls: priorCalls,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        costKes: 0
      };
    } else if (!day.models[cleanModel]) {
      day.models[cleanModel] = {
        model: cleanModel,
        displayName: info.displayName,
        provider: info.provider || provider,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        costKes: 0
      };
    }

    const m = day.models[cleanModel];
    m.calls += 1;
    m.inputTokens += inTok;
    m.outputTokens += outTok;
    m.totalTokens = m.inputTokens + m.outputTokens;
    m.costUsd += resolvedCostUsd;
    m.costKes = parseFloat((m.costUsd * USD_TO_KES).toFixed(2));
    if (!m.displayName) m.displayName = info.displayName;
    if (!m.provider) m.provider = info.provider || provider;

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
  const aggregatedWeekModels = {};

  last7Dates.forEach(d => {
    const entry = store.telemetry.daily[d];
    if (entry) {
      weekCalls += entry.totalCalls || 0;
      weekTokens += (entry.inputTokens || 0) + (entry.outputTokens || 0);
      weekCostUsd += entry.costUsd || 0;
      Object.entries(entry.subjects || {}).forEach(([sub, count]) => {
        aggregatedSubjects[sub] = (aggregatedSubjects[sub] || 0) + count;
      });

      // Aggregate weekly models
      Object.entries(entry.models || {}).forEach(([mKey, mVal]) => {
        const info = getModelInfo(mKey);
        if (!aggregatedWeekModels[mKey]) {
          aggregatedWeekModels[mKey] = {
            model: mKey,
            displayName: info.displayName,
            provider: info.provider,
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
            costKes: 0
          };
        }
        const wModel = aggregatedWeekModels[mKey];
        if (typeof mVal === 'number') {
          wModel.calls += mVal;
        } else {
          wModel.calls += (mVal.calls || 0);
          wModel.inputTokens += (mVal.inputTokens || 0);
          wModel.outputTokens += (mVal.outputTokens || 0);
          wModel.totalTokens += ((mVal.inputTokens || 0) + (mVal.outputTokens || 0));
          wModel.costUsd += (mVal.costUsd || 0);
          wModel.costKes = parseFloat((wModel.costUsd * USD_TO_KES).toFixed(2));
        }
      });
    }
  });

  // Compile detailed model breakdown for today with both USD and KES
  const todayModelsList = [];
  const rawTodayModels = todayData.models || {};
  Object.entries(rawTodayModels).forEach(([name, data]) => {
    const info = getModelInfo(name);
    if (typeof data === 'number') {
      todayModelsList.push({
        model: name,
        displayName: info.displayName || name,
        provider: info.provider || 'gemini',
        calls: data,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        costKes: 0,
        ratesDisplay: `$${(info.input * 1e6).toFixed(3)} in / $${(info.output * 1e6).toFixed(3)} out (per 1M)`
      });
    } else {
      const inTok = data.inputTokens || 0;
      const outTok = data.outputTokens || 0;
      const cUsd = data.costUsd !== undefined ? data.costUsd : calculateModelCost(name, data.provider, inTok, outTok);
      todayModelsList.push({
        model: data.model || name,
        displayName: data.displayName || info.displayName || name,
        provider: data.provider || info.provider || 'gemini',
        calls: data.calls || 0,
        inputTokens: inTok,
        outputTokens: outTok,
        totalTokens: inTok + outTok,
        costUsd: parseFloat(cUsd.toFixed(6)),
        costKes: parseFloat((cUsd * USD_TO_KES).toFixed(2)),
        ratesDisplay: `$${(info.input * 1e6).toFixed(3)} in / $${(info.output * 1e6).toFixed(3)} out (per 1M)`
      });
    }
  });

  // Sort by costUsd descending
  todayModelsList.sort((a, b) => b.costUsd - a.costUsd);

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
      subjects: todayData.subjects,
      forexRate: USD_TO_KES,
      models: todayModelsList
    },
    week: {
      totalCalls: weekCalls,
      totalTokens: weekTokens,
      costUsd: parseFloat(weekCostUsd.toFixed(4)),
      costKes: parseFloat((weekCostUsd * USD_TO_KES).toFixed(2)),
      subjects: aggregatedSubjects,
      models: Object.values(aggregatedWeekModels)
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

// ── VERIFIED GRADE CORRECTION & ANTI-JOYRIDING FLOW ─────────

/**
 * Submit a parent-verified grade correction request
 */
function submitGradeChangeRequest({ parentEmail, studentId, requestedGrade, reason = '' }) {
  const studentsStore = loadJson(STUDENTS_FILE, { students: [] });
  const student = studentsStore.students.find(s => s.id === studentId);
  if (!student) return { success: false, error: 'Learner profile not found.' };

  const cleanGrade = parseInt(requestedGrade, 10);
  if (![6, 7, 8, 9, 10, 11, 12].includes(cleanGrade)) {
    return { success: false, error: 'Invalid requested grade level (Grade 6 to 12).' };
  }

  if (student.grade === cleanGrade) {
    return { success: false, error: `Learner is already enrolled in Grade ${cleanGrade}.` };
  }

  const adminStoreData = loadJson(ADMIN_FILE, {});
  if (!adminStoreData.pendingGradeChanges) adminStoreData.pendingGradeChanges = [];

  // Check if there is already a pending request for this student
  const existing = adminStoreData.pendingGradeChanges.find(r => r.studentId === studentId && r.status === 'pending');
  if (existing) {
    return { success: false, error: 'A grade correction request for this learner is already pending admin review.' };
  }

  const requestRecord = {
    id: `gcr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    studentId,
    studentHandle: student.handle,
    currentGrade: student.grade,
    requestedGrade: cleanGrade,
    currentSchoolLevel: student.schoolLevel || (student.grade >= 10 ? 'SS' : 'JSS'),
    requestedSchoolLevel: cleanGrade >= 10 ? 'SS' : 'JSS',
    parentEmail,
    reason: (reason || 'Parent requested grade correction').slice(0, 300),
    status: 'pending',
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null
  };

  adminStoreData.pendingGradeChanges.unshift(requestRecord);
  saveJson(ADMIN_FILE, adminStoreData);

  return {
    success: true,
    requestId: requestRecord.id,
    message: `Grade change request for ${student.handle} submitted. Our education team reviews all grade changes within 24 hours to preserve continuous CBE competencies.`
  };
}

/**
 * Get all grade correction requests
 */
function getGradeChangeRequests(statusFilter = 'all') {
  const adminStoreData = loadJson(ADMIN_FILE, {});
  const list = adminStoreData.pendingGradeChanges || [];
  if (statusFilter === 'all') return list;
  return list.filter(r => r.status === statusFilter);
}

/**
 * Review, approve or reject grade correction request
 */
function reviewGradeChangeRequest(requestId, { action, reviewer = 'admin' }) {
  const adminStoreData = loadJson(ADMIN_FILE, {});
  if (!adminStoreData.pendingGradeChanges) return { success: false, error: 'No requests found.' };

  const req = adminStoreData.pendingGradeChanges.find(r => r.id === requestId);
  if (!req) return { success: false, error: 'Request not found.' };

  if (req.status !== 'pending') {
    return { success: false, error: `Request has already been ${req.status}.` };
  }

  if (action === 'approve') {
    const studentsStore = loadJson(STUDENTS_FILE, { students: [] });
    const student = studentsStore.students.find(s => s.id === req.studentId);
    if (!student) return { success: false, error: 'Student record no longer exists.' };

    const oldGrade = student.grade;
    student.grade = req.requestedGrade;
    student.schoolLevel = req.requestedGrade >= 10 ? 'SS' : 'JSS';
    if (student.schoolLevel === 'SS' && !student.pathway) {
      student.pathway = 'STEM';
    }
    student.lastActive = new Date().toISOString();
    saveJson(STUDENTS_FILE, studentsStore);

    req.status = 'approved';
    req.reviewedAt = new Date().toISOString();
    req.reviewedBy = reviewer;
    saveJson(ADMIN_FILE, adminStoreData);

    return {
      success: true,
      action: 'approved',
      student: { id: student.id, handle: student.handle, grade: student.grade, schoolLevel: student.schoolLevel },
      message: `Approved: ${student.handle} shifted from Grade ${oldGrade} to Grade ${student.grade} (${student.schoolLevel}).`
    };
  } else if (action === 'reject') {
    req.status = 'rejected';
    req.reviewedAt = new Date().toISOString();
    req.reviewedBy = reviewer;
    saveJson(ADMIN_FILE, adminStoreData);

    return {
      success: true,
      action: 'rejected',
      message: `Request for learner ${req.studentHandle} was rejected.`
    };
  } else {
    return { success: false, error: 'Invalid review action. Must be approve or reject.' };
  }
}

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
  submitGradeChangeRequest,
  getGradeChangeRequests,
  reviewGradeChangeRequest,
  getAllSchoolsDirectory,
  updateSchoolPilotStatus,
  getSubscriptionsLedger,
  getModelInfo,
  calculateModelCost,
  USD_TO_KES
};
