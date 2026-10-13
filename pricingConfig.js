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
      '2 compulsory + 1 elective subject',
      '10–15 turns per day limit',
      'Basic weekly parent note',
      'No teacher report'
    ],
    limits: {
      maxSubjects: 3,
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
      'All compulsory subjects/learning areas + 2 electives',
      '300 daily turns (generous daily learning allowance for full lessons & labs)',
      'Weekly parent summary in warm, plain language (conversational tone only)',
      'Basic teacher report showing CBE strand engagement and areas of struggle',
      'Safe Box (student wellbeing reflection space)',
      'Streaks, badges, and learning vault',
      'Knowledge chatmarks'
    ],
    limits: {
      compulsorySubjects: 'all',
      maxElectives: 2, // Standard offers all compulsory + 2 electives
      maxSubjects: null,
      dailyTurns: 300,
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
      'All compulsory subjects + ALL electives',
      '500 daily turns (extended deep session allowance for full labs & past papers)',
      'Detailed parent report with thinking pattern analysis',
      'Rich teacher and headteacher report with full reasoning patterns and SBA documentation support',
      'Safe Box Pro (student reflection + proactive AI emotional stress radar)',
      'Extended AI memory and context',
      'Priority AI model routing',
      'Know Your Child — deep thinking & curiosity portrait (unlocks after 90 days)'
    ],
    limits: {
      compulsorySubjects: 'all',
      maxElectives: Infinity, // Premium offers all compulsory + all electives
      maxSubjects: null,
      dailyTurns: 500,
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
      maxSubjects: null, // Unlimited CBE subjects for pilot trial
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

// ── RATE CARD MATRIX ──────────────────────────────────────────
// Dynamic pricing across Curricula (CBC vs IGCSE) and Levels (JSS vs Senior School)
const RATE_CARDS = {
  // 1. Kenyan CBC Junior Secondary School (Grades 7–9) & Upper Primary (Grade 6)
  CBC_JSS: {
    free: {
      monthly: 0,
      annual: 0,
      label: 'Free Explorer',
      description: '2 compulsory + 1 elective subject, 15 daily turns'
    },
    standard: {
      monthly: 700,
      annual: 7000,
      annualSavings: 1400,
      label: 'Standard Scholar',
      description: 'All compulsory learning areas + 2 electives, 300 daily turns, weekly parent note'
    },
    premium: {
      monthly: 1500,
      annual: 15000,
      annualSavings: 3000,
      label: 'Premium Scholar',
      description: 'All compulsory learning areas + ALL electives, 500 daily turns, SBA reports, Safe Box Pro'
    }
  },

  // 2. Kenyan CBC Senior Secondary School (Grades 10–12 New Enrolment)
  CBC_SS: {
    free: {
      monthly: 0,
      annual: 0,
      label: 'Free Explorer',
      description: '2 compulsory + 1 elective subject, 15 daily turns'
    },
    standard: {
      monthly: 900,
      annual: 9000,
      annualSavings: 1800,
      label: 'Senior Standard',
      description: 'All compulsory subjects + 2 pathway electives, 300 turns/day, lab simulators'
    },
    premium: {
      monthly: 1800,
      annual: 18000,
      annualSavings: 3600,
      label: 'Senior Premium Pro',
      description: 'All compulsory subjects + ALL pathway electives, 500 turns/day, KCSE/KSSEA revision radar, deep SBA'
    }
  },

  // 3. Kenyan CBC Senior Secondary School — Transition Loyalty Rate (for Grade 9 Alumni)
  CBC_SS_LOYALTY: {
    free: {
      monthly: 0,
      annual: 0,
      label: 'Free Explorer',
      description: '2 compulsory + 1 elective subject, 15 daily turns'
    },
    standard: {
      monthly: 800,
      annual: 8000,
      annualSavings: 1600,
      label: 'Senior Pioneer Rate (Loyalty)',
      description: 'Locked-in rate for graduating JSS learners (Save KES 1,200/year, 300 turns/day)'
    },
    premium: {
      monthly: 1600,
      annual: 16000,
      annualSavings: 3200,
      label: 'Senior Premium (Loyalty)',
      description: 'Locked-in premium rate for graduating JSS learners (Save KES 2,400/year, 500 turns/day)'
    }
  },

  // 4. Cambridge Assessment International Education (CAIE Lower Secondary Checkpoint Years 7–9 & Pearson iLower)
  CHECKPOINT: {
    free: {
      monthly: 0,
      annual: 0,
      label: 'Checkpoint Free Starter',
      description: '2 core + 1 secondary subject (3 subjects total), 15 daily turns, Checkpoint foundations'
    },
    standard: {
      monthly: 3999,
      annual: 39999,
      annualSavings: 7989,
      label: 'Checkpoint Standard',
      description: '2 core + 2 electives (4 subjects total) with Cambridge Science Lab Bench, 300 daily turns'
    },
    premium: {
      monthly: 4999,
      annual: 49999,
      annualSavings: 9989,
      label: 'Checkpoint Master',
      description: 'All Checkpoint core + all secondary subjects, Cambridge Science Lab Bench & diagnostic tests, 500 daily turns'
    }
  },

  // 5. Cambridge Assessment International Education (CAIE Upper Secondary IGCSE Years 10–11 & Pearson Edexcel)
  IGCSE: {
    free: {
      monthly: 0,
      annual: 0,
      label: 'IGCSE Free Starter',
      description: '2 core (Maths + English) + 1 elective subject (3 subjects total), 15 daily turns, Core/Foundation mark schemes'
    },
    standard: {
      monthly: 3999,
      annual: 39999,
      annualSavings: 7989,
      label: 'IGCSE Standard',
      description: '2 core (Maths + English) + 2 electives (4 subjects total) with Cambridge Science Lab Bench & Paper 6 ATP simulators, 300 daily turns'
    },
    premium: {
      monthly: 4999,
      annual: 49999,
      annualSavings: 9989,
      label: 'IGCSE Exam Master',
      description: 'All subjects (All compulsory + ALL electives), examiner commentary, Paper 6 ATP engine, strict keyword validator, 500 daily turns'
    }
  }
};

/**
 * Dynamically resolves the exact price, tier details, and rate card for any student
 * @param {Object} student - Student record (grade, schoolLevel, curriculum, subscriptionTier, etc.)
 * @param {string} tier - 'free' | 'standard' | 'premium'
 * @param {string} billingCycle - 'monthly' | 'annual'
 * @param {boolean} isTransitioningAlumni - whether learner was active in JSS and gets the KES 800 discount
 */
function resolvePricingForStudent(student = {}, tier = 'standard', billingCycle = 'monthly', isTransitioningAlumni = false) {
  const cleanGrade = parseInt(student.grade || student.yearGroup || 7, 10);
  const cleanLevel = student.schoolLevel || (cleanGrade >= 10 ? 'SS' : 'JSS');
  const curriculum = (student.curriculum || 'CBC').toUpperCase();
  const cleanTier = ['free', 'standard', 'premium'].includes(tier) ? tier : 'standard';
  const cleanCycle = billingCycle === 'annual' ? 'annual' : 'monthly';

  let rateCardKey = 'CBC_JSS';

  if (curriculum === 'IGCSE' || curriculum === 'CAMBRIDGE' || curriculum === 'BRITISH' || curriculum === 'EDEXCEL') {
    const isLowerSec = cleanGrade < 10;
    rateCardKey = isLowerSec ? 'CHECKPOINT' : 'IGCSE';
  } else if (cleanLevel === 'SS' || cleanGrade >= 10) {
    // If the student was an active subscriber in JSS or has loyalty flag, grant KES 800 rate
    const hasLoyalty = isTransitioningAlumni || student.wasJssSubscriber || student.hasLoyaltyDiscount;
    rateCardKey = hasLoyalty ? 'CBC_SS_LOYALTY' : 'CBC_SS';
  } else {
    rateCardKey = 'CBC_JSS';
  }

  const card = RATE_CARDS[rateCardKey] || RATE_CARDS.CBC_JSS;
  const tierInfo = card[cleanTier] || card.standard;
  const amount = cleanCycle === 'annual' ? tierInfo.annual : tierInfo.monthly;
  const savingsDisplay = cleanCycle === 'annual' && tierInfo.annualSavings
    ? `Save KES ${tierInfo.annualSavings.toLocaleString()} (equivalent to 2 months free)`
    : null;

  return {
    amount,
    monthly: tierInfo.monthly,
    annual: tierInfo.annual,
    currency: 'KES',
    rateCardKey,
    tier: cleanTier,
    tierLabel: tierInfo.label,
    description: tierInfo.description,
    billingCycle: cleanCycle,
    priceDisplay: `KES ${amount.toLocaleString()}${cleanCycle === 'annual' ? '/year' : '/month'}`,
    savingsDisplay,
    isLoyaltyDiscount: rateCardKey === 'CBC_SS_LOYALTY'
  };
}

// ── COMPULSORY SUBJECTS DEFINITIONS ──────────────────────────────
const JSS_COMPULSORY_SUBJECTS = ['Mathematics', 'English', 'Kiswahili', 'Integrated Science', 'Science & Technology', 'Social Studies'];
const SS_COMPULSORY_SUBJECTS = ['Core Mathematics', 'Essential Mathematics', 'English', 'Kiswahili', 'Community Service Learning'];
const BRITISH_COMPULSORY_SUBJECTS = [
  'Mathematics', 'English', 'First Language English', 'English as a Second Language',
  'Mathematics (0580)', 'First Language English (0500)', 'English as a Second Language (0510)',
  'Checkpoint Mathematics (0862)', 'Checkpoint English (0861)',
  'Mathematics A (4MA1)', 'Mathematics B (4MB1)',
  'English Language A (4EA1)', 'English Language B (4EB1)', 'English as a Second Language (4ES1)',
  'iLowerSecondary Maths (LMA11)', 'iLowerSecondary English (LEN11)'
];

/**
 * Returns whether a subject is a compulsory core learning area
 * @param {string} subject - Subject name or alias
 * @param {boolean|string} levelOrCurriculum - true/'SS' for Senior School, 'BRITISH'/'IGCSE' for British, false/'JSS' for JSS
 */
function isCompulsorySubject(subject, levelOrCurriculum = false) {
  const norm = String(subject || '').trim().toLowerCase();
  const curStr = String(levelOrCurriculum || '').toUpperCase();
  const isBritish = curStr === 'BRITISH' || curStr === 'IGCSE' || curStr === 'CAMBRIDGE' || curStr === 'EDEXCEL';
  const isSenior = levelOrCurriculum === true || curStr === 'SS' || curStr === 'SENIOR';

  if (isBritish) {
    return BRITISH_COMPULSORY_SUBJECTS.some(c => {
      const cLow = c.toLowerCase();
      return cLow === norm || norm.includes(cLow) || cLow.includes(norm);
    });
  }
  const list = isSenior ? SS_COMPULSORY_SUBJECTS : JSS_COMPULSORY_SUBJECTS;
  return list.some(c => c.toLowerCase() === norm);
}

/**
 * Returns the maximum number of electives allowed based on tier:
 * - Free: 1 elective
 * - Standard: 2 electives
 * - Premium / School / Pilot: Infinity (all electives)
 */
function getMaxElectivesForTier(tier = 'free') {
  const clean = String(tier || 'free').toLowerCase();
  if (clean === 'free') return 1;
  if (clean === 'standard') return 2;
  return Infinity;
}

/**
 * Validates a student's chosen subjects according to tier stipulations:
 * - Free: Up to 2 compulsory subjects + 1 elective (max 3 subjects total)
 * - Standard: All compulsory subjects + up to 2 electives
 * - Premium / School / Pilot: All compulsory subjects + all electives
 */
function validateTierSubjectSelection({ subjects, tier = 'free', isSenior = false, curriculum = 'CBC' }) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return { valid: false, error: 'Please select at least one subject.' };
  }

  const cleanTier = String(tier || 'free').toLowerCase();
  const curStr = String(curriculum || '').toUpperCase();
  const isBritish = curStr === 'BRITISH' || curStr === 'IGCSE' || curStr === 'CAMBRIDGE' || curStr === 'EDEXCEL';

  let compulsoryList;
  if (isBritish) {
    compulsoryList = BRITISH_COMPULSORY_SUBJECTS;
  } else if (isSenior) {
    compulsoryList = SS_COMPULSORY_SUBJECTS;
  } else {
    compulsoryList = JSS_COMPULSORY_SUBJECTS;
  }
  const compNorms = compulsoryList.map(s => s.toLowerCase());

  const selectedCompulsory = subjects.filter(s => compNorms.some(c => c === s.toLowerCase() || (isBritish && s.toLowerCase().includes(c))));
  const selectedElectives = subjects.filter(s => !selectedCompulsory.includes(s));

  if (cleanTier === 'free') {
    if (selectedElectives.length > 1) {
      return {
        valid: false,
        error: 'Free Plan allows only 1 elective subject. Please select 1 elective or upgrade to Standard for 2 electives (or Premium for all electives).'
      };
    }
    if (selectedCompulsory.length > 2) {
      return {
        valid: false,
        error: 'Free Plan allows up to 2 compulsory subjects. Please select up to 2 compulsory subjects or upgrade to Standard.'
      };
    }
    if (subjects.length > 3) {
      return {
        valid: false,
        error: 'Free Plan allows a maximum of 3 subjects (2 compulsory + 1 elective). Please select up to 3 subjects or upgrade to Standard.'
      };
    }
  } else if (cleanTier === 'standard') {
    if (selectedElectives.length > 2) {
      return {
        valid: false,
        error: isBritish
          ? `Standard Plan includes 2 core subjects (Maths & English) + up to 2 electives (4 subjects total with Cambridge Science Lab Bench). You selected ${selectedElectives.length} electives. Upgrade to Premium Exam Master to unlock all electives!`
          : `Standard Plan includes all compulsory subjects + up to 2 electives. You selected ${selectedElectives.length} electives. Upgrade to Premium to unlock all electives!`
      };
    }
    if (isBritish && subjects.length > 4) {
      return {
        valid: false,
        error: 'Standard Plan includes 2 core subjects + up to 2 electives (4 subjects total with Cambridge Science Lab Bench). Upgrade to Premium Exam Master to unlock all electives!'
      };
    }
  }

  // Premium, School, and Pilot: All compulsory + all electives are valid!
  return { valid: true, compulsoryCount: selectedCompulsory.length, electiveCount: selectedElectives.length };
}

/**
 * Returns the maximum number of subjects a student is allowed to choose based on their subscription tier
 * @param {string} tier - 'free' | 'standard' | 'premium'
 * @returns {number} max allowed subjects
 */
function getMaxSubjectsForTier(tier = 'free') {
  const cleanTier = String(tier || 'free').toLowerCase();
  if (cleanTier === 'free') {
    return 3; // Free Plan: 2 compulsory + 1 elective
  }
  // Standard: all compulsory + 2 electives
  // Premium, Pilot, and School tiers: All compulsory + all electives
  return Infinity;
}

module.exports = {
  PRICING_TIERS,
  RATE_CARDS,
  resolvePricingForStudent,
  getMaxSubjectsForTier,
  getMaxElectivesForTier,
  isCompulsorySubject,
  validateTierSubjectSelection,
  JSS_COMPULSORY_SUBJECTS,
  SS_COMPULSORY_SUBJECTS,
  BRITISH_COMPULSORY_SUBJECTS,
  ADDITIONAL_CHILD_ADDON,
  FEATURE_NAMING,
  getKnowYourChildGate,
  pilotConfig: require('./pilotConfig')
};
