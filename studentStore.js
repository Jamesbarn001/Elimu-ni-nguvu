// ══════════════════════════════════════════════════════════════
// ELINGU SECURE STUDENT & SESSION STORE
// Compliant with Kenya Data Protection Act 2019 (Section 33 & 40)
// Zero-PII, Pseudonymous Handles, Hashed PINs, Hierarchical RBAC
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const authUtils = require('./authUtils');

const DATA_DIR = path.join(__dirname, 'data');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

const pricingConfig = require('./pricingConfig');
const parentStore = require('./parentStore');
const pilotConfig = require('./pilotConfig');
const db = require('./db');

function syncDb(fn) {
  try {
    fn();
  } catch (err) {
    // Non-fatal sync fallback
  }
}

// Ensure data directory exists
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
    console.error(`Error loading ${filePath}:`, err.message);
  }
  return defaultValue;
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    require('./persistentStore').persist(filePath, data);
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err.message);
  }
}

// LEGACY — kept for backward-compatible verification of pre-bcrypt hashes
// Hash PIN with SHA-256 and salt
function hashPin(pin, salt = 'elingu_salt_2026') {
  return crypto.createHash('sha256').update(pin + salt).digest('hex');
}

// 47 Kenyan Counties for regional contextualisation (DPA compliant coarse granularity)
const KENYAN_COUNTIES = [
  'Nairobi', 'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita Taveta',
  'Garissa', 'Wajir', 'Mandera', 'Marsabit', 'Isiolo', 'Meru', 'Tharaka-Nithi',
  'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua', 'Nyeri', 'Kirinyaga',
  'Murang\'a', 'Kiambu', 'Turkana', 'West Pokot', 'Samburu', 'Trans Nzoia',
  'Uasin Gishu', 'Elgeyo Marakwet', 'Nandi', 'Baringo', 'Laikipia', 'Nakuru',
  'Narok', 'Kajiado', 'Kericho', 'Bomet', 'Kakamega', 'Vihiga', 'Bungoma',
  'Busia', 'Siaya', 'Kisumu', 'Homa Bay', 'Migori', 'Kisii', 'Nyamira'
];

// Verified Kenyan Upper Primary & Junior Secondary Schools (Grades 6–9)
const KENYAN_JSS_SCHOOLS = {
  'Nairobi': [
    'Nairobi Primary School & JSS',
    'Moi Forces Academy JSS',
    'Olympic Primary & JSS (Kibera)',
    'Hospital Hill School & JSS',
    'Kilimani Junior Secondary',
    'Pangani Primary & JSS',
    'State House Primary & JSS',
    'Moi Avenue Primary & JSS',
    'Jamhuri Junior Secondary'
  ],
  'Mombasa': [
    'Mombasa Primary School & JSS',
    'Aga Khan Junior Secondary',
    'Central Girls Primary & JSS',
    'Khamis Junior Secondary',
    'Nyali Primary & JSS',
    'Serani Junior Secondary'
  ],
  'Kiambu': [
    'Kiambu Primary & JSS',
    'Thika Road Primary & JSS',
    'Loreto Limuru JSS',
    'Ruiru Junior Secondary',
    'Alliance Junior Secondary Wing',
    'Githunguri Primary & JSS'
  ],
  'Nakuru': [
    'Nakuru Primary & JSS',
    'Menengai Junior Secondary',
    'Lenana JSS Nakuru',
    'Bahati Primary & JSS',
    'Naivasha Boarding Primary & JSS'
  ],
  'Uasin Gishu': [
    'Hill School Eldoret & JSS',
    'Uasin Gishu Primary & JSS',
    'Gulab Lochab JSS',
    'Eldoret Premier JSS',
    'Wareng Junior Secondary'
  ],
  'Kisumu': [
    'Kisumu Union Primary & JSS',
    'Victoria Primary School & JSS',
    'Kenyatta Sports Ground JSS',
    'Winam Junior Secondary',
    'Kisumu Girls Junior Wing'
  ],
  'Kilifi': [
    'Kilifi Township Primary & JSS',
    'Malindi High (JSS Wing)',
    'Mtwapa Junior Secondary',
    'Mariakani Primary & JSS'
  ],
  'Machakos': [
    'Machakos Primary & JSS',
    'Muthini Junior Secondary',
    'Kyumbi JSS',
    'Kathiani Primary & JSS'
  ],
  'Nyeri': [
    'Nyeri Primary & JSS',
    'Dedan Kimathi Memorial JSS',
    'Karatina Junior Secondary',
    'Tetum Primary & JSS'
  ],
  'Kakamega': [
    'Kakamega Primary & JSS',
    'Shikoti Girls JSS',
    'Lurambi Junior Secondary',
    'Mumias Complex Primary & JSS'
  ]
};

const KENYA_INTERNATIONAL_SCHOOLS = [
  'Braeburn School (Gitanga Road)',
  'Braeburn Garden Estate',
  'Braeburn Nanyuki International',
  'Braeburn Mombasa International',
  'Brookhouse School (Karen)',
  'Brookhouse School (Runda)',
  'Peponi School (Ruiru)',
  'Peponi House Preparatory',
  'Hillcrest International School (Karen)',
  'St. Andrew\'s School, Turi',
  'The Banda School (Nairobi)',
  'Kenton College Preparatory',
  'Pembroke House School (Gilgil)',
  'Greensteds International School (Nakuru)',
  'Oshwal Academy Nairobi (Senior)',
  'Oshwal Academy Nairobi (Junior)',
  'Oshwal Academy Mombasa',
  'Premier Academy (Nairobi)',
  'Nairobi Academy',
  'Rusinga Schools (Nairobi)',
  'Strathmore School (Nairobi)',
  'Light International School (Nairobi)',
  'Rosslyn Academy (Nairobi)',
  'International School of Kenya (ISK)',
  'Cavina School (Nairobi)',
  'Independent / Homeschool / Other'
];

function getSchoolsForCounty(county) {
  if (county === 'BRITISH' || county === 'international' || county === 'International') {
    return KENYA_INTERNATIONAL_SCHOOLS;
  }
  const list = KENYAN_JSS_SCHOOLS[county] || [];
  return [
    ...list,
    `${county} Primary School & JSS`,
    `${county} Township Junior Secondary`,
    'Other Kenyan CBE School (Custom)'
  ];
}

// Dynamic Tier Resolver — synchronises child with parent's active subscription and pilot status
function resolveStudentTier(student) {
  if (!student) return { subscriptionTier: 'free', tierInfo: pricingConfig.PRICING_TIERS.free, isPilotActive: false };

  let parent = null;
  if (student.email) {
    try {
      parent = parentStore.getParentByEmail(student.email);
    } catch (e) {
      // fallback
    }
  }

  // Check direct student pilot or parent pilot
  const studentPilotActive = pilotConfig.isPilotActive(student);
  const parentPilotActive = parent ? pilotConfig.isPilotActive(parent) : false;
  const isPilot = studentPilotActive || parentPilotActive;

  let tier = 'free';
  const childSubTier = parent?.studentSubscriptions?.[student.id]?.tier;
  const parentTier = parent?.subscriptionTier;
  const studentTier = student?.subscriptionTier;

  // Tier hierarchy: premium > school > standard > pilot > free
  const tierRank = { premium: 5, school: 4, standard: 3, pilot: 2, free: 1 };
  const candidates = [studentTier, childSubTier, parentTier].filter(t => t && t !== 'pilot' && t !== 'free');

  if (candidates.includes('premium')) {
    tier = 'premium';
  } else if (candidates.length > 0) {
    tier = candidates.sort((a, b) => (tierRank[b] || 0) - (tierRank[a] || 0))[0];
  } else if (isPilot) {
    tier = 'pilot';
  } else {
    tier = 'free';
  }

  // Strict normalization
  tier = String(tier || 'free').trim().toLowerCase();
  if (!['free', 'standard', 'premium', 'pilot', 'school', 'subcounty', 'county', 'foundation'].includes(tier)) {
    tier = 'free';
  }

  // Resolve level-aware pricing and labels (e.g., Senior Premium Pro vs Premium Scholar)
  let levelPricing = { tierLabel: 'Free', amount: 0, priceDisplay: 'KES 0', rateCardKey: 'CBC_JSS' };
  try {
    levelPricing = pricingConfig.resolvePricingForStudent(student, tier, 'monthly');
  } catch (err) {
    // fallback if error
  }

  const baseTierInfo = pricingConfig.PRICING_TIERS[tier] || pricingConfig.PRICING_TIERS.free;
  const tierInfo = {
    ...baseTierInfo,
    id: tier,
    name: levelPricing.tierLabel || baseTierInfo.name,
    uiLabel: levelPricing.tierLabel || baseTierInfo.uiLabel,
    priceMonthly: (levelPricing.amount !== undefined) ? levelPricing.amount : baseTierInfo.priceMonthly,
    priceDisplay: levelPricing.priceDisplay || baseTierInfo.priceDisplay,
    rateCardKey: levelPricing.rateCardKey || 'CBC_JSS',
    schoolLevel: student.schoolLevel || (parseInt(student.grade || 7, 10) >= 10 ? 'SS' : 'JSS')
  };

  return {
    subscriptionTier: tier,
    tierInfo,
    isPilotActive: isPilot,
    pilotStatus: studentPilotActive
      ? pilotConfig.getPilotStatus(student)
      : parentPilotActive
        ? pilotConfig.getPilotStatus(parent)
        : null
  };
}

