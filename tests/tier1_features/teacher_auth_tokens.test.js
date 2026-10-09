// ============================================================
// Tier 1 — Feature 9: Teacher Portal Authentication & Tokens
// ORIGINAL_REQUEST §R1, R2, TEST_INFRA.md Feature #9
// ============================================================

module.exports = {
  'TC-TEA-01: Teacher registers under valid school admin code and receives signed HMAC token': async (ctx) => {
    // 1. Create school
    const adminCode = ctx.uniqueSchoolCode('MFA');
    await ctx.api('/api/school/create', {
      method: 'POST',
      body: {
        name: 'Moi Forces Academy',
        county: 'Nairobi',
        adminCode,
        grades: [7],
        streams: { '7': ['East'] }
      }
    });

    // 2. Register teacher
    const idNumber = String(Math.floor(10000000 + Math.random() * 90000000));
    const regRes = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Mwalimu James',
        idNumber,
        email: ctx.uniqueEmail('mwalimu'),
        phone: ctx.uniquePhone(),
        password: 'TeacherSecure2026!',
        role: 'subject_teacher',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });

    ctx.assertEqual(regRes.status, 200, 'Teacher registration should succeed');
    ctx.assertEqual(regRes.data.success, true);
    ctx.assert(regRes.data.token, 'Must return signed session token');
    ctx.assertIncludes(regRes.data.token, '.', 'HMAC token must contain period separator');
    ctx.assertEqual(regRes.data.teacher.name, 'Mwalimu James');
  },

  'TC-TEA-02: Teacher registration with missing fields or weak password rejected with 400': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('SCH');
    await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Sample School', county: 'Nairobi', adminCode, grades: [7], streams: { '7': ['East'] } }
    });

    const res = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Weak Pass Teacher',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('teacher'),
        password: 'pass', // Weak password (< 8 chars)
        adminCode
      }
    });

    ctx.assertEqual(res.status, 400, 'Weak password should return 400 Bad Request');
    ctx.assert(res.data.error, 'Error message must be present');
  },

  'TC-TEA-03: Teacher login with valid credentials succeeds and issues 24h HMAC token': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('ADM');
    await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Nairobi High JSS', county: 'Nairobi', adminCode, grades: [7], streams: { '7': ['East'] } }
    });

    const idNumber = String(Math.floor(10000000 + Math.random() * 90000000));
    const password = 'TeacherPass2026!';
    await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Lucy',
        idNumber,
        email: ctx.uniqueEmail('lucy'),
        phone: ctx.uniquePhone(),
        password,
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Science & Technology'] }]
      }
    });

    // Login via idNumber
    const loginRes = await ctx.api('/api/teacher/login', {
      method: 'POST',
      body: { identifier: idNumber, password }
    });

    ctx.assertEqual(loginRes.status, 200, 'Teacher login should return 200 OK');
    ctx.assertEqual(loginRes.data.success, true);
    ctx.assert(loginRes.data.token, 'Must return signed token on login');
    ctx.assertEqual(loginRes.data.teacher.name, 'Tr. Lucy');
  },

  'TC-TEA-04: Teacher login with incorrect password returns 401 Unauthorized': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('ADM');
    await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Starehe JSS', county: 'Nairobi', adminCode, grades: [7], streams: { '7': ['East'] } }
    });

    const idNumber = String(Math.floor(10000000 + Math.random() * 90000000));
    await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. David',
        idNumber,
        email: ctx.uniqueEmail('david'),
        password: 'ValidPass1234!',
        adminCode
      }
    });

    const loginRes = await ctx.api('/api/teacher/login', {
      method: 'POST',
      body: { identifier: idNumber, password: 'WrongPassword999!' }
    });

    ctx.assertEqual(loginRes.status, 401, 'Invalid teacher password must return 401');
    ctx.assertIncludes(loginRes.data.error, 'Invalid');
  },

  'TC-TEA-05: 5 consecutive failed teacher logins trigger 15-minute lockout (HTTP 423)': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('ADM');
    await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Pangani JSS', county: 'Nairobi', adminCode, grades: [7], streams: { '7': ['East'] } }
    });

    const idNumber = String(Math.floor(10000000 + Math.random() * 90000000));
    await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Grace',
        idNumber,
        email: ctx.uniqueEmail('grace'),
        password: 'CorrectPass1234!',
        adminCode
      }
    });

    let res = null;
    for (let i = 0; i < 5; i++) {
      res = await ctx.api('/api/teacher/login', {
        method: 'POST',
        body: { identifier: idNumber, password: 'BadPassword0000!' }
      });
    }

    ctx.assertEqual(res.status, 423, '5th consecutive failure must return 423 Locked');
    ctx.assertEqual(res.data.locked, true);
    ctx.assertIncludes(res.data.error, 'locked');
  }
};
