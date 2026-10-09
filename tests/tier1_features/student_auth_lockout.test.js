// ============================================================
// Tier 1 — Feature 2: Student PIN Verification & Lockout
// ORIGINAL_REQUEST §R1, R2, TEST_INFRA.md Feature #2
// ============================================================

const studentStore = require('../../studentStore');

module.exports = {
  'TC-STU-06: Verified learner successful login returns 200 OK and student object': async (ctx) => {
    const handle = ctx.uniqueHandle('AuthStu');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    const regRes = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    ctx.assertEqual(regRes.status, 200);
    const studentId = regRes.data.student.id;

    // Simulate parent activation
    studentStore.setStudentParentVerified(studentId);

    // Attempt login
    const loginRes = await ctx.api('/api/students/login', {
      method: 'POST',
      body: { handleOrEmail: handle, pin }
    });

    ctx.assertEqual(loginRes.status, 200, 'Authenticated login should return 200 OK');
    ctx.assertEqual(loginRes.data.success, true, 'Login should succeed');
    ctx.assertEqual(loginRes.data.student.id, studentId, 'Returned student ID must match');
  },

  'TC-STU-07: Unverified learner login gate returns 403 Forbidden with unverified: true': async (ctx) => {
    const handle = ctx.uniqueHandle('Unverified');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });

    // Attempt login before parent activation
    const loginRes = await ctx.api('/api/students/login', {
      method: 'POST',
      body: { handleOrEmail: handle, pin }
    });

    ctx.assertEqual(loginRes.status, 403, 'Unverified login attempt must return 403 Forbidden');
    ctx.assertEqual(loginRes.data.unverified, true, 'unverified flag must be true');
    ctx.assertIncludes(loginRes.data.error, 'parent has not activated', 'Error message should guide child to parent');
  },

  'TC-STU-08: Incorrect PIN submission returns 401 Unauthorized': async (ctx) => {
    const handle = ctx.uniqueHandle('WrongPin');
    const pin = '8392';
    const email = ctx.uniqueEmail('parent');

    const reg = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    studentStore.setStudentParentVerified(reg.data.student.id);

    const loginRes = await ctx.api('/api/students/login', {
      method: 'POST',
      body: { handleOrEmail: handle, pin: '7193' } // wrong PIN
    });

    ctx.assertEqual(loginRes.status, 401, 'Wrong PIN must return 401 Unauthorized');
    ctx.assertEqual(loginRes.data.success, false);
  },

  'TC-STU-09: 5 consecutive failed PIN attempts trigger 10-minute lockout (HTTP 423)': async (ctx) => {
    const handle = ctx.uniqueHandle('LockoutTarget');
    const pin = '9482';
    const email = ctx.uniqueEmail('parent');

    const reg = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    studentStore.setStudentParentVerified(reg.data.student.id);

    // Send 5 incorrect attempts
    let lastRes = null;
    for (let i = 0; i < 5; i++) {
      lastRes = await ctx.api('/api/students/login', {
        method: 'POST',
        body: { handleOrEmail: handle, pin: '0918' }
      });
    }

    ctx.assertEqual(lastRes.status, 423, '5th failed attempt must trigger 423 Locked');
    ctx.assertEqual(lastRes.data.locked, true, 'Response must have locked: true');
    ctx.assert(lastRes.data.error.includes('locked'), 'Error must mention account locked');
  },

  'TC-STU-10: Correct PIN rejected with HTTP 423 while lockout remains active': async (ctx) => {
    const handle = ctx.uniqueHandle('PostLockCheck');
    const pin = '9482';
    const email = ctx.uniqueEmail('parent');

    const reg = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    studentStore.setStudentParentVerified(reg.data.student.id);

    // Trigger lockout
    for (let i = 0; i < 5; i++) {
      await ctx.api('/api/students/login', {
        method: 'POST',
        body: { handleOrEmail: handle, pin: '0000' }
      });
    }

    // Now try correct PIN while locked
    const correctTry = await ctx.api('/api/students/login', {
      method: 'POST',
      body: { handleOrEmail: handle, pin }
    });

    ctx.assertEqual(correctTry.status, 423, 'Correct PIN must still be rejected while lock is active');
    ctx.assertEqual(correctTry.data.locked, true);
  }
};
