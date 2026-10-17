// ════════════════════════════════════════════════════════════
// ELINGU PARENT STORE — Family Account & Verification System
// Compliant with Kenya Data Protection Act 2019
// Manages: Parent records, Family PINs, Child approvals
// ════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const authUtils = require('./authUtils');
const pricingConfig = require('./pricingConfig');
const pilotConfig = require('./pilotConfig');

const DATA_DIR = path.join(__dirname, 'data');
const PARENTS_FILE = path.join(DATA_DIR, 'parents.json');

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
    console.error(`[parentStore] Error loading ${filePath}:`, err.message);
  }
  return defaultValue;
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    require('./persistentStore').persist(filePath, data);
  } catch (err) {
    console.error(`[parentStore] Error saving ${filePath}:`, err.message);
  }
}

// LEGACY — kept for backward-compatible verification of pre-bcrypt hashes
function hashFamilyPin(pin, salt = 'elingu_parent_salt_2026') {
  return crypto.createHash('sha256').update(String(pin) + salt).digest('hex');
}

function generateVerifyToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── READ ──────────────────────────────────────────────────────

function getParentByEmail(email) {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = store.parents.find(p => p.email === cleanEmail);
  if (!parent) return null;

  // Auto-check expiration if on pilot
  if (parent.subscriptionTier === 'pilot' && !pilotConfig.isPilotActive(parent)) {
    parent.subscriptionTier = 'free';
    parent.tierUpdatedAt = new Date().toISOString();
    saveJson(PARENTS_FILE, store);
  }

  parent.pilotStatus = pilotConfig.getPilotStatus(parent);
  return parent;
}

function getParentByPhone(phone) {
  const normPhone = authUtils.normalizeKenyanPhone(phone);
  if (!normPhone) return null;
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = store.parents.find(p => (p.phone && authUtils.normalizeKenyanPhone(p.phone) === normPhone) || p.email === normPhone + '@phone.elingu.local');
  if (!parent) return null;

  if (parent.subscriptionTier === 'pilot' && !pilotConfig.isPilotActive(parent)) {
    parent.subscriptionTier = 'free';
    parent.tierUpdatedAt = new Date().toISOString();
    saveJson(PARENTS_FILE, store);
  }

  parent.pilotStatus = pilotConfig.getPilotStatus(parent);
  return parent;
}

function getParentByEmailOrPhone(identifier) {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  if (clean.includes('@')) {
    return getParentByEmail(clean);
  }
  const byPhone = getParentByPhone(clean);
  if (byPhone) return byPhone;
  return getParentByEmail(clean);
}

function getParentByToken(token) {
  if (!token) return null;
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = store.parents.find(p => p.verifyToken === token);
  if (!parent) return null;

  if (parent.subscriptionTier === 'pilot' && !pilotConfig.isPilotActive(parent)) {
    parent.subscriptionTier = 'free';
    parent.tierUpdatedAt = new Date().toISOString();
    saveJson(PARENTS_FILE, store);
  }

  parent.pilotStatus = pilotConfig.getPilotStatus(parent);
  return parent;
}

// ── WRITE ─────────────────────────────────────────────────────

