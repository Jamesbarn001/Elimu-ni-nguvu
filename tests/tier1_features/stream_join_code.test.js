// ============================================================
// Tier 1 — Feature 8: Stream Join Code DB Validation
// ORIGINAL_REQUEST §AC, TEST_INFRA.md Feature #8
// ============================================================

module.exports = {
  'TC-STU-36: Valid stream join code successfully enrolls learner in class stream': async (ctx) => {
    // 1. Create school with stream
    const adminCode = ctx.uniqueSchoolCode('ADM');
    const schoolRes = await ctx.api('/api/school/create', {
      method: 'POST',
      body: {
        name: 'Moi Forces Academy JSS',
        county: 'Nairobi',
        adminCode,
        grades: [7],
        streams: { '7': ['East'] }
      }
    });
    ctx.assertEqual(schoolRes.status, 200);
    const joinCode = schoolRes.data.school.joinCodes['7_East'];
    ctx.assert(joinCode, 'School creation must generate stream join code for 7_East');

    // 2. Register learner
    const handle = ctx.uniqueHandle('StreamJoiner');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');
    const studentRes = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    const studentId = studentRes.data.student.id;

    // 3. Join stream with join code
    const joinRes = await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId, joinCode }
    });

    ctx.assertEqual(joinRes.status, 200, 'Stream join should succeed with 200 OK');
    ctx.assertEqual(joinRes.data.success, true);
    ctx.assertEqual(joinRes.data.grade, 7);
    ctx.assertEqual(joinRes.data.stream, 'East');
    ctx.assertEqual(joinRes.data.streamJoinCode, joinCode);
  },

  'TC-STU-37: Case-insensitive join code resolution succeeds': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('ADM');
    const schoolRes = await ctx.api('/api/school/create', {
      method: 'POST',
      body: {
        name: 'Lenana School JSS',
        county: 'Nairobi',
        adminCode,
        grades: [8],
        streams: { '8': ['West'] }
      }
    });
    const joinCode = schoolRes.data.school.joinCodes['8_West'];

    const studentRes = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle: ctx.uniqueHandle('LowerJoin'), pin: ctx.uniquePin(), grade: 8, email: ctx.uniqueEmail('parent') }
    });
    const studentId = studentRes.data.student.id;

    // Pass lowercase join code
    const lowerCode = joinCode.toLowerCase();
    const joinRes = await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId, joinCode: lowerCode }
    });

    ctx.assertEqual(joinRes.status, 200, 'Lowercase join code should resolve');
    ctx.assertEqual(joinRes.data.success, true);
  },

  'TC-STU-38: Invalid or fake join code rejected with 400 Bad Request': async (ctx) => {
    const studentRes = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle: ctx.uniqueHandle('FakeCodeStu'), pin: ctx.uniquePin(), grade: 7, email: ctx.uniqueEmail('parent') }
    });
    const studentId = studentRes.data.student.id;

    const joinRes = await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId, joinCode: 'FAKE-999-XYZ' }
    });

    ctx.assertEqual(joinRes.status, 400, 'Invalid stream code must return 400 Bad Request');
    ctx.assertIncludes(joinRes.data.error, 'Invalid stream code');
  },

  'TC-STU-39: Non-existent student ID with valid join code returns 400 Bad Request': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('ADM');
    const schoolRes = await ctx.api('/api/school/create', {
      method: 'POST',
      body: {
        name: 'Alliance JSS',
        county: 'Kiambu',
        adminCode,
        grades: [7],
        streams: { '7': ['East'] }
      }
    });
    const joinCode = schoolRes.data.school.joinCodes['7_East'];

    const joinRes = await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId: 'nonexistent_student_99999', joinCode }
    });

    ctx.assertEqual(joinRes.status, 400, 'Non-existent student ID must return 400 Bad Request');
    ctx.assertIncludes(joinRes.data.error, 'Student account not found');
  },

  'TC-STU-40: Missing stream join code in request returns 400 Bad Request': async (ctx) => {
    const joinRes = await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId: 'some_stu_id' }
    });

    ctx.assertEqual(joinRes.status, 400, 'Missing joinCode must return 400 Bad Request');
    ctx.assertIncludes(joinRes.data.error, 'required');
  }
};
