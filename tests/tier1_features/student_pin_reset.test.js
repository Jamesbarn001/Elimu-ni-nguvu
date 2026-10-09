// ============================================================
// Tier 1 — Feature 3: Student PIN Reset Recovery Flow
// ORIGINAL_REQUEST §R1, TEST_INFRA.md Feature #3
// ============================================================

const studentStore = require('../../studentStore');

module.exports = {
  'TC-STU-11: Learner PIN reset OTP request returns masked parent target': async (ctx) => {
    const handle = ctx.uniqueHandle('OtpTarget');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent_target');

    await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });

    const res = await ctx.api('/api/students/request-otp', {
      method: 'POST',
      body: { handleOrEmail: handle }
    });

    ctx.assertEqual(res.status, 200, 'OTP request should return 200 OK');
    ctx.assertEqual(res.data.success, true);
    ctx.assert(res.data.maskedTarget, 'Masked target must be returned');
    ctx.assertIncludes(res.data.maskedTarget, '@', 'Email target must mask domain or name');
  },

  'TC-STU-12: Non-existent student OTP request rejected with 400 Bad Request': async (ctx) => {
    const res = await ctx.api('/api/students/request-otp', {
      method: 'POST',
      body: { handleOrEmail: 'NonExistentHandle_99999' }
    });

    ctx.assertEqual(res.status, 400, 'Non-existent account OTP request should return 400');
    ctx.assertIncludes(res.data.error, 'No learner account found');
  },

  'TC-STU-13: Reset PIN with invalid OTP code returns 400 Bad Request': async (ctx) => {
    const handle = ctx.uniqueHandle('BadOtpStu');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });

    await ctx.api('/api/students/request-otp', {
      method: 'POST',
      body: { handleOrEmail: handle }
    });

    const resetRes = await ctx.api('/api/students/reset-pin', {
      method: 'POST',
      body: {
        handleOrEmail: handle,
        otp: '000000', // Invalid OTP
        newPin: '8492'
      }
    });

    ctx.assertEqual(resetRes.status, 400, 'Invalid OTP must return 400 Bad Request');
    ctx.assertIncludes(resetRes.data.error, 'verification code', 'Error should mention verification code');
  },

  'TC-STU-14: Reset PIN with valid OTP but weak new PIN returns 400 Bad Request': async (ctx) => {
    const handle = ctx.uniqueHandle('WeakResetStu');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    const reg = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    studentStore.setStudentParentVerified(reg.data.student.id);

    // Call store directly to extract valid generated OTP
    const otpResult = studentStore.requestStudentOTP(handle);
    const validOtp = otpResult.otp;

    const resetRes = await ctx.api('/api/students/reset-pin', {
      method: 'POST',
      body: {
        handleOrEmail: handle,
        otp: validOtp,
        newPin: '1111' // Weak repeated PIN
      }
    });

    ctx.assertEqual(resetRes.status, 400, 'Weak new PIN must return 400 Bad Request');
    ctx.assertIncludes(resetRes.data.error, 'same digit', 'Error should explain weak PIN');
  },

  'TC-STU-15: Reset PIN with valid OTP updates PIN and authenticates successfully': async (ctx) => {
    const handle = ctx.uniqueHandle('GoodResetStu');
    const oldPin = '5829';
    const newPin = '9371';
    const email = ctx.uniqueEmail('parent');

    const reg = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin: oldPin, grade: 7, email }
    });
    studentStore.setStudentParentVerified(reg.data.student.id);

    const otpResult = studentStore.requestStudentOTP(handle);
    const validOtp = otpResult.otp;

    const resetRes = await ctx.api('/api/students/reset-pin', {
      method: 'POST',
      body: {
        handleOrEmail: handle,
        otp: validOtp,
        newPin
      }
    });

    ctx.assertEqual(resetRes.status, 200, 'Valid reset must return 200 OK');
    ctx.assertEqual(resetRes.data.success, true);

    // Verify new PIN authenticates
    const loginRes = await ctx.api('/api/students/login', {
      method: 'POST',
      body: { handleOrEmail: handle, pin: newPin }
    });

    ctx.assertEqual(loginRes.status, 200, 'Login with new PIN must succeed');
    ctx.assertEqual(loginRes.data.student.handle, handle);
  }
};