function createParent(emailOrPhone, optionalPhone, optionalName) {
  let cleanInput = '';
  let optPhone = optionalPhone;
  let optName = optionalName || null;
  let familyPass = null;
  let isVerified = false;

  if (typeof emailOrPhone === 'object' && emailOrPhone !== null) {
    cleanInput = (emailOrPhone.email || emailOrPhone.phone || '').trim();
    optPhone = emailOrPhone.phone || null;
    optName = emailOrPhone.name || emailOrPhone.fullName || optionalName || null;
    familyPass = emailOrPhone.familyPassword || emailOrPhone.familyPin || emailOrPhone.password || null;
    isVerified = !!emailOrPhone.verified;
  } else {
    cleanInput = (emailOrPhone || '').trim();
  }

  const isPhone = !cleanInput.includes('@') && !!authUtils.normalizeKenyanPhone(cleanInput);
  const cleanEmail = isPhone
    ? (authUtils.normalizeKenyanPhone(cleanInput) + '@phone.elingu.local')
    : cleanInput.toLowerCase();
  const cleanPhone = isPhone
    ? authUtils.normalizeKenyanPhone(cleanInput)
    : (optPhone ? authUtils.normalizeKenyanPhone(optPhone) : null);
  const cleanName = optName ? String(optName).trim().slice(0, 60) : null;

  const store = loadJson(PARENTS_FILE, { parents: [] });

  const existing = store.parents.find(p => p.email === cleanEmail || (cleanPhone && p.phone === cleanPhone));
  if (existing) {
    let changed = false;
    if (cleanName && (!existing.name || existing.name !== cleanName)) {
      existing.name = cleanName;
      changed = true;
    }
    if (cleanPhone && (!existing.phone || existing.phone !== cleanPhone)) {
      existing.phone = cleanPhone;
      changed = true;
    }
    if (familyPass) {
      existing.familyPinHash = authUtils.hashCredentialSync(familyPass);
      if (isVerified) existing.verified = true;
      changed = true;
    }
    if (changed) {
      saveJson(PARENTS_FILE, store);
    }
    return getParentByEmailOrPhone(cleanEmail);
  }

  const token = generateVerifyToken();
  const newParent = {
    id: 'par_' + crypto.randomBytes(6).toString('hex'),
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    familyPinHash: familyPass ? authUtils.hashCredentialSync(familyPass) : null,
    verified: isVerified,
    verifyToken: token,
    tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    children: [],
    pendingChildren: [],
    subscriptionTier: 'free',
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString()
  };

  store.parents.push(newParent);
  saveJson(PARENTS_FILE, store);
  return newParent;
}

function addPendingChild(parentEmail, studentId, handle) {
  const cleanEmail = (parentEmail || '').trim().toLowerCase();
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = store.parents.find(p => p.email === cleanEmail);
  if (!parent) return null;

  if (!Array.isArray(parent.pendingChildren)) {
    parent.pendingChildren = [];
  }

  // Purge expired pending requests (older than 48 hours)
  const now = Date.now();
  parent.pendingChildren = parent.pendingChildren.filter(c => !c.tokenExpiresAt || new Date(c.tokenExpiresAt).getTime() > now);

  // Maximum 4 active approved children under one parent account
  const activeChildrenCount = (parent.children || []).length;
  if (activeChildrenCount >= pricingConfig.ADDITIONAL_CHILD_ADDON.maxChildren) {
    return { error: `Maximum ${pricingConfig.ADDITIONAL_CHILD_ADDON.maxChildren} active learners allowed under one family account.` };
  }

  // If already pending under same studentId or handle, refresh approveToken and timestamp
  const existingPendingIdx = parent.pendingChildren.findIndex(c => c.studentId === studentId || (c.handle && c.handle.toLowerCase() === (handle || '').trim().toLowerCase()));
  const approveToken = generateVerifyToken();
  const entry = {
    studentId,
    handle,
    requestedAt: new Date().toISOString(),
    approveToken,
    tokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  };

  if (existingPendingIdx >= 0) {
    parent.pendingChildren[existingPendingIdx] = entry;
  } else {
    parent.pendingChildren.push(entry);
  }

  saveJson(PARENTS_FILE, store);
  return entry;
}

async function verifyParentAndSetPin(token, familyPassword, firstChildId, parentName) {
  const validation = authUtils.validatePassword(familyPassword);
  if (!validation.valid) return { success: false, error: validation.error };

  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = store.parents.find(p => p.verifyToken === token);

  if (!parent) return { success: false, error: 'Invalid or expired verification link.' };

  const now = new Date();
  if (parent.tokenExpiresAt && new Date(parent.tokenExpiresAt) < now) {
    return { success: false, error: 'This verification link has expired. Please re-register.' };
  }

  if (parentName && typeof parentName === 'string') {
    parent.name = parentName.trim().slice(0, 60);
  }
  parent.familyPinHash = await authUtils.hashCredential(familyPassword);
  parent.verified = true;
  parent.verifyToken = null;
  parent.tokenExpiresAt = null;
  parent.lastActive = now.toISOString();

  if (firstChildId && !parent.children.includes(firstChildId)) {
    parent.children.push(firstChildId);
    parent.pendingChildren = parent.pendingChildren.filter(c => c.studentId !== firstChildId);
  }

  saveJson(PARENTS_FILE, store);
  return { success: true, parent };
}

