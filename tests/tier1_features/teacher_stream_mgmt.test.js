// ============================================================
// Tier 1 — Feature 11: Teacher Stream Management
// ORIGINAL_REQUEST §R2, TEST_INFRA.md Feature #11
// ============================================================

module.exports = {
  'TC-TEA-11: Teacher dashboard data returns streams and assigned missions': async (ctx) => {
    // 1. Create school
    const adminCode = ctx.uniqueSchoolCode('DASH');
    const schRes = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Alliance High JSS', county: 'Kiambu', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = schRes.data.school.id;

    // 2. Register teacher
    const regRes = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Chebet',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('chebet'),
        password: 'SecureTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });
    const token = regRes.data.token;

    // 3. Request dashboard data
    const dashRes = await ctx.api('/api/teacher/dashboard-data', {
      headers: { Authorization: `Bearer ${token}` }
    });

    ctx.assertEqual(dashRes.status, 200);
    ctx.assertEqual(dashRes.data.success, true);
    ctx.assert(dashRes.data.streams, 'Must return streams');
    ctx.assert(Array.isArray(dashRes.data.missions), 'Must return missions array');
  },

  'TC-TEA-12: Teacher dashboard data without auth token rejected with 401 Unauthorized': async (ctx) => {
    const res = await ctx.api('/api/teacher/dashboard-data');
    ctx.assertEqual(res.status, 401, 'Unauthorized request should return 401');
    ctx.assertIncludes(res.data.error, 'Unauthorized');
  },

  'TC-TEA-13: Bulk student import creates multiple learner records in stream': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('BULK');
    const schRes = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Kericho JSS', county: 'Kericho', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = schRes.data.school.id;

    const regRes = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Kip',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('kip'),
        password: 'SecureTeacher2026!',
        adminCode
      }
    });
    const token = regRes.data.token;

    const importRes = await ctx.api('/api/school/import-students', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        schoolId,
        students: [
          { name: 'Kiprono', grade: 7, stream: 'East', parentPhone: '0711000001' },
          { name: 'Chepngeno', grade: 7, stream: 'East', parentPhone: '0711000002' }
        ]
      }
    });

    ctx.assertEqual(importRes.status, 200);
    ctx.assertEqual(importRes.data.success, true);
    ctx.assertEqual(importRes.data.created.length, 2, 'Should create 2 learners');
  },

  'TC-TEA-14: Bulk student import without auth token returns 401 Unauthorized': async (ctx) => {
    const res = await ctx.api('/api/school/import-students', {
      method: 'POST',
      body: { schoolId: 'sch_any', students: [{ name: 'Test' }] }
    });
    ctx.assertEqual(res.status, 401);
  },

  'TC-TEA-15: Cross-school bulk student import attempt rejected with 403 Forbidden': async (ctx) => {
    // School 1
    const adminCode1 = ctx.uniqueSchoolCode('SCH1');
    const sch1 = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'School One', county: 'Nairobi', adminCode: adminCode1, grades: [7], streams: { '7': ['East'] } }
    });
    // School 2
    const adminCode2 = ctx.uniqueSchoolCode('SCH2');
    const sch2 = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'School Two', county: 'Nairobi', adminCode: adminCode2, grades: [7], streams: { '7': ['East'] } }
    });

    // Register teacher in School 1
    const teacherRes = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. One',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('one'),
        password: 'PassOne2026!',
        adminCode: adminCode1
      }
    });
    const token = teacherRes.data.token;

    // Attempt to import into School 2 using School 1's teacher token
    const attackRes = await ctx.api('/api/school/import-students', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        schoolId: sch2.data.school.id,
        students: [{ name: 'Intruder', grade: 7, stream: 'East' }]
      }
    });

    ctx.assertEqual(attackRes.status, 403, 'Cross-school import must return 403 Forbidden');
    ctx.assertIncludes(attackRes.data.error, 'Cannot import students into another school');
  }
};