// Student CRUD
function getStudents() {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  // Return public properties with resolved parent subscription tier
  return store.students.map(s => {
    const { subscriptionTier, tierInfo, isPilotActive, pilotStatus } = resolveStudentTier(s);
    return {
      id: s.id,
      handle: s.handle,
      email: s.email || '',
      grade: s.grade,
      county: s.county,
      avatar: s.avatar,
      age: s.age || (s.grade === 6 ? 11 : s.grade === 7 ? 12 : s.grade === 8 ? 14 : 15),
      schoolLevel: s.schoolLevel || (s.grade >= 10 ? 'SS' : 'JSS'),
      curriculum: s.curriculum || 'CBC',
      examBoard: s.examBoard || (s.curriculum === 'BRITISH' ? 'CAIE' : null),
      examTier: s.examTier || null,
      yearGroup: s.yearGroup || (s.curriculum === 'BRITISH' ? s.grade : null),
      pathway: s.pathway || (s.grade >= 10 ? 'STEM' : null),
      selectedSubjects: s.selectedSubjects || s.quests || [],
      freeSubjects: s.freeSubjects || (s.quests ? s.quests.slice(0, 3) : ['Mathematics', 'Science & Technology']),
      stream: s.stream || null,
      schoolId: s.schoolId || null,
      streamJoinCode: s.streamJoinCode || null,
      pilotCode: s.pilotCode || null,
      pilotExpiresAt: s.pilotExpiresAt || null,
      isPilotActive,
      pilotStatus,
      parentConsent: s.parentConsent !== undefined ? s.parentConsent : true,
      parentVerified: s.parentVerified !== undefined ? s.parentVerified : true,
      createdAt: s.createdAt,
      lastActive: s.lastActive,
      streak: s.streak || 1,
      points: s.points !== undefined ? s.points : 150,
      totalTurns: s.totalTurns || 0,
      subscriptionTier,
      tierInfo
    };
  });
}

function getStudentById(id, includePrivate = false) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const s = store.students.find(s => s.id === id);
  if (!s) return null;
  const { subscriptionTier, tierInfo, isPilotActive, pilotStatus } = resolveStudentTier(s);
  
  if (includePrivate) {
    return {
      ...s,
      schoolLevel: s.schoolLevel || (s.grade >= 10 ? 'SS' : 'JSS'),
      pathway: s.pathway || (s.grade >= 10 ? 'STEM' : null),
      selectedSubjects: s.selectedSubjects || s.quests || [],
      freeSubjects: s.freeSubjects || (s.quests ? s.quests.slice(0, 3) : ['Mathematics', 'Science & Technology']),
      isPilotActive,
      pilotStatus,
      subscriptionTier,
      tierInfo
    };
  }

  const { pinHash: _ph, tempPin: _tp, otpHash: _oh, ...safeStudent } = s;
  return {
    ...safeStudent,
    schoolLevel: safeStudent.schoolLevel || (safeStudent.curriculum === 'BRITISH' ? (safeStudent.grade >= 10 ? 'IGCSE' : 'CHECKPOINT') : (safeStudent.grade >= 10 ? 'SS' : 'JSS')),
    curriculum: safeStudent.curriculum || 'CBC',
    examBoard: safeStudent.examBoard || null,
    examTier: safeStudent.examTier || null,
    yearGroup: safeStudent.yearGroup || (safeStudent.curriculum === 'BRITISH' ? safeStudent.grade : null),
    pathway: safeStudent.pathway || (safeStudent.curriculum !== 'BRITISH' && safeStudent.grade >= 10 ? 'STEM' : null),
    selectedSubjects: safeStudent.selectedSubjects || safeStudent.quests || [],
    freeSubjects: safeStudent.freeSubjects || (safeStudent.quests ? safeStudent.quests.slice(0, 3) : ['Mathematics', 'Science & Technology']),
    isPilotActive,
    pilotStatus,
    subscriptionTier,
    tierInfo
  };
}

function isSameContact(student, contactStr, normPhone) {
  if (!student) return false;
  const clean = (contactStr || '').trim().toLowerCase();
  const sEmail = (student.email || '').toLowerCase();
  const sParentPhone = student.parentPhone || null;
  const sStudentPhone = student.studentPhone || null;
  if (clean && sEmail === clean) return true;
  if (normPhone) {
    if (sParentPhone === normPhone || sStudentPhone === normPhone) return true;
    if (sEmail === `${normPhone}@phone.elingu.local`) return true;
  }
  const cleanPhone = clean ? authUtils.normalizeKenyanPhone(clean) : null;
  if (cleanPhone) {
    if (sParentPhone === cleanPhone || sStudentPhone === cleanPhone) return true;
    if (sEmail === `${cleanPhone}@phone.elingu.local`) return true;
  }
  return false;
}

function purgeExpiredUnverifiedStudents() {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const now = Date.now();
  const EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours
  const initialLen = store.students.length;
  const purgedIds = [];
  store.students = store.students.filter(s => {
    if (s.parentVerified === false) {
      const createdTime = new Date(s.createdAt || 0).getTime();
      if (now - createdTime > EXPIRY_MS) {
        purgedIds.push(s.id);
        return false;
      }
    }
    return true;
  });
  if (store.students.length !== initialLen) {
    saveJson(STUDENTS_FILE, store);
    syncDb(() => {
      for (const id of purgedIds) {
        db.querySync('DELETE FROM students WHERE id = $1', [id]);
      }
    });
  }
}

function isHandleOrEmailTaken(handle, email) {
  purgeExpiredUnverifiedStudents();
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const cleanHandle = (handle || '').trim().toLowerCase();
  const cleanContact = (email || '').trim().toLowerCase();
  const normPhone = cleanContact ? authUtils.normalizeKenyanPhone(cleanContact) : null;

  const handleMatch = cleanHandle ? store.students.find(s => (s.handle || '').toLowerCase() === cleanHandle) : null;
  const contactMatch = cleanContact ? store.students.find(s => {
    const sEmail = (s.email || '').toLowerCase();
    const sParentPhone = s.parentPhone || null;
    const sStudentPhone = s.studentPhone || null;
    if (sEmail === cleanContact) return true;
    if (normPhone) {
      if (sParentPhone === normPhone || sStudentPhone === normPhone) return true;
      if (sEmail === `${normPhone}@phone.elingu.local`) return true;
    }
    return false;
  }) : null;

  let handleTaken = false;
  if (handleMatch) {
    if (handleMatch.parentVerified === true) {
      handleTaken = true;
    } else {
      // Unverified signup: if same parent/student contact is checking/re-submitting, do not report taken against themselves!
      const isSameParent = isSameContact(handleMatch, cleanContact, normPhone);
      handleTaken = !isSameParent;
    }
  }

  return {
    handleTaken,
    emailTaken: !!contactMatch,
    taken: !!(handleTaken || contactMatch)
  };
}