async function approveChildWithPin(parentEmail, familyPassword, studentId) {
  const cleanEmail = (parentEmail || '').trim().toLowerCase();
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = store.parents.find(p => p.email === cleanEmail);

  if (!parent) return { success: false, error: 'Parent account not found.' };
  if (!parent.verified) return { success: false, error: 'Parent account not yet verified.' };
  
  const isValid = await authUtils.verifyCredential(familyPassword, parent.familyPinHash, 'elingu_parent_salt_2026');
  if (!isValid) {
    return { success: false, error: 'Incorrect Family Password.' };
  }

  // Auto-migrate legacy SHA-256 hash to bcrypt
  if (authUtils.isLegacyHash(parent.familyPinHash)) {
    parent.familyPinHash = await authUtils.hashCredential(familyPassword);
  }

  const pending = parent.pendingChildren.find(c => c.studentId === studentId);
  if (!pending) {
    if (parent.children.includes(studentId)) return { success: true, alreadyApproved: true };
    return { success: false, error: 'No pending request found for this child.' };
  }

  parent.children.push(studentId);
  parent.pendingChildren = parent.pendingChildren.filter(c => c.studentId !== studentId);

  // Automatically sync child subscription tier with parent plan
  if (parent.subscriptionTier && parent.subscriptionTier !== 'free') {
    parent.studentSubscriptions = parent.studentSubscriptions || {};
    parent.studentSubscriptions[studentId] = {
      tier: parent.subscriptionTier,
      billingCycle: parent.billingCycle || 'monthly',
      updatedAt: new Date().toISOString()
    };

    // Also update student record directly
    const studentsFile = path.join(DATA_DIR, 'students.json');
    const sStore = loadJson(studentsFile, { students: [] });
    const student = sStore.students.find(s => s.id === studentId);
    if (student) {
      student.subscriptionTier = parent.subscriptionTier;
      student.tierUpdatedAt = new Date().toISOString();
      saveJson(studentsFile, sStore);
    }
  }

  parent.lastActive = new Date().toISOString();
  saveJson(PARENTS_FILE, store);

  return { success: true };
}

function findParentInStore(store, identifier) {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  if (clean.includes('@')) {
    return store.parents.find(p => p.email === clean);
  }
  const normPhone = authUtils.normalizeKenyanPhone(clean);
  if (normPhone) {
    return store.parents.find(p => (p.phone && authUtils.normalizeKenyanPhone(p.phone) === normPhone) || p.email === normPhone + '@phone.elingu.local');
  }
  return store.parents.find(p => p.email === clean);
}

async function verifyFamilyPassword(emailOrPhone, familyPassword) {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, emailOrPhone);
  if (!parent || !parent.verified) return { success: false, error: 'Account not found or not verified.' };

  // Check lockout
  const lockStatus = authUtils.checkLockout(parent);
  if (lockStatus.locked) {
    return { success: false, locked: true, error: `Account temporarily locked. Try again in ${lockStatus.minutesRemaining} minute(s).` };
  }
  // Clear expired lockout fields
  if (lockStatus.expired) {
    authUtils.clearFailedAttempts(parent);
  }

  const cleanPassword = String(familyPassword || '').trim();
  const isValid = await authUtils.verifyCredential(cleanPassword, parent.familyPinHash, 'elingu_parent_salt_2026');

  if (!isValid) {
    const result = authUtils.recordFailedAttempt(parent, 'parent');
    saveJson(PARENTS_FILE, store);
    if (result.locked) {
      return { success: false, locked: true, error: `Too many failed attempts. Account locked for ${authUtils.PARENT_LOCKOUT_MINUTES} minutes.` };
    }
    return { success: false, error: `Incorrect email/phone or password. ${result.attemptsRemaining} attempt(s) remaining.` };
  }

  // Success — clear failed attempts
  authUtils.clearFailedAttempts(parent);

  // Auto-migrate legacy SHA-256 hash to bcrypt
  if (authUtils.isLegacyHash(parent.familyPinHash)) {
    parent.familyPinHash = await authUtils.hashCredential(cleanPassword);
  }

  parent.lastActive = new Date().toISOString();
  saveJson(PARENTS_FILE, store);
  return { success: true, parent };
}

