// ══════════════════════════════════════════════════════════════
// ELINGU TEACHER & INSTITUTIONAL SUITE ROUTER
// Manages: School Onboarding, Stream Management, Teacher Auth,
// AI Mission Generation, Live Assessment Tracking, Process Trails,
// and Dedicated HTML Teacher Portal (`/teacher/portal`)
// ══════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const teacherStore = require('./teacherStore');
const studentStore = require('./studentStore');
const authUtils = require('./authUtils');
const { sanitizeHtml, verifyTeacherToken, generateTeacherToken } = authUtils;

/**
 * Fallback curriculum quiz items if external LLM is offline
 */
function getFallbackQuizItems(grade, subject, strand, count = 3, difficulty = 'ME') {
  const cleanSubject = (subject || 'Mathematics').toLowerCase();
  
  if (cleanSubject.includes('math')) {
    return [
      {
        id: 'q1',
        question: 'Chebet and Amani are sharing a rectangular shamba in Nandi. Chebet cultivates 1/3 of the shamba, and Amani cultivates 1/4. What fraction of the total shamba have they cultivated together?',
        answerMode: 'numeric',
        expectedAnswer: '7/12',
        acceptableVariants: ['7/12', 'seven twelfths'],
        hintSequence: [
          'To add fractions with different denominators, what must you find first?',
          'What is the Least Common Multiple (LCM) of 3 and 4? Convert both fractions to that denominator.'
        ],
        difficulty: 'ME'
      },
      {
        id: 'q2',
        question: 'Which of the following is a prime number between 20 and 30?',
        answerMode: 'mcq',
        expectedAnswer: '23',
        acceptableVariants: ['23', 'twenty three'],
        mcqOptions: ['21', '23', '25', '27'],
        mcqCorrectIndex: 1,
        hintSequence: [
          'A prime number has exactly two distinct factors: 1 and itself.',
          'Notice that 21 = 3 × 7, 25 = 5 × 5, and 27 = 3 × 9.'
        ],
        difficulty: 'ME'
      },
      {
        id: 'q3',
        question: 'A bag of maize weighs 45.6 kg. A farmer sells 18.25 kg at the local market. How many kilograms of maize remain in the bag?',
        answerMode: 'numeric',
        expectedAnswer: '27.35',
        acceptableVariants: ['27.35', '27.35 kg', '27.35kg'],
        hintSequence: [
          'Line up your decimal points vertically before subtracting: 45.60 - 18.25.',
          'Remember you may need to borrow 1 from the tenths column!'
        ],
        difficulty: 'AE'
      }
    ].slice(0, count);
  }

  if (cleanSubject.includes('sci')) {
    return [
      {
        id: 'q1',
        question: 'During a science practical, learners mixed river sand and water from Lake Victoria. Which separation method is best suited to separate the sand completely from the water?',
        answerMode: 'mcq',
        expectedAnswer: 'Filtration',
        acceptableVariants: ['filtration', 'filtering'],
        mcqOptions: ['Evaporation', 'Filtration', 'Magnetic separation', 'Distillation'],
        mcqCorrectIndex: 1,
        hintSequence: [
          'Think about insoluble solids suspended in a liquid.',
          'Which method uses a porous barrier like filter paper or a clean cotton cloth?'
        ],
        difficulty: 'ME'
      },
      {
        id: 'q2',
        question: 'Name the simple machine used to dig agricultural beds (shamba) where the effort is applied at one end and the load acts at the other end.',
        answerMode: 'short_answer',
        expectedAnswer: 'Lever',
        acceptableVariants: ['lever', 'a lever', 'first class lever'],
        hintSequence: [
          'Think of common tools like a jembe, crowbar, or wheelbarrow.',
          'What family of simple machines rotates around a pivot or fulcrum?'
        ],
        difficulty: 'ME'
      },
      {
        id: 'q3',
        question: 'True or False: Sound travels faster through water in Lake Naivasha than it does through the surrounding air.',
        answerMode: 'true_false',
        expectedAnswer: 'True',
        acceptableVariants: ['true', 't'],
        hintSequence: [
          'Consider how closely packed particles are in liquids compared to gases.',
          'Denser mediums allow vibrations to pass between molecules more rapidly.'
        ],
        difficulty: 'EE'
      }
    ].slice(0, count);
  }

  if (cleanSubject.includes('english')) {
    return [
      {
        id: 'q1',
        question: 'Complete the sentence with the correct verb form: Neither the teacher nor the pupils ___ (was/were) absent during the Kisumu county drama festival.',
        answerMode: 'fill_blank',
        expectedAnswer: 'were',
        acceptableVariants: ['were'],
        hintSequence: [
          'When using "neither... nor", the verb agrees with the subject closest to it.',
          'The noun closest to the blank is "pupils" (plural).'
        ],
        difficulty: 'ME'
      },
      {
        id: 'q2',
        question: 'Identify the word that is an adjective in this sentence: "The elderly elder spoke wise proverbs under the acacia tree."',
        answerMode: 'mcq',
        expectedAnswer: 'elderly',
        acceptableVariants: ['elderly', 'wise'],
        mcqOptions: ['spoke', 'elderly', 'tree', 'proverbs'],
        mcqCorrectIndex: 1,
        hintSequence: [
          'An adjective describes or modifies a noun.',
          'Look for the word describing the noun "elder".'
        ],
        difficulty: 'AE'
      },
      {
        id: 'q3',
        question: 'Write the plural form of the compound noun: "passer-by".',
        answerMode: 'short_answer',
        expectedAnswer: 'passers-by',
        acceptableVariants: ['passers-by', 'passers by'],
        hintSequence: [
          'In compound nouns, the plural marker usually attaches to the principal noun part.',
          'Which word carries the main meaning: passer or by?'
        ],
        difficulty: 'EE'
      }
    ].slice(0, count);
  }

  if (cleanSubject.includes('kiswahili')) {
    return [
      {
        id: 'q1',
        question: 'Kanusha sentensi ifuatayo: "Wanafunzi wote wameingia darasani."',
        answerMode: 'short_answer',
        expectedAnswer: 'Wanafunzi wote hawajaingia darasani',
        acceptableVariants: ['wanafunzi wote hawajaingia darasani', 'wanafunzi hawajaingia darasani'],
        hintSequence: [
          'Ukanushaji wa kiambishi cha hali timilifu "-me-" huwa "-ja-".',
          'Hakikisha ngeli ya A-WA imeambatanishwa vizuri: "wa-" inakuwa "hawa-".'
        ],
        difficulty: 'ME'
      },
      {
        id: 'q2',
        question: 'Chagua kisawe (neno lenye maana sawa) cha neno "Barabara":',
        answerMode: 'mcq',
        expectedAnswer: 'Tarihi au Njia kuu',
        acceptableVariants: ['njia', 'njia kuu'],
        mcqOptions: ['Gereza', 'Njia kuu', 'Uwanja', 'Kijito'],
        mcqCorrectIndex: 1,
        hintSequence: [
          'Fikiria mahali ambapo magari na watembea kwa miguu hupitia.',
          'Neno gani lina maana sawa na "tarihi" au njia kubwa?'
        ],
        difficulty: 'AE'
      }
    ].slice(0, count);
  }

  // Social Studies Fallback
  return [
    {
      id: 'q1',
      question: 'Which of the following physical features in Kenya was formed through the process of faulting and downwarping?',
      answerMode: 'mcq',
      expectedAnswer: 'The Great Rift Valley',
      acceptableVariants: ['rift valley', 'the great rift valley'],
      mcqOptions: ['Mount Kenya', 'The Great Rift Valley', 'Chalbi Desert', 'Nyika Plateau'],
      mcqCorrectIndex: 1,
      hintSequence: [
        'Think about the massive trench cutting across Kenya from Turkana to Kajiado.',
        'This geological formation has escarpments on both sides.'
      ],
      difficulty: 'ME'
    },
    {
      id: 'q2',
      question: 'State one major economic benefit of tea farming in Kericho and Nandi counties to Kenya\'s national economy.',
      answerMode: 'short_answer',
      expectedAnswer: 'Foreign exchange earner',
      acceptableVariants: ['foreign exchange', 'foreign exchange earner', 'creates employment', 'employment', 'source of income'],
      hintSequence: [
        'Consider what happens when Kenya exports agricultural cash crops internationally.',
        'It brings in foreign currency or creates jobs for thousands of residents.'
      ],
      difficulty: 'ME'
    }
  ].slice(0, count);
}