function createStudent({ fullName, realName, handle, email, studentEmail, studentPhone, parentPhone, grade, county, avatar, pin, age, school, quests, freeSubjects, pilotCode, parentConsent, schoolId, stream, streamJoinCode, pathway, selectedSubjects, curriculum, examBoard, examTier, yearGroup }) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const cleanRealName = (fullName || realName || '').trim().slice(0, 60) || null;
  const cleanHandle = (handle || cleanRealName || 'Mwanafunzi').trim().slice(0, 24);
  const cleanEmail = (email || '').trim().toLowerCase().slice(0, 80);
  const cleanStudentEmail = studentEmail ? String(studentEmail).trim().toLowerCase().slice(0, 80) : null;
  const cleanStudentPhone = studentPhone ? authUtils.normalizeKenyanPhone(studentPhone) : null;
  const cleanParentPhone = parentPhone ? authUtils.normalizeKenyanPhone(parentPhone) : null;

  // Curriculum determination: 'CBC' (default) vs 'BRITISH'
  const isBritishCurriculum = String(curriculum || '').toUpperCase() === 'BRITISH' || String(curriculum || '').toUpperCase() === 'IGCSE' || String(curriculum || '').toUpperCase() === 'CAMBRIDGE';
  const cleanCurriculum = isBritishCurriculum ? 'BRITISH' : 'CBC';
  const cleanExamBoard = isBritishCurriculum ? (String(examBoard || '').toUpperCase() === 'EDEXCEL' ? 'EDEXCEL' : 'CAIE') : null;

  let cleanGrade = [6, 7, 8, 9, 10, 11, 12].includes(parseInt(grade || yearGroup)) ? parseInt(grade || yearGroup) : (isBritishCurriculum ? 10 : 6);
  const cleanYearGroup = isBritishCurriculum ? cleanGrade : null;

  // STRICT RULE: Tiers (Core vs Extended) exist ONLY for Year 10 and 11. Years 7–9 follow unified Checkpoint syllabus.
  const cleanExamTier = (isBritishCurriculum && cleanGrade >= 10) ? (String(examTier || '').toLowerCase() === 'core' ? 'core' : 'extended') : null;
  const cleanCounty = KENYAN_COUNTIES.includes(county) ? county : 'Nairobi';
  const cleanAvatar = avatar || '🦁';
  
  const pinValidation = authUtils.validateStudentPin(pin);
  if (!pinValidation.valid) {
    const err = new Error(pinValidation.error || 'PIN must be exactly 4 digits and not be easily guessable');
    err.code = 'WEAK_PIN';
    throw err;
  }
  const cleanPin = pin.toString();
  const cleanAge = age ? parseInt(age, 10) : (cleanGrade === 6 ? 11 : cleanGrade === 7 ? 12 : cleanGrade === 8 ? 14 : 15);
  let cleanSchool = (school || (isBritishCurriculum ? 'International School Nairobi' : `${cleanCounty} Junior Secondary`)).trim().slice(0, 60);
  let resolvedSchoolId = schoolId || null;
  let resolvedStream = stream || null;
  let resolvedStreamJoinCode = streamJoinCode ? String(streamJoinCode).trim().toUpperCase() : null;

  // School level and pathway for Senior School architecture / British curriculum
  const cleanSchoolLevel = isBritishCurriculum ? (cleanGrade >= 10 ? 'IGCSE' : 'CHECKPOINT') : (cleanGrade >= 10 ? 'SS' : 'JSS');
  const VALID_PATHWAYS = ['STEM', 'HUMANITIES', 'ARTS_SPORTS'];
  const cleanPathway = (!isBritishCurriculum && cleanSchoolLevel === 'SS' && VALID_PATHWAYS.includes(pathway)) ? pathway : null;

  // Selected subjects — validated per curriculum & level
  const JSS_SUBJECTS = ['Mathematics', 'English', 'Kiswahili', 'Integrated Science', 'Science & Technology', 'Social Studies', 'Agriculture', 'Creative Arts'];
  const SS_COMPULSORY = ['Mathematics', 'Core Mathematics', 'Essential Mathematics', 'English', 'Kiswahili', 'Community Service Learning'];
  const SS_STEM = ['Physics', 'Chemistry', 'Biology', 'Computer Studies', 'Agriculture', 'Home Science', 'Advanced Mathematics', 'Drawing and Design', 'Aviation Technology', 'Building and Construction', 'Electrical and Electronics Technology'];
  const SS_HUMANITIES = ['History and Citizenship', 'Geography', 'Business Studies', 'CRE', 'IRE', 'HRE', 'Literature in English', 'Fasihi ya Kiswahili', 'French', 'German', 'Arabic', 'Mandarin Chinese'];
  const SS_ARTS_SPORTS = ['Music and Dance', 'Theatre and Film', 'Fine Art', 'Graphic Design', 'Sports and Recreation'];
  const BRITISH_SUBJECTS = [
    'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'English', 'First Language English', 'Business Studies', 'Economics', 'Geography', 'History',
    // Cambridge IGCSE & Checkpoint
    'Mathematics (0580)', 'First Language English (0500)', 'English as a Second Language (0510)',
    'Physics (0625)', 'Chemistry (0620)', 'Biology (0610)', 'Computer Science (0478)',
    'Business Studies (0450)', 'Economics (0455)', 'Geography (0460)', 'History (0470)',
    'Checkpoint Mathematics (0862)', 'Checkpoint English (0861)', 'Lower Secondary Science (0893)', 'Computing (0860)', 'Global Perspectives (0838)',
    'Physics (Checkpoint)', 'Chemistry (Checkpoint)', 'Biology (Checkpoint)',
    // Pearson Edexcel IGCSE & iLowerSecondary
    'Mathematics A (4MA1)', 'Mathematics B (4MB1)',
    'English Language A (4EA1)', 'English Language B (4EB1)', 'English as a Second Language (4ES1)',
    'Physics (4PH1)', 'Chemistry (4CH1)', 'Biology (4BI1)', 'Human Biology (4HB1)',
    'Computer Science (4CP0)', 'Business (4BS1)', 'Economics (4EC1)', 'Geography (4GE1)', 'History (4HI1)',
    'iLowerSecondary Maths (LMA11)', 'iLowerSecondary English (LEN11)', 'iLowerSecondary Science (LSC11)',
    'iLowerSecondary Computing (LIT11)', 'Global Citizenship (LGC11)'
  ];
  const ALL_VALID_SUBJECTS = [...new Set([...JSS_SUBJECTS, ...SS_COMPULSORY, ...SS_STEM, ...SS_HUMANITIES, ...SS_ARTS_SPORTS, ...BRITISH_SUBJECTS])];

  let cleanSelectedSubjects;
  if (Array.isArray(selectedSubjects) && selectedSubjects.length > 0) {
    cleanSelectedSubjects = selectedSubjects.filter(s => ALL_VALID_SUBJECTS.includes(s));
  } else if (isBritishCurriculum) {
    if (cleanExamBoard === 'EDEXCEL') {
      cleanSelectedSubjects = cleanGrade >= 10
        ? ['Mathematics A (4MA1)', 'English Language A (4EA1)', 'Physics (4PH1)', 'Chemistry (4CH1)', 'Computer Science (4CP0)']
        : ['iLowerSecondary Maths (LMA11)', 'iLowerSecondary English (LEN11)', 'iLowerSecondary Science (LSC11)'];
    } else {
      cleanSelectedSubjects = cleanGrade >= 10
        ? ['Mathematics (0580)', 'First Language English (0500)', 'Physics (0625)', 'Chemistry (0620)', 'Computer Science (0478)']
        : ['Checkpoint Mathematics (0862)', 'Checkpoint English (0861)', 'Lower Secondary Science (0893)', 'Computing (0860)'];
    }
  } else if (cleanSchoolLevel === 'SS') {
    cleanSelectedSubjects = ['Core Mathematics', 'English', 'Kiswahili', 'Community Service Learning'];
  } else {
    cleanSelectedSubjects = ['Mathematics', 'English', 'Kiswahili', 'Integrated Science', 'Social Studies'];
  }

  // If a stream join code was provided during signup, strictly validate against schools & streams
  if (resolvedStreamJoinCode) {
    const teacherStore = require('./teacherStore');
    const resolved = teacherStore.getSchoolByJoinCode(resolvedStreamJoinCode);
    if (!resolved) {
      const err = new Error(`Invalid class stream code "${resolvedStreamJoinCode}". Please ask your teacher for your classroom code (e.g. KUJ-8E) or leave this field blank.`);
      err.code = 'INVALID_STREAM_CODE';
      throw err;
    }
    resolvedSchoolId = resolved.schoolId;
    cleanSchool = resolved.schoolName;
    cleanGrade = resolved.grade;
    resolvedStream = resolved.stream;
    resolvedStreamJoinCode = resolved.joinCode;
  }

  // Quests backward compat — now derived from selectedSubjects
  const cleanQuests = cleanSelectedSubjects.length > 0 ? cleanSelectedSubjects : (Array.isArray(quests) && quests.length > 0 ? quests : ['Mathematics', 'Science & Technology', 'English']);
  // Free plan: 2 compulsory + 1 elective = 3 subjects
  const cleanFreeSubjects = Array.isArray(freeSubjects) && freeSubjects.length > 0
    ? freeSubjects.slice(0, 3)
    : cleanQuests.slice(0, 3);

  // Check pilot code if provided
  let pilotData = null;
  if (pilotCode) {
    const pRes = pilotConfig.verifyPilotCode(pilotCode);
    if (pRes.valid) {
      pilotData = pRes;
    }
  }

  // Block duplicate nicknames
  const existingCheck = isHandleOrEmailTaken(cleanHandle, cleanEmail);
  if (existingCheck.handleTaken) {
    const err = new Error(`A learner with the nickname "${cleanHandle}" already exists. Please choose a different nickname or log in.`);
    err.code = 'DUPLICATE_HANDLE';
    throw err;
  }

  // If an unverified draft exists for this nickname under the same family contact, replace it cleanly
  const existingDraft = store.students.find(s => (s.handle || '').toLowerCase() === cleanHandle.toLowerCase() && s.parentVerified === false);
  if (existingDraft && isSameContact(existingDraft, cleanEmail, cleanParentPhone || cleanStudentPhone)) {
    store.students = store.students.filter(s => s.id !== existingDraft.id);
  }

  // Duplicate email is now ALLOWED — sibling accounts under same parent.
  // Flag it so the server knows to send a parent approval email.
  const isExistingParentEmail = existingCheck.emailTaken;

  const studentId = 'stu_' + crypto.randomBytes(6).toString('hex');
  const newStudent = {
    id: studentId,
    realName: cleanRealName,
    handle: cleanHandle,
    email: cleanEmail,
    studentEmail: cleanStudentEmail,
    studentPhone: cleanStudentPhone,
    parentPhone: cleanParentPhone,
    grade: cleanGrade,
    county: cleanCounty,
    age: cleanAge,
    school: cleanSchool,
    schoolId: resolvedSchoolId,
    stream: resolvedStream,
    streamJoinCode: resolvedStreamJoinCode,
    schoolLevel: cleanSchoolLevel,
    curriculum: cleanCurriculum,
    examBoard: cleanExamBoard,
    examTier: cleanExamTier,
    yearGroup: cleanYearGroup,
    pathway: cleanPathway,
    selectedSubjects: cleanSelectedSubjects,
    avatar: cleanAvatar,
    quests: cleanQuests,
    freeSubjects: cleanFreeSubjects,
    pilotCode: pilotData ? pilotData.code : null,
    pilotType: pilotData ? pilotData.type : null,
    pilotCohortName: pilotData ? pilotData.cohortName : null,
    pilotActivatedAt: pilotData ? pilotData.activatedAt : null,
    pilotExpiresAt: pilotData ? pilotData.expiresAt : null,
    subscriptionTier: resolvedSchoolId ? 'school' : (pilotData ? 'pilot' : 'free'),
    parentConsent: parentConsent !== undefined ? !!parentConsent : true,
    // parentVerified starts false — set to true when parent clicks email link
    parentVerified: false,
    pinHash: authUtils.hashCredentialSync(cleanPin),
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    streak: 1,
    points: 150,
    totalTurns: 0
  };

  store.students.push(newStudent);
  saveJson(STUDENTS_FILE, store);

  syncDb(() => {
    db.querySync(`
      INSERT INTO students (
        id, handle, grade, county, school_id, school_name, stream,
        stream_join_code, email, student_email, student_phone, parent_phone,
        avatar, age, pin_hash, subscription_tier, tier_updated_at, quests,
        free_subjects, parent_consent, parent_verified, pilot_code, pilot_type,
        pilot_cohort_name, pilot_activated_at, pilot_expires_at, streak,
        total_turns, daily_turns_count, daily_turn_date, failed_login_attempts,
        locked_until, created_at, last_active
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32, $33, $34
      )
      ON CONFLICT(id) DO UPDATE SET
        handle = EXCLUDED.handle,
        grade = EXCLUDED.grade,
        school_id = EXCLUDED.school_id,
        stream = EXCLUDED.stream,
        stream_join_code = EXCLUDED.stream_join_code,
        subscription_tier = EXCLUDED.subscription_tier,
        last_active = EXCLUDED.last_active
    `, [
      newStudent.id,
      newStudent.handle,
      newStudent.grade,
      newStudent.county,
      newStudent.schoolId,
      newStudent.school,
      newStudent.stream,
      newStudent.streamJoinCode,
      newStudent.email,
      newStudent.studentEmail,
      newStudent.studentPhone,
      newStudent.parentPhone,
      newStudent.avatar,
      newStudent.age,
      newStudent.pinHash,
      newStudent.subscriptionTier,
      newStudent.tierUpdatedAt || null,
      db.toJson(newStudent.quests),
      db.toJson(newStudent.freeSubjects),
      newStudent.parentConsent ? 1 : 0,
      newStudent.parentVerified ? 1 : 0,
      newStudent.pilotCode,
      newStudent.pilotType,
      newStudent.pilotCohortName,
      newStudent.pilotActivatedAt,
      newStudent.pilotExpiresAt,
      newStudent.streak,
      newStudent.totalTurns,
      0,
      null,
      0,
      null,
      newStudent.createdAt,
      newStudent.lastActive
    ]);
  });

  const { subscriptionTier, tierInfo, isPilotActive, pilotStatus } = resolveStudentTier(newStudent);
  return {
    id: newStudent.id,
    realName: newStudent.realName,
    handle: newStudent.handle,
    email: newStudent.email,
    grade: newStudent.grade,
    county: newStudent.county,
    age: newStudent.age,
    school: newStudent.school,
    schoolId: newStudent.schoolId,
    stream: newStudent.stream,
    streamJoinCode: newStudent.streamJoinCode,
    avatar: newStudent.avatar,
    quests: newStudent.quests,
    schoolLevel: newStudent.schoolLevel,
    curriculum: newStudent.curriculum,
    examBoard: newStudent.examBoard,
    examTier: newStudent.examTier,
    yearGroup: newStudent.yearGroup,
    pathway: newStudent.pathway,
    selectedSubjects: newStudent.selectedSubjects,
    freeSubjects: newStudent.freeSubjects,
    pilotCode: newStudent.pilotCode,
    pilotExpiresAt: newStudent.pilotExpiresAt,
    isPilotActive,
    pilotStatus,
    parentConsent: newStudent.parentConsent,
    parentVerified: newStudent.parentVerified,
    studentEmail: newStudent.studentEmail,
    studentPhone: newStudent.studentPhone,
    parentPhone: newStudent.parentPhone,
    streak: newStudent.streak,
    points: newStudent.points !== undefined ? newStudent.points : 150,
    subscriptionTier,
    tierInfo,
    isExistingParentEmail  // tells server which email flow to trigger
  };
}