// OTP request for password reset / change verification
function requestOTP(emailOrPhone) {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, emailOrPhone);
  if (!parent) return { success: false, error: 'No account found for this email or phone.' };

  // Check cooldown
  const cooldown = authUtils.checkOTPCooldown(parent);
  if (cooldown.coolingDown) {
    return { success: false, error: `Too many code requests. Please wait ${cooldown.minutesRemaining} minute(s) before requesting another.` };
  }

  const otp = authUtils.generateOTP();
  authUtils.storeOTPOnRecord(parent, otp);
  authUtils.recordOTPRequest(parent);
  saveJson(PARENTS_FILE, store);

  return { success: true, otp, parent }; // Caller (server.js) sends it via email or SMS
}

// Verify the OTP code entered by the parent
function verifyParentOTP(emailOrPhone, otp) {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, emailOrPhone);
  if (!parent) return { valid: false, error: 'No account found for this email or phone.' };

  const result = authUtils.verifyOTPFromRecord(parent, otp);
  saveJson(PARENTS_FILE, store);
  return result;
}

// Reset password — requires OTP to have been verified first
async function resetFamilyPassword(emailOrPhone, newPassword) {
  const cleanPassword = String(newPassword || '').trim();

  // Validate password strength
  const validation = authUtils.validatePassword(cleanPassword);
  if (!validation.valid) return { success: false, error: validation.error };

  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, emailOrPhone);
  if (!parent) return { success: false, error: 'No parent account found.' };

  // Require OTP verification first
  if (!parent.otpVerified) {
    return { success: false, error: 'Please verify your identity with a verification code first.' };
  }

  parent.familyPinHash = await authUtils.hashCredential(cleanPassword);
  parent.verified = true;
  parent.otpVerified = false; // Consume the OTP verification
  parent.lastActive = new Date().toISOString();
  authUtils.clearFailedAttempts(parent); // Unlock if locked
  saveJson(PARENTS_FILE, store);
  return { success: true, message: 'Family Password updated successfully!' };
}

// Change password from within portal — requires current password
async function changeFamilyPassword(emailOrPhone, oldPassword, newPassword) {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, emailOrPhone);

  if (!parent || !parent.verified) return { success: false, error: 'Account not found.' };

  const isValid = await authUtils.verifyCredential(oldPassword, parent.familyPinHash, 'elingu_parent_salt_2026');
  if (!isValid) {
    return { success: false, error: 'Incorrect current password.' };
  }

  const validation = authUtils.validatePassword(newPassword);
  if (!validation.valid) return { success: false, error: validation.error };

  parent.familyPinHash = await authUtils.hashCredential(newPassword);
  parent.lastActive = new Date().toISOString();
  saveJson(PARENTS_FILE, store);
  return { success: true, message: 'Password changed successfully!' };
}

// Parent resets a child's 4-digit PIN
async function resetChildPin(emailOrPhone, childId, newPin) {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, emailOrPhone);
  if (!parent) return { success: false, error: 'Parent account not found.' };
  if (!parent.children.includes(childId)) {
    return { success: false, error: 'This child is not linked to your account.' };
  }

  const pinValidation = authUtils.validateStudentPin(newPin);
  if (!pinValidation.valid) return { success: false, error: pinValidation.error };

  // Load and update the student's PIN
  const studentsFile = path.join(DATA_DIR, 'students.json');
  const studentStore = loadJson(studentsFile, { students: [] });
  const student = studentStore.students.find(s => s.id === childId);
  if (!student) return { success: false, error: 'Child account not found.' };

  student.pinHash = await authUtils.hashCredential(String(newPin).trim());
  authUtils.clearFailedAttempts(student); // Unlock child if locked
  saveJson(studentsFile, studentStore);
  return { success: true, message: `PIN for ${student.handle} has been reset.` };
}

function updateParentSubscription(parentEmailOrPhone, tier, billingCycle = 'monthly') {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, parentEmailOrPhone);

  if (!parent) return { success: false, error: 'Parent account not found.' };
  if (!pricingConfig.PRICING_TIERS[tier]) {
    return { success: false, error: `Invalid subscription tier: ${tier}` };
  }

  parent.subscriptionTier = tier;
  parent.billingCycle = billingCycle;
  parent.tierUpdatedAt = new Date().toISOString();
  parent.lastActive = new Date().toISOString();

  saveJson(PARENTS_FILE, store);
  return { success: true, parent };
}

