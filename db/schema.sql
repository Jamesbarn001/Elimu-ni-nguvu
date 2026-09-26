-- ══════════════════════════════════════════════════════════════
-- ELINGU INSTITUTIONAL & SOCRATIC DATABASE SCHEMA
-- Compatible with PostgreSQL (Production) and SQLite (Local / Dev)
-- ══════════════════════════════════════════════════════════════

-- 1. Schools (Institutional Topology & Hierarchy)
CREATE TABLE IF NOT EXISTS schools (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  county VARCHAR(64) NOT NULL,
  admin_code VARCHAR(64) UNIQUE NOT NULL,
  grades TEXT NOT NULL,          -- JSON array of grades, e.g. [7, 8]
  streams TEXT NOT NULL,         -- JSON map of streams, e.g. {"7": ["East", "West"]}
  join_codes TEXT NOT NULL,      -- JSON map of stream join codes, e.g. {"7_East": "KUJ-7E"}
  created_by VARCHAR(128),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schools_admin_code ON schools(admin_code);

-- 2. Teachers & School Administrators
CREATE TABLE IF NOT EXISTS teachers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  id_number VARCHAR(64) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(64) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'subject_teacher',
  school_id VARCHAR(64) NOT NULL,
  school_name VARCHAR(255),
  assignments TEXT NOT NULL DEFAULT '[]', -- JSON array of stream assignments
  failed_login_attempts INT DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  last_active TEXT NOT NULL,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_teachers_school_id ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_id_number ON teachers(id_number);
CREATE INDEX IF NOT EXISTS idx_teachers_email ON teachers(email);
CREATE INDEX IF NOT EXISTS idx_teachers_phone ON teachers(phone);

-- 3. Students (Learners)
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(64) PRIMARY KEY,
  handle VARCHAR(64) NOT NULL,
  grade INT NOT NULL,
  county VARCHAR(64),
  school_id VARCHAR(64),
  school_name VARCHAR(255),
  stream VARCHAR(64),
  stream_join_code VARCHAR(64),
  email VARCHAR(255),
  student_email VARCHAR(255),
  student_phone VARCHAR(64),
  parent_phone VARCHAR(64),
  avatar VARCHAR(32) DEFAULT '🦁',
  age INT,
  pin_hash VARCHAR(255),
  subscription_tier VARCHAR(32) DEFAULT 'free',
  tier_updated_at TEXT,
  quests TEXT DEFAULT '[]',               -- JSON array
  free_subjects TEXT DEFAULT '[]',        -- JSON array
  parent_consent INT DEFAULT 0,
  parent_verified INT DEFAULT 0,
  pilot_code VARCHAR(64),
  pilot_type VARCHAR(32),
  pilot_cohort_name VARCHAR(128),
  pilot_activated_at TEXT,
  pilot_expires_at TEXT,
  streak INT DEFAULT 1,
  total_turns INT DEFAULT 0,
  daily_turns_count INT DEFAULT 0,
  daily_turn_date VARCHAR(32),
  failed_login_attempts INT DEFAULT 0,
  locked_until TEXT,
  otp_hash VARCHAR(255),
  otp_expires_at TEXT,
  otp_verified INT DEFAULT 0,
  otp_request_count INT DEFAULT 0,
  created_at TEXT NOT NULL,
  last_active TEXT NOT NULL,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_grade_stream ON students(grade, stream);
CREATE INDEX IF NOT EXISTS idx_students_join_code ON students(stream_join_code);
CREATE INDEX IF NOT EXISTS idx_students_handle ON students(handle);

-- 4. Missions (Live Curriculum Quizzes & Classroom Missions)
CREATE TABLE IF NOT EXISTS missions (
  id VARCHAR(64) PRIMARY KEY,
  teacher_id VARCHAR(64),
  teacher_name VARCHAR(255),
  school_id VARCHAR(64) NOT NULL,
  grade INT NOT NULL,
  stream VARCHAR(64) NOT NULL,
  subject VARCHAR(64) NOT NULL,
  strand VARCHAR(128),
  sub_strand VARCHAR(128),
  title VARCHAR(255) NOT NULL,
  hint_mode VARCHAR(32) DEFAULT 'open',
  hint_delay_minutes INT DEFAULT 0,
  display_mode VARCHAR(32) DEFAULT 'sequential',
  items TEXT NOT NULL,                    -- JSON array of quiz items
  submissions TEXT NOT NULL DEFAULT '{}', -- JSON map of student process trails
  pushed_at TEXT,
  deadline TEXT,
  status VARCHAR(32) DEFAULT 'active',
  created_at TEXT NOT NULL,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_missions_school_stream ON missions(school_id, grade, stream);
CREATE INDEX IF NOT EXISTS idx_missions_subject ON missions(subject);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);

-- 5. Student Socratic Sessions (Conversation History)
CREATE TABLE IF NOT EXISTS sessions (
  session_key VARCHAR(128) PRIMARY KEY,   -- e.g. stu_123_mathematics
  student_id VARCHAR(64) NOT NULL,
  subject VARCHAR(64) NOT NULL,
  messages TEXT NOT NULL,                 -- JSON array of messages
  last_updated TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_student_id ON sessions(student_id);

-- 6. Parent Accounts (Family Portal)
CREATE TABLE IF NOT EXISTS parents (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(64) UNIQUE,
  family_pin_hash VARCHAR(255),
  verified INT DEFAULT 0,
  verify_token VARCHAR(128),
  token_expires_at TEXT,
  children TEXT DEFAULT '[]',             -- JSON array of child IDs
  pending_children TEXT DEFAULT '[]',     -- JSON array
  subscription_tier VARCHAR(32) DEFAULT 'family_standard',
  student_subscriptions TEXT DEFAULT '{}',-- JSON map
  billing_cycle VARCHAR(32),
  tier_updated_at TEXT,
  failed_login_attempts INT DEFAULT 0,
  locked_until TEXT,
  otp_hash VARCHAR(255),
  otp_expires_at TEXT,
  otp_verified INT DEFAULT 0,
  otp_request_count INT DEFAULT 0,
  otp_cooldown_until TEXT,
  created_at TEXT NOT NULL,
  last_active TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parents_email ON parents(email);
CREATE INDEX IF NOT EXISTS idx_parents_phone ON parents(phone);