function maskContact(contact) {
  if (!contact) return '';
  if (contact.includes('@')) {
    const [name, domain] = contact.split('@');
    if (name.length <= 2) return name[0] + '*@' + domain;
    return name[0] + '*'.repeat(Math.max(name.length - 2, 1)) + name[name.length - 1] + '@' + domain;
  }
  // Phone: +254712345678 -> +254***678
  if (contact.length >= 8) {
    return contact.slice(0, 4) + '***' + contact.slice(-3);
  }
  return contact;
}

function findStudentByIdentifier(storeOrIdentifier, optionalIdentifier) {
  let store, identifier;
  if (optionalIdentifier !== undefined) {
    store = storeOrIdentifier;
    identifier = optionalIdentifier;
  } else {
    store = loadJson(STUDENTS_FILE, { students: [] });
    identifier = storeOrIdentifier;
  }
  if (!identifier) return null;
  const cleanInput = String(identifier).trim().toLowerCase();
  const normPhone = authUtils.normalizeKenyanPhone(cleanInput);

  return store.students.find(s => {
    const handleMatch = (s.handle || '').toLowerCase() === cleanInput;
    const parentEmailMatch = (s.email || '').toLowerCase() === cleanInput;
    const studentEmailMatch = s.studentEmail && s.studentEmail.toLowerCase() === cleanInput;
    const studentPhoneMatch = normPhone && s.studentPhone && authUtils.normalizeKenyanPhone(s.studentPhone) === normPhone;
    const parentPhoneMatch = normPhone && s.parentPhone && authUtils.normalizeKenyanPhone(s.parentPhone) === normPhone;
    return (handleMatch || parentEmailMatch || studentEmailMatch || studentPhoneMatch || parentPhoneMatch);
  });
}

function requestStudentOTP(identifier) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = findStudentByIdentifier(store, identifier);
  if (!student) {
    return { success: false, error: 'No learner account found with this nickname, email, or phone.' };
  }

  const cooldown = authUtils.checkOTPCooldown(student);
  if (cooldown.coolingDown) {
    return { success: false, error: `Too many code requests. Please wait ${cooldown.minutesRemaining} minute(s) before requesting another.` };
  }

  const otp = authUtils.generateOTP();
  authUtils.storeOTPOnRecord(student, otp);
  authUtils.recordOTPRequest(student);
  saveJson(STUDENTS_FILE, store);

  // Determine delivery target: student personal contact takes priority if present
  let channel = 'email';
  let target = '';
  let recipientRole = 'student';

  if (student.studentEmail) {
    channel = 'email';
    target = student.studentEmail;
    recipientRole = 'student';
  } else if (student.studentPhone) {
    channel = 'sms';
    target = student.studentPhone;
    recipientRole = 'student';
  } else if (student.parentPhone) {
    channel = 'sms';
    target = student.parentPhone;
    recipientRole = 'parent';
  } else if (student.email && student.email.includes('@phone.elingu.local')) {
    channel = 'sms';
    target = student.email.replace('@phone.elingu.local', '');
    recipientRole = 'parent';
  } else {
    channel = 'email';
    target = student.email;
    recipientRole = 'parent';
  }

  return {
    success: true,
    otp,
    student,
    channel,
    target,
    recipientRole,
    maskedTarget: maskContact(target),
    message: recipientRole === 'student'
      ? `A 6-digit code was sent to your ${channel === 'sms' ? 'phone' : 'email'} (${maskContact(target)}).`
      : `A 6-digit code was sent to your parent's ${channel === 'sms' ? 'phone' : 'email'} (${maskContact(target)}). Ask them for the code!`
  };
}

async function resetStudentPinWithOTP(identifier, otp, newPin) {
  const cleanPin = String(newPin || '').trim();
  const pinValidation = authUtils.validateStudentPin(cleanPin);
  if (!pinValidation.valid) {
    return { success: false, error: pinValidation.error };
  }

  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = findStudentByIdentifier(store, identifier);
  if (!student) {
    return { success: false, error: 'Student not found.' };
  }

  const otpRes = authUtils.verifyOTPFromRecord(student, otp);
  if (!otpRes.valid) {
    return { success: false, error: otpRes.error || 'Invalid or expired verification code.' };
  }

  student.pinHash = await authUtils.hashCredential(cleanPin);
  authUtils.clearFailedAttempts(student);
  student.lastActive = new Date().toISOString();
  saveJson(STUDENTS_FILE, store);

  const { subscriptionTier, tierInfo } = resolveStudentTier(student);

  // Return parent notification contact details
  const parentEmail = (student.email && !student.email.includes('@phone.elingu.local')) ? student.email : null;
  const parentPhone = student.parentPhone || (student.email && student.email.includes('@phone.elingu.local') ? student.email.replace('@phone.elingu.local', '') : null);

  return {
    success: true,
    student: {
      id: student.id,
      handle: student.handle,
      email: student.email,
      studentEmail: student.studentEmail,
      studentPhone: student.studentPhone,
      grade: student.grade,
      county: student.county,
      school: student.school,
      avatar: student.avatar,
      quests: student.quests || [],
      subscriptionTier,
      tierInfo
    },
    parentEmail,
    parentPhone,
    message: 'Your 4-digit PIN has been reset successfully!'
  };
}