function activateParentPilot(parentEmailOrPhone, accessCode) {
  const pilotRes = pilotConfig.verifyPilotCode(accessCode);
  if (!pilotRes.valid) {
    return { success: false, error: pilotRes.error };
  }

  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, parentEmailOrPhone);
  if (!parent) return { success: false, error: 'Parent account not found.' };

  parent.subscriptionTier = 'pilot';
  parent.pilotCode = pilotRes.code;
  parent.pilotType = pilotRes.type;
  parent.pilotCohortName = pilotRes.cohortName;
  parent.pilotActivatedAt = pilotRes.activatedAt;
  parent.pilotExpiresAt = pilotRes.expiresAt;
  parent.tierUpdatedAt = new Date().toISOString();
  parent.lastActive = new Date().toISOString();

  saveJson(PARENTS_FILE, store);
  return {
    success: true,
    parent,
    pilotData: pilotRes,
    message: `🎉 ${pilotRes.cohortName} activated! All CBE subjects unlocked for your family until ${new Date(pilotRes.expiresAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}.`
  };
}

function setChildSubscription(parentEmailOrPhone, studentId, tier, billingCycle = 'monthly') {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, parentEmailOrPhone);
  if (!parent) return { success: false, error: 'Parent account not found.' };
  if (!parent.children || !parent.children.includes(studentId)) {
    return { success: false, error: 'Child not linked to this family account.' };
  }

  parent.studentSubscriptions = parent.studentSubscriptions || {};
  parent.studentSubscriptions[studentId] = {
    tier: tier || 'free',
    billingCycle,
    updatedAt: new Date().toISOString()
  };
  saveJson(PARENTS_FILE, store);

  const studentsFile = path.join(DATA_DIR, 'students.json');
  const sStore = loadJson(studentsFile, { students: [] });
  const student = sStore.students.find(s => s.id === studentId);
  if (student) {
    student.subscriptionTier = tier || 'free';
    student.tierUpdatedAt = new Date().toISOString();

    // Auto-enroll pending requested subject on upgrade to Standard or Premium
    if (tier === 'standard' || tier === 'premium') {
      const pendingReq = (parent.upgradeRequests || []).find(r => r.studentId === studentId && r.status === 'pending');
      if (pendingReq && pendingReq.requestedSubject) {
        student.selectedSubjects = student.selectedSubjects || [];
        const normSubj = pendingReq.requestedSubject.trim().toLowerCase();
        const exists = student.selectedSubjects.some(s => {
          const sLow = s.toLowerCase();
          return sLow === normSubj || sLow.includes(normSubj) || normSubj.includes(sLow);
        });
        if (!exists) {
          student.selectedSubjects.push(pendingReq.requestedSubject);
          student.quests = student.selectedSubjects;
        }
        pendingReq.status = 'approved';
        pendingReq.approvedAt = new Date().toISOString();
      }
    }

    saveJson(studentsFile, sStore);
  }

  saveJson(PARENTS_FILE, store);
  return { success: true, parent, studentId, tier };
}

function isBritishLearner(student) {
  if (!student) return false;
  const cur = String(student.curriculum || '').toUpperCase();
  const lvl = String(student.schoolLevel || '').toUpperCase();
  const brd = String(student.examBoard || '').toUpperCase();
  return cur === 'BRITISH' || cur === 'IGCSE' || cur === 'CAMBRIDGE' || cur === 'EDEXCEL' ||
         lvl === 'CHECKPOINT' || lvl === 'IGCSE' ||
         brd === 'CAIE' || brd === 'EDEXCEL';
}

