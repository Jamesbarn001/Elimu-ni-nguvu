// ============================================================
// Tier 1 — Feature 4: Student Session Tokens & IDOR Defense
// ORIGINAL_REQUEST §R2, TEST_INFRA.md Feature #4
// ============================================================

module.exports = {
  'TC-STU-16: Save student inquiry session messages for specific subject': async (ctx) => {
    const studentId = ctx.uniqueId('stu');
    const messages = [
      { role: 'user', content: 'What is a fraction?' },
      { role: 'assistant', content: 'Think of sharing a chapati between two people. How much does each person get?' }
    ];

    const res = await ctx.api('/api/students/session', {
      method: 'POST',
      body: {
        studentId,
        subject: 'Mathematics',
        messages
      }
    });

    ctx.assertEqual(res.status, 200, 'Saving session should return 200 OK');
    ctx.assertEqual(res.data.success, true);
  },

  'TC-STU-17: Retrieve session messages returns saved conversation and timestamp': async (ctx) => {
    const studentId = ctx.uniqueId('stu');
    const messages = [
      { role: 'user', content: 'What is force in science?' },
      { role: 'assistant', content: 'When you kick a football, what are you applying to it?' }
    ];

    await ctx.api('/api/students/session', {
      method: 'POST',
      body: { studentId, subject: 'Science & Technology', messages }
    });

    const getRes = await ctx.api(`/api/students/session?studentId=${studentId}&subject=Science%20%26%20Technology`);
    ctx.assertEqual(getRes.status, 200, 'Session GET should return 200 OK');
    ctx.assertEqual(getRes.data.messages.length, 2, 'Should return saved messages array');
    ctx.assertEqual(getRes.data.messages[0].content, 'What is force in science?');
    ctx.assert(getRes.data.lastUpdated, 'Response must include lastUpdated timestamp');
  },

  'TC-STU-18: Missing studentId in session retrieval returns 400 Bad Request': async (ctx) => {
    const res = await ctx.api('/api/students/session?subject=Mathematics');
    ctx.assertEqual(res.status, 400, 'Missing studentId must return 400 Bad Request');
    ctx.assertIncludes(res.data.error, 'Student ID');
  },

  'TC-STU-19: Missing subject in session retrieval returns 400 Bad Request': async (ctx) => {
    const res = await ctx.api('/api/students/session?studentId=some_student_id');
    ctx.assertEqual(res.status, 400, 'Missing subject must return 400 Bad Request');
    ctx.assertIncludes(res.data.error, 'subject');
  },

  'TC-STU-20: Session partition isolation: Student B does not leak into Student A': async (ctx) => {
    const studentA = ctx.uniqueId('stu_a');
    const studentB = ctx.uniqueId('stu_b');

    // Save session for Student A
    await ctx.api('/api/students/session', {
      method: 'POST',
      body: {
        studentId: studentA,
        subject: 'English',
        messages: [{ role: 'user', content: 'Student A private poem inquiry' }]
      }
    });

    // Student B requests English session
    const resB = await ctx.api(`/api/students/session?studentId=${studentB}&subject=English`);
    ctx.assertEqual(resB.status, 200);
    // Student B's session should be empty array
    ctx.assertEqual(resB.data.messages.length, 0, "Student B's session must not contain Student A's messages");
  }
};
