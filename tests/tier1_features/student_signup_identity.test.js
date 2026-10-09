// ============================================================
// Tier 1 — Feature 1: Student Portal Signup & Identity
// ORIGINAL_REQUEST §R1, TEST_INFRA.md Feature #1
// ============================================================

module.exports = {
  'TC-STU-01: Standard learner registration with valid parent email': async (ctx) => {
    const handle = ctx.uniqueHandle('Zawadi');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    const res = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: {
        handle,
        pin,
        grade: 7,
        county: 'Nairobi',
        school: 'Kilimani Junior Secondary',
        email,
        avatar: '🦁',
        quests: ['Mathematics', 'Science & Technology']
      }
    });

    ctx.assertEqual(res.status, 200, 'Student profile registration should return 200 OK');
    ctx.assertEqual(res.data.success, true, 'Registration response should have success: true');
    ctx.assertEqual(res.data.awaitingParentApproval, true, 'Learner should await parent approval');
    ctx.assert(res.data.student && res.data.student.id, 'Should return created student with ID');
    ctx.assertEqual(res.data.student.handle, handle, 'Returned student handle must match requested handle');
  },

  'TC-STU-02: Kenyan phone number signup normalizes to E.164 and routes SMS': async (ctx) => {
    const handle = ctx.uniqueHandle('Baraka');
    const pin = ctx.uniquePin();
    const phone = ctx.uniquePhone(); // e.g. 0712345678

    const res = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: {
        handle,
        pin,
        grade: 8,
        county: 'Mombasa',
        parentPhone: phone,
        avatar: '🦅'
      }
    });

    ctx.assertEqual(res.status, 200, 'Phone registration should return 200 OK');
    ctx.assertEqual(res.data.success, true, 'Success flag should be true');
    ctx.assertEqual(res.data.channel, 'sms', 'Channel must resolve to SMS');
    ctx.assertEqual(res.data.contactType, 'sms', 'Contact type must be sms');
    ctx.assertIncludes(res.data.student.email, '@phone.elingu.local', 'Synthetic email alias should be assigned');
  },

  'TC-STU-03: Existing parent sibling registration adds to pendingChildren': async (ctx) => {
    const parentEmail = ctx.uniqueEmail('mama_amani');
    const handle1 = ctx.uniqueHandle('ChildOne');
    const pin1 = ctx.uniquePin();

    // First child
    const res1 = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle: handle1, pin: pin1, grade: 7, email: parentEmail }
    });
    ctx.assertEqual(res1.status, 200);

    // Second child (sibling) with same parent email
    const handle2 = ctx.uniqueHandle('ChildTwo');
    const pin2 = ctx.uniquePin();
    const res2 = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle: handle2, pin: pin2, grade: 8, email: parentEmail }
    });

    ctx.assertEqual(res2.status, 200, 'Sibling registration should succeed');
    ctx.assertEqual(res2.data.success, true);
    ctx.assertEqual(res2.data.awaitingParentApproval, true);
  },

  'TC-STU-04: Duplicate nickname rejection returns 409 Conflict with DUPLICATE_HANDLE': async (ctx) => {
    const handle = ctx.uniqueHandle('UniqueLearner');
    const pin = ctx.uniquePin();
    const email1 = ctx.uniqueEmail('parent1');
    const email2 = ctx.uniqueEmail('parent2');

    // Register first time
    const res1 = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email: email1 }
    });
    ctx.assertEqual(res1.status, 200);

    // Register second time with same handle
    const res2 = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 8, email: email2 }
    });

    ctx.assertEqual(res2.status, 409, 'Duplicate handle must return 409 Conflict');
    ctx.assertEqual(res2.data.code, 'DUPLICATE_HANDLE', 'Error code must be DUPLICATE_HANDLE');
  },

  'TC-STU-05: Weak PIN rejection pattern 1234 returns 400 Bad Request': async (ctx) => {
    const handle = ctx.uniqueHandle('Kevo');
    const email = ctx.uniqueEmail('parent');

    const res = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: {
        handle,
        pin: '1234', // Weak sequential PIN
        grade: 7,
        email
      }
    });

    ctx.assertEqual(res.status, 400, 'Sequential PIN 1234 should return 400 Bad Request');
    ctx.assertIncludes(res.data.error, 'easy to guess', 'Error should mention PIN is too easy to guess');
  }
};