function setCurriculumFamilySubscription(parentEmailOrPhone, curriculumFamily, tier = 'premium', billingCycle = 'monthly') {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, parentEmailOrPhone);
  if (!parent) return { success: false, error: 'Parent account not found.' };

  const targetCurriculum = String(curriculumFamily || 'CBC').toUpperCase();
  const isBriTarget = targetCurriculum === 'BRITISH' || targetCurriculum === 'IGCSE' || targetCurriculum === 'CAMBRIDGE';

  const studentsFile = path.join(DATA_DIR, 'students.json');
  const sStore = loadJson(studentsFile, { students: [] });

  const parentChildren = parent.children || [];
  const matchingStudents = sStore.students.filter(s => {
    if (!parentChildren.includes(s.id)) return false;
    const isBri = isBritishLearner(s);
    return isBriTarget ? isBri : !isBri;
  });

  // Cap at 3 learners per family bundle
  const eligibleStudents = matchingStudents.slice(0, 3);

  parent.studentSubscriptions = parent.studentSubscriptions || {};
  eligibleStudents.forEach(st => {
    parent.studentSubscriptions[st.id] = {
      tier: tier || 'premium',
      billingCycle,
      bundleType: isBriTarget ? 'igcse_family' : 'cbc_family',
      updatedAt: new Date().toISOString()
    };
    st.subscriptionTier = tier || 'premium';
    st.tierUpdatedAt = new Date().toISOString();

    // Auto-enroll any pending requested subjects
    const pendingReq = (parent.upgradeRequests || []).find(r => r.studentId === st.id && r.status === 'pending');
    if (pendingReq && pendingReq.requestedSubject) {
      st.selectedSubjects = st.selectedSubjects || [];
      const normSubj = pendingReq.requestedSubject.trim().toLowerCase();
      const exists = st.selectedSubjects.some(s => {
        const sLow = s.toLowerCase();
        return sLow === normSubj || sLow.includes(normSubj) || normSubj.includes(sLow);
      });
      if (!exists) {
        st.selectedSubjects.push(pendingReq.requestedSubject);
        st.quests = st.selectedSubjects;
      }
      pendingReq.status = 'approved';
      pendingReq.approvedAt = new Date().toISOString();
    }
  });

  parent.lastActive = new Date().toISOString();
  saveJson(PARENTS_FILE, store);
  saveJson(studentsFile, sStore);

  return {
    success: true,
    bundleType: isBriTarget ? 'igcse_family' : 'cbc_family',
    upgradedCount: eligibleStudents.length,
    studentNames: eligibleStudents.map(s => s.handle)
  };
}

function recordUpgradeRequest(emailOrPhone, studentId, studentHandle, requestedSubject, pathway) {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, emailOrPhone);
  if (!parent) return null;

  parent.upgradeRequests = parent.upgradeRequests || [];
  const reqEntry = {
    id: 'req_' + Date.now(),
    studentId,
    studentHandle,
    requestedSubject,
    pathway,
    requestedAt: new Date().toISOString(),
    status: 'pending'
  };
  parent.upgradeRequests.unshift(reqEntry);
  if (parent.upgradeRequests.length > 20) {
    parent.upgradeRequests = parent.upgradeRequests.slice(0, 20);
  }
  saveJson(PARENTS_FILE, store);
  return reqEntry;
}

function approveUpgradeRequest(emailOrPhone, studentId, requestedSubject) {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, emailOrPhone);
  if (!parent) return { success: false, error: 'Parent account not found.' };

  parent.upgradeRequests = parent.upgradeRequests || [];
  const req = parent.upgradeRequests.find(r => 
    r.studentId === studentId && 
    r.status === 'pending' &&
    (!requestedSubject || (r.requestedSubject && r.requestedSubject.toLowerCase() === requestedSubject.toLowerCase()))
  );
  if (!req) {
    const anyReq = parent.upgradeRequests.find(r => r.studentId === studentId && r.status === 'pending');
    if (!anyReq) return { success: false, error: 'No pending unlock request found.' };
    anyReq.status = 'approved';
    anyReq.approvedAt = new Date().toISOString();
    saveJson(PARENTS_FILE, store);
    return { success: true, request: anyReq };
  }

  req.status = 'approved';
  req.approvedAt = new Date().toISOString();
  saveJson(PARENTS_FILE, store);
  return { success: true, request: req };
}

function dismissUpgradeRequest(emailOrPhone, studentId, requestedSubject) {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, emailOrPhone);
  if (!parent) return { success: false, error: 'Parent account not found.' };

  parent.upgradeRequests = parent.upgradeRequests || [];
  const req = parent.upgradeRequests.find(r => 
    r.studentId === studentId && 
    r.status === 'pending' &&
    (!requestedSubject || (r.requestedSubject && r.requestedSubject.toLowerCase() === requestedSubject.toLowerCase()))
  );
  if (!req) {
    const anyReq = parent.upgradeRequests.find(r => r.studentId === studentId && r.status === 'pending');
    if (!anyReq) return { success: false, error: 'No pending request found.' };
    anyReq.status = 'dismissed';
    anyReq.dismissedAt = new Date().toISOString();
    saveJson(PARENTS_FILE, store);
    return { success: true, request: anyReq };
  }

  req.status = 'dismissed';
  req.dismissedAt = new Date().toISOString();
  saveJson(PARENTS_FILE, store);
  return { success: true, request: req };
}