async function authenticateStudent(handleOrEmail, pin) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const cleanPin = (pin || '').toString();

  const student = findStudentByIdentifier(store, handleOrEmail);

  if (!student) return null;

  const lockout = authUtils.checkLockout(student);
  if (lockout.locked) {
    return { locked: true, minutesRemaining: lockout.minutesRemaining };
  }

  const isValid = await authUtils.verifyCredential(cleanPin, student.pinHash, 'elingu_salt_2026');

  if (!isValid) {
    const attemptRes = authUtils.recordFailedAttempt(student, 'student');
    saveJson(STUDENTS_FILE, store);
    if (attemptRes && attemptRes.locked) {
      const lockStatus = authUtils.checkLockout(student);
      return { locked: true, minutesRemaining: lockStatus.minutesRemaining || 10 };
    }
    return null;
  }

  authUtils.clearFailedAttempts(student);

  if (authUtils.isLegacyHash(student.pinHash)) {
    student.pinHash = authUtils.hashCredentialSync(cleanPin);
  }

  saveJson(STUDENTS_FILE, store);

  const { subscriptionTier, tierInfo, isPilotActive, pilotStatus } = resolveStudentTier(student);
  return {
    id: student.id,
    handle: student.handle,
    email: student.email || '',
    grade: student.grade,
    county: student.county,
    age: student.age || (student.grade === 6 ? 11 : student.grade === 7 ? 12 : student.grade === 8 ? 14 : 15),
    school: student.school || `${student.county} CBE School`,
    avatar: student.avatar || '🦁',
    quests: student.quests || ['Mathematics', 'Science & Technology', 'English'],
    schoolLevel: student.schoolLevel || (student.grade >= 10 ? 'SS' : 'JSS'),
    curriculum: student.curriculum || 'CBC',
    examBoard: student.examBoard || (student.curriculum === 'BRITISH' ? 'CAIE' : null),
    examTier: student.examTier || null,
    yearGroup: student.yearGroup || (student.curriculum === 'BRITISH' ? student.grade : null),
    pathway: student.pathway || (student.grade >= 10 ? 'STEM' : null),
    selectedSubjects: student.selectedSubjects || student.quests || [],
    freeSubjects: student.freeSubjects || (student.quests ? student.quests.slice(0, 3) : ['Mathematics', 'English']),
    pilotCode: student.pilotCode || null,
    pilotExpiresAt: student.pilotExpiresAt || null,
    isPilotActive,
    pilotStatus,
    parentConsent: student.parentConsent !== undefined ? student.parentConsent : true,
    parentVerified: student.parentVerified !== undefined ? student.parentVerified : true,
    streak: student.streak || 1,
    points: student.points !== undefined ? student.points : 150,
    subscriptionTier,
    tierInfo
  };
}

function updateStudentProfile(id, { grade, county, age, school, avatar, handle, email, quests, freeSubjects, schoolLevel, pathway, selectedSubjects, points, curriculum, examBoard, examTier, yearGroup }) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === id);
  if (!student) return null;

  if (curriculum !== undefined) {
    student.curriculum = String(curriculum).toUpperCase() === 'BRITISH' ? 'BRITISH' : 'CBC';
  }
  if (examBoard !== undefined) {
    student.examBoard = examBoard;
  }
  if (examTier !== undefined) {
    student.examTier = examTier;
  }
  if (yearGroup !== undefined) {
    student.yearGroup = parseInt(yearGroup, 10);
  }

  const isBri = student.curriculum === 'BRITISH';

  if (grade !== undefined && [6, 7, 8, 9, 10, 11, 12].includes(parseInt(grade))) {
    student.grade = parseInt(grade);
    student.schoolLevel = isBri ? (student.grade >= 10 ? 'IGCSE' : 'CHECKPOINT') : (student.grade >= 10 ? 'SS' : 'JSS');
    if (isBri) {
      student.yearGroup = student.grade;
    }
  }
  if (schoolLevel) {
    student.schoolLevel = schoolLevel;
  }
  if (pathway !== undefined) {
    student.pathway = isBri ? null : pathway;
  }
  if (county && KENYAN_COUNTIES.includes(county)) {
    student.county = county;
  }
  if (age) {
    student.age = parseInt(age, 10);
  }
  if (school) {
    student.school = school.trim().slice(0, 60);
  }
  if (avatar) {
    student.avatar = avatar;
  }
  if (handle) {
    student.handle = handle.trim().slice(0, 24);
  }
  if (email !== undefined) {
    student.email = email.trim().toLowerCase().slice(0, 80);
  }
  if (points !== undefined && typeof points === 'number') {
    student.points = points;
  }
  if (Array.isArray(selectedSubjects)) {
    student.selectedSubjects = selectedSubjects;
    student.quests = selectedSubjects;
  } else if (Array.isArray(quests)) {
    student.quests = quests;
    student.selectedSubjects = quests;
  }
  if (Array.isArray(freeSubjects)) {
    student.freeSubjects = freeSubjects.slice(0, 3);
  }

  student.lastActive = new Date().toISOString();
  saveJson(STUDENTS_FILE, store);

  const { subscriptionTier, tierInfo, isPilotActive, pilotStatus } = resolveStudentTier(student);
  return {
    id: student.id,
    handle: student.handle,
    email: student.email || '',
    grade: student.grade,
    county: student.county,
    age: student.age,
    school: student.school,
    avatar: student.avatar,
    schoolLevel: student.schoolLevel || (isBri ? (student.grade >= 10 ? 'IGCSE' : 'CHECKPOINT') : (student.grade >= 10 ? 'SS' : 'JSS')),
    curriculum: student.curriculum || 'CBC',
    examBoard: student.examBoard || (student.curriculum === 'BRITISH' ? 'CAIE' : null),
    examTier: student.examTier || null,
    yearGroup: student.yearGroup || (student.curriculum === 'BRITISH' ? student.grade : null),
    pathway: student.pathway || null,
    selectedSubjects: student.selectedSubjects || student.quests || [],
    quests: student.quests,
    freeSubjects: student.freeSubjects || (student.quests ? student.quests.slice(0, 3) : ['Mathematics', 'English']),
    pilotCode: student.pilotCode || null,
    pilotExpiresAt: student.pilotExpiresAt || null,
    isPilotActive,
    pilotStatus,
    parentConsent: student.parentConsent !== undefined ? student.parentConsent : true,
    parentVerified: student.parentVerified !== undefined ? student.parentVerified : true,
    streak: student.streak || 1,
    points: student.points !== undefined ? student.points : 150,
    subscriptionTier,
    tierInfo
  };
}

function activateStudentPilot(studentId, accessCode) {
  const pilotRes = pilotConfig.verifyPilotCode(accessCode);
  if (!pilotRes.valid) {
    return { success: false, error: pilotRes.error };
  }

  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) return { success: false, error: 'Student not found.' };

  student.pilotCode = pilotRes.code;
  student.pilotType = pilotRes.type;
  student.pilotCohortName = pilotRes.cohortName;
  student.pilotActivatedAt = pilotRes.activatedAt;
  student.pilotExpiresAt = pilotRes.expiresAt;
  student.subscriptionTier = 'pilot';
  student.lastActive = new Date().toISOString();

  saveJson(STUDENTS_FILE, store);
  const tierData = resolveStudentTier(student);
  const { pinHash: _ph, tempPin: _tp, otpHash: _oh, ...safeStudent } = student;
  return {
    success: true,
    student: {
      ...safeStudent,
      freeSubjects: safeStudent.freeSubjects || (safeStudent.quests ? safeStudent.quests.slice(0, 2) : ['Mathematics', 'Science & Technology']),
      ...tierData
    },
    message: `🎉 ${pilotRes.cohortName} activated! Full access unlocked until ${new Date(pilotRes.expiresAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}.`
  };
}


async function verifyStudentPin(id, pin) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === id);
  if (!student) return false;
  const cleanPin = (pin || '').toString();
  
  const isValid = await authUtils.verifyCredential(cleanPin, student.pinHash, 'elingu_salt_2026');
  
  if (isValid && authUtils.isLegacyHash(student.pinHash)) {
    student.pinHash = authUtils.hashCredentialSync(cleanPin);
    saveJson(STUDENTS_FILE, store);
  }
  
  return isValid;
}

const SUBJECT_CANONICAL = {
  'Integrated Science': 'Science & Technology',
  'Science': 'Science & Technology',
  'Science and Technology': 'Science & Technology',
  'Social': 'Social Studies',
  'Swahili': 'Kiswahili',
  'Math': 'Mathematics',
  'Maths': 'Mathematics'
};

function normalizeSubject(subject) {
  return SUBJECT_CANONICAL[subject] || subject;
}