module.exports = function (options = {}) {
  const callLLM = options.callLLM;

  function extractTeacherToken(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    if (req.headers['x-teacher-token']) {
      return String(req.headers['x-teacher-token']).trim();
    }
    if (req.query && req.query.token) {
      return String(req.query.token).trim();
    }
    return null;
  }

  function requireTeacherAuth(allowedRoles = []) {
    return (req, res, next) => {
      const token = extractTeacherToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized: Teacher authentication session required.' });
      }
      const decoded = verifyTeacherToken(token);
      if (!decoded || !decoded.id) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired teacher authentication session.' });
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient institutional privileges for this action.' });
      }

      req.teacher = decoded;
      next();
    };
  }

  function setSecurityHeaders(res) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self';");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 1 — SCHOOL & STREAM MANAGEMENT ENDPOINTS
  // ══════════════════════════════════════════════════════════════

  // POST /api/school/create
  router.post('/api/school/create', (req, res) => {
    try {
      const { name, county, adminCode, grades, streams, createdBy } = req.body;
      const school = teacherStore.createSchool({ name, county, adminCode, grades, streams, createdBy });
      res.json({ success: true, school });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/school/verify-code/:code
  router.get('/api/school/verify-code/:code', (req, res) => {
    const code = (req.params.code || '').trim().toUpperCase();
    // Check if admin code
    const adminSchool = teacherStore.getSchoolByAdminCode(code);
    if (adminSchool) {
      return res.json({
        type: 'admin',
        valid: true,
        school: {
          id: adminSchool.id,
          name: adminSchool.name,
          county: adminSchool.county,
          grades: adminSchool.grades,
          streams: adminSchool.streams
        }
      });
    }
    // Check if stream code
    const streamInfo = teacherStore.getSchoolByJoinCode(code);
    if (streamInfo) {
      return res.json({
        type: 'stream',
        valid: true,
        schoolName: streamInfo.schoolName,
        schoolId: streamInfo.schoolId,
        grade: streamInfo.grade,
        stream: streamInfo.stream,
        joinCode: streamInfo.joinCode
      });
    }
    res.status(404).json({ valid: false, error: 'Invalid school or stream code.' });
  });

  // GET /api/school/:schoolId
  router.get('/api/school/:schoolId', (req, res) => {
    const school = teacherStore.getSchoolById(req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found.' });
    res.json({ success: true, school });
  });

  // POST /api/school/import-students (Bulk CSV)
  router.post('/api/school/import-students', requireTeacherAuth(), async (req, res) => {
    try {
      const { schoolId, students, defaults } = req.body;
      if (!schoolId || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: 'School ID and non-empty students array required.' });
      }
      if (req.teacher.schoolId !== schoolId) {
        return res.status(403).json({ error: 'Forbidden: Cannot import students into another school.' });
      }
      const result = await studentStore.bulkCreateStudents(students, schoolId, defaults || {});
      res.json({
        success: true,
        message: `Successfully registered ${result.created.length} learner accounts.`,
        ...result
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 2 — TEACHER AUTHENTICATION & DASHBOARD DATA
  // ══════════════════════════════════════════════════════════════

  // POST /api/teacher/register
  router.post('/api/teacher/register', async (req, res) => {
    try {
      const { name, idNumber, email, phone, password, role, adminCode, assignments } = req.body;
      if (!adminCode) return res.status(400).json({ error: 'School Admin Code is required.' });
      const school = teacherStore.getSchoolByAdminCode(adminCode);
      if (!school) return res.status(404).json({ error: `School admin code "${adminCode}" not found.` });

      const teacher = await teacherStore.createTeacher({
        name,
        idNumber,
        email,
        phone,
        password,
        role: role || 'subject_teacher',
        schoolId: school.id,
        assignments: assignments || []
      });

      const token = generateTeacherToken(teacher);
      res.json({ success: true, token, teacher, schoolName: school.name });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/teacher/login
  router.post('/api/teacher/login', async (req, res) => {
    try {
      const { identifier, password } = req.body;
      if (!identifier || !password) return res.status(400).json({ error: 'Identifier and password are required.' });
      const result = await teacherStore.verifyTeacherLogin(identifier, password);
      if (!result.success) {
        return res.status(result.locked ? 423 : 401).json({ error: result.error, locked: result.locked });
      }
      const token = generateTeacherToken(result.teacher);
      const school = teacherStore.getSchoolById(result.teacher.schoolId);
      res.json({
        success: true,
        token,
        teacher: result.teacher,
        school: school ? {
          id: school.id,
          name: school.name,
          county: school.county,
          adminCode: school.adminCode,
          grades: school.grades,
          streams: school.streams,
          joinCodes: school.joinCodes
        } : null
      });
    } catch (err) {
      res.status(500).json({ error: 'Teacher login failed.' });
    }
  });

  // GET /api/teacher/dashboard-data
  router.get('/api/teacher/dashboard-data', requireTeacherAuth(), (req, res) => {
    try {
      const teacherId = req.query.teacherId || req.headers['x-teacher-id'] || req.teacher.id;
      if (req.teacher.role !== 'school_admin' && req.teacher.id !== teacherId) {
        return res.status(403).json({ error: 'Forbidden: Cannot access another teacher\'s dashboard data.' });
      }
      const teacher = teacherStore.getTeacherById(teacherId);
      if (!teacher) return res.status(404).json({ error: 'Teacher profile not found.' });
      if (teacher.schoolId !== req.teacher.schoolId) {
        return res.status(403).json({ error: 'Forbidden: Cannot access records of a teacher in another school.' });
      }

      const school = teacherStore.getSchoolById(teacher.schoolId);
      const isHeadteacher = teacher.role === 'school_admin';

      // Build accessible streams list
      const accessibleStreams = [];
      if (isHeadteacher && school && school.streams) {
        for (const [grade, streamList] of Object.entries(school.streams)) {
          (streamList || []).forEach(sName => {
            const codeKey = `${grade}_${sName}`;
            const joinCode = (school.joinCodes && school.joinCodes[codeKey]) || '';
            const students = studentStore.getStudentsByStream(school.id, grade, sName);
            accessibleStreams.push({
              grade: parseInt(grade),
              stream: sName,
              joinCode,
              studentCount: students.length,
              students: students.map(s => {
                const resolved = studentStore.resolveStudentTier(s);
                return {
                  id: s.id,
                  handle: s.handle,
                  avatar: s.avatar,
                  grade: s.grade,
                  pathway: s.pathway || null,
                  subscriptionTier: resolved.subscriptionTier || 'free',
                  selectedSubjects: s.selectedSubjects || s.quests || [],
                  totalTurns: s.totalTurns,
                  lastActive: s.lastActive
                };
              })
            });
          });
        }
      } else if (teacher.assignments && teacher.assignments.length > 0) {
        teacher.assignments.forEach(asgn => {
          const codeKey = `${asgn.grade}_${asgn.stream}`;
          const joinCode = (school && school.joinCodes) ? school.joinCodes[codeKey] : '';
          const students = studentStore.getStudentsByStream(teacher.schoolId, asgn.grade, asgn.stream);
          accessibleStreams.push({
            grade: asgn.grade,
            stream: asgn.stream,
            subjects: asgn.subjects || [],
            joinCode,
            studentCount: students.length,
            students: students.map(s => {
              const resolved = studentStore.resolveStudentTier(s);
              return {
                id: s.id,
                handle: s.handle,
                avatar: s.avatar,
                grade: s.grade,
                pathway: s.pathway || null,
                subscriptionTier: resolved.subscriptionTier || 'free',
                selectedSubjects: s.selectedSubjects || s.quests || [],
                totalTurns: s.totalTurns,
                lastActive: s.lastActive
              };
            })
          });
        });
      }

      // Fetch missions
      const missions = isHeadteacher
        ? teacherStore.getMissionsBySchool(teacher.schoolId)
        : teacherStore.getMissionsByTeacher(teacher.id);

      // Enrich missions with analytics
      const enrichedMissions = missions.map(m => {
        const analytics = teacherStore.getMissionAnalytics(m.id);
        return {
          id: m.id,
          title: m.title,
          grade: m.grade,
          stream: m.stream,
          subject: m.subject,
          strand: m.strand,
          hintMode: m.hintMode,
          itemsCount: m.items.length,
          pushedAt: m.pushedAt,
          deadline: m.deadline,
          status: m.status,
          totalSubmissions: analytics ? analytics.totalSubmissions : 0,
          cbeDistribution: analytics ? analytics.cbeDistribution : null,
          roadblocksCount: analytics ? analytics.roadblocks.length : 0
        };
      });

      res.json({
        success: true,
        teacher: {
          id: teacher.id,
          name: teacher.name,
          role: teacher.role,
          schoolId: teacher.schoolId,
          schoolName: school ? school.name : 'Elingu School',
          idNumber: teacher.idNumber,
          email: teacher.email,
          phone: teacher.phone,
          assignments: teacher.assignments || []
        },
        school: school ? {
          id: school.id,
          name: school.name,
          county: school.county,
          adminCode: school.adminCode,
          grades: school.grades,
          streams: school.streams,
          joinCodes: school.joinCodes
        } : null,
        streams: accessibleStreams,
        missions: enrichedMissions
      });
    } catch (err) {
      console.error('[server] teacher dashboard-data error:', err);
      res.status(500).json({ error: 'Failed to retrieve teacher dashboard data.' });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 3 — STUDENT STREAM LINKING
  // ══════════════════════════════════════════════════════════════

  // POST /api/students/join-stream
  router.post('/api/students/join-stream', (req, res) => {
    try {
      const { studentId, joinCode } = req.body;
      if (!studentId || !joinCode) {
        return res.status(400).json({ error: 'Student ID and stream join code are required.' });
      }
      const result = studentStore.joinStream(studentId, joinCode);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      res.json({
        success: true,
        message: `Hongera! You are now enrolled in ${result.schoolName} (Grade ${result.grade} ${result.stream})! 🌟`,
        schoolName: result.schoolName,
        grade: result.grade,
        stream: result.stream,
        streamJoinCode: result.streamJoinCode
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to join stream.' });
    }
  });

  // POST /api/teacher/update-student-subjects — Teacher updates enrolled subjects for a student in their school
  router.post('/api/teacher/update-student-subjects', requireTeacherAuth(), (req, res) => {
    try {
      const { studentId, selectedSubjects, pathway } = req.body;
      if (!studentId || !Array.isArray(selectedSubjects) || selectedSubjects.length === 0) {
        return res.status(400).json({ error: 'Student ID and at least one subject are required.' });
      }

      const student = studentStore.getStudentById(studentId, true);
      if (!student) {
        return res.status(404).json({ error: 'Learner profile not found.' });
      }

      // 1. School Boundary Check: Prevent modifying students outside teacher's school
      if (!student.schoolId || student.schoolId !== req.teacher.schoolId) {
        return res.status(403).json({ error: 'Forbidden: You can only update subjects for learners enrolled in your verified school.' });
      }

      // 2. Teacher Role & Assignment Permission Check:
      // School admins (Headteachers) can manage any student in the school.
      // Class and Subject teachers can only manage students in streams assigned to them.
      const isHeadteacher = (req.teacher.role === 'school_admin');
      if (!isHeadteacher) {
        const teacherProfile = teacherStore.getTeacherById(req.teacher.id);
        const assignments = (teacherProfile && teacherProfile.assignments) || [];
        const hasStreamAssignment = assignments.some(a =>
          parseInt(a.grade, 10) === parseInt(student.grade, 10) &&
          String(a.stream || '').toLowerCase() === String(student.stream || '').toLowerCase()
        );

        if (!hasStreamAssignment) {
          return res.status(403).json({
            error: `Forbidden: You are not assigned to Grade ${student.grade} Stream ${student.stream || ''}. Only assigned teachers or the Headteacher can update this learner's subjects.`
          });
        }
      }

      // 3. Active Subjects Check: Restrict to subjects currently available on Elingu
      const isSenior = (student.grade >= 10);
      const ACTIVE_JSS_SUBJECTS = ['Mathematics', 'English', 'Kiswahili', 'Science & Technology', 'Social Studies'];
      const ACTIVE_SS_SUBJECTS = ['Core Mathematics', 'Essential Mathematics', 'Community Service Learning', 'English', 'Kiswahili', 'Physics', 'Chemistry', 'Biology', 'Computer Studies'];
      const ACTIVE_AVAILABLE = isSenior ? ACTIVE_SS_SUBJECTS : ACTIVE_JSS_SUBJECTS;

      const validSubjects = selectedSubjects.filter(s => ACTIVE_AVAILABLE.includes(s));
      if (validSubjects.length === 0) {
        return res.status(400).json({ error: 'None of the selected subjects are currently available on Elingu.' });
      }

      // 4. Subscription Tier Subject Rules Check:
      // Active institutional licenses (school/subcounty/county) and Premium allow all electives.
      // Standard tier allows all compulsory + up to 2 electives.
      // Free tier allows up to 2 compulsory + 1 elective (max 3 total).
      const pricingConfig = require('./pricingConfig');
      const school = teacherStore.getSchoolById(req.teacher.schoolId);
      const isSchoolLicenseActive = school && (school.subscriptionTier === 'school' || school.subscriptionTier === 'subcounty' || school.subscriptionTier === 'county');

      const resolvedTier = isSchoolLicenseActive ? { subscriptionTier: 'school' } : studentStore.resolveStudentTier(student);
      const tierValidation = pricingConfig.validateTierSubjectSelection({
        subjects: validSubjects,
        tier: resolvedTier.subscriptionTier,
        isSenior
      });

      if (!tierValidation.valid) {
        return res.status(400).json({ error: tierValidation.error });
      }

      const updatePayload = {
        selectedSubjects: validSubjects,
        quests: validSubjects,
        freeSubjects: validSubjects.slice(0, 3)
      };
      if (pathway) {
        updatePayload.pathway = pathway;
      }

      const updated = studentStore.updateStudentProfile(studentId, updatePayload);
      res.json({
        success: true,
        message: `Hongera! Enrolled subjects updated for ${updated.handle}.`,
        student: updated
      });
    } catch (err) {
      console.error('[teacherRoutes] update-student-subjects error:', err);
      res.status(500).json({ error: 'Failed to update student subjects.' });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 4 — MISSION (LIVE ASSIGNMENT) ENDPOINTS
  // ══════════════════════════════════════════════════════════════

  // POST /api/mission/generate (AI Quiz Generator)
  router.post('/api/mission/generate', requireTeacherAuth(), async (req, res) => {
    try {
      const { grade, subject, strand, count = 3, difficulty = 'ME' } = req.body;
      const cleanGrade = parseInt(grade) || 7;
      const cleanSubject = String(subject || 'Mathematics').trim();
      const cleanStrand = String(strand || 'Core Curriculum').trim();
      const cleanCount = Math.min(10, Math.max(1, parseInt(count) || 3));

      let items = null;
      if (typeof callLLM === 'function') {
        try {
          const systemPrompt = `You are Elingu's Curriculum Assessment Generator for Kenya CBE (Competency-Based Education) Grades 6-9.
Generate exactly ${cleanCount} assessment questions for:
- Grade: Grade ${cleanGrade}
- Subject: ${cleanSubject}
- Strand/Topic: ${cleanStrand}
- Target Competency Level: ${difficulty} (EE=Exceeding, ME=Meeting, AE=Approaching, BE=Below)

For each question:
1. Root the problem context in everyday Kenyan life, counties, markets, farming, or wildlife.
2. Choose the best answerMode from: numeric, step_by_step, mcq, true_false, free_text, fill_blank, grammar_correction, short_answer, diagram_label, translation.
3. Provide expectedAnswer and 2-3 acceptableVariants.
4. If mcq, provide mcqOptions (4 options) and mcqCorrectIndex (0-3).
5. Provide 2 Socratic hints that guide without spoiling the answer.

Output format: Return ONLY valid JSON array with no markdown fences:
[
  {
    "id": "q1",
    "question": "...",
    "answerMode": "numeric",
    "expectedAnswer": "...",
    "acceptableVariants": ["..."],
    "mcqOptions": ["...", "..."],
    "mcqCorrectIndex": 1,
    "hintSequence": ["...", "..."],
    "difficulty": "${difficulty}"
  }
]`;
          const messages = [{ role: 'user', content: `Generate ${cleanCount} CBE quiz items for Grade ${cleanGrade} ${cleanSubject} on ${cleanStrand}.` }];
          const reply = await callLLM(messages, systemPrompt, '', { maxTokens: 1800 });
          if (reply) {
            const cleaned = reply.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed) && parsed.length > 0) {
              items = parsed;
            }
          }
        } catch (e) {
          console.warn('[mission/generate] LLM generator notice:', e.message);
        }
      }

      if (!items) {
        items = getFallbackQuizItems(cleanGrade, cleanSubject, cleanStrand, cleanCount, difficulty);
      }

      res.json({ success: true, items });
    } catch (err) {
      console.error('[mission/generate] error:', err);
      res.status(500).json({ error: 'Failed to generate quiz items.' });
    }
  });

  // POST /api/mission/create
  router.post('/api/mission/create', requireTeacherAuth(), (req, res) => {
    try {
      const schoolId = req.body.schoolId;
      if (!schoolId) return res.status(400).json({ error: 'schoolId is required.' });
      if (req.teacher.schoolId !== schoolId) {
        return res.status(403).json({ error: 'Forbidden: Cannot push missions to another school.' });
      }
      if (req.teacher.role !== 'school_admin') {
        const cleanG = parseInt(req.body.grade);
        const cleanS = String(req.body.stream || '').trim().toLowerCase();
        const hasAssignment = (req.teacher.assignments || []).some(a =>
          parseInt(a.grade) === cleanG &&
          String(a.stream || '').trim().toLowerCase() === cleanS
        );
        if (!hasAssignment) {
          return res.status(403).json({ error: 'Forbidden: You are not assigned to Grade ' + req.body.grade + ' ' + req.body.stream + '.' });
        }
      }
      const mission = teacherStore.createMission(req.body);
      res.json({ success: true, mission });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /api/mission/active-for-student
  router.get('/api/mission/active-for-student', (req, res) => {
    try {
      const { studentId, subject } = req.query;
      if (!studentId) return res.status(400).json({ error: 'Student ID required.' });
      const student = studentStore.getStudentById(studentId);
      if (!student || !student.schoolId || !student.stream) {
        return res.json({ missions: [] }); // Not linked to school stream
      }

      const missions = teacherStore.getActiveMissionsForStudent(
        student.schoolId,
        student.grade,
        student.stream,
        subject
      );

      // Student view: sanitize answers and hints
      const sanitized = missions.map(m => {
        const studentSub = m.submissions ? m.submissions[studentId] : null;
        return {
          id: m.id,
          title: m.title,
          teacherName: m.teacherName,
          subject: m.subject,
          strand: m.strand,
          hintMode: m.hintMode,
          hintDelayMinutes: m.hintDelayMinutes,
          displayMode: m.displayMode,
          pushedAt: m.pushedAt,
          deadline: m.deadline,
          items: m.items.map(i => ({
            id: i.id,
            question: i.question,
            answerMode: i.answerMode,
            mcqOptions: i.mcqOptions,
            diagramUrl: i.diagramUrl,
            passage: i.passage,
            difficulty: i.difficulty,
            hintCount: (i.hintSequence || []).length
          })),
          isCompleted: !!(studentSub && studentSub.completedAt),
          overallCBE: studentSub ? studentSub.overallCBE : null,
          studentProgress: studentSub ? studentSub.items : {}
        };
      });

      res.json({ missions: sanitized });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch active missions.' });
    }
  });

  // GET /api/mission/:missionId
  router.get('/api/mission/:missionId', (req, res) => {
    const mission = teacherStore.getMissionById(req.params.missionId);
    if (!mission) return res.status(404).json({ error: 'Mission not found.' });

    // Check if caller is an authorized teacher of this school
    const token = extractTeacherToken(req);
    const decoded = token ? verifyTeacherToken(token) : null;
    const isAuthorizedTeacher = decoded && decoded.schoolId === mission.schoolId;

    if (isAuthorizedTeacher) {
      return res.json({ success: true, mission });
    }

    // Public / student view: shield answer keys, acceptable variants, and hint sequence
    const sanitizedMission = {
      ...mission,
      items: (mission.items || []).map(i => {
        const { expectedAnswer: _e, acceptableVariants: _a, hintSequence: _h, ...safeItem } = i;
        return {
          ...safeItem,
          hintCount: Array.isArray(i.hintSequence) ? i.hintSequence.length : 0
        };
      })
    };
    res.json({ success: true, mission: sanitizedMission });
  });

  // POST /api/mission/interact (Answer attempt or hint request)
  router.post('/api/mission/interact', (req, res) => {
    try {
      const { missionId, studentId, studentHandle, itemId, answer, timeSpentSec, hintRequested, hintIndex, hintReadingTimeMs } = req.body;
      if (!missionId || !studentId || !itemId) {
        return res.status(400).json({ error: 'missionId, studentId, and itemId are required.' });
      }
      const result = teacherStore.recordMissionInteraction({
        missionId,
        studentId,
        studentHandle,
        itemId,
        answer,
        timeSpentSec,
        hintRequested,
        hintIndex,
        hintReadingTimeMs
      });
      res.json(result);
    } catch (err) {
      const status = (err.code === 'FORBIDDEN_STREAM') ? 403 : (err.code === 'NOT_FOUND' ? 404 : 400);
      res.status(status).json({ error: err.message });
    }
  });

  // GET /api/mission/:missionId/analytics (Teacher Process Trail & Stacked CBE Bars)
  router.get('/api/mission/:missionId/analytics', requireTeacherAuth(), (req, res) => {
    try {
      const mission = teacherStore.getMissionById(req.params.missionId);
      if (!mission) return res.status(404).json({ error: 'Mission not found.' });
      if (req.teacher.schoolId !== mission.schoolId) {
        return res.status(403).json({ error: 'Forbidden: Cannot view mission analytics from another school.' });
      }
      const analytics = teacherStore.getMissionAnalytics(req.params.missionId);
      res.json({ success: true, analytics });
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate mission analytics.' });
    }
  });

  // POST /api/mission/generate-single-item (Regenerate 1 single item with AI)
  router.post('/api/mission/generate-single-item', requireTeacherAuth(), async (req, res) => {
    try {
      const { grade, subject, strand, difficulty = 'ME' } = req.body;
      const cleanGrade = parseInt(grade) || 8;
      const cleanSubject = String(subject || 'Mathematics').trim();
      const cleanStrand = String(strand || 'Core Curriculum').trim();

      let item = null;
      if (typeof callLLM === 'function') {
        try {
          const prompt = `Generate exactly 1 high quality assessment question for Grade ${cleanGrade} ${cleanSubject} on ${cleanStrand} with target CBE level ${difficulty}.
Kenyan context. Output ONLY valid JSON:
{
  "question": "...",
  "answerMode": "numeric",
  "expectedAnswer": "...",
  "acceptableVariants": ["..."],
  "mcqOptions": ["...", "...", "...", "..."],
  "mcqCorrectIndex": 1,
  "hintSequence": ["...", "..."],
  "difficulty": "${difficulty}"
}`;
          const raw = await callLLM([{ role: 'user', content: prompt }], 'You are a Kenya CBE assessment generator.', '', { maxTokens: 800 });
          if (raw) {
            const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            item = JSON.parse(cleaned);
          }
        } catch (e) {
          console.warn('Single item generation error:', e.message);
        }
      }

      if (!item) {
        const fallbacks = getFallbackQuizItems(cleanGrade, cleanSubject, cleanStrand, 3, difficulty);
        item = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      }

      res.json({ success: true, item });
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate question item.' });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 4B — DOWNLOADABLE SUMMARIES & SBA REPORTS (CSV & PRINT)
  // ══════════════════════════════════════════════════════════════

  function escapeCsv(field) {
    if (field === null || field === undefined) return '""';
    const str = String(field).replace(/"/g, '""');
    return `"${str}"`;
  }

  // GET /api/reports/stream-summary (Class / Stream / Subject summary)
  router.get('/api/reports/stream-summary', requireTeacherAuth(), (req, res) => {
    try {
      const { schoolId, grade, stream, subject, format = 'json' } = req.query;
      if (!schoolId || !grade || !stream) {
        return res.status(400).json({ error: 'schoolId, grade, and stream are required.' });
      }

      if (req.teacher.schoolId !== schoolId) {
        return res.status(403).json({ error: 'Forbidden: Cannot access reports for another school.' });
      }

      const school = teacherStore.getSchoolById(schoolId);
      const cleanGrade = parseInt(grade);
      const cleanStream = String(stream).trim();

      if (req.teacher.role !== 'school_admin') {
        const hasAssignment = (req.teacher.assignments || []).some(a =>
          parseInt(a.grade) === cleanGrade &&
          String(a.stream || '').trim().toLowerCase() === cleanStream.toLowerCase()
        );
        if (!hasAssignment) {
          return res.status(403).json({ error: 'Forbidden: You are not assigned to Grade ' + cleanGrade + ' ' + cleanStream + '.' });
        }
      }

      const students = studentStore.getStudentsByStream(schoolId, cleanGrade, cleanStream);
      const missions = teacherStore.getMissionsByStream(schoolId, cleanGrade, cleanStream);

      const filteredMissions = subject
        ? missions.filter(m => m.subject.toLowerCase() === subject.toLowerCase())
        : missions;

      const rosterData = students.map(s => {
        let completedMissions = 0;
        let cbePoints = 0;
        let hintsUsedTotal = 0;

        filteredMissions.forEach(m => {
          const sub = m.submissions ? m.submissions[s.id] : null;
          if (sub && sub.completedAt) {
            completedMissions++;
            const cbeMap = { EE: 4, ME: 3, AE: 2, BE: 1 };
            cbePoints += cbeMap[sub.overallCBE] || 2;
            Object.values(sub.items || {}).forEach(itemRec => {
              hintsUsedTotal += (itemRec.hintsUsed || []).length;
            });
          }
        });

        const avgScore = completedMissions > 0 ? (cbePoints / completedMissions) : 0;
        let overallCBE = 'Not Assessed';
        if (completedMissions > 0) {
          if (avgScore >= 3.5) overallCBE = 'EE (Exceeding)';
          else if (avgScore >= 2.5) overallCBE = 'ME (Meeting)';
          else if (avgScore >= 1.7) overallCBE = 'AE (Approaching)';
          else overallCBE = 'BE (Below)';
        }

        return {
          id: s.id,
          handle: s.handle,
          totalTurns: s.totalTurns || 0,
          streak: s.streak || 1,
          completedMissions,
          overallCBE,
          hintsUsedTotal,
          lastActive: s.lastActive
        };
      });

      const cbeCounts = { EE: 0, ME: 0, AE: 0, BE: 0 };
      rosterData.forEach(r => {
        if (r.overallCBE.startsWith('EE')) cbeCounts.EE++;
        else if (r.overallCBE.startsWith('ME')) cbeCounts.ME++;
        else if (r.overallCBE.startsWith('AE')) cbeCounts.AE++;
        else if (r.overallCBE.startsWith('BE')) cbeCounts.BE++;
      });

      const totalEvaluated = rosterData.filter(r => r.overallCBE !== 'Not Assessed').length;
      const distribution = {
        EE: totalEvaluated > 0 ? Math.round((cbeCounts.EE / totalEvaluated) * 100) : 0,
        ME: totalEvaluated > 0 ? Math.round((cbeCounts.ME / totalEvaluated) * 100) : 0,
        AE: totalEvaluated > 0 ? Math.round((cbeCounts.AE / totalEvaluated) * 100) : 0,
        BE: totalEvaluated > 0 ? Math.round((cbeCounts.BE / totalEvaluated) * 100) : 0,
        counts: cbeCounts,
        totalEvaluated
      };

      // CSV Export
      if (format === 'csv') {
        const rows = [
          ['REPUBLIC OF KENYA - MINISTRY OF EDUCATION'],
          ['COMPETENCY-BASED EDUCATION (CBE) CLASS ASSESSMENT SUMMARY'],
          ['School:', school ? school.name : 'Elingu School', 'County:', school ? school.county : 'Nairobi'],
          ['Grade & Stream:', `Grade ${cleanGrade} ${cleanStream}`, 'Subject:', subject || 'All Active Subjects'],
          ['Total Enrolled:', students.length, 'Report Date:', new Date().toLocaleDateString('en-KE')],
          [''],
          ['COMPETENCY LEVEL DISTRIBUTION'],
          ['Exceeding Expectations (EE):', `${distribution.counts.EE} (${distribution.EE}%)`],
          ['Meeting Expectations (ME):', `${distribution.counts.ME} (${distribution.ME}%)`],
          ['Approaching Expectations (AE):', `${distribution.counts.AE} (${distribution.AE}%)`],
          ['Below Expectations (BE):', `${distribution.counts.BE} (${distribution.BE}%)`],
          [''],
          ['STUDENT PERFORMANCE LEDGER'],
          ['Learner Handle', 'Admission ID', 'Missions Completed', 'Overall CBE Standing', 'Socratic Hints Scaffolding Index', 'Total Turns', 'Last Active']
        ];

        rosterData.forEach(r => {
          rows.push([
            r.handle,
            r.id,
            r.completedMissions,
            r.overallCBE,
            r.hintsUsedTotal,
            r.totalTurns,
            new Date(r.lastActive).toLocaleDateString('en-KE')
          ]);
        });

        const csvContent = rows.map(row => row.map(escapeCsv).join(',')).join('\r\n');
        setSecurityHeaders(res);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="CBE_Summary_Grade${cleanGrade}_${cleanStream}.csv"`);
        return res.send(csvContent);
      }

      // Printable Official Report
      if (format === 'print') {
        setSecurityHeaders(res);
        return res.send(`<!DOCTYPE html>
<html>
<head>
  <title>CBE Class Assessment Ledger — Grade ${cleanGrade} ${sanitizeHtml(cleanStream)}</title>
  <style>
    @media print { .no-print { display: none !important; } }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #111827; }
    .header { text-align: center; border-bottom: 2px solid #0D3A26; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 20px; color: #0D3A26; text-transform: uppercase; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #4B5563; }
    .meta-table { width: 100%; margin-bottom: 20px; font-size: 13px; border-collapse: collapse; }
    .meta-table td { padding: 6px 12px; border: 1px solid #E5E7EB; }
    .cbe-bar { display: flex; height: 22px; border-radius: 4px; overflow: hidden; margin: 10px 0; }
    .cbe-ee { background: #059669; color: #fff; text-align: center; font-size: 11px; line-height: 22px; font-weight: bold; }
    .cbe-me { background: #10B981; color: #fff; text-align: center; font-size: 11px; line-height: 22px; font-weight: bold; }
    .cbe-ae { background: #F59E0B; color: #fff; text-align: center; font-size: 11px; line-height: 22px; font-weight: bold; }
    .cbe-be { background: #EF4444; color: #fff; text-align: center; font-size: 11px; line-height: 22px; font-weight: bold; }
    .roster-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 16px; }
    .roster-table th, .roster-table td { border: 1px solid #D1D5DB; padding: 8px 10px; text-align: left; }
    .roster-table th { background: #F3F4F6; font-weight: 700; color: #1F2937; }
    .sig-area { margin-top: 40px; display: flex; justify-content: space-between; font-size: 13px; }
    .btn-print { background: #059669; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: space-between;">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn-print" style="background: #4B5563;" onclick="window.close()">Close</button>
  </div>

  <div class="header">
    <h1>Republic of Kenya • Ministry of Education</h1>
    <p>Junior School School-Based Assessment (SBA) Class Performance Ledger</p>
  </div>

  <table class="meta-table">
    <tr>
      <td><strong>School Name:</strong> ${sanitizeHtml(school ? school.name : 'Elingu School')}</td>
      <td><strong>County:</strong> ${sanitizeHtml(school ? school.county : 'Nairobi')}</td>
      <td><strong>Admin Code:</strong> ${sanitizeHtml(school ? school.adminCode : '---')}</td>
    </tr>
    <tr>
      <td><strong>Class / Stream:</strong> Grade ${cleanGrade} ${sanitizeHtml(cleanStream)}</td>
      <td><strong>Subject:</strong> ${sanitizeHtml(subject || 'All Subjects')}</td>
      <td><strong>Date:</strong> ${new Date().toLocaleDateString('en-KE')}</td>
    </tr>
  </table>

  <h3 style="font-size: 14px; margin-bottom: 6px;">Class Competency Distribution (${distribution.totalEvaluated} Assessed Learners)</h3>
  <div class="cbe-bar">
    <div class="cbe-ee" style="width: ${distribution.EE}%;">EE: ${distribution.EE}%</div>
    <div class="cbe-me" style="width: ${distribution.ME}%;">ME: ${distribution.ME}%</div>
    <div class="cbe-ae" style="width: ${distribution.AE}%;">AE: ${distribution.AE}%</div>
    <div class="cbe-be" style="width: ${distribution.BE}%;">BE: ${distribution.BE}%</div>
  </div>

  <table class="roster-table">
    <thead>
      <tr>
        <th>No.</th>
        <th>Learner Handle</th>
        <th>Missions Completed</th>
        <th>CBE Standing</th>
        <th>Hints Index</th>
        <th>Total Turns</th>
      </tr>
    </thead>
    <tbody>
      ${rosterData.map((r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${sanitizeHtml(r.handle)}</strong></td>
          <td>${r.completedMissions}</td>
          <td>${sanitizeHtml(r.overallCBE)}</td>
          <td>${r.hintsUsedTotal}</td>
          <td>${r.totalTurns}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="sig-area">
    <div>
      <p>Class Teacher Signature: _______________________</p>
      <p style="color: #6B7280; font-size: 11px;">Date: _______________________</p>
    </div>
    <div>
      <p>Headteacher / Principal Signature: _______________________</p>
      <p style="color: #6B7280; font-size: 11px;">Official School Stamp</p>
    </div>
  </div>
</body>
</html>`);
      }

      res.json({
        success: true,
        school: school ? { name: school.name, county: school.county, adminCode: school.adminCode } : null,
        grade: cleanGrade,
        stream: cleanStream,
        subject: subject || 'All Subjects',
        totalEnrolled: students.length,
        distribution,
        roster: rosterData
      });
    } catch (err) {
      console.error('[reports/stream-summary] error:', err);
      res.status(500).json({ error: 'Failed to generate stream summary.' });
    }
  });

  // GET /api/reports/student-summary (Individual student dossier)
  router.get('/api/reports/student-summary', requireTeacherAuth(), (req, res) => {
    try {
      const { studentId, format = 'json' } = req.query;
      if (!studentId) return res.status(400).json({ error: 'studentId is required.' });

      const student = studentStore.getStudentById(studentId);
      if (!student) return res.status(404).json({ error: 'Student not found.' });

      if (student.schoolId && student.schoolId !== req.teacher.schoolId) {
        return res.status(403).json({ error: 'Forbidden: Cannot access student dossiers from another school.' });
      }

      const missions = (student.schoolId && student.stream)
        ? teacherStore.getMissionsByStream(student.schoolId, student.grade, student.stream)
        : [];

      const completedList = [];
      missions.forEach(m => {
        const sub = m.submissions ? m.submissions[studentId] : null;
        if (sub && sub.completedAt) {
          completedList.push({
            id: m.id,
            title: m.title,
            subject: m.subject,
            strand: m.strand,
            overallCBE: sub.overallCBE,
            completedAt: sub.completedAt
          });
        }
      });

      // CSV Export
      if (format === 'csv') {
        const rows = [
          ['ELINGU INDIVIDUAL LEARNER COMPETENCY DOSSIER'],
          ['Learner Handle:', student.handle, 'Admission ID:', student.id],
          ['School:', student.school || 'Elingu School', 'Grade & Stream:', `Grade ${student.grade} ${student.stream || ''}`],
          ['Date:', new Date().toLocaleDateString('en-KE')],
          [''],
          ['ASSESSMENT MISSION HISTORY'],
          ['Mission Title', 'Subject', 'Strand', 'Competency Achieved', 'Date Completed']
        ];
        completedList.forEach(m => {
          rows.push([
            m.title,
            m.subject,
            m.strand,
            m.overallCBE,
            new Date(m.completedAt).toLocaleDateString('en-KE')
          ]);
        });

        const csvContent = rows.map(row => row.map(escapeCsv).join(',')).join('\r\n');
        setSecurityHeaders(res);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="Learner_Dossier_${student.handle}.csv"`);
        return res.send(csvContent);
      }

      // Printable Report Card
      if (format === 'print') {
        setSecurityHeaders(res);
        return res.send(`<!DOCTYPE html>
<html>
<head>
  <title>CBE Competency Profile — ${sanitizeHtml(student.handle)}</title>
  <style>
    @media print { .no-print { display: none !important; } }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 28px; color: #111827; }
    .header { text-align: center; border-bottom: 2px solid #0D3A26; padding-bottom: 12px; margin-bottom: 20px; }
    .meta-box { border: 1px solid #E5E7EB; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 13.5px; }
    .card-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .card-table th, .card-table td { border: 1px solid #D1D5DB; padding: 9px 12px; }
    .card-table th { background: #F9FAFB; font-weight: 700; }
    .badge { padding: 3px 8px; border-radius: 12px; font-weight: bold; font-size: 11px; }
    .badge-ee { background: #ECFDF5; color: #065F46; }
    .badge-me { background: #E0F2FE; color: #0369A1; }
    .badge-ae { background: #FEF3C7; color: #92400E; }
    .badge-be { background: #FEE2E2; color: #991B1B; }
    .sig-area { margin-top: 40px; display: flex; justify-content: space-between; font-size: 13px; }
    .btn-print { background: #059669; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: space-between;">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn-print" style="background: #4B5563;" onclick="window.close()">Close</button>
  </div>

  <div class="header">
    <h1 style="margin: 0; font-size: 20px; color: #0D3A26;">Republic of Kenya • Ministry of Education</h1>
    <h2 style="margin: 4px 0 0; font-size: 15px; color: #4B5563;">Individual Learner Competency Report Card</h2>
  </div>

  <div class="meta-box">
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <div><strong>Learner:</strong> ${sanitizeHtml(student.handle)}</div>
      <div><strong>Admission No:</strong> ${sanitizeHtml(student.id)}</div>
      <div><strong>School:</strong> ${sanitizeHtml(student.school || 'Elingu School')}</div>
      <div><strong>Grade & Stream:</strong> Grade ${student.grade} ${sanitizeHtml(student.stream || '')}</div>
      <div><strong>Total Socratic Turns:</strong> ${student.totalTurns || 0}</div>
      <div><strong>Assessment Date:</strong> ${new Date().toLocaleDateString('en-KE')}</div>
    </div>
  </div>

  <h3 style="font-size: 15px; margin-bottom: 8px;">Competency Achievements by Strand</h3>
  <table class="card-table">
    <thead>
      <tr>
        <th>Mission</th>
        <th>Subject</th>
        <th>Strand</th>
        <th>Competency Level</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      ${completedList.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: #6B7280;">No completed missions recorded yet.</td></tr>' : completedList.map(m => `
        <tr>
          <td><strong>${sanitizeHtml(m.title)}</strong></td>
          <td>${sanitizeHtml(m.subject)}</td>
          <td>${sanitizeHtml(m.strand)}</td>
          <td><span class="badge badge-${sanitizeHtml(m.overallCBE.toLowerCase())}">${sanitizeHtml(m.overallCBE)}</span></td>
          <td>${new Date(m.completedAt).toLocaleDateString('en-KE')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="sig-area">
    <div>
      <p>Class Teacher: _______________________</p>
      <p style="color: #6B7280; font-size: 11px;">Remarks: Commendable effort across core strands.</p>
    </div>
    <div>
      <p>Headteacher Signature: _______________________</p>
      <p style="color: #6B7280; font-size: 11px;">Official School Stamp</p>
    </div>
  </div>
</body>
</html>`);
      }

      res.json({
        success: true,
        student: {
          id: student.id,
          handle: student.handle,
          grade: student.grade,
          stream: student.stream,
          school: student.school,
          county: student.county,
          totalTurns: student.totalTurns || 0,
          streak: student.streak || 1
        },
        completedMissionsCount: completedList.length,
        history: completedList
      });
    } catch (err) {
      console.error('[reports/student-summary] error:', err);
      res.status(500).json({ error: 'Failed to generate student summary.' });
    }
  });

  // GET /api/reports/school-summary (Headteacher general grade / school-wide audit)
  router.get('/api/reports/school-summary', requireTeacherAuth(['school_admin']), (req, res) => {
    try {
      const { schoolId, format = 'json' } = req.query;
      if (!schoolId) return res.status(400).json({ error: 'schoolId is required.' });

      if (req.teacher.schoolId !== schoolId) {
        return res.status(403).json({ error: 'Forbidden: Cannot access institutional audits for another school.' });
      }

      const school = teacherStore.getSchoolById(schoolId);
      if (!school) return res.status(404).json({ error: 'School not found.' });

      const allStudents = studentStore.getStudentsBySchool(schoolId);
      const allMissions = teacherStore.getMissionsBySchool(schoolId);

      const streamStats = [];
      if (school.streams) {
        for (const [grade, streamList] of Object.entries(school.streams)) {
          (streamList || []).forEach(sName => {
            const stStudents = allStudents.filter(s => s.grade === parseInt(grade) && (s.stream || '').toLowerCase() === sName.toLowerCase());
            const stMissions = allMissions.filter(m => m.grade === parseInt(grade) && (m.stream || '').toLowerCase() === sName.toLowerCase());
            streamStats.push({
              grade: parseInt(grade),
              stream: sName,
              learnersCount: stStudents.length,
              missionsPushed: stMissions.length
            });
          });
        }
      }

      if (format === 'csv') {
        const rows = [
          ['ELINGU INSTITUTIONAL SCHOOL-WIDE ASSESSMENT AUDIT'],
          ['School:', school.name, 'Admin Code:', school.adminCode],
          ['County:', school.county, 'Total Enrolled:', allStudents.length],
          ['Report Date:', new Date().toLocaleDateString('en-KE')],
          [''],
          ['GRADE & STREAM ENROLLMENT BREAKDOWN'],
          ['Grade Level', 'Stream', 'Enrolled Learners', 'Missions Pushed']
        ];
        streamStats.forEach(st => {
          rows.push([
            `Grade ${st.grade}`,
            st.stream,
            st.learnersCount,
            st.missionsPushed
          ]);
        });

        const csvContent = rows.map(row => row.map(escapeCsv).join(',')).join('\r\n');
        setSecurityHeaders(res);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="Institutional_Audit_${school.adminCode}.csv"`);
        return res.send(csvContent);
      }

      if (format === 'print') {
        setSecurityHeaders(res);
        return res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Institutional Assessment Audit — ${sanitizeHtml(school.name)}</title>
  <style>
    @media print { .no-print { display: none !important; } }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #111827; }
    .header { text-align: center; border-bottom: 2px solid #0D3A26; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 20px; color: #0D3A26; text-transform: uppercase; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #4B5563; }
    .meta-table { width: 100%; margin-bottom: 20px; font-size: 13px; border-collapse: collapse; }
    .meta-table td { padding: 6px 12px; border: 1px solid #E5E7EB; }
    .stats-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 16px; }
    .stats-table th, .stats-table td { border: 1px solid #D1D5DB; padding: 8px 10px; text-align: left; }
    .stats-table th { background: #F3F4F6; font-weight: 700; color: #1F2937; }
    .sig-area { margin-top: 40px; display: flex; justify-content: space-between; font-size: 13px; }
    .btn-print { background: #059669; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: space-between;">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn-print" style="background: #4B5563;" onclick="window.close()">Close</button>
  </div>

  <div class="header">
    <h1>Republic of Kenya • Ministry of Education</h1>
    <p>Junior School Institutional Assessment & Competency Audit</p>
  </div>

  <table class="meta-table">
    <tr>
      <td><strong>School Name:</strong> ${sanitizeHtml(school.name)}</td>
      <td><strong>County:</strong> ${sanitizeHtml(school.county)}</td>
      <td><strong>Institutional Admin Code:</strong> ${sanitizeHtml(school.adminCode)}</td>
    </tr>
    <tr>
      <td><strong>Total Enrolled Learners:</strong> ${allStudents.length}</td>
      <td><strong>Total Missions Pushed:</strong> ${allMissions.length}</td>
      <td><strong>Audit Date:</strong> ${new Date().toLocaleDateString('en-KE')}</td>
    </tr>
  </table>

  <h3 style="font-size: 14px; margin-bottom: 6px;">Grade & Stream Enrollment & Deployment Breakdown</h3>
  <table class="stats-table">
    <thead>
      <tr>
        <th>Grade Level</th>
        <th>Stream</th>
        <th>Enrolled Learners</th>
        <th>Live Missions Pushed</th>
        <th>Join Code</th>
      </tr>
    </thead>
    <tbody>
      ${streamStats.map(st => {
        const joinCode = (school.joinCodes && school.joinCodes[st.grade + '_' + st.stream]) || '---';
        return `
          <tr>
            <td><strong>Grade ${st.grade}</strong></td>
            <td>${sanitizeHtml(st.stream)}</td>
            <td>${st.learnersCount}</td>
            <td>${st.missionsPushed}</td>
            <td><code style="background: #E5E7EB; padding: 2px 6px; border-radius: 4px;">${sanitizeHtml(joinCode)}</code></td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="sig-area">
    <div>
      <p style="margin-bottom: 30px;">Certified by Headteacher / School Principal:</p>
      <p style="border-top: 1px dashed #9CA3AF; padding-top: 4px;">Signature & School Official Stamp</p>
    </div>
    <div>
      <p style="margin-bottom: 30px;">Verification Date:</p>
      <p style="border-top: 1px dashed #9CA3AF; padding-top: 4px;">${new Date().toLocaleDateString('en-KE')}</p>
    </div>
  </div>
</body>
</html>`);
      }

      res.json({
        success: true,
        school: { name: school.name, county: school.county, adminCode: school.adminCode },
        totalStudents: allStudents.length,
        totalMissions: allMissions.length,
        streams: streamStats
      });
    } catch (err) {
      console.error('[reports/school-summary] error:', err);
      res.status(500).json({ error: 'Failed to generate school summary.' });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 5 — DEDICATED HTML TEACHER PORTAL (`/teacher/portal`)
  // ══════════════════════════════════════════════════════════════

  router.get('/teacher/portal', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elingu Mwalimu — Teacher & Institutional CBE Suite</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0D3A26;
      --primary-hover: #144A32;
      --primary-dark: #072618;
      --accent: #4ADE80;
      --bg-cream: #FAF7F2;
      --card-bg: #FFFFFF;
      --border-warm: #E0D8CC;
      --text-main: #1C1C1C;
      --text-sub: #4A4A4A;
      --text-muted: #888888;
      --emerald: #10B981;
      --emerald-dark: #059669;
      --emerald-light: #ECFDF5;
      --amber: #F59E0B;
      --amber-light: #FEF3C7;
      --font-body: 'DM Sans', -apple-system, sans-serif;
      --font-heading: 'Outfit', 'DM Sans', sans-serif;
    }

    body.theme-dark {
      --primary: #4ADE80;
      --primary-hover: #86EFAC;
      --primary-dark: #2D6A4F;
      --accent: #4ADE80;
      --bg-cream: #0B1612;
      --card-bg: rgba(17, 30, 22, 0.92);
      --border-warm: rgba(74, 222, 128, 0.16);
      --text-main: #D4E8DA;
      --text-sub: #A0BCA8;
      --text-muted: #6A8A72;
      --emerald: #34D399;
      --emerald-light: rgba(52, 211, 153, 0.12);
      --amber-light: rgba(245, 158, 11, 0.12);
    }
    body.theme-dark {
      background:
        radial-gradient(ellipse at 8% 10%, rgba(74, 222, 128, 0.14) 0%, transparent 42%),
        radial-gradient(ellipse at 88% 8%, rgba(0, 212, 170, 0.10) 0%, transparent 44%),
        radial-gradient(ellipse at 12% 88%, rgba(245, 158, 11, 0.10) 0%, transparent 44%),
        radial-gradient(ellipse at 86% 82%, rgba(6, 182, 212, 0.08) 0%, transparent 40%),
        #0B1612;
    }
    body.theme-dark .auth-wrapper,
    body.theme-dark .bento-card,
    body.theme-dark .dash-header,
    body.theme-dark .section-card,
    body.theme-dark .mission-item-card {
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 20px rgba(74, 222, 128, 0.05);
    }
    body.theme-dark .user-pill {
      background: rgba(74, 222, 128, 0.12);
      border-color: rgba(74, 222, 128, 0.25);
      color: #4ADE80;
    }
    body.theme-dark .header-badge {
      background: rgba(17, 30, 22, 0.85);
      border-color: rgba(74, 222, 128, 0.16);
      color: #A0BCA8;
    }
    body.theme-dark .btn-logout {
      background: rgba(17, 30, 22, 0.85);
      border-color: rgba(74, 222, 128, 0.16);
      color: #A0BCA8;
    }
    body.theme-dark .auth-tabs {
      background: rgba(10, 22, 16, 0.95);
      border-bottom-color: rgba(74, 222, 128, 0.14);
    }
    body.theme-dark .auth-tab-btn {
      color: #6A8A72;
    }
    body.theme-dark .auth-tab-btn.active {
      color: #4ADE80;
      border-bottom-color: #4ADE80;
    }
    body.theme-dark .form-input,
    body.theme-dark .form-select {
      background: rgba(20, 38, 28, 0.88);
      border-color: rgba(74, 222, 128, 0.2);
      color: #D4E8DA;
    }
    body.theme-dark .form-input::placeholder {
      color: #6A8A72;
    }
    body.theme-dark .portal-tabs {
      background: rgba(10, 22, 16, 0.8);
      border-bottom-color: rgba(74, 222, 128, 0.14);
    }
    body.theme-dark .portal-tab-btn.active {
      color: #4ADE80;
      border-bottom-color: #4ADE80;
    }
    body.theme-dark table {
      color: #D4E8DA;
    }
    body.theme-dark th {
      background: rgba(10, 22, 16, 0.95);
      color: #A0BCA8;
    }
    body.theme-dark td {
      border-bottom-color: rgba(74, 222, 128, 0.08);
    }
    body.theme-dark tr:hover td {
      background: rgba(74, 222, 128, 0.04);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-body);
      background-color: var(--bg-cream);
      color: var(--text-main);
      line-height: 1.5;
      min-height: 100vh;
      padding: 24px 20px 60px;
      display: flex;
      flex-direction: column;
    }

    /* Portal Container */
    .portal-container {
      max-width: 1120px;
      width: 100%;
      margin: 0 auto;
      flex: 1;
    }

    /* Top Navigation Header (Matching Parent Portal) */
    .portal-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0 24px;
      border-bottom: 1px solid var(--border-warm);
      margin-bottom: 26px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-logo-circle {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .brand-logo-img {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid #2D6A4F;
      box-shadow: 0 2px 8px rgba(13, 58, 38, 0.12);
    }
    .brand-logo-circle::after {
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 50%;
      border: 1px solid rgba(45, 106, 79, 0.2);
      pointer-events: none;
    }
    .brand-title {
      font-family: var(--font-heading);
      font-size: 20.5px;
      font-weight: 700;
      color: var(--primary);
      letter-spacing: -0.3px;
      line-height: 1.15;
    }
    .brand-sub {
      font-size: 11.5px;
      color: var(--text-muted);
      font-weight: 400;
      margin-top: 1px;
    }
    .header-badges {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .header-badge {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-sub);
      background: #FFFFFF;
      border: 1px solid var(--border-warm);
      padding: 6px 14px;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .nav-user {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .user-pill {
      background: #E8F5ED;
      border: 1px solid rgba(13, 58, 38, 0.15);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      color: var(--primary);
    }
    .btn-logout {
      background: #FFFFFF;
      border: 1px solid var(--border-warm);
      color: var(--text-sub);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-logout:hover {
      background: #FEE2E2;
      color: #DC2626;
      border-color: #FCA5A5;
    }

    /* Auth Card (When Signed Out) */
    .auth-wrapper {
      max-width: 500px;
      margin: 36px auto;
      background: #FFFFFF;
      border-radius: 18px;
      box-shadow: 0 2px 14px rgba(13, 58, 38, 0.06);
      border: 1px solid var(--border-warm);
      overflow: hidden;
    }
    .auth-tabs {
      display: flex;
      background: #FAF7F2;
      border-bottom: 1px solid var(--border-warm);
      padding: 0 12px;
    }
    .auth-tab-btn {
      flex: 1;
      padding: 15px 8px;
      border: none;
      background: transparent;
      font-family: var(--font-body);
      font-weight: 500;
      font-size: 13.5px;
      color: var(--text-muted);
      cursor: pointer;
      border-bottom: 3px solid transparent;
      margin-bottom: -1px;
      transition: all 0.2s;
      text-align: center;
    }
    .auth-tab-btn:hover {
      color: var(--primary);
    }
    .auth-tab-btn.active {
      color: var(--primary);
      font-weight: 700;
      border-bottom: 3px solid var(--primary);
      background: transparent;
    }
    .auth-body {
      padding: 28px 26px;
    }
    .form-group {
      margin-bottom: 18px;
    }
    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-sub);
      margin-bottom: 6px;
    }
    .form-input, .form-select {
      width: 100%;
      padding: 11px 14px;
      border: 1px solid var(--border-warm);
      border-radius: 12px;
      font-family: var(--font-body);
      font-size: 14px;
      color: var(--text-main);
      background: #FFFFFF;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .form-input:focus, .form-select:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(13, 58, 38, 0.08);
    }
    .btn-primary {
      width: 100%;
      background: var(--primary);
      color: #FFFFFF;
      border: none;
      padding: 13px 18px;
      border-radius: 12px;
      font-family: var(--font-body);
      font-size: 14.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 8px;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }

    /* Dashboard Header Bar */
    .dash-header {
      background: #FFFFFF;
      border-radius: 16px;
      padding: 22px 26px;
      border: 1px solid var(--border-warm);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 22px;
      box-shadow: 0 2px 12px rgba(13, 58, 38, 0.05);
    }
    .school-info h2 {
      font-family: var(--font-heading);
      font-size: 22px;
      color: var(--primary);
      font-weight: 700;
    }
    .school-info p {
      font-size: 13.5px;
      color: var(--text-sub);
      margin-top: 2px;
    }
    .stream-selector-box {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* Main Navigation Tabs */
    .portal-tabs {
      display: flex;
      background: #FFFFFF;
      border: 1px solid var(--border-warm);
      border-radius: 16px;
      padding: 6px;
      margin-bottom: 24px;
      gap: 6px;
      flex-wrap: wrap;
      box-shadow: 0 2px 12px rgba(13, 58, 38, 0.04);
    }
    .portal-tab-btn {
      padding: 10px 18px;
      background: transparent;
      border: none;
      border-radius: 10px;
      font-family: var(--font-body);
      font-size: 13.5px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .portal-tab-btn:hover {
      color: var(--primary);
      background: rgba(13, 58, 38, 0.04);
    }
    .portal-tab-btn.active {
      color: #FFFFFF;
      background: var(--primary);
      box-shadow: 0 2px 8px rgba(13, 58, 38, 0.18);
    }

    /* Cards & Grids */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 860px) {
      .grid-2 { grid-template-columns: 1fr; }
    }

    .bento-card {
      background: #FFFFFF;
      border-radius: 16px;
      padding: 24px;
      border: 1px solid var(--border-warm);
      box-shadow: 0 2px 12px rgba(13, 58, 38, 0.05);
      margin-bottom: 20px;
    }
    .bento-card h3 {
      font-family: var(--font-heading);
      font-size: 17.5px;
      color: var(--primary);
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* CBE Stacked Bar */
    .cbe-bar-container {
      margin: 14px 0;
    }
    .cbe-bar-track {
      height: 20px;
      border-radius: 10px;
      display: flex;
      overflow: hidden;
      background: #E5E7EB;
    }
    .cbe-seg-ee { background: #059669; }
    .cbe-seg-me { background: #10B981; }
    .cbe-seg-ae { background: #F59E0B; }
    .cbe-seg-be { background: #EF4444; }
    .cbe-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 600;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .dot-ee { width: 10px; height: 10px; border-radius: 50%; background: #059669; }
    .dot-me { width: 10px; height: 10px; border-radius: 50%; background: #10B981; }
    .dot-ae { width: 10px; height: 10px; border-radius: 50%; background: #F59E0B; }
    .dot-be { width: 10px; height: 10px; border-radius: 50%; background: #EF4444; }

    /* Mission Row */
    .mission-item-card {
      border: 1px solid var(--border-warm);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      background: var(--bg-cream);
      transition: all 0.2s;
    }
    .mission-item-card:hover {
      border-color: var(--primary);
      background: #FFFFFF;
      box-shadow: 0 2px 8px rgba(13, 58, 38, 0.06);
    }
    .mission-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .mission-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-main);
    }
    .badge {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 12px;
      text-transform: uppercase;
    }
    .badge-open { background: var(--emerald-light); color: var(--emerald-dark); }
    .badge-closed { background: #FEE2E2; color: #DC2626; }
    .badge-timed { background: var(--amber-light); color: #B45309; }

    /* Roadblock Box */
    .roadblock-box {
      background: #FFFBEB;
      border-left: 4px solid var(--amber);
      padding: 12px 14px;
      border-radius: 0 8px 8px 0;
      margin-top: 10px;
      font-size: 12.5px;
      color: #92400E;
    }

    /* Process Trail & Modals */
    .trail-modal {
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(13, 58, 38, 0.45);
      backdrop-filter: blur(4px);
      z-index: 200;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .trail-content {
      background: #FFFFFF;
      max-width: 800px;
      width: 100%;
      max-height: 90vh;
      border-radius: 18px;
      border: 1px solid var(--border-warm);
      box-shadow: 0 12px 40px rgba(13, 58, 38, 0.18);
      overflow-y: auto;
      padding: 28px;
      position: relative;
    }
    .close-btn {
      position: absolute;
      top: 18px; right: 18px;
      background: var(--bg-cream);
      border: 1px solid var(--border-warm);
      border-radius: 50%;
      width: 32px; height: 32px;
      font-size: 15px;
      font-weight: bold;
      color: var(--text-sub);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .close-btn:hover {
      background: #E0D8CC;
      color: #1C1C1C;
    }
    @media (max-width: 640px) {
      body { padding: 14px 10px 40px; }
      .portal-header-bar { flex-direction: column; align-items: flex-start; gap: 12px; }
      .header-badges { width: 100%; justify-content: space-between; }
      .dash-header { padding: 16px; flex-direction: column; align-items: stretch; gap: 14px; }
      .stream-selector-box { flex-direction: column; align-items: stretch; width: 100%; }
      .stream-selector-box select, .stream-selector-box button { width: 100%; }
      .portal-tabs { overflow-x: auto; flex-wrap: nowrap; padding: 4px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
      .portal-tabs::-webkit-scrollbar { display: none; }
      .portal-tab-btn { flex-shrink: 0; padding: 8px 12px; font-size: 12.5px; white-space: nowrap; }
      .bento-card { padding: 16px; }
      .auth-wrapper { margin: 16px auto; }
      .auth-body { padding: 20px 16px; }
      .auth-tabs { overflow-x: auto; }
      .auth-tab-btn { padding: 12px 6px; font-size: 12.5px; }
      .trail-modal { padding: 10px; }
      .trail-content { padding: 18px 14px; max-height: 94vh; }
    }
  </style>
</head>
<body>

  <div class="portal-container">

    <!-- Top Nav Header (Matching Parent Portal) -->
    <header class="portal-header-bar">
      <div class="brand-wrap">
        <div class="brand-logo-circle">
          <img src="/elingu-avatar.png" alt="Elingu Logo" class="brand-logo-img" />
        </div>
        <div>
          <div class="brand-title">Elingu Mwalimu</div>
          <div class="brand-sub">CBE Assessment &amp; Socratic Intelligence Hub</div>
        </div>
      </div>
      <div class="header-badges">
        <span class="header-badge">🛡️ KDPA 2019 Protected</span>
        <div class="nav-user" id="navUserArea" style="display: none;">
          <button id="themeToggleBtn" onclick="toggleTheme()" style="background: var(--card-bg); border: 1px solid var(--border-warm); color: var(--text-sub); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px;">🌙 Dark</button>
          <span class="user-pill" id="userPillText">Mwalimu</span>
          <button class="btn-logout" onclick="logoutTeacher()">Log Out</button>
        </div>
      </div>
    </header>

  <main>

    <!-- Auth Card (Shown when not logged in) -->
    <div id="authSection" class="auth-wrapper">
      <div class="auth-tabs">
        <button class="auth-tab-btn active" id="tabBtnLogin" onclick="switchAuthTab('login')">Teacher Login</button>
        <button class="auth-tab-btn" id="tabBtnReg" onclick="switchAuthTab('register')">Register Teacher</button>
        <button class="auth-tab-btn" id="tabBtnSchool" onclick="switchAuthTab('school')">New School</button>
      </div>

      <div class="auth-body">
        <!-- 1. Login Form -->
        <form id="formLogin" onsubmit="handleTeacherLogin(event)">
          <div class="form-group">
            <label class="form-label">Email, Phone, or National ID</label>
            <input type="text" id="loginId" class="form-input" placeholder="e.g. kamau@school.ke or 0712345678" required />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="loginPass" class="form-input" placeholder="••••••••" required />
          </div>
          <div id="loginFeedback" style="display:none; font-size: 13px; margin-bottom: 12px; color: #DC2626;"></div>
          <button type="submit" class="btn-primary" id="btnLoginSubmit">Sign In to Dashboard 🚀</button>
        </form>

        <!-- 2. Teacher Registration Form -->
        <form id="formRegister" onsubmit="handleTeacherRegister(event)" style="display: none;">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" id="regName" class="form-input" placeholder="e.g. Mwalimu James Kamau" required />
          </div>
          <div class="form-group">
            <label class="form-label">National ID / Passport Number (Required for Accreditation)</label>
            <input type="text" id="regIdNumber" class="form-input" placeholder="e.g. 12345678" required />
          </div>
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" id="regEmail" class="form-input" placeholder="kamau@school.ke" />
          </div>
          <div class="form-group">
            <label class="form-label">Mobile Phone (M-Pesa / SMS Alerts)</label>
            <input type="text" id="regPhone" class="form-input" placeholder="0712345678" required />
          </div>
          <div class="form-group">
            <label class="form-label">School Admin Code</label>
            <input type="text" id="regAdminCode" class="form-input" placeholder="e.g. KUJ-ADMIN" style="text-transform: uppercase;" required />
            <span style="font-size: 11.5px; color: var(--slate-600);">Provided by your Headteacher or Elingu team.</span>
          </div>
          <div class="form-group">
            <label class="form-label">Role in School</label>
            <select id="regRole" class="form-select" onchange="toggleRegAssignment(this.value)">
              <option value="subject_teacher">Subject Teacher</option>
              <option value="class_teacher">Class Teacher</option>
              <option value="school_admin">Headteacher / School Administrator</option>
            </select>
          </div>
          <div id="regAssignmentBox" class="form-group">
            <label class="form-label">Primary Stream Assignment</label>
            <div style="display: flex; gap: 8px;">
              <select id="regGrade" class="form-select" style="flex: 1;">
                <option value="6">Grade 6</option>
                <option value="7">Grade 7</option>
                <option value="8" selected>Grade 8</option>
                <option value="9">Grade 9</option>
              </select>
              <input type="text" id="regStreamName" class="form-input" placeholder="Stream (e.g. East)" style="flex: 1;" />
            </div>
            <div style="margin-top: 8px;">
              <label class="form-label" style="font-size: 12px;">Subject Taught</label>
              <select id="regSubject" class="form-select">
                <option value="Mathematics">Mathematics</option>
                <option value="Science & Technology">Science & Technology</option>
                <option value="English">English</option>
                <option value="Social Studies">Social Studies</option>
                <option value="Kiswahili">Kiswahili</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Create Password</label>
            <input type="password" id="regPassword" class="form-input" placeholder="Min 8 chars, 1 letter, 1 number" required />
          </div>
          <div id="regFeedback" style="display:none; font-size: 13px; margin-bottom: 12px; color: #DC2626;"></div>
          <button type="submit" class="btn-primary" id="btnRegSubmit">Register Teacher Account 🎓</button>
        </form>

        <!-- 3. New School Form -->
        <form id="formSchool" onsubmit="handleSchoolCreate(event)" style="display: none;">
          <div class="form-group">
            <label class="form-label">School Name</label>
            <input type="text" id="schName" class="form-input" placeholder="e.g. Kisumu Union Junior Secondary" required />
          </div>
          <div class="form-group">
            <label class="form-label">County</label>
            <input type="text" id="schCounty" class="form-input" placeholder="e.g. Kisumu" required />
          </div>
          <div class="form-group">
            <label class="form-label">Custom Admin Code (Optional)</label>
            <input type="text" id="schAdminCode" class="form-input" placeholder="Leave blank to auto-generate" style="text-transform: uppercase;" />
          </div>
          <div class="form-group">
            <label class="form-label">Grades Offered</label>
            <div style="display: flex; gap: 12px; font-size: 13.5px; font-weight: 500; flex-wrap: wrap;" id="schGradesContainer">
              <label><input type="checkbox" id="schG6" checked /> Grade 6</label>
              <label><input type="checkbox" id="schG7" checked /> Grade 7</label>
              <label><input type="checkbox" id="schG8" checked /> Grade 8</label>
              <label><input type="checkbox" id="schG9" checked /> Grade 9</label>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Streams (comma-separated)</label>
            <input type="text" id="schStreams" class="form-input" placeholder="East, West, North, South" value="East, West" required />
          </div>
          <div id="schFeedback" style="display:none; font-size: 13px; margin-bottom: 12px; color: #DC2626;"></div>
          <button type="submit" class="btn-primary" id="btnSchSubmit">Provision Institutional School Entity 🏫</button>
        </form>
      </div>
    </div>

    <!-- Main Dashboard Area (Shown when authenticated) -->
    <div id="dashboardSection" style="display: none;">
      
      <!-- Dashboard Header -->
      <div class="dash-header">
        <div class="school-info">
          <h2 id="dashSchoolName">Kisumu Union JSS</h2>
          <p id="dashTeacherRole">Mwalimu Kamau • Grade 8 East Mathematics</p>
        </div>
        <div class="stream-selector-box">
          <label style="font-size: 13px; font-weight: 600; color: var(--slate-700);">Active Stream:</label>
          <select id="streamSelector" class="form-select" style="width: auto; min-width: 180px;" onchange="switchActiveStream(this.value)">
            <!-- Populated dynamically -->
          </select>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="portal-tabs">
        <button class="portal-tab-btn active" id="tabMissions" onclick="switchPortalTab('missions')">📋 Missions & Live Tracker</button>
        <button class="portal-tab-btn" id="tabCreate" onclick="switchPortalTab('create')">🚀 Push Live Mission</button>
        <button class="portal-tab-btn" id="tabRoster" onclick="switchPortalTab('roster')">👥 Student Roster & Stream Codes</button>
        <button class="portal-tab-btn" id="tabDirectory" onclick="switchPortalTab('directory')" style="display: none;">🏫 School Stream Directory</button>
      </div>

      <!-- Tab 1: Missions & Live Tracker -->
      <div id="viewMissions">
        <div class="grid-2">
          <div class="bento-card">
            <h3>Active Live Missions <span id="missionCountBadge" class="badge badge-open">0 active</span></h3>
            <div id="missionsListContainer">
              <p style="font-size: 13.5px; color: var(--slate-600);">No missions currently pushed to this stream. Use "Push Live Mission" to assign one!</p>
            </div>
          </div>

          <div class="bento-card">
            <h3>Live Competency Distribution (Selected Stream)</h3>
            <div id="liveStreamCbeBox">
              <div class="cbe-bar-container">
                <div class="cbe-bar-track">
                  <div class="cbe-seg-ee" style="width: 35%;"></div>
                  <div class="cbe-seg-me" style="width: 40%;"></div>
                  <div class="cbe-seg-ae" style="width: 15%;"></div>
                  <div class="cbe-seg-be" style="width: 10%;"></div>
                </div>
                <div class="cbe-legend">
                  <span class="legend-item"><span class="dot-ee"></span> EE (Exceeding): 35%</span>
                  <span class="legend-item"><span class="dot-me"></span> ME (Meeting): 40%</span>
                  <span class="legend-item"><span class="dot-ae"></span> AE (Approaching): 15%</span>
                  <span class="legend-item"><span class="dot-be"></span> BE (Below): 10%</span>
                </div>
              </div>
              <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--slate-200);">
                <div style="font-size: 13px; font-weight: 700; color: var(--primary);">🔥 Top Misconceptions Flagged by AI</div>
                <p id="topMisconceptionText" style="font-size: 12.5px; color: var(--slate-600); margin-top: 4px;">
                  No critical roadblocks flagged yet. As learners submit missions, common misconceptions will surface here in real-time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Push Live Mission (AI Generator) -->
      <div id="viewCreate" style="display: none;">
        <div class="bento-card">
          <h3>✨ AI Socratic Mission Generator</h3>
          <p style="font-size: 13.5px; color: var(--slate-600); margin-bottom: 18px;">
            Draft 3–5 KICD CBE assessment items calibrated to your syllabus strand. Students solve them step-by-step while Elingu records their 8-dimensional process trail.
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 16px;">
            <div>
              <label class="form-label">Subject</label>
              <select id="genSubject" class="form-select">
                <option value="Mathematics">Mathematics</option>
                <option value="Science & Technology">Science & Technology</option>
                <option value="English">English</option>
                <option value="Social Studies">Social Studies</option>
                <option value="Kiswahili">Kiswahili</option>
              </select>
            </div>
            <div>
              <label class="form-label">CBE Strand / Topic</label>
              <input type="text" id="genStrand" class="form-input" placeholder="e.g. Numbers — Fractions & Decimals" />
            </div>
            <div>
              <label class="form-label">Target CBE Level</label>
              <select id="genDifficulty" class="form-select">
                <option value="ME" selected>Meeting Expectations (ME - Standard)</option>
                <option value="EE">Exceeding Expectations (EE - Challenging)</option>
                <option value="AE">Approaching Expectations (AE - Foundational)</option>
              </select>
            </div>
            <div>
              <label class="form-label">Question Count</label>
              <select id="genCount" class="form-select">
                <option value="2">2 Questions (Fast Exit Ticket)</option>
                <option value="3" selected>3 Questions (Standard Practice)</option>
                <option value="5">5 Questions (Deep Check)</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            <label class="form-label">Socratic Hint Policy (Teacher Control)</label>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <label style="font-size: 13.5px; font-weight: 500; cursor: pointer;">
                <input type="radio" name="hintModeRadio" value="open" checked /> 🟢 <strong>Open</strong> (Hints available & tracked as scaffolding data)
              </label>
              <label style="font-size: 13.5px; font-weight: 500; cursor: pointer;">
                <input type="radio" name="hintModeRadio" value="closed" /> 🔴 <strong>Closed</strong> (Zero hints — pure summative snapshot)
              </label>
              <label style="font-size: 13.5px; font-weight: 500; cursor: pointer;">
                <input type="radio" name="hintModeRadio" value="timed" /> 🟡 <strong>Timed</strong> (No hints for first 3 mins, then unlock)
              </label>
            </div>
          </div>

          <button type="button" class="btn-primary" style="width: auto; padding: 10px 24px;" id="btnGenerateAiQuiz" onclick="generateAiQuiz()">
            ✨ Draft Questions with AI
          </button>
        </div>

        <!-- Generated Questions Editor Area -->
        <div id="quizEditorCard" class="bento-card" style="display: none;">
          <h3>Preview & Edit Assessment Items</h3>
          <div id="quizItemsContainer"></div>
          <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
            <button type="button" class="btn-primary" style="width: auto; padding: 12px 28px; background: var(--primary);" onclick="pushMissionToStream()">
              🚀 Push Live Mission to Stream Now
            </button>
          </div>
        </div>
      </div>

      <!-- Tab 3: Student Roster & Stream Codes -->
      <div id="viewRoster" style="display: none;">
        <div class="grid-2">
          <div class="bento-card">
            <h3>Chalkboard Stream Join Code</h3>
            <p style="font-size: 13px; color: var(--slate-600); margin-bottom: 12px;">
              Write this code on your classroom chalkboard. When learners enter it in their profile, they are instantly linked to your stream!
            </p>
            <div style="background: var(--primary); color: #fff; border-radius: 16px; padding: 26px; text-align: center; margin: 14px 0; box-shadow: 0 4px 16px rgba(13, 58, 38, 0.15);">
              <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: var(--accent);">Classroom Join Code</span>
              <div id="chalkboardCodeDisplay" style="font-family: var(--font-heading); font-size: 42px; font-weight: 800; letter-spacing: 4px; color: var(--accent); margin: 6px 0;">
                ---
              </div>
              <span style="font-size: 12.5px; color: rgba(255,255,255,0.8);">Enter in Elingu Profile Settings → Join School Stream</span>
            </div>
            <button type="button" class="btn-primary" style="background: var(--bg-cream); color: var(--primary); border: 1.5px solid var(--border-warm); width: auto; font-weight: 600; padding: 11px 18px; border-radius: 12px;" onclick="openBulkImportModal()">
              📥 Bulk Import Students via CSV
            </button>
          </div>

          <div class="bento-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
              <h3 style="margin-bottom: 0;">Enrolled Learners in Stream (<span id="rosterCount">0</span>)</h3>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="btn-primary" style="background: var(--primary); font-size: 12px; padding: 7px 14px; width: auto; border-radius: 10px; font-weight: 600;" onclick="downloadClassReport('csv')">
                  📄 Export Class CSV
                </button>
                <button type="button" class="btn-primary" style="background: var(--bg-cream); color: var(--primary); border: 1px solid var(--border-warm); font-size: 12px; padding: 7px 14px; width: auto; border-radius: 10px; font-weight: 600;" onclick="downloadClassReport('print')">
                  🖨️ Print SBA Ledger
                </button>
              </div>
            </div>
            <div id="rosterList" style="max-height: 400px; overflow-y: auto;">
              <p style="font-size: 13px; color: var(--slate-600);">No learners registered in this stream yet.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 4: School Directory (Headteacher Only) -->
      <div id="viewDirectory" style="display: none;">
        <div class="bento-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
            <div>
              <h3 style="margin-bottom: 4px;">🏫 Complete School Grade & Stream Directory</h3>
              <p style="font-size: 13.5px; color: var(--text-sub); margin-bottom: 0;">
                Overview of all active grade streams and join codes provisioned for your school.
              </p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button type="button" class="btn-primary" style="background: var(--primary); font-size: 12.5px; padding: 7px 14px; width: auto; border-radius: 10px; font-weight: 600;" onclick="downloadSchoolAudit('csv')">
                📄 Export School Audit (CSV)
              </button>
              <button type="button" class="btn-primary" style="background: var(--bg-cream); color: var(--primary); border: 1px solid var(--border-warm); font-size: 12.5px; padding: 7px 14px; width: auto; border-radius: 10px; font-weight: 600;" onclick="downloadSchoolAudit('print')">
                🖨️ Printable School Audit
              </button>
            </div>
          </div>
          <div id="schoolDirectoryContainer"></div>
        </div>
      </div>

    </div>

    <!-- Student Process Trail Modal -->
    <div id="trailModal" class="trail-modal">
      <div class="trail-content">
        <button class="close-btn" onclick="closeTrailModal()">✕</button>
        <h2 id="trailModalTitle" style="font-family: var(--font-heading); font-size: 20px; color: var(--primary); margin-bottom: 12px;">Student Process Trail</h2>
        <div id="trailModalBody"></div>
      </div>
    </div>

    <!-- Bulk Student Import Modal -->
    <div id="bulkImportModal" class="trail-modal">
      <div class="trail-content" style="max-width: 580px; padding: 26px;">
        <button class="close-btn" onclick="closeBulkImportModal()">✕</button>
        <h3 style="font-family: var(--font-heading); font-size: 20px; color: var(--primary); margin-bottom: 6px;">📥 Bulk Student Onboarding</h3>
        <p style="font-size: 13px; color: var(--text-sub); margin-bottom: 14px; line-height: 1.5;">
          Paste CSV rows into the box below. Each line should follow the format:<br>
          <strong style="color: var(--primary);">Full Name, Grade, Stream, Parent Phone</strong><br>
          <span style="font-size: 12px; color: var(--text-muted);">Example: Chebet Cheruiyot, 8, East, 0712345678</span>
        </p>
        <textarea id="bulkImportTextarea" class="form-input" style="width: 100%; height: 160px; font-family: monospace; font-size: 13px; resize: vertical; margin-bottom: 16px;" placeholder="Chebet Cheruiyot, 8, East, 0712345678&#10;Brian Omondi, 8, East, 0722334455"></textarea>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" onclick="closeBulkImportModal()" style="background: var(--bg-cream); border: 1px solid var(--border-warm); border-radius: 10px; padding: 10px 18px; font-weight: 600; color: var(--text-sub); cursor: pointer;">Cancel</button>
          <button type="button" class="btn-primary" onclick="submitBulkImport()" style="width: auto; padding: 10px 22px; margin-top: 0;">Enroll Students 🚀</button>
        </div>
      </div>
    </div>

    <!-- Teacher Student Subject Management Modal -->
    <div id="teacherSubjectModal" class="trail-modal">
      <div class="trail-content" style="max-width: 580px; padding: 26px;">
        <button class="close-btn" onclick="closeTeacherSubjectModal()">✕</button>
        <h3 style="font-family: var(--font-heading); font-size: 20px; color: var(--primary); margin-bottom: 6px;">📚 Manage Learner Subjects</h3>
        <p style="font-size: 13px; color: var(--text-sub); margin-bottom: 14px; line-height: 1.5;">
          Select or update the registered curriculum subjects for this learner in your school stream.
        </p>
        <div style="background: var(--bg-cream); border: 1px solid var(--border-warm); border-radius: 10px; padding: 12px; margin-bottom: 14px;">
          <div style="font-size: 12px; color: var(--text-muted);">Learner:</div>
          <div style="font-size: 15px; font-weight: 700; color: var(--text-main);" id="tsModalStudentName">Learner</div>
          <div style="font-size: 12px; color: var(--primary); margin-top: 2px;" id="tsModalStudentMeta">Grade & Stream</div>
          <input type="hidden" id="tsModalStudentId" />
          <input type="hidden" id="tsModalStudentGrade" />
        </div>

        <!-- Pathway Selector for Senior School -->
        <div id="tsModalPathwaySec" style="display: none; margin-bottom: 14px;">
          <label style="font-size: 12.5px; font-weight: 600; color: var(--text-main); margin-bottom: 5px; display: block;">Senior School Pathway</label>
          <select id="tsModalPathwaySelect" class="form-select" onchange="renderTeacherSubjectCheckboxes()">
            <option value="STEM">🔬 STEM Pathway</option>
            <option value="HUMANITIES">📜 Social Sciences / Humanities Pathway</option>
            <option value="ARTS_SPORTS">🎨 Arts & Sports Science Pathway</option>
          </select>
        </div>

        <label style="font-size: 12.5px; font-weight: 600; color: var(--text-main); margin-bottom: 6px; display: block;">Enrolled Subjects</label>
        <div id="tsModalSubjectList" style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; padding: 6px; border: 1px solid var(--border-warm); border-radius: 10px; background: #FAFAFA; margin-bottom: 16px;">
          <!-- Dynamically populated -->
        </div>

        <div id="tsModalFeedback" style="display: none; padding: 10px 12px; border-radius: 8px; font-size: 12.5px; margin-bottom: 14px;"></div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" onclick="closeTeacherSubjectModal()" style="background: var(--bg-cream); border: 1px solid var(--border-warm); border-radius: 10px; padding: 10px 18px; font-weight: 600; color: var(--text-sub); cursor: pointer;">Cancel</button>
          <button type="button" class="btn-primary" id="btnSaveTeacherSubjects" onclick="submitTeacherSubjectChange()" style="width: auto; padding: 10px 22px; margin-top: 0;">Save Subjects ✓</button>
        </div>
      </div>
    </div>

  </main>
  </div>

  <script>
    let activeTeacher = null;
    let activeSchool = null;
    let activeStreams = [];
    let currentSelectedStream = null;
    let generatedItemsCache = [];

    function getTeacherToken() {
      return localStorage.getItem('elingu_mwalimu_token') || '';
    }

    function getAuthHeaders() {
      const token = getTeacherToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      return headers;
    }

    // Check if teacher is cached in localStorage
    window.addEventListener('DOMContentLoaded', () => {
      const savedTeacher = localStorage.getItem('elingu_mwalimu_session');
      if (savedTeacher) {
        try {
          activeTeacher = JSON.parse(savedTeacher);
          loadDashboardData();
        } catch (e) {
          localStorage.removeItem('elingu_mwalimu_session');
          localStorage.removeItem('elingu_mwalimu_token');
        }
      }
    });

    function switchAuthTab(tab) {
      document.getElementById('tabBtnLogin').classList.toggle('active', tab === 'login');
      document.getElementById('tabBtnReg').classList.toggle('active', tab === 'register');
      document.getElementById('tabBtnSchool').classList.toggle('active', tab === 'school');

      document.getElementById('formLogin').style.display = tab === 'login' ? 'block' : 'none';
      document.getElementById('formRegister').style.display = tab === 'register' ? 'block' : 'none';
      document.getElementById('formSchool').style.display = tab === 'school' ? 'block' : 'none';
    }

    function toggleRegAssignment(role) {
      const box = document.getElementById('regAssignmentBox');
      if (box) box.style.display = (role === 'school_admin') ? 'none' : 'block';
    }

    async function handleTeacherLogin(e) {
      e.preventDefault();
      const id = document.getElementById('loginId').value.trim();
      const pass = document.getElementById('loginPass').value;
      const fb = document.getElementById('loginFeedback');
      const btn = document.getElementById('btnLoginSubmit');

      btn.disabled = true;
      btn.textContent = 'Verifying... ⏳';
      fb.style.display = 'none';

      try {
        const res = await fetch('/api/teacher/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: id, password: pass })
        });
        const data = await res.json();
        if (data.success) {
          activeTeacher = data.teacher;
          localStorage.setItem('elingu_mwalimu_session', JSON.stringify(activeTeacher));
          if (data.token) localStorage.setItem('elingu_mwalimu_token', data.token);
          loadDashboardData();
        } else {
          fb.style.display = 'block';
          fb.textContent = data.error || 'Login failed.';
        }
      } catch (err) {
        fb.style.display = 'block';
        fb.textContent = 'Network error during login.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In to Dashboard 🚀';
      }
    }

    async function handleTeacherRegister(e) {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const idNumber = document.getElementById('regIdNumber').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const phone = document.getElementById('regPhone').value.trim();
      const adminCode = document.getElementById('regAdminCode').value.trim();
      const role = document.getElementById('regRole').value;
      const password = document.getElementById('regPassword').value;

      let assignments = [];
      if (role !== 'school_admin') {
        const grade = parseInt(document.getElementById('regGrade').value);
        const stream = document.getElementById('regStreamName').value.trim();
        const subject = document.getElementById('regSubject').value;
        if (grade && stream) {
          assignments.push({ grade, stream, subjects: [subject] });
        }
      }

      const fb = document.getElementById('regFeedback');
      fb.style.display = 'none';

      try {
        const res = await fetch('/api/teacher/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, idNumber, email, phone, adminCode, role, password, assignments })
        });
        const data = await res.json();
        if (data.success) {
          if (data.token) localStorage.setItem('elingu_mwalimu_token', data.token);
          alert('Hongera Mwalimu! Account created for ' + data.schoolName + '. Please log in now.');
          switchAuthTab('login');
        } else {
          fb.style.display = 'block';
          fb.textContent = data.error || 'Registration failed.';
        }
      } catch (err) {
        fb.style.display = 'block';
        fb.textContent = 'Network error during registration.';
      }
    }

    async function handleSchoolCreate(e) {
      e.preventDefault();
      const name = document.getElementById('schName').value.trim();
      const county = document.getElementById('schCounty').value.trim();
      const adminCode = document.getElementById('schAdminCode').value.trim();
      const grades = [];
      const checkboxes = document.querySelectorAll('#schGradesContainer input[type="checkbox"]:checked');
      if (checkboxes.length > 0) {
        checkboxes.forEach(cb => {
          const val = parseInt(cb.id.replace('schG', ''));
          if (!isNaN(val) && !grades.includes(val)) grades.push(val);
        });
      } else {
        if (document.getElementById('schG6')?.checked) grades.push(6);
        if (document.getElementById('schG7')?.checked) grades.push(7);
        if (document.getElementById('schG8')?.checked) grades.push(8);
        if (document.getElementById('schG9')?.checked) grades.push(9);
      }

      const streamList = document.getElementById('schStreams').value.split(',').map(s => s.trim()).filter(Boolean);
      const streams = {};
      grades.forEach(g => streams[g] = streamList);

      const fb = document.getElementById('schFeedback');
      fb.style.display = 'none';

      try {
        const res = await fetch('/api/school/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, county, adminCode, grades, streams })
        });
        const data = await res.json();
        if (data.success) {
          alert('School successfully provisioned!\\nAdmin Code: ' + data.school.adminCode + '\\nShare this code with your teachers.');
          switchAuthTab('register');
          document.getElementById('regAdminCode').value = data.school.adminCode;
        } else {
          fb.style.display = 'block';
          fb.textContent = data.error || 'School creation failed.';
        }
      } catch (err) {
        fb.style.display = 'block';
        fb.textContent = 'Network error creating school.';
      }
    }

    async function loadDashboardData() {
      if (!activeTeacher) return;
      try {
        const res = await fetch('/api/teacher/dashboard-data?teacherId=' + activeTeacher.id, {
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!data.success) {
          logoutTeacher();
          return;
        }

        activeTeacher = data.teacher;
        activeSchool = data.school;
        activeStreams = data.streams || [];

        // Update UI
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('dashboardSection').style.display = 'block';
        document.getElementById('navUserArea').style.display = 'flex';
        document.getElementById('userPillText').textContent = activeTeacher.name + ' (' + (activeTeacher.role === 'school_admin' ? 'Headteacher' : 'Teacher') + ')';

        document.getElementById('dashSchoolName').textContent = activeTeacher.schoolName;
        document.getElementById('dashTeacherRole').textContent = activeTeacher.role === 'school_admin'
          ? 'School Administrator / Headteacher • Full School Access'
          : (activeTeacher.name + ' • ' + (activeStreams[0] ? ('Grade ' + activeStreams[0].grade + ' ' + activeStreams[0].stream) : 'Subject Teacher'));

        // Show directory tab if headteacher
        if (activeTeacher.role === 'school_admin') {
          document.getElementById('tabDirectory').style.display = 'flex';
        }

        // Populate Stream Selector
        const sel = document.getElementById('streamSelector');
        sel.innerHTML = '';
        activeStreams.forEach((st, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = 'Grade ' + st.grade + ' ' + st.stream + ' (' + st.studentCount + ' learners)';
          sel.appendChild(opt);
        });

        if (activeStreams.length > 0) {
          switchActiveStream(0);
        }

        renderMissionsList(data.missions || []);
        renderSchoolDirectory();
      } catch (e) {
        console.error('Error loading dashboard data:', e);
      }
    }

    function switchActiveStream(idx) {
      currentSelectedStream = activeStreams[idx];
      if (!currentSelectedStream) return;

      document.getElementById('chalkboardCodeDisplay').textContent = currentSelectedStream.joinCode || '---';
      document.getElementById('rosterCount').textContent = currentSelectedStream.studentCount || 0;

      // Render Roster
      const rosterList = document.getElementById('rosterList');
      if (!currentSelectedStream.students || currentSelectedStream.students.length === 0) {
        rosterList.innerHTML = '<p style="font-size: 13px; color: var(--slate-600);">No learners registered in this stream yet. Have them enter join code <strong>' + currentSelectedStream.joinCode + '</strong>.</p>';
      } else {
        rosterList.innerHTML = currentSelectedStream.students.map(s => {
          const sid = s.id;
          const tok = encodeURIComponent(getTeacherToken());
          return \`
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--slate-100); flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">\${s.avatar || '🦁'}</span>
              <div>
                <strong style="font-size: 13.5px; color: var(--slate-900);">\${s.handle}</strong>
                <div style="font-size: 11.5px; color: var(--slate-600);">Turns: \${s.totalTurns || 0} • Active: \${new Date(s.lastActive).toLocaleDateString()}</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button type="button" onclick="openTeacherSubjectModal('\${sid}')" class="btn-primary" style="background: var(--bg-cream); color: var(--primary); border: 1px solid var(--border-warm); text-decoration: none; padding: 4px 10px; font-size: 11.5px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; width: auto; cursor: pointer; font-weight: 600;">
                📚 Subjects
              </button>
              <a href="/api/reports/student-summary?studentId=\${sid}&format=print&token=\${tok}" target="_blank" class="btn-primary" style="background: var(--slate-100); color: var(--slate-800); border: 1px solid var(--slate-300); text-decoration: none; padding: 4px 10px; font-size: 11.5px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; width: auto;">
                🖨️ Report Card
              </a>
              <a href="/api/reports/student-summary?studentId=\${sid}&format=csv&token=\${tok}" target="_blank" class="btn-primary" style="background: var(--slate-100); color: var(--slate-800); border: 1px solid var(--slate-300); text-decoration: none; padding: 4px 10px; font-size: 11.5px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; width: auto;">
                📄 CSV
              </a>
              <span class="badge badge-open">Active</span>
            </div>
          </div>
        \`;
        }).join('');
      }
    }

    function switchPortalTab(tab) {
      document.getElementById('tabMissions').classList.toggle('active', tab === 'missions');
      document.getElementById('tabCreate').classList.toggle('active', tab === 'create');
      document.getElementById('tabRoster').classList.toggle('active', tab === 'roster');
      document.getElementById('tabDirectory').classList.toggle('active', tab === 'directory');

      document.getElementById('viewMissions').style.display = tab === 'missions' ? 'block' : 'none';
      document.getElementById('viewCreate').style.display = tab === 'create' ? 'block' : 'none';
      document.getElementById('viewRoster').style.display = tab === 'roster' ? 'block' : 'none';
      document.getElementById('viewDirectory').style.display = tab === 'directory' ? 'block' : 'none';
    }

    function renderMissionsList(missions) {
      const container = document.getElementById('missionsListContainer');
      document.getElementById('missionCountBadge').textContent = missions.length + ' active';

      if (!missions || missions.length === 0) {
        container.innerHTML = '<p style="font-size: 13.5px; color: var(--slate-600);">No missions currently pushed to this stream.</p>';
        return;
      }

      container.innerHTML = missions.map(m => \`
        <div class="mission-item-card">
          <div class="mission-header">
            <span class="mission-title">\${m.title}</span>
            <span class="badge badge-\${m.hintMode}">\${m.hintMode.toUpperCase()} HINTS</span>
          </div>
          <div style="font-size: 12.5px; color: var(--slate-600); margin-bottom: 8px;">
            Grade \${m.grade} \${m.stream} • \${m.subject} • \${m.strand}
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--primary);">
            <span>Submissions: \${m.totalSubmissions}</span>
            <span>Items: \${m.itemsCount}</span>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
            <button type="button" class="btn-primary" style="padding: 6px 14px; font-size: 12.5px; width: auto;" onclick="inspectProcessTrails('\${m.id}')">
              🔍 Inspect Process Trails
            </button>
            <a href="/api/reports/stream-summary?schoolId=\${activeTeacher ? activeTeacher.schoolId : ''}&grade=\${m.grade}&stream=\${encodeURIComponent(m.stream)}&subject=\${encodeURIComponent(m.subject)}&format=csv&token=\${encodeURIComponent(getTeacherToken())}" target="_blank" class="btn-primary" style="background: var(--slate-700); text-decoration: none; padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; width: auto;">
              📄 Export CSV
            </a>
            <a href="/api/reports/stream-summary?schoolId=\${activeTeacher ? activeTeacher.schoolId : ''}&grade=\${m.grade}&stream=\${encodeURIComponent(m.stream)}&subject=\${encodeURIComponent(m.subject)}&format=print&token=\${encodeURIComponent(getTeacherToken())}" target="_blank" class="btn-primary" style="background: var(--slate-700); text-decoration: none; padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; width: auto;">
              🖨️ Print Report
            </a>
          </div>
        </div>
      \`).join('');
    }

    async function inspectProcessTrails(missionId) {
      try {
        const res = await fetch('/api/mission/' + missionId + '/analytics', {
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!data.success) return alert('Could not load mission analytics.');

        const a = data.analytics;
        document.getElementById('trailModalTitle').textContent = 'Process Trails: ' + a.title + ' (Grade ' + a.grade + ' ' + a.stream + ')';
        
        let bodyHtml = \`
          <div style="margin-bottom: 16px;">
            <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px;">CBE Distribution across \${a.totalSubmissions} learner(s):</div>
            <div class="cbe-bar-track">
              <div class="cbe-seg-ee" style="width: \${a.cbeDistribution.EE}%;"></div>
              <div class="cbe-seg-me" style="width: \${a.cbeDistribution.ME}%;"></div>
              <div class="cbe-seg-ae" style="width: \${a.cbeDistribution.AE}%;"></div>
              <div class="cbe-seg-be" style="width: \${a.cbeDistribution.BE}%;"></div>
            </div>
            <div class="cbe-legend">
              <span class="legend-item"><span class="dot-ee"></span> EE: \${a.cbeDistribution.EE}%</span>
              <span class="legend-item"><span class="dot-me"></span> ME: \${a.cbeDistribution.ME}%</span>
              <span class="legend-item"><span class="dot-ae"></span> AE: \${a.cbeDistribution.AE}%</span>
              <span class="legend-item"><span class="dot-be"></span> BE: \${a.cbeDistribution.BE}%</span>
            </div>
          </div>
        \`;

        if (a.studentTrails.length === 0) {
          bodyHtml += '<p style="font-size: 13px; color: var(--slate-600);">No student submissions recorded for this mission yet.</p>';
        } else {
          bodyHtml += '<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 14px;">';
          a.studentTrails.forEach(tr => {
            bodyHtml += \`
              <div style="border: 1px solid var(--slate-200); border-radius: 12px; padding: 14px; background: var(--slate-50);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong style="font-size: 14px; color: var(--slate-900);">\${tr.studentHandle}</strong>
                  <span class="badge" style="background: #059669; color: #fff;">Overall: \${tr.overallCBE}</span>
                </div>
                <div style="font-size: 12px; color: var(--slate-600);">
                  Started: \${new Date(tr.startedAt).toLocaleTimeString()} • Completed: \${tr.completedAt ? new Date(tr.completedAt).toLocaleTimeString() : 'In Progress'}
                </div>
                <div style="margin-top: 8px;">
                  \${Object.entries(tr.items).map(([qId, item]) => \`
                    <div style="font-size: 12.5px; padding: 6px 0; border-top: 1px solid var(--slate-200);">
                      <strong>\${qId.toUpperCase()}:</strong> Attempts: \${item.attempts.length} • Hints: \${item.hintsUsed.length} • Arc: <em>\${item.evolutionArc}</em> • Level: <strong>\${item.cbeLevel}</strong>
                      <div style="font-size: 11.5px; color: var(--slate-600); margin-top: 2px;">
                        \${item.attempts.map((att, aIdx) => \`
                          <span style="display: inline-block; margin-right: 8px; color: \${att.correct ? '#059669' : '#DC2626'};">
                            Attempt \${aIdx + 1}: "\${att.answer}" \${att.correct ? '✓' : '✗'}
                          </span>
                        \`).join('')}
                      </div>
                    </div>
                  \`).join('')}
                </div>
              </div>
            \`;
          });
          bodyHtml += '</div>';
        }

        document.getElementById('trailModalBody').innerHTML = bodyHtml;
        document.getElementById('trailModal').style.display = 'flex';
      } catch (e) {
        alert('Error fetching process trail data.');
      }
    }

    function closeTrailModal() {
      document.getElementById('trailModal').style.display = 'none';
    }

    async function generateAiQuiz() {
      const subject = document.getElementById('genSubject').value;
      const strand = document.getElementById('genStrand').value.trim() || 'Core Competency';
      const difficulty = document.getElementById('genDifficulty').value;
      const count = document.getElementById('genCount').value;
      const btn = document.getElementById('btnGenerateAiQuiz');

      btn.disabled = true;
      btn.textContent = 'Generating CBE Items with AI... ⏳';

      try {
        const grade = currentSelectedStream ? currentSelectedStream.grade : 8;
        const res = await fetch('/api/mission/generate', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ grade, subject, strand, difficulty, count })
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.items)) {
          generatedItemsCache = data.items;
          renderQuizEditor(data.items);
        } else {
          alert('Failed to generate quiz items.');
        }
      } catch (e) {
        alert('Network error generating quiz items.');
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ Draft Questions with AI';
      }
    }

    function renderQuizEditor(items) {
      generatedItemsCache = items || [];
      const container = document.getElementById('quizItemsContainer');
      
      let html = '';
      generatedItemsCache.forEach((item, idx) => {
        const isMcq = (item.answerMode === 'mcq' || item.answerMode === 'comprehension_mcq');
        const opts = item.mcqOptions || ['Option A', 'Option B', 'Option C', 'Option D'];
        const correctIdx = item.mcqCorrectIndex !== null && item.mcqCorrectIndex !== undefined ? item.mcqCorrectIndex : 0;
        const variants = (item.acceptableVariants || []).join(', ');
        const hints = item.hintSequence || ['Think about the core principle.', 'Review your calculation steps.'];

        html += \`
        <div class="question-edit-card" id="qCard_\${idx}" style="border: 1px solid var(--slate-200); border-radius: 12px; padding: 18px; margin-bottom: 16px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 14.5px; color: var(--primary);">Question \${idx + 1}</strong>
              <select id="qDiff_\${idx}" class="form-select" style="width: auto; padding: 3px 8px; font-size: 12px;" onchange="updateItemDifficulty(\${idx}, this.value)">
                <option value="EE" \${item.difficulty === 'EE' ? 'selected' : ''}>EE (Exceeding)</option>
                <option value="ME" \${item.difficulty === 'ME' ? 'selected' : ''}>ME (Meeting)</option>
                <option value="AE" \${item.difficulty === 'AE' ? 'selected' : ''}>AE (Approaching)</option>
                <option value="BE" \${item.difficulty === 'BE' ? 'selected' : ''}>BE (Below)</option>
              </select>
            </div>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn-logout" style="color: var(--primary); border-color: var(--slate-300); font-size: 12px; padding: 4px 10px;" onclick="regenerateSingleItem(\${idx})">
                🔄 AI Regenerate
              </button>
              <button type="button" class="btn-logout" style="color: #DC2626; border-color: #FCA5A5; font-size: 12px; padding: 4px 10px;" onclick="removeQuizItem(\${idx})">
                🗑️ Delete
              </button>
            </div>
          </div>

          <label class="form-label">Question Text (Editable)</label>
          <textarea id="qText_\${idx}" class="form-input" style="height: 70px; margin-bottom: 12px;" onchange="syncItemText(\${idx})">\${item.question}</textarea>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label class="form-label">Answer Mode</label>
              <select id="qMode_\${idx}" class="form-select" onchange="changeItemMode(\${idx}, this.value)">
                <option value="numeric" \${item.answerMode === 'numeric' ? 'selected' : ''}>Numeric (Number/Fraction)</option>
                <option value="mcq" \${isMcq ? 'selected' : ''}>Multiple Choice (MCQ)</option>
                <option value="step_by_step" \${item.answerMode === 'step_by_step' ? 'selected' : ''}>Step-by-Step</option>
                <option value="short_answer" \${item.answerMode === 'short_answer' ? 'selected' : ''}>Short Answer</option>
                <option value="true_false" \${item.answerMode === 'true_false' ? 'selected' : ''}>True / False</option>
                <option value="fill_blank" \${item.answerMode === 'fill_blank' ? 'selected' : ''}>Fill in the Blank</option>
                <option value="translation" \${item.answerMode === 'translation' ? 'selected' : ''}>Translation (Kiswahili/English)</option>
                <option value="grammar_correction" \${item.answerMode === 'grammar_correction' ? 'selected' : ''}>Grammar Correction</option>
              </select>
            </div>
            <div>
              <label class="form-label">Primary Expected Answer</label>
              <input type="text" id="qAns_\${idx}" class="form-input" value="\${item.expectedAnswer}" onchange="syncItemAnswer(\${idx})" />
            </div>
          </div>

          <!-- MCQ Options Section -->
          <div id="qMcqSection_\${idx}" style="display: \${isMcq ? 'block' : 'none'}; background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
            <label class="form-label" style="margin-bottom: 6px;">Multiple Choice Options (Select radio next to correct option):</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              \${opts.map((opt, oIdx) => \`
                <div style="display: flex; align-items: center; gap: 6px;">
                  <input type="radio" name="mcq_correct_\${idx}" value="\${oIdx}" \${oIdx === correctIdx ? 'checked' : ''} onchange="setMcqCorrect(\${idx}, \${oIdx})" />
                  <input type="text" class="form-input" style="padding: 6px 10px; font-size: 13px;" id="mcq_opt_\${idx}_\${oIdx}" value="\${opt}" onchange="syncMcqOption(\${idx}, \${oIdx}, this.value)" placeholder="Option \${String.fromCharCode(65 + oIdx)}" />
                </div>
              \`).join('')}
            </div>
          </div>

          <!-- Acceptable Equivalents -->
          <div style="margin-bottom: 12px;">
            <label class="form-label">Acceptable Equivalents / Variants (comma-separated)</label>
            <input type="text" id="qVariants_\${idx}" class="form-input" value="\${variants}" placeholder="e.g. 7/12, seven twelfths, 0.58" onchange="syncVariants(\${idx}, this.value)" />
          </div>

          <!-- Socratic Hints -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label class="form-label">Socratic Hint 1 (Guiding Question)</label>
              <input type="text" id="qHint1_\${idx}" class="form-input" value="\${hints[0] || ''}" onchange="syncHint(\${idx}, 0, this.value)" />
            </div>
            <div>
              <label class="form-label">Socratic Hint 2 (Scaffold)</label>
              <input type="text" id="qHint2_\${idx}" class="form-input" value="\${hints[1] || ''}" onchange="syncHint(\${idx}, 1, this.value)" />
            </div>
          </div>

          <!-- Optional Diagram/Figure Note -->
          <div>
            <label class="form-label">Optional Figure Note / Diagram (Text description, ASCII art, or Image URL - Free)</label>
            <input type="text" id="qDiagram_\${idx}" class="form-input" value="\${item.diagramUrl || ''}" placeholder="Optional text note or image URL" onchange="syncDiagram(\${idx}, this.value)" />
          </div>
        </div>
        \`;
      });

      html += \`
        <div style="margin-bottom: 16px;">
          <button type="button" class="btn-logout" style="color: var(--primary); border: 2px dashed var(--emerald); width: 100%; padding: 12px; font-weight: 700; border-radius: 10px; cursor: pointer; background: var(--emerald-light);" onclick="addBlankQuestion()">
            ➕ Add Custom Question (Write from scratch)
          </button>
        </div>
      \`;

      container.innerHTML = html;
      document.getElementById('quizEditorCard').style.display = 'block';
    }

    function syncItemText(idx) {
      if (generatedItemsCache[idx]) {
        generatedItemsCache[idx].question = document.getElementById('qText_' + idx).value.trim();
      }
    }
    function syncItemAnswer(idx) {
      if (generatedItemsCache[idx]) {
        generatedItemsCache[idx].expectedAnswer = document.getElementById('qAns_' + idx).value.trim();
      }
    }
    function updateItemDifficulty(idx, val) {
      if (generatedItemsCache[idx]) generatedItemsCache[idx].difficulty = val;
    }
    function changeItemMode(idx, mode) {
      if (!generatedItemsCache[idx]) return;
      generatedItemsCache[idx].answerMode = mode;
      const isMcq = (mode === 'mcq' || mode === 'comprehension_mcq');
      const mcqBox = document.getElementById('qMcqSection_' + idx);
      if (mcqBox) mcqBox.style.display = isMcq ? 'block' : 'none';
      if (isMcq && !generatedItemsCache[idx].mcqOptions) {
        generatedItemsCache[idx].mcqOptions = ['Option A', 'Option B', 'Option C', 'Option D'];
        generatedItemsCache[idx].mcqCorrectIndex = 0;
      }
    }
    function syncMcqOption(idx, oIdx, val) {
      if (generatedItemsCache[idx] && generatedItemsCache[idx].mcqOptions) {
        generatedItemsCache[idx].mcqOptions[oIdx] = val.trim();
      }
    }
    function setMcqCorrect(idx, oIdx) {
      if (generatedItemsCache[idx]) {
        generatedItemsCache[idx].mcqCorrectIndex = oIdx;
        if (generatedItemsCache[idx].mcqOptions) {
          generatedItemsCache[idx].expectedAnswer = generatedItemsCache[idx].mcqOptions[oIdx];
          const ansInput = document.getElementById('qAns_' + idx);
          if (ansInput) ansInput.value = generatedItemsCache[idx].expectedAnswer;
        }
      }
    }
    function syncVariants(idx, val) {
      if (generatedItemsCache[idx]) {
        generatedItemsCache[idx].acceptableVariants = val.split(',').map(v => v.trim()).filter(Boolean);
      }
    }
    function syncHint(idx, hIdx, val) {
      if (generatedItemsCache[idx]) {
        if (!generatedItemsCache[idx].hintSequence) generatedItemsCache[idx].hintSequence = [];
        generatedItemsCache[idx].hintSequence[hIdx] = val.trim();
      }
    }
    function syncDiagram(idx, val) {
      if (generatedItemsCache[idx]) {
        generatedItemsCache[idx].diagramUrl = val.trim() || null;
      }
    }
    function removeQuizItem(idx) {
      generatedItemsCache.splice(idx, 1);
      renderQuizEditor(generatedItemsCache);
    }
    function addBlankQuestion() {
      const newQ = {
        id: 'q' + (generatedItemsCache.length + 1),
        question: 'Type your custom question here...',
        answerMode: 'numeric',
        expectedAnswer: '',
        acceptableVariants: [],
        mcqOptions: ['A', 'B', 'C', 'D'],
        mcqCorrectIndex: 0,
        hintSequence: ['Think about the core formula or definition.'],
        difficulty: 'ME'
      };
      generatedItemsCache.push(newQ);
      renderQuizEditor(generatedItemsCache);
    }
    async function regenerateSingleItem(idx) {
      const subject = document.getElementById('genSubject').value;
      const strand = document.getElementById('genStrand').value.trim() || 'Core Competency';
      const grade = currentSelectedStream ? currentSelectedStream.grade : 8;
      const diff = document.getElementById('qDiff_' + idx)?.value || 'ME';

      try {
        const res = await fetch('/api/mission/generate-single-item', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ grade, subject, strand, difficulty: diff })
        });
        const data = await res.json();
        if (data.success && data.item) {
          generatedItemsCache[idx] = { ...data.item, id: 'q' + (idx + 1) };
          renderQuizEditor(generatedItemsCache);
        }
      } catch (e) {
        alert('Error regenerating item.');
      }
    }

    async function pushMissionToStream() {
      if (!currentSelectedStream) return alert('Please select a stream first.');
      const subject = document.getElementById('genSubject').value;
      const strand = document.getElementById('genStrand').value.trim() || 'Core Competency';
      const hintMode = document.querySelector('input[name="hintModeRadio"]:checked').value;

      if (generatedItemsCache.length === 0) {
        return alert('Please add or generate at least 1 question before pushing.');
      }

      // Collect finalized edited items
      const updatedItems = generatedItemsCache.map((item, idx) => ({
        ...item,
        question: (document.getElementById('qText_' + idx)?.value || item.question || '').trim(),
        answerMode: document.getElementById('qMode_' + idx)?.value || item.answerMode || 'short_answer',
        expectedAnswer: (document.getElementById('qAns_' + idx)?.value || item.expectedAnswer || '').trim(),
        acceptableVariants: item.acceptableVariants || [],
        hintSequence: item.hintSequence || []
      }));

      try {
        const res = await fetch('/api/mission/create', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            teacherId: activeTeacher.id,
            teacherName: activeTeacher.name,
            schoolId: activeTeacher.schoolId,
            grade: currentSelectedStream.grade,
            stream: currentSelectedStream.stream,
            subject,
            strand,
            title: strand + ' Check',
            hintMode,
            items: updatedItems
          })
        });
        const data = await res.json();
        if (data.success) {
          alert('Hongera! Live Mission pushed to Grade ' + currentSelectedStream.grade + ' ' + currentSelectedStream.stream + '! 🚀');
          document.getElementById('quizEditorCard').style.display = 'none';
          switchPortalTab('missions');
          loadDashboardData();
        } else {
          alert(data.error || 'Failed to push mission.');
        }
      } catch (e) {
        alert('Network error pushing mission.');
      }
    }

    function renderSchoolDirectory() {
      const container = document.getElementById('schoolDirectoryContainer');
      if (!activeSchool || !activeSchool.streams) return;

      let html = '<div style="display: flex; flex-direction: column; gap: 14px;">';
      for (const [grade, streamsList] of Object.entries(activeSchool.streams)) {
        html += \`
          <div style="border: 1px solid var(--border-warm); border-radius: 12px; padding: 16px; background: var(--bg-cream);">
            <strong style="font-size: 15px; color: var(--primary);">Grade \${grade}</strong>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px;">
              \${(streamsList || []).map(s => {
                const codeKey = grade + '_' + s;
                const code = (activeSchool.joinCodes && activeSchool.joinCodes[codeKey]) || '---';
                return \`
                  <div style="background: #fff; border: 1px solid var(--border-warm); border-radius: 8px; padding: 8px 14px;">
                    <div style="font-size: 13.5px; font-weight: 700; color: var(--text-main);">Stream \${s}</div>
                    <div style="font-size: 12px; color: var(--primary); font-weight: 600;">Join Code: \${code}</div>
                  </div>
                \`;
              }).join('')}
            </div>
          </div>
        \`;
      }
      html += '</div>';
      container.innerHTML = html;
    }

    function openBulkImportModal() {
      const modal = document.getElementById('bulkImportModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeBulkImportModal() {
      const modal = document.getElementById('bulkImportModal');
      if (modal) modal.style.display = 'none';
    }

    function submitBulkImport() {
      const textarea = document.getElementById('bulkImportTextarea');
      const raw = textarea ? textarea.value : '';
      if (!raw || !raw.trim()) return alert('Please enter at least one student row.');

      const lines = raw.split(/\\r?\\n/).map(l => l.trim()).filter(Boolean);
      const students = lines.map(line => {
        const parts = line.split(',').map(p => p.trim());
        return {
          name: parts[0],
          grade: parts[1] || currentSelectedStream?.grade || 8,
          stream: parts[2] || currentSelectedStream?.stream || 'East',
          parentPhone: parts[3] || ''
        };
      });

      if (students.length === 0) return alert('No student rows found.');

      fetch('/api/school/import-students', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ schoolId: activeTeacher.schoolId, students })
      })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          alert('Hongera! ' + d.created.length + ' students enrolled into your school! 🎉');
          textarea.value = '';
          closeBulkImportModal();
          loadDashboardData();
        } else {
          alert(d.error || 'Import failed.');
        }
      })
      .catch(() => alert('Network error during bulk import.'));
    }

    function downloadClassReport(format) {
      if (!currentSelectedStream || !activeTeacher) return alert('Please select a stream first.');
      const url = '/api/reports/stream-summary?schoolId=' + activeTeacher.schoolId +
        '&grade=' + currentSelectedStream.grade +
        '&stream=' + encodeURIComponent(currentSelectedStream.stream) +
        '&format=' + format +
        '&token=' + encodeURIComponent(getTeacherToken());
      window.open(url, '_blank');
    }

    function downloadSchoolAudit(format) {
      if (!activeTeacher || !activeTeacher.schoolId) return alert('No active school detected.');
      const url = '/api/reports/school-summary?schoolId=' + activeTeacher.schoolId +
        '&format=' + format +
        '&token=' + encodeURIComponent(getTeacherToken());
      window.open(url, '_blank');
    }

    // ── TEACHER SUBJECT MANAGEMENT MODAL LOGIC ──
    // Only active subjects currently implemented in Elingu's curriculum context:
    const TEACHER_JSS_SUBJECTS = ['Mathematics', 'English', 'Kiswahili', 'Science & Technology', 'Social Studies'];
    const TEACHER_SS_COMPULSORY = ['Core Mathematics', 'Essential Mathematics', 'Community Service Learning', 'English', 'Kiswahili'];
    const TEACHER_SS_PATHWAYS = {
      STEM: ['Physics', 'Chemistry', 'Biology', 'Computer Studies'],
      HUMANITIES: [],
      ARTS_SPORTS: []
    };

    let curTeacherStudentSubjects = [];
    let curTeacherStudentTier = 'free';

    function openTeacherSubjectModal(studentId) {
      if (!currentSelectedStream || !currentSelectedStream.students) return;
      const s = currentSelectedStream.students.find(item => item.id === studentId);
      if (!s) return alert('Learner not found in stream.');

      document.getElementById('tsModalStudentId').value = s.id;
      const grade = s.grade || currentSelectedStream.grade || 8;
      document.getElementById('tsModalStudentGrade').value = grade;
      document.getElementById('tsModalStudentName').textContent = s.handle;
      const isSenior = parseInt(grade, 10) >= 10;
      curTeacherStudentTier = s.subscriptionTier || 'free';
      const maxSubjects = (curTeacherStudentTier === 'free') ? 3 : 5;
      document.getElementById('tsModalStudentMeta').textContent = 'Grade ' + grade + ' (' + (isSenior ? 'Senior School' : 'Junior Secondary') + ') • Stream ' + (currentSelectedStream.stream || '') + ' • ' + curTeacherStudentTier.toUpperCase() + ' Plan (Max ' + maxSubjects + ' Subjects)';

      curTeacherStudentSubjects = Array.isArray(s.selectedSubjects) ? [...s.selectedSubjects] : [];

      const pSec = document.getElementById('tsModalPathwaySec');
      const pSel = document.getElementById('tsModalPathwaySelect');
      if (isSenior) {
        pSec.style.display = 'block';
        pSel.value = s.pathway || 'STEM';
      } else {
        pSec.style.display = 'none';
      }

      const fb = document.getElementById('tsModalFeedback');
      if (fb) fb.style.display = 'none';

      renderTeacherSubjectCheckboxes();

      const modal = document.getElementById('teacherSubjectModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeTeacherSubjectModal() {
      const modal = document.getElementById('teacherSubjectModal');
      if (modal) modal.style.display = 'none';
    }

    function renderTeacherSubjectCheckboxes() {
      const grade = parseInt(document.getElementById('tsModalStudentGrade').value, 10);
      const isSenior = grade >= 10;
      const tier = (curTeacherStudentTier || 'free').toLowerCase();
      const list = document.getElementById('tsModalSubjectList');
      list.innerHTML = '';

      let availableSubjects = [];
      if (!isSenior) {
        availableSubjects = TEACHER_JSS_SUBJECTS;
      } else {
        const pathway = document.getElementById('tsModalPathwaySelect').value || 'STEM';
        const electives = TEACHER_SS_PATHWAYS[pathway] || TEACHER_SS_PATHWAYS.STEM;
        availableSubjects = [...new Set([...TEACHER_SS_COMPULSORY, ...electives])];
      }

      const compulsoryList = isSenior ? TEACHER_SS_COMPULSORY : ['Mathematics', 'English', 'Kiswahili', 'Integrated Science', 'Science & Technology', 'Social Studies'];
      const compNorms = compulsoryList.map(c => c.toLowerCase());

      availableSubjects.forEach(s => {
        const isComp = compNorms.includes(s.toLowerCase());
        const isLocked = isSenior && TEACHER_SS_COMPULSORY.includes(s);
        const isChecked = curTeacherStudentSubjects.includes(s) || isLocked;

        const row = document.createElement('label');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '10px';
        row.style.padding = '8px 10px';
        row.style.background = isChecked ? '#ECFDF5' : '#FFFFFF';
        row.style.border = isChecked ? '1px solid #A7F3D0' : '1px solid #E2E8F0';
        row.style.borderRadius = '8px';
        row.style.cursor = isLocked ? 'default' : 'pointer';
        row.style.fontSize = '13px';
        row.style.fontWeight = isChecked ? '600' : '400';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = s;
        checkbox.checked = isChecked;
        if (isLocked) checkbox.disabled = true;

        checkbox.onchange = function() {
          const fb = document.getElementById('tsModalFeedback');
          if (fb) fb.style.display = 'none';

          if (checkbox.checked) {
            if (tier === 'free') {
              const compChosen = curTeacherStudentSubjects.filter(x => compNorms.includes(x.toLowerCase()));
              const elecChosen = curTeacherStudentSubjects.filter(x => !compNorms.includes(x.toLowerCase()));
              if (!isComp && elecChosen.length >= 1) {
                checkbox.checked = false;
                fb.style.display = 'block';
                fb.style.background = '#FEF2F2';
                fb.style.color = '#991B1B';
                fb.textContent = 'Free Plan allows only 1 elective. Advise parent to upgrade to Standard for 2 electives or Premium for all electives.';
                return;
              }
              if (isComp && compChosen.length >= 2) {
                checkbox.checked = false;
                fb.style.display = 'block';
                fb.style.background = '#FEF2F2';
                fb.style.color = '#991B1B';
                fb.textContent = 'Free Plan allows 2 compulsory subjects. Advise parent to upgrade to Standard for all compulsory subjects.';
                return;
              }
              if (curTeacherStudentSubjects.length >= 3) {
                checkbox.checked = false;
                fb.style.display = 'block';
                fb.style.background = '#FEF2F2';
                fb.style.color = '#991B1B';
                fb.textContent = 'Free Plan allows up to 3 subjects (2 compulsory + 1 elective).';
                return;
              }
            } else if (tier === 'standard') {
              // Standard allows all compulsory + up to 2 electives
              if (!isComp) {
                const elecChosen = curTeacherStudentSubjects.filter(x => !compNorms.includes(x.toLowerCase()));
                if (elecChosen.length >= 2) {
                  checkbox.checked = false;
                  fb.style.display = 'block';
                  fb.style.background = '#FEF2F2';
                  fb.style.color = '#991B1B';
                  fb.textContent = 'Standard Plan offers all compulsory subjects + 2 electives. Upgrade to Premium for ALL electives in this pathway!';
                  return;
                }
              }
            }
            // Premium or School: all electives in pathway!
            if (!curTeacherStudentSubjects.includes(s)) curTeacherStudentSubjects.push(s);
          } else {
            curTeacherStudentSubjects = curTeacherStudentSubjects.filter(item => item !== s);
          }
          renderTeacherSubjectCheckboxes();
        };

        const span = document.createElement('span');
        span.textContent = s + (isComp ? ' (Compulsory)' : ' (Elective)');
        if (isComp) span.style.color = 'var(--primary)';

        row.appendChild(checkbox);
        row.appendChild(span);
        list.appendChild(row);
      });
    }

    async function submitTeacherSubjectChange() {
      const studentId = document.getElementById('tsModalStudentId').value;
      const grade = parseInt(document.getElementById('tsModalStudentGrade').value, 10);
      const isSenior = grade >= 10;
      const pathway = isSenior ? document.getElementById('tsModalPathwaySelect').value : null;
      const fb = document.getElementById('tsModalFeedback');
      const btn = document.getElementById('btnSaveTeacherSubjects');

      const checkboxes = document.querySelectorAll('#tsModalSubjectList input[type="checkbox"]:checked');
      const chosen = Array.from(checkboxes).map(c => c.value);

      const maxSubjects = (curTeacherStudentTier === 'free') ? 3 : 5;

      if (chosen.length === 0) {
        fb.style.display = 'block';
        fb.style.background = '#FEF2F2';
        fb.style.color = '#991B1B';
        fb.textContent = 'Please select at least one subject.';
        return;
      }

      if (chosen.length > maxSubjects) {
        fb.style.display = 'block';
        fb.style.background = '#FEF2F2';
        fb.style.color = '#991B1B';
        fb.textContent = 'Maximum ' + maxSubjects + ' subjects allowed on the ' + curTeacherStudentTier.toUpperCase() + ' plan.';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Saving... ⏳';
      fb.style.display = 'none';

      try {
        const res = await fetch('/api/teacher/update-student-subjects', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            studentId,
            selectedSubjects: chosen,
            pathway
          })
        });

        const data = await res.json();
        btn.disabled = false;
        btn.textContent = 'Save Subjects ✓';

        fb.style.display = 'block';
        if (data.success) {
          fb.style.background = '#ECFDF5';
          fb.style.border = '1px solid #A7F3D0';
          fb.style.color = '#065F46';
          fb.innerHTML = '✓ ' + data.message;
          setTimeout(() => {
            closeTeacherSubjectModal();
            loadDashboardData(); // Reload live stream student data
          }, 1500);
        } else {
          fb.style.background = '#FEF2F2';
          fb.style.border = '1px solid #FECACA';
          fb.style.color = '#991B1B';
          fb.textContent = data.error || 'Failed to update subjects.';
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Save Subjects ✓';
        fb.style.display = 'block';
        fb.style.background = '#FEF2F2';
        fb.style.border = '1px solid #FECACA';
        fb.style.color = '#991B1B';
        fb.textContent = 'Network error saving subjects.';
      }
    }

    function logoutTeacher() {
      localStorage.removeItem('elingu_mwalimu_session');
      localStorage.removeItem('elingu_mwalimu_token');
      activeTeacher = null;
      document.getElementById('authSection').style.display = 'block';
      document.getElementById('dashboardSection').style.display = 'none';
      document.getElementById('navUserArea').style.display = 'none';
    }

    function toggleTheme() {
      const isDark = document.body.classList.toggle('theme-dark');
      localStorage.setItem('elingTheme', isDark ? 'dark' : 'light');
      const btn = document.getElementById('themeToggleBtn');
      if (btn) btn.innerHTML = isDark ? '\u2600\uFE0F Light' : '\uD83C\uDF19 Dark';
    }
    (function() {
      const saved = localStorage.getItem('elingTheme');
      if (saved === 'dark') {
        document.body.classList.add('theme-dark');
        const btn = document.getElementById('themeToggleBtn');
        if (btn) btn.innerHTML = '\u2600\uFE0F Light';
      }
    })();
  </script>
</body>
</html>`);
  });

  return router;
};
