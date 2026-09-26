// ════════════════════════════════════════════════════════════
// pilotConfig.js — Elingu School & Parent Pilot System
// Stipulated time cohorts with automatic expiration
// ════════════════════════════════════════════════════════════

const PILOT_REGISTRY = {
  // School Cohorts (Institutional / JSS deployments)
  'PILOT2026': {
    code: 'PILOT2026',
    type: 'school',
    cohortName: 'Kenya JSS 200-Learner Pilot Cohort',
    durationDays: 60,
    features: ['All CBE subjects unlimited', 'Unlimited daily turns', 'Classroom & Teacher Insights', 'SBA documentation']
  },
  'JSS-PILOT': {
    code: 'JSS-PILOT',
    type: 'school',
    cohortName: 'Junior Secondary School Partner Trial',
    durationDays: 60,
    features: ['All CBE subjects unlimited', 'Unlimited daily turns', 'Teacher report']
  },
  'ELINGU200': {
    code: 'ELINGU200',
    type: 'school',
    cohortName: 'Elingu Research & Pedagogical Cohort',
    durationDays: 90,
    features: ['All CBE subjects unlimited', 'Unlimited daily turns', 'Full SBA reporting']
  },

  // Individual Parent Trial Cohorts
  'PARENT2026': {
    code: 'PARENT2026',
    type: 'parent',
    cohortName: 'Parent Early Access Pilot Pass',
    durationDays: 30,
    features: ['All CBE subjects unlimited', 'Unlimited daily turns', 'Conversational weekly parent summary']
  },
  'TRIAL30': {
    code: 'TRIAL30',
    type: 'parent',
    cohortName: '30-Day Family Full Access Pilot',
    durationDays: 30,
    features: ['All CBE subjects unlimited', 'Unlimited daily turns']
  },
  'FAMILY60': {
    code: 'FAMILY60',
    type: 'parent',
    cohortName: '60-Day Extended Family Pilot',
    durationDays: 60,
    features: ['All CBE subjects unlimited', 'Unlimited daily turns']
  }
};

/**
 * Validate a pilot access code (case-insensitive)
 * Returns { valid: true, pilotData, expiresAt } or { valid: false, error }
 */
function verifyPilotCode(inputCode) {
  const clean = (inputCode || '').trim().toUpperCase();
  if (!clean) {
    return { valid: false, error: 'Pilot code cannot be empty.' };
  }

  const entry = PILOT_REGISTRY[clean];
  if (!entry) {
    return { valid: false, error: 'Invalid pilot code. Please verify the code provided for your school or family cohort.' };
  }

  const durationDays = entry.durationDays || 30;
  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

  return {
    valid: true,
    code: clean,
    type: entry.type,
    cohortName: entry.cohortName,
    durationDays,
    activatedAt: activatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    features: entry.features
  };
}

/**
 * Checks whether an entity (student or parent) has an active, unexpired pilot
 */
function isPilotActive(entity) {
  if (!entity || !entity.pilotCode || !entity.pilotExpiresAt) return false;
  const now = new Date();
  const expiry = new Date(entity.pilotExpiresAt);
  return now < expiry;
}

/**
 * Get human-readable status for a pilot
 */
function getPilotStatus(entity) {
  if (!entity || !entity.pilotCode) {
    return { isPilot: false, active: false, statusText: 'No pilot code active' };
  }

  const now = new Date();
  const expiry = entity.pilotExpiresAt ? new Date(entity.pilotExpiresAt) : null;

  if (!expiry || now >= expiry) {
    return {
      isPilot: true,
      active: false,
      code: entity.pilotCode,
      expired: true,
      statusText: `Pilot expired on ${expiry ? expiry.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown date'}`
    };
  }

  const diffMs = expiry - now;
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    isPilot: true,
    active: true,
    code: entity.pilotCode,
    cohortName: entity.pilotCohortName || entity.pilotCode,
    daysLeft,
    daysRemaining: daysLeft,
    expiresAt: entity.pilotExpiresAt,
    statusText: `Active Pilot (${entity.pilotCohortName || entity.pilotCode}) — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining (valid until ${expiry.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })})`
  };
}

module.exports = {
  PILOT_REGISTRY,
  verifyPilotCode,
  isPilotActive,
  getPilotStatus
};