// Session History Persistence per Student & Subject
function getStudentSession(studentId, subject) {
  const sessions = loadJson(SESSIONS_FILE, {});
  const canon = normalizeSubject(subject);
  const key = `${studentId}_${canon}`;
  return sessions[key] || { messages: [], lastUpdated: null };
}

function saveStudentSession(studentId, subject, messages) {
  const sessions = loadJson(SESSIONS_FILE, {});
  const canon = normalizeSubject(subject);
  const key = `${studentId}_${canon}`;
  const now = new Date().toISOString();
  
  sessions[key] = {
    studentId,
    subject: canon,
    messages: (messages || []).slice(-30), // keep recent 30 messages max
    lastUpdated: now
  };
  saveJson(SESSIONS_FILE, sessions);

  syncDb(() => {
    db.querySync(`
      INSERT INTO sessions (session_key, student_id, subject, messages, last_updated)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(session_key) DO UPDATE SET
        messages = EXCLUDED.messages,
        last_updated = EXCLUDED.last_updated
    `, [key, studentId, canon, db.toJson(sessions[key].messages), now]);
  });

  // Update student last active and daily turns stats
  recordDailyTurn(studentId);

  // Update Aggregated Analytics Signals (Privacy Preserving)
  recordPedagogicalSignal(studentId, subject, messages);
}

// ── TONIGHT'S PARENT GUIDE CACHE (DINNER, BEDTIME PRAISE, TEACHER PROMPT) ──
function saveTonightsGuide(studentId, subject, guideData) {
  const sessions = loadJson(SESSIONS_FILE, {});
  const canon = normalizeSubject(subject);
  const key = `${studentId}_${canon}`;
  if (!sessions[key]) {
    sessions[key] = { studentId, subject: canon, messages: [], lastUpdated: new Date().toISOString() };
  }
  sessions[key].tonightsGuide = guideData;
  saveJson(SESSIONS_FILE, sessions);
  return true;
}

function getStudentTonightsGuide(studentId, subject) {
  const sessions = loadJson(SESSIONS_FILE, {});
  const canon = normalizeSubject(subject);
  const key = `${studentId}_${canon}`;
  return sessions[key]?.tonightsGuide || null;
}

// Daily turn counters for tier enforcement (e.g. 15 turns/day on Free tier)
function getDailyTurns(studentId) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) return 0;
  const today = new Date().toISOString().slice(0, 10);
  if (student.dailyTurnDate === today) {
    return student.dailyTurnsCount || 0;
  }
  return 0;
}

function recordDailyTurn(studentId) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) return 0;
  const now = new Date();
  let today;
  try {
    today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(now);
  } catch (e) {
    today = now.toISOString().slice(0, 10);
  }
  
  if (student.dailyTurnDate !== today) {
    // Check if the previous activity was yesterday (in Kenyan calendar days) to maintain streak
    if (student.dailyTurnDate) {
      const prevDate = new Date(student.dailyTurnDate + 'T00:00:00Z');
      const currDate = new Date(today + 'T00:00:00Z');
      const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        student.streak = (student.streak || 1) + 1;
      } else if (diffDays > 1) {
        student.streak = 1;
      }
    } else {
      student.streak = student.streak || 1;
    }
    student.dailyTurnDate = today;
    student.dailyTurnsCount = 1;
  } else {
    student.dailyTurnsCount = (student.dailyTurnsCount || 0) + 1;
  }

  // Award 5 points per turn
  student.points = (student.points !== undefined ? student.points : 150) + 5;
  student.totalTurns = (student.totalTurns || 0) + 1;
  student.lastActive = now.toISOString();
  saveJson(STUDENTS_FILE, store);

  syncDb(() => {
    db.querySync(`
      UPDATE students
      SET total_turns = $2,
          daily_turns_count = $3,
          daily_turn_date = $4,
          last_active = $5,
          streak = $6
      WHERE id = $1
    `, [
      student.id,
      student.totalTurns,
      student.dailyTurnsCount,
      student.dailyTurnDate,
      student.lastActive,
      student.streak
    ]);
  });

  return student.dailyTurnsCount;
}

function awardStudentPoints(studentId, pointsToAdd) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) return 150;
  student.points = (student.points !== undefined ? student.points : 150) + (pointsToAdd || 0);
  saveJson(STUDENTS_FILE, store);
  return student.points;
}

// Record Pedagogical Signal for Heatmaps & Teacher Dashboards (No verbatim logs)
function recordPedagogicalSignal(studentId, subject, messages) {
  const analytics = loadJson(ANALYTICS_FILE, { signals: [], summaryByGrade: {} });
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) return;

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const now = new Date().toISOString();

  // Extract high-level topic / strand signals without storing sensitive text
  analytics.signals.push({
    grade: student.grade,
    county: student.county,
    subject,
    timestamp: now,
    length: lastUserMsg.length,
  });

  // Limit signal history to recent 1,000 events
  if (analytics.signals.length > 1000) {
    analytics.signals = analytics.signals.slice(-1000);
  }

  saveJson(ANALYTICS_FILE, analytics);
}

// Multi-step Confirmed Purge (Right to Erasure - DPA Sec 40)
async function purgeStudentData(studentId, pin) {
  const isAuthorized = await verifyStudentPin(studentId, pin);
  if (!isAuthorized) {
    return { success: false, error: 'Invalid PIN. Data erasure aborted.' };
  }

  // 1. Remove student profile
  const store = loadJson(STUDENTS_FILE, { students: [] });
  store.students = store.students.filter(s => s.id !== studentId);
  saveJson(STUDENTS_FILE, store);

  // 2. Remove all session histories for this student
  const sessions = loadJson(SESSIONS_FILE, {});
  Object.keys(sessions).forEach(key => {
    if (key.startsWith(`${studentId}_`)) {
      delete sessions[key];
    }
  });
  saveJson(SESSIONS_FILE, sessions);

  return { success: true, message: 'All student history, streaks, and sessions have been permanently erased.' };
}

// Hierarchical Teacher / Admin Analytics
function getAggregatedAnalytics(role = 'subject_teacher', filter = {}) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const analytics = loadJson(ANALYTICS_FILE, { signals: [] });

  const totalStudents = store.students.length;
  const activeCountyCount = new Set(store.students.map(s => s.county)).size;

  // Grade distributions
  const gradeDistribution = { 6: 0, 7: 0, 8: 0, 9: 0 };
  store.students.forEach(s => {
    if (gradeDistribution[s.grade] !== undefined) gradeDistribution[s.grade]++;
  });

  // Subject engagement breakdown
  const subjectEngagement = {
    'Mathematics': 0,
    'Science & Technology': 0,
    'English': 0,
    'Social Studies': 0,
    'Kiswahili': 0
  };

  analytics.signals.forEach(sig => {
    const subj = sig.subject === 'Integrated Science' ? 'Science & Technology' : sig.subject;
    if (subjectEngagement[subj] !== undefined) {
      subjectEngagement[subj]++;
    }
  });

  // Filter based on Hierarchical Role
  if (role === 'subject_teacher') {
    const targetSubject = normalizeSubject(filter.subject || 'Mathematics');
    const targetGrade = parseInt(filter.grade) || 7;
    return {
      role: 'Subject Teacher',
      subject: targetSubject,
      grade: targetGrade,
      activeLearnersInGrade: gradeDistribution[targetGrade] || 0,
      totalInquiriesInSubject: subjectEngagement[targetSubject] || 0,
      recentActivityCount: analytics.signals.filter(s => normalizeSubject(s.subject) === targetSubject && s.grade === targetGrade).length
    };
  }

  if (role === 'class_teacher') {
    const targetGrade = parseInt(filter.grade) || 7;
    return {
      role: 'Class Teacher',
      grade: targetGrade,
      totalStudentsInClass: gradeDistribution[targetGrade] || 0,
      subjectEngagementAcrossClass: subjectEngagement,
      totalClassInquiries: analytics.signals.filter(s => s.grade === targetGrade).length
    };
  }

  // Principal / Senior View (Bird's-Eye)
  return {
    role: 'Principal (Bird\'s-Eye)',
    totalEnrolledStudents: totalStudents,
    activeCounties: activeCountyCount,
    gradeDistribution,
    subjectEngagement,
    totalSchoolInquiries: analytics.signals.length
  };
}

// Mark a student's account as parent-verified (called after parent clicks email link)
function setStudentParentVerified(studentId) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) return false;
  student.parentVerified = true;
  saveJson(STUDENTS_FILE, store);
  return true;
}

