// ============================================================
// Tier 1 — Feature 5: KDPA 2019 Child PII Masking
// ORIGINAL_REQUEST §AC, TEST_INFRA.md Feature #5
// ============================================================

module.exports = {
  'TC-STU-21: Student registration response omits plain PIN and pinHash': async (ctx) => {
    const handle = ctx.uniqueHandle('PiiCheck');
    const pin = '8392';
    const email = ctx.uniqueEmail('parent');

    const res = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });

    ctx.assertEqual(res.status, 200);
    const stu = res.data.student;
    ctx.assertEqual(stu.pin, undefined, 'Plaintext PIN must not be leaked in student object');
    ctx.assertEqual(stu.pinHash, undefined, 'pinHash must not be leaked in response');
    ctx.assertEqual(stu.tempPin, undefined, 'tempPin must not be leaked in response');
  },

  'TC-STU-22: Unauthenticated verification-status check does not leak credentials': async (ctx) => {
    const handle = ctx.uniqueHandle('VerifCheck');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    const reg = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });
    const studentId = reg.data.student.id;

    const res = await ctx.api(`/api/students/verification-status?studentId=${studentId}`);
    ctx.assertEqual(res.status, 200);
    ctx.assertEqual(res.data.pinHash, undefined, 'pinHash must be omitted from status endpoint');
    ctx.assertEqual(res.data.otpHash, undefined, 'otpHash must be omitted from status endpoint');
    ctx.assertEqual(res.data.password, undefined, 'password field must never exist in response');
  },

  'TC-STU-23: Child accounts contain pseudonymous handles and no national ID': async (ctx) => {
    const handle = ctx.uniqueHandle('PseudonymLearner');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent');

    const res = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: {
        handle,
        pin,
        grade: 7,
        email,
        nationalId: '12345678' // Attempt to inject National ID
      }
    });

    ctx.assertEqual(res.status, 200);
    ctx.assertEqual(res.data.student.nationalId, undefined, 'National ID must not be stored or returned for child accounts');
    ctx.assertEqual(res.data.student.handle, handle);
  },

  'TC-STU-24: Phone registration contact display masks or formats responsibly': async (ctx) => {
    const handle = ctx.uniqueHandle('PhoneMask');
    const pin = ctx.uniquePin();
    const phone = ctx.uniquePhone(); // 07...

    const res = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, parentPhone: phone }
    });

    ctx.assertEqual(res.status, 200);
    ctx.assertEqual(res.data.contactType, 'sms');
    // Ensure raw system internal synthetic email is not exposed as primary contact display
    ctx.assertEqual(res.data.parentContactDisplay, phone);
  },

  'TC-STU-25: OTP request masks delivery target per KDPA standards': async (ctx) => {
    const handle = ctx.uniqueHandle('MaskOtpTarget');
    const pin = ctx.uniquePin();
    const email = 'elingu.parent.test@example.com';

    await ctx.api('/api/students/profile', {
      method: 'POST',
      body: { handle, pin, grade: 7, email }
    });

    const res = await ctx.api('/api/students/request-otp', {
      method: 'POST',
      body: { handleOrEmail: handle }
    });

    ctx.assertEqual(res.status, 200);
    ctx.assert(res.data.maskedTarget, 'maskedTarget must be present');
    ctx.assert(res.data.maskedTarget.includes('*'), 'Target must contain mask asterisks: ' + res.data.maskedTarget);
  }
};
