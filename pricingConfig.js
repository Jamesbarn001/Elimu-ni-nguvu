// ════════════════════════════════════════════════════════════
// ELINGU PRICING CONFIGURATION & FEATURE GATES
// Finalised Pricing Structure & Feature Naming Specification
// ════════════════════════════════════════════════════════════

const PRICING_TIERS = {
  free: {
    id: 'free',
    name: 'Free',
    uiLabel: 'Free', // Strict: no "Gov/NGO" qualifier on public UI
    priceMonthly: 0,
    priceAnnual: 0,
    currency: 'KES',
    priceDisplay: 'KES 0',
    billingPeriod: 'Forever',
    badge: null,
    features: [
      '2 subject chats',
      '10–15 turns per day limit',
      'Basic weekly parent note',
      'No teacher report'
    ],
    limits: {
      maxSubjects: 2,
      dailyTurns: 15,
      contextTurns: 20,
      teacherReport: false,
      knowYourChild: false,
      safeBox: false,
      extendedMemory: false,
      priorityRouting: false
    }
  },

  standard: {
    id: 'standard',
    name: 'Standard',
    uiLabel: 'Standard',
    priceMonthly: 700,
    priceAnnual: 7000,
    currency: 'KES',
    priceDisplay: 'KES 700/month',
    annualSavings: 1400,
    annualSavingsDisplay: 'Save KES 1,400 — equivalent to 2 months free',
    badge: null,
    features: [
      'All CBE subjects, unlimited',
      '150 daily turns (generous daily learning allowance)',
      'Weekly parent summary in warm, plain language (conversational tone only)',
      'Basic teacher report showing CBE strand engagement and areas of struggle',
      'Safe Box (student wellbeing reflection space)',
      'Streaks, badges, and learning vault',
      'Knowledge chatmarks'
    ],
    limits: {
      maxSubjects: 5,
      dailyTurns: 150,
      contextTurns: 20,
      teacherReport: 'basic',
      knowYourChild: false,
      safeBox: 'manual', // Learner manually inputs feelings & reflections
      extendedMemory: false,
      priorityRouting: false
    }
  },

  premium: {
    id: 'premium',
    name: 'Premium',
    uiLabel: 'Premium',
    priceMonthly: 1500,
    priceAnnual: 15000,
    currency: 'KES',
    priceDisplay: 'KES 1,500/month',
    annualSavings: 3000,
    annualSavingsDisplay: 'Save KES 3,000 — equivalent to 3 months free',
    badge: 'Most Comprehensive',
    features: [
      'Everything in Standard',
      '300 daily turns (extended deep session allowance)',
      'Detailed parent report with thinking pattern analysis',
      'Rich teacher and headteacher report with full reasoning patterns and SBA documentation support',
      'Safe Box Pro (student reflection + proactive AI emotional stress radar)',
      'Extended AI memory and context',
      'Priority AI model routing',
      'Know Your Child — deep thinking & curiosity portrait (unlocks after 90 days)'
    ],
    limits: {
      maxSubjects: 5,
      dailyTurns: 300,
      contextTurns: 30,
      teacherReport: 'rich_sba',
      knowYourChild: true,
      safeBox: 'proactive_ai', // Learner inputs + AI tutor proactively detects & documents stress
      extendedMemory: true,
      priorityRouting: true,
      softCapNoticeThresholdPercent: 20 // Flag on admin side if overused below 20% quota
    }
  },

  school: {
    id: 'school',
    name: 'School Licence',
    uiLabel: 'School (100–999 Pupils)',
    targetAudience: 'Single primary or junior secondary school',
    minPupils: 100,
    maxPupils: 999,
    priceMonthly: 500,
    priceAnnual: 5000,
    currency: 'KES',
    priceDisplay: 'KES 500 / pupil / month (KES 5,000 / year)',
    billingPeriod: 'Annual / Termly',
    badge: 'School Bulk',
    features: [
      'KES 500/pupil/month (save KES 1,000/yr with annual payment at KES 5,000/yr)',
      'Dedicated Teacher & Headteacher Dashboard',
      'Class-level CBE Strand Mastery & Misconception Heatmaps',
      'KICD SBA (School-Based Assessment) Report Generator',
      'All CBE subjects, 300 turns/day per pupil',
      'Computer lab & home access via School Code + Admission No'
    ],
    limits: {
      isInstitutional: true,
      institutionType: 'school',
      dailyTurns: 300,
      teacherDashboard: 'full',
      elinguInsights: true,
      sbaReportGeneration: true
    }
  },

  subcounty: {
    id: 'subcounty',
    name: 'Sub-County Cluster Licence',
    uiLabel: 'Sub-County (1,000–9,999 Pupils)',
    targetAudience: 'Clustered schools under Sub-County Education Office / CSOs',
    minPupils: 1000,
    maxPupils: 9999,
    priceMonthly: 400,
    priceAnnual: 4000,
    currency: 'KES',
    priceDisplay: 'KES 400 / pupil / month (KES 4,000 / year)',
    billingPeriod: 'Annual / Termly',
    badge: 'Sub-County Bulk',
    features: [
      'KES 400/pupil/month (save KES 800/yr with annual payment at KES 4,000/yr)',
      'Cross-school performance benchmarking across the sub-county',
      'Curriculum Support Officer (CSO) oversight portal',
      'Sub-County CBE Literacy & Numeracy Progress Reports',
      'Teacher Professional Development & CBE Pedagogy Analytics',
      'Priority onboarding & school technician training'
    ],
    limits: {
      isInstitutional: true,
      institutionType: 'subcounty',
      dailyTurns: 300,
      teacherDashboard: 'full',
      subCountyDashboard: 'full',
      elinguInsights: true,
      sbaReportGeneration: true
    }
  },

  county: {
    id: 'county',
    name: 'County-Wide Deployment',
    uiLabel: 'County Government / MoE (10,000+ Pupils)',
    targetAudience: 'County Education Boards, Devolved Government & Development Partners',
    minPupils: 10000,
    maxPupils: null,
    priceMonthly: 300,
    priceAnnual: 3000,
    currency: 'KES',
    priceDisplay: 'KES 300 / pupil / month (KES 3,000 / year)',
    billingPeriod: 'Annual Fiscal Cycle',
    badge: 'Government / County',
    features: [
      'KES 300/pupil/month (KES 3,000/yr per pupil — optimal scale discount)',
      'County-wide educational equity & learning deficit heatmaps',
      'Longitudinal cognitive & CBE competency tracking across sub-counties',
      'Dedicated infrastructure SLA & high-concurrency cloud provisioning',
      'Custom co-branded county portal & annual KICD-aligned impact audit',
      'Direct integration with County Bursary & Education management systems'
    ],
    limits: {
      isInstitutional: true,
      institutionType: 'county',
      dailyTurns: 300,
      teacherDashboard: 'full',
      subCountyDashboard: 'full',
      countyDashboard: 'full',
      elinguInsights: true,
      sbaReportGeneration: true
    }
  },

  foundation: {
    id: 'foundation',
    name: 'Foundation / NGO',
    uiLabel: 'Foundation / NGO',
    priceDisplay: 'Grant-funded',
    currency: 'KES',
    billingPeriod: 'Partner Funded',
    badge: 'Social Impact',
    features: [
      'Free deployment for underserved and public school students',
      'Managed through Elingu\'s foundation arm'
    ],
    limits: {
      isGrantFunded: true
    }
  },

  pilot: {
    id: 'pilot',
    name: 'Pilot Trial',
    uiLabel: 'Pilot Trial',
    priceMonthly: 0,
    priceAnnual: 0,
    currency: 'KES',
    priceDisplay: 'KES 0 (Trial)',
    billingPeriod: 'Trial Cohort',
    badge: 'Pilot Cohort',
    features: [
      'All CBE subjects, unlimited',
      '150 daily turns',
      'Basic weekly parent summary',
      'Teacher report'
    ],
    limits: {
      maxSubjects: 5,
      dailyTurns: 150,
      contextTurns: 20,
      teacherReport: 'basic',
      knowYourChild: false,
      safeBox: false,
      extendedMemory: false, // Explicitly 20 turns, matching user directive
      priorityRouting: false
    }
  }
};

