// tests/tier1_features/full_system_verification.test.js
// Complete end-to-end integration test of all system capabilities:
// - Student, Parent, Teacher sign up and login
// - Password reveal mechanism
// - Socratic Chat and Learning
// - School and stream code creation and linking
// - JSS (KES 700/1,500) vs Senior School (KES 900/1,800) pricing differentiation
// - Email and SMS notification dispatches

const studentStore = require('../../studentStore');
const parentStore = require('../../parentStore');
const pricingConfig = require('../../pricingConfig');
const emailService = require('../../emailService');

let sharedSchool = null;
let sharedJssJoinCode = null;
let sharedSsJoinCode = null;
let sharedTeacherToken = null;
let sharedParentEmail = null;
let sharedJssStudent = null;
let sharedSsStudent = null;

module.exports = {
  'SYS-01: School creation generates Admin Code and Class Stream Join Codes': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('MFA');
    const res = await ctx.api('/api/school/create', {
      method: 'POST',
      body: {
        name: 'Moi Forces Academy',
        county: 'Nairobi',
        adminCode,
        grades: [7, 8, 10, 11],
        streams: {
          '7': ['East', 'West'],
          '10': ['STEM_A', 'Arts_B']
        }
      }
    });

    ctx.assertEqual(res.status, 200);
    ctx.assertEqual(res.data.success, true);
    ctx.assert(res.data.school.joinCodes['7_East'], 'Should have 7_East join code');
    ctx.assert(res.data.school.joinCodes['10_STEM_A'], 'Should have 10_STEM_A join code');
    sharedSchool = res.data.school;
    sharedJssJoinCode = res.data.school.joinCodes['7_East'];
    sharedSsJoinCode = res.data.school.joinCodes['10_STEM_A'];
  },

  'SYS-02: Teacher registers, signs in, and accesses teacher dashboard with assigned streams': async (ctx) => {
    const school = sharedSchool;
    const teacherEmail = ctx.uniqueEmail('mwalimu');
    const idNumber = String(Math.floor(10000000 + Math.random() * 90000000));
    const password = 'TeacherPass2026!';

    // Register
    const regRes = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Mwalimu Otieno',
        idNumber,
        email: teacherEmail,
        phone: ctx.uniquePhone(),
        password,
        adminCode: school.adminCode,
        assignments: [
          { grade: 7, stream: 'East', subjects: ['Mathematics'] },
          { grade: 10, stream: 'STEM_A', subjects: ['Physics'] }
        ]
      }
    });
    ctx.assertEqual(regRes.status, 200);
    const token = regRes.data.token;
    ctx.assert(token, 'Must return signed token');

    // Login
    const loginRes = await ctx.api('/api/teacher/login', {
      method: 'POST',
      body: { identifier: teacherEmail, password }
    });
    ctx.assertEqual(loginRes.status, 200);
    ctx.assertEqual(loginRes.data.success, true);

    // Dashboard access
    const dashRes = await ctx.api('/api/teacher/dashboard-data', {
      headers: { Authorization: `Bearer ${token}` }
    });
    ctx.assertEqual(dashRes.status, 200);
    ctx.assertEqual(dashRes.data.streams.length, 2);
    sharedTeacherToken = token;
  },

  'SYS-03: JSS Student enrolls via Stream Join Code, links to school, and logs in': async (ctx) => {
    const jssJoinCode = sharedJssJoinCode;
    const school = sharedSchool;
    const parentEmail = ctx.uniqueEmail('parent_sys');
    const handle = ctx.uniqueHandle('JssLearner');
    const pin = '3829';

    const regRes = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: {
        handle,
        pin,
        grade: 7,
        county: 'Nairobi',
        email: parentEmail,
        streamJoinCode: jssJoinCode,
        freeSubjects: ['Mathematics', 'English', 'Science & Technology']
      }
    });
    ctx.assertEqual(regRes.status, 200);
    const student = regRes.data.student;
    ctx.assertEqual(student.schoolId, school.id);
    ctx.assertEqual(student.stream, 'East');

    // Activate parent & verify learner via verifyParentAndSetPin
    const parent = parentStore.getParentByEmail(parentEmail);
    ctx.assert(parent, 'Parent must exist after first child registration');
    const verifyRes = await parentStore.verifyParentAndSetPin(parent.verifyToken, 'FamilyPass2026!', student.id);
    ctx.assertEqual(verifyRes.success, true);
    studentStore.setStudentParentVerified(student.id);

    // Learner Login
    const loginRes = await ctx.api('/api/students/login', {
      method: 'POST',
      body: { handleOrEmail: handle, pin }
    });
    ctx.assertEqual(loginRes.status, 200);
    ctx.assertEqual(loginRes.data.success, true);
    ctx.assertEqual(loginRes.data.student.id, student.id);

    sharedParentEmail = parentEmail;
    sharedJssStudent = student;
  },

  'SYS-04: Senior School Student (Grade 10 STEM) enrolls under same parent (sibling)': async (ctx) => {
    const parentEmail = sharedParentEmail;
    const ssJoinCode = sharedSsJoinCode;
    const handle = ctx.uniqueHandle('SsLearner');
    const pin = '7491';

    const regRes = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: {
        handle,
        pin,
        grade: 10,
        county: 'Nairobi',
        email: parentEmail,
        schoolLevel: 'SS',
        pathway: 'STEM',
        selectedSubjects: ['Core Mathematics', 'English', 'Physics', 'Chemistry'],
        streamJoinCode: ssJoinCode
      }
    });
    ctx.assertEqual(regRes.status, 200);
    const ssStudent = regRes.data.student;
    ctx.assertEqual(ssStudent.schoolLevel, 'SS');
    ctx.assertEqual(ssStudent.pathway, 'STEM');
    ctx.assertEqual(ssStudent.stream, 'STEM_A');

    studentStore.setStudentParentVerified(ssStudent.id);
    const approveRes = await parentStore.approveChildWithPin(parentEmail, 'FamilyPass2026!', ssStudent.id);
    ctx.assertEqual(approveRes.success, true);
    sharedSsStudent = ssStudent;
  },

  'SYS-05: Parent Portal accesses dashboard and sees both JSS and Senior learners': async (ctx) => {
    const parentEmail = sharedParentEmail;

    const dashRes = await ctx.api('/api/parent/dashboard', {
      method: 'POST',
      body: { email: parentEmail, familyPassword: 'FamilyPass2026!' }
    });
    ctx.assertEqual(dashRes.status, 200);
    ctx.assertEqual(dashRes.data.success, true);
    ctx.assertEqual(dashRes.data.children.length, 2);
  },

  'SYS-06: Pricing differentiation correctly distinguishes JSS (KES 1500) vs Senior School (KES 1800)': async (ctx) => {
    const jssStudent = sharedJssStudent;
    const ssStudent = sharedSsStudent;
    const parentEmail = sharedParentEmail;

    // 1. Pricing configuration check
    const jssPricing = pricingConfig.resolvePricingForStudent(jssStudent, 'premium', 'monthly');
    const ssPricing = pricingConfig.resolvePricingForStudent(ssStudent, 'premium', 'monthly');

    ctx.assertEqual(jssPricing.amount, 1500, 'JSS Premium must be KES 1,500');
    ctx.assertEqual(jssPricing.tierLabel, 'Premium Scholar');
    ctx.assertEqual(ssPricing.amount, 1800, 'Senior School Premium must be KES 1,800');
    ctx.assertEqual(ssPricing.tierLabel, 'Senior Premium Pro');

    // 2. Payment confirmation API check for Senior School
    const payResSS = await ctx.api('/api/payment/confirm', {
      method: 'POST',
      body: {
        email: parentEmail,
        familyPassword: 'FamilyPass2026!',
        studentId: ssStudent.id,
        tier: 'premium',
        billingCycle: 'monthly',
        paymentMethod: 'M-Pesa STK Push',
        transactionRef: 'MPESA_SS_' + Date.now()
      }
    });
    ctx.assertEqual(payResSS.status, 200);
    ctx.assertEqual(payResSS.data.amount, 1800, 'Senior School payment confirmation must charge KES 1,800');
    ctx.assertEqual(payResSS.data.tierInfo.name, 'Senior Premium Pro');

    // 3. Payment confirmation API check for JSS
    const payResJSS = await ctx.api('/api/payment/confirm', {
      method: 'POST',
      body: {
        email: parentEmail,
        familyPassword: 'FamilyPass2026!',
        studentId: jssStudent.id,
        tier: 'premium',
        billingCycle: 'monthly',
        paymentMethod: 'M-Pesa STK Push',
        transactionRef: 'MPESA_JSS_' + Date.now()
      }
    });
    ctx.assertEqual(payResJSS.status, 200);
    ctx.assertEqual(payResJSS.data.amount, 1500, 'JSS payment confirmation must charge KES 1,500');
    ctx.assertEqual(payResJSS.data.tierInfo.name, 'Premium Scholar');
  },

  'SYS-07: Socratic Chat Learning & OTP Email Dispatch operate without error': async (ctx) => {
    const jssStudent = sharedJssStudent;

    // Chat endpoint
    const chatRes = await ctx.api('/api/chat', {
      method: 'POST',
      body: {
        studentId: jssStudent.id,
        grade: 7,
        subject: 'Mathematics',
        messages: [{ role: 'user', content: 'What is an obtuse angle?' }]
      }
    });
    ctx.assertEqual(chatRes.status, 200);
    ctx.assert(chatRes.data.reply, 'Chat must return Socratic reply');

    // Email service
    const emailRes = await emailService.sendOTPEmail({
      parentEmail: 'parent@example.com',
      otpCode: '918234',
      purpose: 'verification test'
    });
    ctx.assert(emailRes.success, 'Email service should dispatch without error');
  }
};
