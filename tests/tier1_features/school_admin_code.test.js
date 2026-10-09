// ============================================================
// Tier 1 — Feature 10: School Admin Code Gate
// ORIGINAL_REQUEST §R2, TEST_INFRA.md Feature #10
// ============================================================

module.exports = {
  'TC-TEA-06: School institution creation generates admin code and stream join codes': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('GATE');
    const res = await ctx.api('/api/school/create', {
      method: 'POST',
      body: {
        name: 'Kenya High JSS',
        county: 'Nairobi',
        adminCode,
        grades: [7, 8],
        streams: {
          '7': ['East', 'West'],
          '8': ['North']
        }
      }
    });

    ctx.assertEqual(res.status, 200);
    ctx.assertEqual(res.data.success, true);
    const school = res.data.school;
    ctx.assertEqual(school.adminCode, adminCode);
    ctx.assert(school.joinCodes['7_East'], 'Must have 7_East join code');
    ctx.assert(school.joinCodes['7_West'], 'Must have 7_West join code');
    ctx.assert(school.joinCodes['8_North'], 'Must have 8_North join code');
  },

  'TC-TEA-07: Duplicate school admin code rejected with 400 Bad Request': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('DUP');
    const res1 = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Original School', county: 'Nairobi', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    ctx.assertEqual(res1.status, 200);

    const res2 = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Impostor School', county: 'Nairobi', adminCode, grades: [7], streams: { '7': ['East'] } }
    });

    ctx.assertEqual(res2.status, 400, 'Duplicate admin code must return 400 Bad Request');
    ctx.assertIncludes(res2.data.error, 'already in use');
  },

  'TC-TEA-08: Code verification service resolves School Admin Code': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('VERIF');
    await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Maseno JSS', county: 'Kisumu', adminCode, grades: [7], streams: { '7': ['A'] } }
    });

    const res = await ctx.api(`/api/school/verify-code/${adminCode}`);
    ctx.assertEqual(res.status, 200);
    ctx.assertEqual(res.data.valid, true);
    ctx.assertEqual(res.data.type, 'admin');
    ctx.assertEqual(res.data.school.name, 'Maseno JSS');
  },

  'TC-TEA-09: Code verification service resolves Student Stream Join Code': async (ctx) => {
    const adminCode = ctx.uniqueSchoolCode('STRM');
    const createRes = await ctx.api('/api/school/create', {
      method: 'POST',
      body: { name: 'Maranda JSS', county: 'Siaya', adminCode, grades: [7], streams: { '7': ['East'] } }
    });
    const joinCode = createRes.data.school.joinCodes['7_East'];

    const res = await ctx.api(`/api/school/verify-code/${joinCode}`);
    ctx.assertEqual(res.status, 200);
    ctx.assertEqual(res.data.valid, true);
    ctx.assertEqual(res.data.type, 'stream');
    ctx.assertEqual(res.data.schoolName, 'Maranda JSS');
    ctx.assertEqual(res.data.stream, 'East');
  },

  'TC-TEA-10: Invalid code verification returns 404 with valid: false': async (ctx) => {
    const res = await ctx.api('/api/school/verify-code/NON-EXISTENT-CODE-999');
    ctx.assertEqual(res.status, 404, 'Invalid code should return 404 Not Found');
    ctx.assertEqual(res.data.valid, false);
  }
};