// Curriculum-aligned topic synthesis helper (removes prompt noise, extracts clean CBE concept titles)
function synthesizeLearningTopic(subj, sess) {
  if (!sess || !sess.messages || sess.messages.length === 0) {
    return `${subj} Exploration`;
  }

  const allText = sess.messages.map(m => m.content || '').join(' ');
  const userMsgs = sess.messages.filter(m => m.role === 'user');
  const substantiveUserMsg = [...userMsgs].reverse().find(m => {
    const txt = (m.content || '').trim().toLowerCase();
    const genericWords = ['ready', 'idk', 'ok', 'okay', 'yes', 'no', 'alaas', 'hello', 'hi', 'sawa', 'sure', 'start'];
    return txt.length >= 8 && !genericWords.includes(txt);
  });

  const curriculumMap = [
    // Mathematics
    { regex: /rates\s+of\s+work/i, label: 'Rates of Work Investigation' },
    { regex: /factors?\s+(?:and|&)\s+multiples?/i, label: 'Factors, Multiples & Divisibility' },
    { regex: /(?:linear\s+equations?|algebraic\s+expressions?|algebra)/i, label: 'Algebra & Linear Equations' },
    { regex: /(?:fractions?|percentages?|decimals?|ratios?)/i, label: 'Fractions, Decimals & Ratios' },
    { regex: /(?:pythagoras|angles?|triangles?|geometry|polygons?)/i, label: 'Geometry & Angle Properties' },
    { regex: /(?:area|perimeter|volume|surface\s+area|measurement)/i, label: 'Measurement, Area & Volume' },
    { regex: /(?:integers?|negative\s+numbers?|indices|powers?)/i, label: 'Integers & Number Operations' },
    { regex: /(?:statistics?|data\s+handling|mean|median|mode|bar\s+graph|pie\s+chart)/i, label: 'Statistics & Data Handling' },
    { regex: /(?:commercial\s+arithmetic|profit|loss|simple\s+interest|discount|currency)/i, label: 'Commercial Arithmetic & Finance' },
    { regex: /grade\s+7\s+mathematics/i, label: 'Grade 7 Mathematics Foundations' },
    { regex: /grade\s+8\s+mathematics/i, label: 'Grade 8 Mathematics Foundations' },
    { regex: /grade\s+9\s+mathematics/i, label: 'Grade 9 Mathematics Foundations' },
    { regex: /grade\s+6\s+mathematics/i, label: 'Grade 6 Mathematics Foundations' },

    // English
    { regex: /(?:literary\s+devices?|figurative\s+language|metaphors?|similes?|personification|poetry|poetic)/i, label: 'Literary Devices in Poetry' },
    { regex: /(?:tenses?|parts\s+of\s+speech|nouns?|verbs?|adjectives?|adverbs?|prepositions?|grammar)/i, label: 'Grammar & Sentence Structures' },
    { regex: /(?:comprehension|reading\s+skills?|summary\s+writing|passage)/i, label: 'Reading Comprehension & Analysis' },
    { regex: /(?:composition|creative\s+writing|essay|narrative|letter\s+writing)/i, label: 'Composition & Creative Writing' },
    { regex: /(?:proverbs?|idioms?|phrasal\s+verbs?|vocabulary)/i, label: 'Vocabulary, Idioms & Expressions' },

    // Kiswahili
    { regex: /(?:ushairi|mashairi|vina|mizani|beti)/i, label: 'Uchambuzi wa Ushairi' },
    { regex: /(?:sarufi|ngeli|vitenzi|nomino|vivumishi|viunganishi)/i, label: 'Sarufi na Muundo wa Sentensi' },
    { regex: /(?:insha|uandishi|barua|hotuba)/i, label: 'Uandishi wa Insha na Mawasiliano' },
    { regex: /(?:methali|misemo|nahau|vitendawili)/i, label: 'Fasihi Simulizi, Methali na Nahau' },
    { regex: /(?:ufahamu|kusoma|taarifa)/i, label: 'Kusoma na Ufahamu wa Kina' },

    // Science & Technology / Integrated Science
    { regex: /(?:circulatory\s+system|heart|blood\s+vessels?|arteries|veins)/i, label: 'Human Circulatory System' },
    { regex: /(?:digestive\s+system|digestion|nutrients?|enzymes)/i, label: 'Human Digestive System' },
    { regex: /(?:states?\s+of\s+matter|melting|freezing|evaporation|condensation|sublimation)/i, label: 'Matter & Change of State' },
    { regex: /(?:mixtures?|separation\s+of\s+mixtures?|filtration|distillation)/i, label: 'Separation of Mixtures' },
    { regex: /(?:forces?|energy|light|reflection|refraction|sound|magnets?)/i, label: 'Force, Energy & Mechanics' },
    { regex: /(?:fungi|mushrooms?|moulds?|yeast|invertebrates?|insects?|ecosystems?)/i, label: 'Living Things & Ecosystems' },
    { regex: /(?:computer|digital\s+devices?|internet\s+safety|data|coding)/i, label: 'Digital Technology & Computing' },

    // Social Studies & Agriculture
    { regex: /(?:soil|soil\s+conservation|crops?|livestock|farming|agriculture)/i, label: 'Soil Conservation & Agriculture' },
    { regex: /(?:weather|climate|physical\s+features?|mountains?|lakes?|maps?)/i, label: 'Physical Environment & Geography' },
    { regex: /(?:citizenship|governance|democracy|kenyan\s+constitution|heritage)/i, label: 'Citizenship, Governance & Heritage' }
  ];

  for (const item of curriculumMap) {
    if (item.regex.test(allText)) {
      return item.label;
    }
  }

  if (substantiveUserMsg && substantiveUserMsg.content) {
    let clean = substantiveUserMsg.content.trim()
      .replace(/^hello[^\n]*/i, '')
      .replace(/^today\s+(?:we\s+are|we're)\s+(?:diving\s+into|exploring)\s+/i, '')
      .replace(/^(?:can\s+you\s+(?:help\s+me\s+with|explain|teach\s+me\s+about)|what\s+(?:is|are\s+the\s+main)|how\s+do\s+(?:we|i)\s+calculate|tell\s+me\s+about|i\s+want\s+to\s+learn\s+about|explain\s+to\s+me|please\s+explain)\s+/i, '')
      .replace(/[?!.]+$/, '')
      .trim();

    if (clean.length >= 5 && clean.length <= 45) {
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }
  }

  return `${subj} Concept Inquiry`;
}

// Activity and Progress Aggregator for Parent & Teacher Insights
function getChildActivitySummary(studentId) {
  const sessions = loadJson(SESSIONS_FILE, {});
  const subjectsExplored = [];
  const recentTopics = [];
  const prefix = `${studentId}_`;

  Object.keys(sessions).forEach(key => {
    if (!key.startsWith(prefix)) return;
    const sess = sessions[key];
    const subj = sess.subject || key.slice(prefix.length);
    if (sess && sess.messages && sess.messages.length > 0) {
      if (!subjectsExplored.includes(subj)) subjectsExplored.push(subj);
      const userMsgs = sess.messages.filter(m => m.role === 'user');
      const turnCount = userMsgs.length;
      const topicTitle = synthesizeLearningTopic(subj, sess);

      // Extract representative Socratic question & learner response for drill-down
      const assistantMsgs = sess.messages.filter(m => m.role === 'assistant');
      const keyQuestion = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1].content : '';
      const keyAnswer = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : '';

      recentTopics.push({
        subject: subj,
        topic: topicTitle,
        turnCount,
        lastUpdated: sess.lastUpdated,
        keyQuestion: keyQuestion.substring(0, 300),
        keyAnswer: keyAnswer.substring(0, 150),
        tonightsGuide: sess.tonightsGuide || null
      });
    }
  });

  return {
    subjectsExplored,
    recentTopics: recentTopics.sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0)),
    hasActivity: recentTopics.length > 0
  };
}

function setStudentTier(studentId, tier) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) return { success: false, error: 'Student not found.' };

  student.subscriptionTier = tier || 'free';
  student.tierUpdatedAt = new Date().toISOString();
  student.lastActive = new Date().toISOString();
  saveJson(STUDENTS_FILE, store);

  const resolved = resolveStudentTier(student);
  return { success: true, student, ...resolved };
}

/**
 * Link an existing student to a school and stream via Stream Join Code (e.g. KUJ-8E)
 */
function joinStream(studentId, joinCode) {
  const teacherStore = require('./teacherStore');
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) return { success: false, error: 'Student account not found.' };

  const resolved = teacherStore.getSchoolByJoinCode(joinCode);
  if (!resolved) {
    return { success: false, error: 'Invalid stream code. Please verify the code provided by your teacher (e.g. KUJ-8E).' };
  }

  student.schoolId = resolved.schoolId;
  student.school = resolved.schoolName;
  student.grade = resolved.grade;
  student.stream = resolved.stream;
  student.streamJoinCode = resolved.joinCode;
  student.subscriptionTier = 'school';
  student.lastActive = new Date().toISOString();

  saveJson(STUDENTS_FILE, store);

  syncDb(() => {
    db.querySync(`
      UPDATE students
      SET school_id = $2,
          school_name = $3,
          grade = $4,
          stream = $5,
          stream_join_code = $6,
          subscription_tier = $7,
          last_active = $8
      WHERE id = $1
    `, [
      student.id,
      student.schoolId,
      student.school,
      student.grade,
      student.stream,
      student.streamJoinCode,
      student.subscriptionTier,
      student.lastActive
    ]);
  });

  const { pinHash: _ph, tempPin: _tp, otpHash: _oh, ...safeStudent } = student;
  return {
    success: true,
    student: safeStudent,
    schoolId: resolved.schoolId,
    schoolName: resolved.schoolName,
    grade: resolved.grade,
    stream: resolved.stream,
    streamJoinCode: resolved.joinCode
  };
}

/**
 * Get all students enrolled in a specific school grade stream
 */
