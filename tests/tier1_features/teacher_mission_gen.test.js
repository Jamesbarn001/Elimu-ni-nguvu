// ============================================================
// Tier 1 — Feature 12: Teacher Mission Generation & Assignment
// ORIGINAL_REQUEST §R2, TEST_INFRA.md Feature #12
// ============================================================

module.exports = {
  'TC-TEA-16: Mission generation returns CBE assessment items with Kenyan context': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('GEN');
    await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Nakuru JSS', county: 'Nakuru', adminCode, grades: [7], streams: { '7': ['East'] } }
    });

    const reg = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Koech',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('koech'),
        password: 'PassTeacher2026!',
        adminCode
      }
    });
    const token = reg.data.token;

    const genRes = await ctx.api('/api/mission/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        grade: 7,
        subject: 'Mathematics',
        strand: 'Fractions',
        count: 3,
        difficulty: 'ME'
      }
    });

    ctx.assertEqual(genRes.status, 200);
    ctx.assertEqual(genRes.data.success, true);
    ctx.assert(Array.isArray(genRes.data.items), 'Must return items array');
    ctx.assert(genRes.data.items.length >= 1, 'Should return at least 1 item');
    const firstItem = genRes.data.items[0];
    ctx.assert(firstItem.question, 'Item must have question text');
    ctx.assert(firstItem.answerMode, 'Item must have answerMode');
    ctx.assert(firstItem.hintSequence, 'Item must have hintSequence');
  },

  'TC-TEA-17: Single question item regeneration returns single item': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('SNG');
    await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Eldoret JSS', county: 'Uasin Gishu', adminCode, grades: [8], streams: { '8': ['West'] } }
    });

    const reg = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Rono',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('rono'),
        password: 'PassTeacher2026!',
        adminCode
      }
    });
    const token = reg.data.token;

    const singleRes = await ctx.api('/api/mission/generate-single-item', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        grade: 8,
        subject: 'Science & Technology',
        strand: 'Circulatory System'
      }
    });

    ctx.assertEqual(singleRes.status, 200);
    ctx.assertEqual(singleRes.data.success, true);
    ctx.assert(singleRes.data.item && singleRes.data.item.question, 'Must return single item');
  },

  'TC-TEA-18: Mission creation deploys quiz mission to assigned stream': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('PUSH');
    const schRes = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Kakamega JSS', county: 'Kakamega', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = schRes.data.school.id;

    const reg = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Wekesa',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('wekesa'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });
    const token = reg.data.token;

    const missionRes = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        schoolId,
        grade: 7,
        stream: 'East',
        subject: 'Mathematics',
        strand: 'Fractions',
        title: 'Term 1 Fractions Review',
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        items: [
          {
            id: 'q1',
            question: 'What is 1/2 + 1/4?',
            answerMode: 'numeric',
            expectedAnswer: '3/4',
            acceptableVariants: ['3/4', 'three quarters'],
            hintSequence: ['Find a common denominator']
          }
        ]
      }
    });

    ctx.assertEqual(missionRes.status, 200);
    ctx.assertEqual(missionRes.data.success, true);
    ctx.assert(missionRes.data.mission.id, 'Created mission must have an ID');
    ctx.assertEqual(missionRes.data.mission.status, 'active');
  },

  'TC-TEA-19: Mission creation rejected if teacher is not assigned to target stream': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('UNASS');
    const schRes = await ctx.api('/api/school/create', {
      method: 'POST',
      body: {
        name: 'Nyeri JSS',
        county: 'Nyeri',
        adminCode,
        grades: [7, 8],
        streams: { '7': ['East'], '8': ['West'] }
      }
    });
    const schoolId = schRes.data.school.id;

    // Teacher assigned ONLY to Grade 7 East
    const reg = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Maina',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('maina'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });
    const token = reg.data.token;

    // Attempt to push to Grade 8 West
    const attackRes = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        schoolId,
        grade: 8,
        stream: 'West',
        subject: 'Mathematics',
        title: 'Unauthorized Mission',
        items: [{ id: 'q1', question: 'Test?', expectedAnswer: '1' }]
      }
    });

    ctx.assertEqual(attackRes.status, 403, 'Unassigned stream push must return 403 Forbidden');
    ctx.assertIncludes(attackRes.data.error, 'not assigned');
  },

  'TC-TEA-20: Mission creation without required schoolId returns 400 Bad Request': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('MIS');
    await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Thika JSS', county: 'Kiambu', adminCode, grades: [7], streams: { '7': ['East'] } }
    });

    const reg = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Njeri',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('njeri'),
        password: 'PassTeacher2026!',
        adminCode
      }
    });
    const token = reg.data.token;

    const res = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { grade: 7, stream: 'East', title: 'Missing School ID' }
    });

    ctx.assertEqual(res.status, 400, 'Missing schoolId must return 400');
    ctx.assertIncludes(res.data.error, 'schoolId');
  }
};
