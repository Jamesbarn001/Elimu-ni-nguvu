// ══════════════════════════════════════════════════════════════
// ELINGU DATABASE MIGRATION SCRIPT
// Migrates legacy data/*.json files into the unified database
// Idempotent: Can be run multiple times safely without duplicates.
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const db = require('./client');

function loadJson(fileName, fallback = null) {
  const filePath = path.resolve(__dirname, '../data', fileName);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.warn(`Warning: Could not parse ${fileName}:`, e.message);
    return fallback;
  }
}

async function migrate() {
  console.log('🔄 Starting Elingu Database Migration from data/*.json ...\n');

  await db.initSchema();

  let schoolsCount = 0;
  let teachersCount = 0;
  let studentsCount = 0;
  let missionsCount = 0;
  let sessionsCount = 0;
  let parentsCount = 0;

  // 1. Migrate Schools
  const schoolsData = loadJson('schools.json', { schools: [] });
  for (const s of (schoolsData.schools || [])) {
    try {
      await db.query(`
        INSERT INTO schools (id, name, county, admin_code, grades, streams, join_codes, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT(id) DO UPDATE SET
          name = EXCLUDED.name,
          county = EXCLUDED.county,
          admin_code = EXCLUDED.admin_code,
          grades = EXCLUDED.grades,
          streams = EXCLUDED.streams,
          join_codes = EXCLUDED.join_codes,
          created_at = EXCLUDED.created_at
      `, [
        s.id,
        s.name,
        s.county || 'Nairobi',
        s.adminCode,
        db.toJson(s.grades || [7, 8]),
        db.toJson(s.streams || {}),
        db.toJson(s.joinCodes || {}),
        s.createdBy || 'migration',
        s.createdAt || new Date().toISOString()
      ]);
      schoolsCount++;
    } catch (err) {
      console.error(`Error migrating school ${s.id}:`, err.message);
    }
  }
  console.log(`✓ Migrated ${schoolsCount} schools.`);

  // 2. Migrate Teachers
  const teachersData = loadJson('teachers.json', { teachers: [] });
  for (const t of (teachersData.teachers || [])) {
    try {
      await db.query(`
        INSERT INTO teachers (
          id, name, id_number, email, phone, password_hash, role,
          school_id, school_name, assignments, failed_login_attempts,
          locked_until, created_at, last_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT(id) DO UPDATE SET
          name = EXCLUDED.name,
          id_number = EXCLUDED.id_number,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role,
          school_id = EXCLUDED.school_id,
          school_name = EXCLUDED.school_name,
          assignments = EXCLUDED.assignments,
          failed_login_attempts = EXCLUDED.failed_login_attempts,
          locked_until = EXCLUDED.locked_until,
          last_active = EXCLUDED.last_active
      `, [
        t.id,
        t.name,
        t.idNumber,
        t.email || null,
        t.phone || null,
        t.passwordHash,
        t.role || 'subject_teacher',
        t.schoolId,
        t.schoolName || null,
        db.toJson(t.assignments || []),
        t.failedLoginAttempts || 0,
        t.lockedUntil || null,
        t.createdAt || new Date().toISOString(),
        t.lastActive || new Date().toISOString()
      ]);
      teachersCount++;
    } catch (err) {
      console.error(`Error migrating teacher ${t.id}:`, err.message);
    }
  }
  console.log(`✓ Migrated ${teachersCount} teachers.`);

  // 3. Migrate Students
  const studentsData = loadJson('students.json', { students: [] });
  for (const s of (studentsData.students || [])) {
    try {
      await db.query(`
        INSERT INTO students (
          id, handle, grade, county, school_id, school_name, stream,
          stream_join_code, email, student_email, student_phone, parent_phone,
          avatar, age, pin_hash, subscription_tier, tier_updated_at, quests,
          free_subjects, parent_consent, parent_verified, pilot_code, pilot_type,
          pilot_cohort_name, pilot_activated_at, pilot_expires_at, streak,
          total_turns, daily_turns_count, daily_turn_date, failed_login_attempts,
          locked_until, otp_hash, otp_expires_at, otp_verified, otp_request_count,
          created_at, last_active
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
          $29, $30, $31, $32, $33, $34, $35, $36, $37, $38
        )
        ON CONFLICT(id) DO UPDATE SET
          handle = EXCLUDED.handle,
          grade = EXCLUDED.grade,
          county = EXCLUDED.county,
          school_id = EXCLUDED.school_id,
          school_name = EXCLUDED.school_name,
          stream = EXCLUDED.stream,
          stream_join_code = EXCLUDED.stream_join_code,
          email = EXCLUDED.email,
          student_email = EXCLUDED.student_email,
          student_phone = EXCLUDED.student_phone,
          parent_phone = EXCLUDED.parent_phone,
          avatar = EXCLUDED.avatar,
          age = EXCLUDED.age,
          pin_hash = EXCLUDED.pin_hash,
          subscription_tier = EXCLUDED.subscription_tier,
          tier_updated_at = EXCLUDED.tier_updated_at,
          quests = EXCLUDED.quests,
          free_subjects = EXCLUDED.free_subjects,
          parent_consent = EXCLUDED.parent_consent,
          parent_verified = EXCLUDED.parent_verified,
          pilot_code = EXCLUDED.pilot_code,
          pilot_type = EXCLUDED.pilot_type,
          pilot_cohort_name = EXCLUDED.pilot_cohort_name,
          pilot_activated_at = EXCLUDED.pilot_activated_at,
          pilot_expires_at = EXCLUDED.pilot_expires_at,
          streak = EXCLUDED.streak,
          total_turns = EXCLUDED.total_turns,
          daily_turns_count = EXCLUDED.daily_turns_count,
          daily_turn_date = EXCLUDED.daily_turn_date,
          failed_login_attempts = EXCLUDED.failed_login_attempts,
          locked_until = EXCLUDED.locked_until,
          otp_hash = EXCLUDED.otp_hash,
          otp_expires_at = EXCLUDED.otp_expires_at,
          otp_verified = EXCLUDED.otp_verified,
          otp_request_count = EXCLUDED.otp_request_count,
          last_active = EXCLUDED.last_active
      `, [
        s.id,
        s.handle,
        parseInt(s.grade) || 7,
        s.county || 'Nairobi',
        s.schoolId || null,
        s.school || null,
        s.stream || null,
        s.streamJoinCode || null,
        s.email || null,
        s.studentEmail || null,
        s.studentPhone || null,
        s.parentPhone || null,
        s.avatar || '🦁',
        s.age ? parseInt(s.age) : null,
        s.pinHash || null,
        s.subscriptionTier || 'free',
        s.tierUpdatedAt || null,
        db.toJson(s.quests || ['Mathematics', 'Science & Technology', 'English']),
        db.toJson(s.freeSubjects || ['Mathematics', 'Science & Technology']),
        s.parentConsent ? 1 : 0,
        s.parentVerified ? 1 : 0,
        s.pilotCode || null,
        s.pilotType || null,
        s.pilotCohortName || null,
        s.pilotActivatedAt || null,
        s.pilotExpiresAt || null,
        s.streak || 1,
        s.totalTurns || 0,
        s.dailyTurnsCount || 0,
        s.dailyTurnDate || null,
        s.failedLoginAttempts || 0,
        s.lockedUntil || null,
        s.otpHash || null,
        s.otpExpiresAt || null,
        s.otpVerified ? 1 : 0,
        s.otpRequestCount || 0,
        s.createdAt || new Date().toISOString(),
        s.lastActive || new Date().toISOString()
      ]);
      studentsCount++;
    } catch (err) {
      console.error(`Error migrating student ${s.id}:`, err.message);
    }
  }
  console.log(`✓ Migrated ${studentsCount} students.`);

  // 4. Migrate Missions
  const missionsData = loadJson('missions.json', { missions: [] });
  for (const m of (missionsData.missions || [])) {
    try {
      await db.query(`
        INSERT INTO missions (
          id, teacher_id, teacher_name, school_id, grade, stream, subject,
          strand, sub_strand, title, hint_mode, hint_delay_minutes,
          display_mode, items, submissions, pushed_at, deadline, status, created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )
        ON CONFLICT(id) DO UPDATE SET
          teacher_id = EXCLUDED.teacher_id,
          teacher_name = EXCLUDED.teacher_name,
          school_id = EXCLUDED.school_id,
          grade = EXCLUDED.grade,
          stream = EXCLUDED.stream,
          subject = EXCLUDED.subject,
          strand = EXCLUDED.strand,
          sub_strand = EXCLUDED.sub_strand,
          title = EXCLUDED.title,
          hint_mode = EXCLUDED.hint_mode,
          hint_delay_minutes = EXCLUDED.hint_delay_minutes,
          display_mode = EXCLUDED.display_mode,
          items = EXCLUDED.items,
          submissions = EXCLUDED.submissions,
          pushed_at = EXCLUDED.pushed_at,
          deadline = EXCLUDED.deadline,
          status = EXCLUDED.status
      `, [
        m.id,
        m.teacherId || null,
        m.teacherName || null,
        m.schoolId,
        parseInt(m.grade) || 7,
        m.stream,
        m.subject,
        m.strand || null,
        m.subStrand || null,
        m.title,
        m.hintMode || 'open',
        m.hintDelayMinutes || 0,
        m.displayMode || 'sequential',
        db.toJson(m.items || []),
        db.toJson(m.submissions || {}),
        m.pushedAt || null,
        m.deadline || null,
        m.status || 'active',
        m.createdAt || new Date().toISOString()
      ]);
      missionsCount++;
    } catch (err) {
      console.error(`Error migrating mission ${m.id}:`, err.message);
    }
  }
  console.log(`✓ Migrated ${missionsCount} missions.`);

  // 5. Migrate Sessions
  const sessionsData = loadJson('sessions.json', {});
  for (const [key, sess] of Object.entries(sessionsData)) {
    try {
      await db.query(`
        INSERT INTO sessions (session_key, student_id, subject, messages, last_updated)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(session_key) DO UPDATE SET
          messages = EXCLUDED.messages,
          last_updated = EXCLUDED.last_updated
      `, [
        key,
        sess.studentId || key.split('_')[0],
        sess.subject || key.split('_')[1] || 'general',
        db.toJson(sess.messages || []),
        sess.lastUpdated || new Date().toISOString()
      ]);
      sessionsCount++;
    } catch (err) {
      console.error(`Error migrating session ${key}:`, err.message);
    }
  }
  console.log(`✓ Migrated ${sessionsCount} student sessions.`);

  // 6. Migrate Parents
  const parentsData = loadJson('parents.json', { parents: [] });
  for (const p of (parentsData.parents || [])) {
    try {
      await db.query(`
        INSERT INTO parents (
          id, email, phone, family_pin_hash, verified, verify_token,
          token_expires_at, children, pending_children, subscription_tier,
          student_subscriptions, billing_cycle, tier_updated_at, failed_login_attempts,
          locked_until, otp_hash, otp_expires_at, otp_verified, otp_request_count,
          otp_cooldown_until, created_at, last_active
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22
        )
        ON CONFLICT(id) DO UPDATE SET
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          family_pin_hash = EXCLUDED.family_pin_hash,
          verified = EXCLUDED.verified,
          verify_token = EXCLUDED.verify_token,
          token_expires_at = EXCLUDED.token_expires_at,
          children = EXCLUDED.children,
          pending_children = EXCLUDED.pending_children,
          subscription_tier = EXCLUDED.subscription_tier,
          student_subscriptions = EXCLUDED.student_subscriptions,
          billing_cycle = EXCLUDED.billing_cycle,
          tier_updated_at = EXCLUDED.tier_updated_at,
          failed_login_attempts = EXCLUDED.failed_login_attempts,
          locked_until = EXCLUDED.locked_until,
          otp_hash = EXCLUDED.otp_hash,
          otp_expires_at = EXCLUDED.otp_expires_at,
          otp_verified = EXCLUDED.otp_verified,
          otp_request_count = EXCLUDED.otp_request_count,
          otp_cooldown_until = EXCLUDED.otp_cooldown_until,
          last_active = EXCLUDED.last_active
      `, [
        p.id,
        p.email || null,
        p.phone || null,
        p.familyPinHash || null,
        p.verified ? 1 : 0,
        p.verifyToken || null,
        p.tokenExpiresAt || null,
        db.toJson(p.children || []),
        db.toJson(p.pendingChildren || []),
        p.subscriptionTier || 'family_standard',
        db.toJson(p.studentSubscriptions || {}),
        p.billingCycle || null,
        p.tierUpdatedAt || null,
        p.failedLoginAttempts || 0,
        p.lockedUntil || null,
        p.otpHash || null,
        p.otpExpiresAt || null,
        p.otpVerified ? 1 : 0,
        p.otpRequestCount || 0,
        p.otpCooldownUntil || null,
        p.createdAt || new Date().toISOString(),
        p.lastActive || new Date().toISOString()
      ]);
      parentsCount++;
    } catch (err) {
      console.error(`Error migrating parent ${p.id}:`, err.message);
    }
  }
  console.log(`✓ Migrated ${parentsCount} parents.`);

  console.log('\n🎉 ALL JSON DATA SUCCESSFULLY MIGRATED TO DATABASE! 🚀\n');
  return {
    schools: schoolsCount,
    teachers: teachersCount,
    students: studentsCount,
    missions: missionsCount,
    sessions: sessionsCount,
    parents: parentsCount
  };
}

if (require.main === module) {
  migrate().catch(err => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  });
}

module.exports = { migrate };
