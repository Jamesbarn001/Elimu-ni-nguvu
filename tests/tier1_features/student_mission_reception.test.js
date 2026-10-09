// ============================================================
// Tier 1 — Feature 13: Student Mission Reception & Attempt
// ORIGINAL_REQUEST §AC, TEST_INFRA.md Feature #13
// ============================================================

module.exports = {
  'TC-STU-41: Learner retrieves active missions assigned to their class stream': async (ctx) => {
    // 1. Setup school, stream, teacher, and mission
    const adminCode = ctx.uniqueSchoolCode('REC');
    const sch = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Kilifi JSS', county: 'Kilifi', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = sch.data.school.id;
    const joinCode = sch.data.school.joinCodes['7_East'];

    const teacher = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Juma',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('juma'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });

    const missionRes = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacher.data.token}` },
      body: {
        schoolId,
        grade: 7,
        stream: 'East',
        subject: 'Mathematics',
        title: 'Morning Mental Math',
        items: [
          {
            id: 'q1',
            question: 'What is 15 * 4?',
            answerMode: 'numeric',
            expectedAnswer: '60',
            acceptableVariants: ['60', 'sixty'],
            hintSequence: ['Multiply 15 by 2 first, then double it.']
          }
        ]
      }
    });

    // 2. Student joins stream
    const student = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle: ctx.uniqueHandle('Receiver'), pin: ctx.uniquePin(), grade: 7, email: ctx.uniqueEmail('parent') }
    });
    const studentId = student.data.student.id;
    await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId, joinCode }
    });

    // 3. Retrieve active missions for student
    const activeRes = await ctx.api(`/api/mission/active-for-student?studentId=${studentId}&subject=Mathematics`);
    ctx.assertEqual(activeRes.status, 200);
    ctx.assert(Array.isArray(activeRes.data.missions), 'Must return missions array');
    ctx.assert(activeRes.data.missions.length >= 1, 'Should contain active mission');
    ctx.assertEqual(activeRes.data.missions[0].id, missionRes.data.mission.id);
  },

  'TC-STU-42: Student mission view strips answer keys and acceptable variants': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('STRIP');
    const sch = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Kwale JSS', county: 'Kwale', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = sch.data.school.id;
    const joinCode = sch.data.school.joinCodes['7_East'];

    const teacher = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Mishi',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('mishi'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });

    const missionRes = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacher.data.token}` },
      body: {
        schoolId,
        grade: 7,
        stream: 'East',
        subject: 'Mathematics',
        title: 'Secret Answer Mission',
        items: [
          {
            id: 'q1',
            question: 'Solve for x: 2x = 10',
            answerMode: 'numeric',
            expectedAnswer: '5',
            acceptableVariants: ['5', 'five'],
            hintSequence: ['Divide both sides by 2']
          }
        ]
      }
    });
    const missionId = missionRes.data.mission.id;

    // Fetch via public/student mission endpoint
    const viewRes = await ctx.api(`/api/mission/${missionId}`);
    ctx.assertEqual(viewRes.status, 200);
    const item = viewRes.data.mission.items[0];
    ctx.assertEqual(item.expectedAnswer, undefined, 'expectedAnswer must be stripped for students');
    ctx.assertEqual(item.acceptableVariants, undefined, 'acceptableVariants must be stripped for students');
    ctx.assertEqual(item.hintCount, 1, 'hintCount must be present');
  },

  'TC-STU-43: Student submits correct answer via interact endpoint and gets evaluated': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('ANS');
    const sch = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Bomet JSS', county: 'Bomet', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = sch.data.school.id;
    const joinCode = sch.data.school.joinCodes['7_East'];

    const teacher = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Cherono',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('cherono'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });

    const missionRes = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacher.data.token}` },
      body: {
        schoolId,
        grade: 7,
        stream: 'East',
        subject: 'Mathematics',
        title: 'Addition Challenge',
        items: [
          {
            id: 'q1',
            question: 'What is 50 + 25?',
            answerMode: 'numeric',
            expectedAnswer: '75',
            acceptableVariants: ['75', 'seventy five'],
            hintSequence: ['Add 50 + 20 then add 5']
          }
        ]
      }
    });
    const missionId = missionRes.data.mission.id;

    const student = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle: ctx.uniqueHandle('Answerer'), pin: ctx.uniquePin(), grade: 7, email: ctx.uniqueEmail('parent') }
    });
    const studentId = student.data.student.id;
    await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId, joinCode }
    });

    const interactRes = await ctx.api('/api/mission/interact', {
      method: 'POST',
      body: {
        missionId,
        studentId,
        studentHandle: student.data.student.handle,
        itemId: 'q1',
        answer: '75',
        timeSpentSec: 15
      }
    });

    ctx.assertEqual(interactRes.status, 200);
    ctx.assertEqual(interactRes.data.evaluated, true);
    ctx.assertEqual(interactRes.data.correct, true);
  },

  'TC-STU-44: Student requests hint with reading duration and gets hint text': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('HINT');
    const sch = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Vihiga JSS', county: 'Vihiga', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const schoolId = sch.data.school.id;
    const joinCode = sch.data.school.joinCodes['7_East'];

    const teacher = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Mudavadi',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('mudavadi'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'East', subjects: ['Mathematics'] }]
      }
    });

    const missionRes = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacher.data.token}` },
      body: {
        schoolId,
        grade: 7,
        stream: 'East',
        subject: 'Mathematics',
        title: 'Hint Guided Mission',
        items: [
          {
            id: 'q1',
            question: 'What is 12 * 12?',
            answerMode: 'numeric',
            expectedAnswer: '144',
            hintSequence: ['Think of 12 * 10 plus 12 * 2']
          }
        ]
      }
    });
    const missionId = missionRes.data.mission.id;

    const student = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle: ctx.uniqueHandle('Hinter'), pin: ctx.uniquePin(), grade: 7, email: ctx.uniqueEmail('parent') }
    });
    const studentId = student.data.student.id;
    await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId, joinCode }
    });

    const hintRes = await ctx.api('/api/mission/interact', {
      method: 'POST',
      body: {
        missionId,
        studentId,
        itemId: 'q1',
        hintRequested: true,
        hintIndex: 0,
        hintReadingTimeMs: 3500
      }
    });

    ctx.assertEqual(hintRes.status, 200);
    ctx.assert(hintRes.data.hint, 'Must return hint text');
    ctx.assertIncludes(hintRes.data.hint, '12 * 10');
  },

  'TC-STU-45: Cross-stream mission attempt rejected with 403 Forbidden': async (ctx) => {
    // School with two streams: 7 East and 7 West
    const adminCode = ctx.uniqueSchoolCode('STMX');
    const sch = await ctx.api('/api/school/create', {
      method: 'POST',
      body: {
        name: 'Embu JSS',
        county: 'Embu',
        adminCode,
        grades: [7],
        streams: { '7': ['East', 'West'] }
      }
    });
    const schoolId = sch.data.school.id;
    const joinCodeEast = sch.data.school.joinCodes['7_East'];

    const teacher = await ctx.api('/api/teacher/register', {
      method: 'POST',
      body: {
        name: 'Tr. Munyi',
        idNumber: String(Math.floor(10000000 + Math.random() * 90000000)),
        email: ctx.uniqueEmail('munyi'),
        password: 'PassTeacher2026!',
        adminCode,
        assignments: [{ grade: 7, stream: 'West', subjects: ['Mathematics'] }]
      }
    });

    // Mission deployed to West
    const missionRes = await ctx.api('/api/mission/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacher.data.token}` },
      body: {
        schoolId,
        grade: 7,
        stream: 'West',
        subject: 'Mathematics',
        title: 'West Stream Only Mission',
        items: [{ id: 'q1', question: 'Test?', answerMode: 'numeric', expectedAnswer: '1' }]
      }
    });
    const missionId = missionRes.data.mission.id;

    // Student enrolled in East (not West!)
    const student = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle: ctx.uniqueHandle('EastStudent'), pin: ctx.uniquePin(), grade: 7, email: ctx.uniqueEmail('parent') }
    });
    const studentId = student.data.student.id;
    await ctx.api('/api/students/join-stream', {
      method: 'POST',
      body: { studentId, joinCode: joinCodeEast }
    });

    // Attempt to interact with West mission
    const res = await ctx.api('/api/mission/interact', {
      method: 'POST',
      body: {
        missionId,
        studentId,
        itemId: 'q1',
        answer: '1'
      }
    });

    ctx.assertEqual(res.status, 403, 'Cross-stream mission attempt must return 403 Forbidden');
    ctx.assertIncludes(res.data.error, 'stream');
  }
};