// ── ADDITIONAL CHILD ADD-ON ──────────────────────────────────
const ADDITIONAL_CHILD_ADDON = {
  priceMonthly: 400,
  currency: 'KES',
  maxChildren: 4,
  label: 'Add another child — KES 400/month per additional child',
  description: 'Maximum 4 children under one parent account. Applies as an add-on to Standard and Premium tiers.',
  availableOnTiers: ['standard', 'premium']
};

// ── FEATURE NAMING SPECIFICATION ─────────────────────────────
// The same underlying analytical feature, framed for the specific audience:
const FEATURE_NAMING = {
  parent: {
    id: 'know_your_child',
    name: 'Know Your Child',
    description: 'A deep portrait of how your child thinks, what drives their curiosity, and where their natural strengths are emerging. Updated every term.',
    tone: 'Warm, emotional, personal — no data tables or strand labels visible to parent',
    tierRequired: 'premium',
    gateDays: 90
  },
  teacher: {
    id: 'elingu_insights',
    name: 'Elingu Insights',
    description: 'Detailed reasoning patterns, CBE strand analytics, and SBA-aligned progress data for every learner.',
    tone: 'Professional, data-oriented — shows strand/sub-strand level data and class aggregate view',
    tiersAvailable: ['school', 'premium']
  }
};

// ── FEATURE GATE HELPER: 90-DAY "KNOW YOUR CHILD" UNLOCK ─────
function getKnowYourChildGate(studentCreatedAt, parentTier = 'free') {
  const GATE_DAYS = 90;
  const createdDate = studentCreatedAt ? new Date(studentCreatedAt) : new Date();
  const now = new Date();
  const diffTime = Math.max(0, now - createdDate);
  const daysActive = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const isPremium = (parentTier === 'premium');
  const daysReached = daysActive >= GATE_DAYS;
  const unlocked = isPremium && daysReached;
  const daysRemaining = Math.max(0, GATE_DAYS - daysActive);
  const progressPercent = Math.min(100, Math.round((daysActive / GATE_DAYS) * 100));

  let statusText = '';
  if (unlocked) {
    statusText = 'Unlocked — Termly Thinking Portrait Ready';
  } else if (!isPremium) {
    statusText = `Available in Premium — unlocks after ${GATE_DAYS} days of learning (${daysActive}/${GATE_DAYS} days recorded)`;
  } else {
    statusText = `Know Your Child unlocks after ${daysRemaining} more days of learning (${daysActive}/${GATE_DAYS} days)`;
  }

  return {
    featureName: FEATURE_NAMING.parent.name,
    description: FEATURE_NAMING.parent.description,
    unlocked,
    isPremium,
    daysActive,
    daysRequired: GATE_DAYS,
    daysRemaining,
    progressPercent,
    statusText
  };
}

module.exports = {
  PRICING_TIERS,
  ADDITIONAL_CHILD_ADDON,
  FEATURE_NAMING,
  getKnowYourChildGate,
  pilotConfig: require('./pilotConfig')
};