function getStudentsByStream(schoolId, grade, stream) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const cleanGrade = parseInt(grade);
  const cleanStream = String(stream || '').trim().toLowerCase();
  return store.students.filter(s =>
    s.schoolId === schoolId &&
    s.grade === cleanGrade &&
    (s.stream || '').trim().toLowerCase() === cleanStream
  );
}

/**
 * Get all students enrolled in a school
 */
function getStudentsBySchool(schoolId) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  return store.students.filter(s => s.schoolId === schoolId);
}

/**
 * Bulk import students for institutional onboarding (from CSV or structured array)
 */
async function bulkCreateStudents(studentRows, schoolId, defaults = {}) {
  const teacherStore = require('./teacherStore');
  const school = teacherStore.getSchoolById(schoolId);
  if (!school) throw new Error('School entity not found.');

  const store = loadJson(STUDENTS_FILE, { students: [] });
  const results = {
    totalRequested: studentRows.length,
    created: [],
    skipped: []
  };

  for (const row of studentRows) {
    try {
      const handle = (row.name || row.handle || '').trim().slice(0, 24);
      if (!handle) {
        results.skipped.push({ row, reason: 'Missing name/handle' });
        continue;
      }

      // If handle already exists, append unique suffix
      let uniqueHandle = handle;
      let counter = 1;
      while (store.students.some(s => s.handle.toLowerCase() === uniqueHandle.toLowerCase())) {
        uniqueHandle = `${handle.slice(0, 18)}_${counter}`;
        counter++;
      }

      const grade = [6, 7, 8, 9].includes(parseInt(row.grade)) ? parseInt(row.grade) : (defaults.grade || 7);
      const stream = (row.stream || defaults.stream || 'East').trim();
      const parentContact = (row.parentPhone || row.parentEmail || row.email || '').trim();
      const normPhone = authUtils.normalizeKenyanPhone(parentContact);
      const email = normPhone && !parentContact.includes('@')
        ? `${normPhone}@phone.elingu.local`
        : (parentContact.toLowerCase() || `parent_${crypto.randomBytes(4).toString('hex')}@phone.elingu.local`);

      // Default temporary PIN: e.g. "2468" or provided pin
      const pin = String(row.pin || '2468');
      const studentId = 'stu_' + crypto.randomBytes(6).toString('hex');

      // Resolve stream join code
      const codeKey = `${grade}_${stream}`;
      const streamJoinCode = school.joinCodes ? school.joinCodes[codeKey] : null;

      const newStudent = {
        id: studentId,
        handle: uniqueHandle,
        email,
        studentEmail: row.studentEmail || null,
        studentPhone: row.studentPhone ? authUtils.normalizeKenyanPhone(row.studentPhone) : null,
        parentPhone: normPhone || null,
        grade,
        county: school.county || 'Nairobi',
        age: row.age ? parseInt(row.age) : (grade === 6 ? 11 : grade === 7 ? 12 : grade === 8 ? 14 : 15),
        school: school.name,
        schoolId: school.id,
        stream,
        streamJoinCode,
        avatar: row.avatar || '🦁',
        quests: ['Mathematics', 'Science & Technology', 'English'],
        freeSubjects: ['Mathematics', 'Science & Technology'],
        subscriptionTier: 'school',
        parentConsent: true,
        parentVerified: false,
        pinHash: authUtils.hashCredentialSync(pin),
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        streak: 1,
        totalTurns: 0
      };

      store.students.push(newStudent);
      results.created.push({
        id: newStudent.id,
        handle: newStudent.handle,
        grade: newStudent.grade,
        stream: newStudent.stream,
        tempPin: pin,
        parentContact: email
      });
    } catch (err) {
      results.skipped.push({ row, reason: err.message });
    }
  }

  saveJson(STUDENTS_FILE, store);

  syncDb(() => {
    for (const res of results.created) {
      const student = store.students.find(s => s.id === res.id);
      if (!student) continue;
      db.querySync(`
        INSERT INTO students (
          id, handle, grade, county, school_id, school_name, stream,
          stream_join_code, email, student_email, student_phone, parent_phone,
          avatar, age, pin_hash, subscription_tier, tier_updated_at, quests,
          free_subjects, parent_consent, parent_verified, pilot_code, pilot_type,
          pilot_cohort_name, pilot_activated_at, pilot_expires_at, streak,
          total_turns, daily_turns_count, daily_turn_date, failed_login_attempts,
          locked_until, created_at, last_active
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
          $29, $30, $31, $32, $33, $34
        )
        ON CONFLICT(id) DO UPDATE SET
          handle = EXCLUDED.handle,
          grade = EXCLUDED.grade,
          school_id = EXCLUDED.school_id,
          school_name = EXCLUDED.school_name,
          stream = EXCLUDED.stream,
          stream_join_code = EXCLUDED.stream_join_code,
          subscription_tier = EXCLUDED.subscription_tier,
          last_active = EXCLUDED.last_active
      `, [
        student.id,
        student.handle,
        student.grade,
        student.county || null,
        student.schoolId || null,
        student.school || null,
        student.stream || null,
        student.streamJoinCode || null,
        student.email || null,
        student.studentEmail || null,
        student.studentPhone || null,
        student.parentPhone || null,
        student.avatar || '🦁',
        student.age || null,
        student.pinHash,
        student.subscriptionTier || 'school',
        student.tierUpdatedAt || null,
        db.toJson(student.quests || []),
        db.toJson(student.freeSubjects || []),
        student.parentConsent ? 1 : 0,
        student.parentVerified ? 1 : 0,
        student.pilotCode || null,
        student.pilotType || null,
        student.pilotCohortName || null,
        student.pilotActivatedAt || null,
        student.pilotExpiresAt || null,
        student.streak || 1,
        student.totalTurns || 0,
        0,
        null,
        0,
        null,
        student.createdAt,
        student.lastActive
      ]);
    }
  });

  return results;
}

/**
 * Updates an enrolled student's Cambridge/Edexcel exam tier (core vs extended).
 * GOVERNANCE RULE:
 * - If student is linked to a school (schoolId is set), ONLY an authorized teacher from that school can change it.
 * - If student is independent (schoolId is null), parent can update it.
 * - Years 7–9 cannot have a tier (unified Checkpoint curriculum).
 */
function updateStudentExamTier(studentId, newTier, actor = {}) {
  const store = loadJson(STUDENTS_FILE, { students: [] });
  const student = store.students.find(s => s.id === studentId);
  if (!student) {
    return { success: false, error: 'Student account not found.' };
  }

  const isBritish = student.curriculum === 'BRITISH' || student.curriculum === 'IGCSE';
  if (!isBritish) {
    return { success: false, error: 'Exam tiers apply only to British International (IGCSE) curriculum.' };
  }

  const yearGroup = parseInt(student.yearGroup || student.grade, 10);
  if (yearGroup < 10) {
    return { success: false, error: `Years 7–9 follow a unified Checkpoint syllabus. Core/Extended tiers begin in Year 10.` };
  }

  const cleanTier = String(newTier || '').toLowerCase();
  if (!['core', 'extended'].includes(cleanTier)) {
    return { success: false, error: 'Invalid tier. Must be either "core" or "extended".' };
  }

  // Governance check
  if (student.schoolId) {
    // School-linked: only teacher or school admin can modify
    if (actor.role !== 'teacher' && actor.role !== 'admin') {
      return {
        success: false,
        error: `Academic tier is managed by ${student.school || 'the school'}. Please request your teacher to adjust your class tier.`
      };
    }
    if (actor.schoolId && actor.schoolId !== student.schoolId) {
      return { success: false, error: 'Unauthorized: You can only manage students enrolled in your school.' };
    }
  } else {
    // Independent: parent or student with parent consent
    if (actor.role !== 'parent' && actor.role !== 'admin' && !actor.parentVerified) {
      return { success: false, error: 'Parent verification required to update examination tier.' };
    }
  }

  student.examTier = cleanTier;
  student.lastActive = new Date().toISOString();
  saveJson(STUDENTS_FILE, store);

  return {
    success: true,
    message: `Examination tier updated to ${cleanTier.toUpperCase()} successfully.`,
    examTier: cleanTier,
    student: {
      id: student.id,
      handle: student.handle,
      yearGroup,
      examTier: cleanTier,
      school: student.school
    }
  };
}

module.exports = {
  KENYAN_COUNTIES,
  KENYAN_JSS_SCHOOLS,
  KENYA_INTERNATIONAL_SCHOOLS,
  getSchoolsForCounty,
  getStudents,
  getStudentById,
  resolveStudentTier,
  isHandleOrEmailTaken,
  createStudent,
  authenticateStudent,
  updateStudentProfile,
  updateStudentExamTier,
  verifyStudentPin,
  setStudentParentVerified,
  getStudentSession,
  saveStudentSession,
  getDailyTurns,
  recordDailyTurn,
  purgeStudentData,
  getAggregatedAnalytics,
  activateStudentPilot,
  requestStudentOTP,
  resetStudentPinWithOTP,
  findStudentByIdentifier,
  getChildActivitySummary,
  setStudentTier,
  joinStream,
  getStudentsByStream,
  getStudentsBySchool,
  bulkCreateStudents,
  saveTonightsGuide,
  getStudentTonightsGuide,
  awardStudentPoints,
  isSameContact,
  purgeExpiredUnverifiedStudents
};

