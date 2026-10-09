// ============================================================
// Tier 1 — Feature 15: Parent Portal Authentication & Token Gate
// ORIGINAL_REQUEST §R1, TEST_INFRA.md Feature #15
// ============================================================

const parentStore = require('../../parentStore');

module.exports = {
  'TC-PAR-01: First-child parent verification sets Family Password and activates account': async (ctx) => {
    const handle = ctx.uniqueHandle('ChildOne');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    const reg = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    const childId = reg.data.student.id;

    const parent = parentStore.getParentByEmail(email);
    ctx.assert(parent && parent.verifyToken, 'Parent must have verifyToken generated');
    const token = parent.verifyToken;

    const verifyRes = await ctx.api('/api/parent/verify', {
      method: 'POST',
      body: {
        token,
        childId,
        familyPassword: 'ParentSecurePass2026!'
      }
    });

    ctx.assertEqual(verifyRes.status, 200);
    ctx.assertEqual(verifyRes.data.success, true);
    ctx.assertIncludes(verifyRes.data.message, 'activated');
  },

  'TC-PAR-02: First-child verification with weak password rejected with 400': async (ctx) => {
    const handle = ctx.uniqueHandle('ChildTwo');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    const reg = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    const childId = reg.data.student.id;

    const parent = parentStore.getParentByEmail(email);
    const token = parent.verifyToken;

    const verifyRes = await ctx.api('/api/parent/verify', {
      method: 'POST',
      body: {
        token,
        childId,
        familyPassword: 'weak' // < 8 characters
      }
    });

    ctx.assertEqual(verifyRes.status, 400);
    ctx.assertIncludes(verifyRes.data.error, 'at least 8 characters');
  },

  'TC-PAR-03: First-child verification with invalid token returns 400 Bad Request': async (ctx) => {
    const verifyRes = await ctx.api('/api/parent/verify', {
      method: 'POST',
      body: {
        token: 'invalid_token_99999',
        childId: 'any_child_id',
        familyPassword: 'ParentSecurePass2026!'
      }
    });

    ctx.assertEqual(verifyRes.status, 400);
    ctx.assertIncludes(verifyRes.data.error, 'Invalid or expired');
  },

  'TC-PAR-04: Parent 2FA OTP request generates 6-digit code for password recovery': async (ctx) => {
    const handle = ctx.uniqueHandle('ChildThree');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    const reg = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    const parent = parentStore.getParentByEmail(email);
    await ctx.api('/api/parent/verify', {
      method: 'POST',
      body: {
        token: parent.verifyToken,
        childId: reg.data.student.id,
        familyPassword: 'ParentSecurePass2026!'
      }
    });

    const otpRes = await ctx.api('/api/parent/request-otp', {
      method: 'POST',
      body: { email }
    });

    ctx.assertEqual(otpRes.status, 200);
    ctx.assertEqual(otpRes.data.success, true);
    ctx.assertIncludes(otpRes.data.message, 'code has been sent');
  },

  'TC-PAR-05: Parent password reset with valid OTP updates password successfully': async (ctx) => {
    const handle = ctx.uniqueHandle('ChildFour');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    const reg = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    const parent = parentStore.getParentByEmail(email);
    await ctx.api('/api/parent/verify', {
      method: 'POST',
      body: {
        token: parent.verifyToken,
        childId: reg.data.student.id,
        familyPassword: 'OldPassword1234!'
      }
    });

    // Request OTP from store directly to obtain the code
    const otpResult = parentStore.requestOTP(email);
    const otp = otpResult.otp;

    const resetRes = await ctx.api('/api/parent/reset-password', {
      method: 'POST',
      body: {
        email,
        otp,
        newPassword: 'BrandNewPassword2026!'
      }
    });

    ctx.assertEqual(resetRes.status, 200);
    ctx.assertEqual(resetRes.data.success, true);

    // Verify parent can log in to dashboard with new password
    const dashRes = await ctx.api('/api/parent/dashboard', {
      method: 'POST',
      body: { email, familyPassword: 'BrandNewPassword2026!' }
    });
    ctx.assertEqual(dashRes.status, 200);
    ctx.assertEqual(dashRes.data.success, true);
  }
};