// ── PENDING M-PESA PAYMENTS TRACKING ──────────────────────────
const PENDING_PAYMENTS_FILE = path.join(DATA_DIR, 'pending_payments.json');

function recordPendingPayment({ checkoutRequestId, transactionRef, email, studentId, tier, billingCycle, amount, phone }) {
  const store = loadJson(PENDING_PAYMENTS_FILE, { payments: [] });
  const entry = {
    checkoutRequestId,
    transactionRef: transactionRef || null,
    email: (email || '').toLowerCase().trim(),
    studentId: studentId || null,
    tier: tier || 'standard',
    billingCycle: billingCycle || 'monthly',
    amount: amount || 0,
    phone: phone || null,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  store.payments = store.payments || [];
  store.payments.unshift(entry);
  if (store.payments.length > 50) store.payments = store.payments.slice(0, 50);
  saveJson(PENDING_PAYMENTS_FILE, store);
  return entry;
}

function findPendingPayment(query = {}) {
  const store = loadJson(PENDING_PAYMENTS_FILE, { payments: [] });
  if (!store.payments) return null;
  return store.payments.find(p => {
    if (query.checkoutRequestId && p.checkoutRequestId === query.checkoutRequestId) return true;
    if (query.transactionRef && p.transactionRef === query.transactionRef) return true;
    return false;
  }) || null;
}

function completePendingPayment(checkoutRequestIdOrRef, metadata = {}) {
  const store = loadJson(PENDING_PAYMENTS_FILE, { payments: [] });
  if (!store.payments) return null;
  const payment = store.payments.find(p =>
    p.checkoutRequestId === checkoutRequestIdOrRef || p.transactionRef === checkoutRequestIdOrRef
  );
  if (!payment) return null;
  payment.status = 'completed';
  payment.completedAt = new Date().toISOString();
  payment.receipt = metadata.receipt || payment.transactionRef;
  payment.paidAmount = metadata.paidAmount || payment.amount;
  saveJson(PENDING_PAYMENTS_FILE, store);
  return payment;
}

// DPA Sec 40 Right to Erasure — Parent-authenticated child data erasure
async function purgeChildData(parentEmailOrPhone, childId) {
  const store = loadJson(PARENTS_FILE, { parents: [] });
  const parent = findParentInStore(store, parentEmailOrPhone);
  if (!parent) return { success: false, error: 'Parent account not found.' };
  if (!parent.children || !parent.children.includes(childId)) {
    return { success: false, error: 'Child is not linked to this family account.' };
  }

  // 1. Remove child from parent account
  parent.children = parent.children.filter(id => id !== childId);
  if (parent.studentSubscriptions) {
    delete parent.studentSubscriptions[childId];
  }
  parent.lastActive = new Date().toISOString();
  saveJson(PARENTS_FILE, store);

  // 2. Remove student record from students.json
  const studentsFile = path.join(DATA_DIR, 'students.json');
  const sStore = loadJson(studentsFile, { students: [] });
  sStore.students = (sStore.students || []).filter(s => s.id !== childId);
  saveJson(studentsFile, sStore);

  // 3. Purge all learning sessions and chat history
  const sessionsFile = path.join(DATA_DIR, 'sessions.json');
  const sessions = loadJson(sessionsFile, {});
  Object.keys(sessions).forEach(key => {
    if (key.startsWith(`${childId}_`)) {
      delete sessions[key];
    }
  });
  saveJson(sessionsFile, sessions);

  return { success: true, message: 'Child learning records, streaks, and sessions permanently erased.' };
}

module.exports = {
  getParentByEmail,
  getParentByPhone,
  getParentByEmailOrPhone,
  getParentByToken,
  createParent,
  addPendingChild,
  verifyParentAndSetPin,
  approveChildWithPin,
  verifyFamilyPassword,
  requestOTP,
  verifyParentOTP,
  resetFamilyPassword,
  changeFamilyPassword,
  resetChildPin,
  updateParentSubscription,
  setChildSubscription,
  setCurriculumFamilySubscription,
  activateParentPilot,
  generateVerifyToken,
  recordUpgradeRequest,
  approveUpgradeRequest,
  dismissUpgradeRequest,
  recordPendingPayment,
  findPendingPayment,
  completePendingPayment,
  purgeChildData,
  pricingConfig,
  pilotConfig
};

