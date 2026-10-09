// ============================================================
// Tier 1 — Feature 14: Teacher Live Tracker Analytics & Process Trails
// ORIGINAL_REQUEST §AC, R1, TEST_INFRA.md Feature #14
// ============================================================

module.exports = {
  'TC-TEA-21: Teacher retrieves live mission analytics with CBE competency distribution': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('TRK');
    const sch = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Kapsabet JSS', county: 'Nandi', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = sch.data.school.id;
    const joinCode = sch.data.school.joinCodes['7_East'];

    const teacher = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Sang',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('sang'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });
    const token = teacher.data.token;

    const missionRes = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        schoolId,
        grade: 7,
        stream: 'East',
        subject: 'Mathematics',
        title: 'Fractions Live Test',
        items: [
          {
            id: 'q1',
            question: 'What is 1/3 + 1/3?',
            answerMode: 'numeric',
            expectedAnswer: '2/3',
            hintSequence: ['Add the numerators directly']
          }
        ]
      }
    });
    const missionId = missionRes.data.mission.id;

    // Student joins and submits
    const student = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle: ctx.uniqueHandle('TrackerStu'), pin: ctx.uniquePin(), grade: 7, email: ctx.uniqueEmail('parent') }
    });
    const studentId = student.data.student.id;
    await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId, joinCode }
    });

    await ctx.api('/api/mission/interact', {
      method: 'POST',
      body: {
        missionId,
        studentId,
        studentHandle: student.data.student.handle,
        itemId: 'q1',
        answer: '2/3',
        timeSpentSec: 20
      }
    });

    // Query analytics
    const anaRes = await ctx.api(`/api/mission/${missionId}/analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    ctx.assertEqual(anaRes.status, 200);
    ctx.assertEqual(anaRes.data.success, true);
    ctx.assertEqual(anaRes.data.analytics.enrolledCount, 1);
    ctx.assertEqual(anaRes.data.analytics.attemptedCount, 1);
    ctx.assert(anaRes.data.analytics.attemptedList.length === 1);
    ctx.assertEqual(anaRes.data.analytics.attemptedList[0].handle, student.data.student.handle);
  },

  'TC-TEA-22: Process trail captures time spent and attempt count': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('TRAIL');
    const sch = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Lugari JSS', county: 'Kakamega', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = sch.data.school.id;
    const joinCode = sch.data.school.joinCodes['7_East'];

    const teacher = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Shitsama',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('shitsama'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });
    const token = teacher.data.token;

    const missionRes = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        schoolId,
        grade: 7,
        stream: 'East',
        subject: 'Mathematics',
        title: 'Timing Trail Test',
        items: [{ id: 'q1', question: '2 + 2?', answerMode: 'numeric', expectedAnswer: '4' }]
      }
    });
    const missionId = missionRes.data.mission.id;

    const student = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle: ctx.uniqueHandle('TimerStu'), pin: ctx.uniquePin(), grade: 7, email: ctx.uniqueEmail('parent') }
    });
    const studentId = student.data.student.id;
    await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId, joinCode }
    });

    await ctx.api('/api/mission/interact', {
      method: 'POST',
      body: {
        missionId,
        studentId,
        studentHandle: student.data.student.handle,
        itemId: 'q1',
        answer: '4',
        timeSpentSec: 42
      }
    });

    const anaRes = await ctx.api(`/api/mission/${missionId}/analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    ctx.assertEqual(anaRes.status, 200);
    const sub = anaRes.data.analytics.attemptedList[0];
    ctx.assert(sub.completedAt, 'Should have completedAt recorded');
    ctx.assertEqual(sub.attemptsCount, 1);
  },

  'TC-TEA-23: Cross-school mission analytics access blocked with 403 Forbidden': async (ctx) => {
    // School 1
    const adminCode1 = ctx.uniqueSchoolCode('S1');
    const sch1 = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'School 1', county: 'Nairobi', adminCode: adminCode1, grades: [7], streams: { '7': ['East'] } }
    });
    // School 2
    const adminCode2 = ctx.uniqueSchoolCode('S2');
    const sch2 = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'School 2', county: 'Nairobi', adminCode: adminCode2, grades: [7], streams: { '7': ['East'] } }
    });

    // Teacher 1 creates mission in School 1
    const teacher1 = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. One',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('one'),
        password: 'PassTeacher2026!',
        adminCode: adminCode1,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });

    const missionRes = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacher1.data.token}` },
      body: {
        schoolId: sch1.data.school.id,
        grade: 7,
        stream: 'East',
        subject: 'Mathematics',
        title: 'Sch 1 Mission',
        items: [{ id: 'q1', question: 'Test?', answerMode: 'numeric', expectedAnswer: '1' }]
      }
    });
    const missionId = missionRes.data.mission.id;

    // Teacher 2 registered in School 2
    const teacher2 = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Two',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('two'),
        password: 'PassTeacher2026!',
        adminCode: adminCode2
      }
    });

    // Teacher 2 tries to view School 1's mission analytics
    const attackRes = await ctx.api(`/api/mission/${missionId}/analytics`, {
      headers: { Authorization: `Bearer ${teacher2.data.token}` }
    });

    ctx.assertEqual(attackRes.status, 403, 'Cross-school analytics must return 403');
    ctx.assertIncludes(attackRes.data.error, 'another school');
  },

  'TC-TEA-24: Stream summary report returns structured JSON with pseudonymous roster': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('SUMJSON');
    const sch = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Masinga JSS', county: 'Machakos', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = sch.data.school.id;

    const teacher = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Mutua',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('mutua'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });

    const reportRes = await ctx.api(`/api/reports/stream-summary?schoolId=${schoolId}&grade=7&stream=East&format=json`, {
      headers: { Authorization: `Bearer ${teacher.data.token}` }
    });

    ctx.assertEqual(reportRes.status, 200);
    ctx.assert(reportRes.data.roster, 'Must contain roster array');
    ctx.assert(reportRes.data.distribution, 'Must contain CBE distribution');
  },

  'TC-TEA-25: Stream summary report CSV export returns MoE-compliant text/csv': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('SUMCSV');
    const sch = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Kitui JSS', county: 'Kitui', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = sch.data.school.id;

    const teacher = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Mwikali',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('mwikali'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });

    const csvRes = await ctx.api(`/api/reports/stream-summary?schoolId=${schoolId}&grade=7&stream=East&format=csv`, {
      headers: { Authorization: `Bearer ${teacher.data.token}` }
    });

    ctx.assertEqual(csvRes.status, 200);
    const contentType = csvRes.headers.get('content-type') || '';
    ctx.assertIncludes(contentType, 'text/csv');
    ctx.assertIncludes(csvRes.text, 'MINISTRY OF EDUCATION');
    ctx.assertIncludes(csvRes.text, 'COMPETENCY-BASED EDUCATION');
  }
};
