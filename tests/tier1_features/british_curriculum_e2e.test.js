// ============================================================
// Tier 1 — Feature 19: British International Curriculum (Cambridge CAIE & Edexcel)
// E2E Verification Suite: Registration, Pricing, Governance, and Socratic Engine
// ============================================================

const pricingConfig = require('../../pricingConfig');
const curriculumContextBritish = require('../../curriculumContextBritish');
const studentStore = require('../../studentStore');

module.exports = {
  'TC-BRI-01: Lower Secondary Checkpoint (Year 7-9) registration locks examTier to null': async (ctx) => {
    const handle = ctx.uniqueHandle('CheckpointLiam');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent_liam');

    const res = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: {
        handle,
        pin,
        curriculum: 'BRITISH',
        examBoard: 'CAIE',
        yearGroup: 8,
        grade: 8,
        school: 'Brookhouse School (Karen)',
        email,
        avatar: '🦁',
        selectedSubjects: ['Mathematics', 'Physics', 'English']
      }
    });

    ctx.assertEqual(res.status, 200, 'Checkpoint registration should succeed with 200');
    const stu = res.data.student;
    ctx.assertEqual(stu.curriculum, 'BRITISH', 'Curriculum must be BRITISH');
    ctx.assertEqual(stu.examBoard, 'CAIE', 'Exam board must be CAIE');
    ctx.assertEqual(stu.yearGroup, 8, 'Year group must be 8');
    ctx.assertEqual(stu.examTier, null, 'Years 7-9 Checkpoint MUST have examTier null (unified syllabus)');
    ctx.assertEqual(stu.schoolLevel, 'CHECKPOINT', 'School level must be CHECKPOINT');
  },

  'TC-BRI-02: Upper Secondary (Year 10-11) IGCSE registration supports Core vs Extended tier': async (ctx) => {
    const handleExt = ctx.uniqueHandle('IgcseMaya');
    const pin = ctx.uniquePin();
    const email = ctx.uniqueEmail('parent_maya');

    const res = await ctx.api('/api/students/profile', {
      method: 'POST',
      body: {
        handle: handleExt,
        pin,
        curriculum: 'BRITISH',
        examBoard: 'CAIE',
        yearGroup: 10,
        grade: 10,
        examTier: 'extended',
        school: 'Braeburn Garden Estate',
        email,
        avatar: '⚡',
        selectedSubjects: ['Mathematics', 'Physics', 'Chemistry', 'Computer Science']
      }
    });

    ctx.assertEqual(res.status, 200, 'Year 10 Extended registration should succeed');
    const stu = res.data.student;
    ctx.assertEqual(stu.curriculum, 'BRITISH', 'Curriculum must be BRITISH');
    ctx.assertEqual(stu.examTier, 'extended', 'Year 10 student must be enrolled in extended tier');
    ctx.assertEqual(stu.schoolLevel, 'IGCSE', 'School level must be IGCSE');
  },

  'TC-BRI-03: British pricing resolution returns KES 3,999 Standard & KES 4,999 Premium': async (ctx) => {
    const studentBritish = {
      id: 'stu_test_bri_pricing',
      grade: 10,
      curriculum: 'BRITISH',
      examBoard: 'CAIE',
      examTier: 'extended'
    };

    const standardPricing = pricingConfig.resolvePricingForStudent(studentBritish, 'standard');
    ctx.assertEqual(standardPricing.monthly, 3999, 'British Standard monthly price must be KES 3,999');
    ctx.assertEqual(standardPricing.annual, 39999, 'British Standard annual price must be KES 39,999');

    const premiumPricing = pricingConfig.resolvePricingForStudent(studentBritish, 'premium');
    ctx.assertEqual(premiumPricing.monthly, 4999, 'British Premium monthly price must be KES 4,999');
    ctx.assertEqual(premiumPricing.annual, 49999, 'British Premium annual price must be KES 49,999');

    // Also verify Kenya CBC student resolution is isolated and untouched
    const studentCbc = { id: 'stu_test_cbc', grade: 8, curriculum: 'CBC' };
    const cbcStandardPricing = pricingConfig.resolvePricingForStudent(studentCbc, 'standard');
    ctx.assertEqual(cbcStandardPricing.monthly, 700, 'Kenyan CBC JSS standard monthly must remain KES 700');
    const cbcPremiumPricing = pricingConfig.resolvePricingForStudent(studentCbc, 'premium');
    ctx.assertEqual(cbcPremiumPricing.monthly, 1500, 'Kenyan CBC JSS premium monthly must remain KES 1,500');
  },

  'TC-BRI-04: Tier Governance - Teacher of school has authority to update tier; unauthorized actor rejected': async (ctx) => {
    // 1. Create a school student enrolled in Year 10
    const handle = ctx.uniqueHandle('SchoolLearner');
    const pin = ctx.uniquePin();
    const parentEmail = ctx.uniqueEmail('parent_gov');
    const schoolId = 'sch_hillcrest_international';

    const stu = studentStore.createStudent({
      handle,
      pin,
      email: parentEmail,
      grade: 10,
      curriculum: 'BRITISH',
      examBoard: 'CAIE',
      examTier: 'core',
      school: 'Hillcrest International',
      schoolId: schoolId,
      yearGroup: 10
    });

    // 2. Student attempts to update their own tier directly -> rejected
    const studentRes = studentStore.updateStudentExamTier(stu.id, 'extended', { role: 'student', id: stu.id });
    ctx.assertEqual(studentRes.success, false, 'Student cannot change their own exam tier');
    ctx.assertIncludes(studentRes.error, 'managed by', 'Error must state tier is managed by school');

    // 3. Parent of a school-linked student attempts to update tier -> rejected because teacher holds authority
    const parentRes = studentStore.updateStudentExamTier(stu.id, 'extended', { role: 'parent', email: parentEmail });
    ctx.assertEqual(parentRes.success, false, 'Parent cannot change tier for school-enrolled student');
    ctx.assertIncludes(parentRes.error, 'managed by', 'Error must state tier is managed by school');

    // 4. Authorized teacher from that school updates tier -> succeeds!
    const updated = studentStore.updateStudentExamTier(stu.id, 'extended', { role: 'teacher', schoolId: schoolId });
    ctx.assertEqual(updated.examTier, 'extended', 'Authorized teacher should successfully update tier to extended');
  },

  'TC-BRI-05: Socratic British Knowledge Engine enforces CAIE command words and 2025 non-calculator rule': async (ctx) => {
    // Verify curriculumContextBritish exists and has comprehensive knowledge modules
    ctx.assert(curriculumContextBritish != null, 'curriculumContextBritish must be defined');
    ctx.assert(curriculumContextBritish.CAIE != null, 'CAIE specifications must exist');
    ctx.assert(curriculumContextBritish.EDEXCEL != null, 'Edexcel specifications must exist');

    // Check CAIE Mathematics 0580 syllabus rules
    const maths0580 = curriculumContextBritish.CAIE.Mathematics_0580;
    ctx.assert(maths0580 != null, '0580 Mathematics must be present');
    ctx.assertEqual(maths0580.paperRules.Paper2.calculatorAllowed, false, 'CAIE 2025 Paper 2 must be NON-CALCULATOR');

    // Check CAIE Command Words taxonomy
    const commandWords = curriculumContextBritish.CAIE.CommandWords;
    ctx.assert(commandWords.State != null, 'Command word State must be defined');
    ctx.assert(commandWords.Explain != null, 'Command word Explain must be defined');
    ctx.assert(commandWords.Calculate != null, 'Command word Calculate must be defined');

    // Check Paper 6 Alternative to Practical protocols
    const atp = curriculumContextBritish.CAIE.Sciences_ATP_Paper6;
    ctx.assert(atp != null, 'Sciences ATP Paper 6 protocols must be defined');
    ctx.assert(atp.variableIdentification != null, 'ATP must contain experimental variable guidance');
  },

  'TC-BRI-06: Dedicated Labs Isolation - CBE STEM Lab vs Cambridge Science Lab Bench (Paper 6 ATP)': async (ctx) => {
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');

    // 1. CBE Lab Bench DOM assertions
    ctx.assertIncludes(html, 'id="cbeLabBenchContainer"', 'CBE Lab container must exist');
    ctx.assertIncludes(html, 'CBE STEM INNOVATION & PRACTICAL LAB', 'CBE Lab must have distinctive badge');
    ctx.assertIncludes(html, 'KNEC School-Based Assessment (SBA)', 'CBE Lab must reference SBA rubrics');
    ctx.assertIncludes(html, 'Plant Indicators (Hibiscus / Turmeric)', 'CBE Lab must feature local Kenyan improvisation');
    ctx.assertIncludes(html, 'Evaporative Charcoal Cooler', 'CBE Lab must include charcoal cooler tech');
    ctx.assertIncludes(html, 'triggerCbeLabAction', 'CBE Lab must trigger dedicated CBE actions');

    // 2. Cambridge Lab Bench DOM assertions
    ctx.assertIncludes(html, 'id="cambridgeLabBenchContainer"', 'Cambridge Lab container must exist');
    ctx.assertIncludes(html, 'CAMBRIDGE SCIENCE LAB BENCH', 'Cambridge Lab must have distinctive badge');
    ctx.assertIncludes(html, 'Paper 6 Alternative to Practical (ATP)', 'Cambridge Lab must specify Paper 6 ATP');
    ctx.assertIncludes(html, 'Measuring Cylinder (±0.5 cm³)', 'Cambridge Lab must feature calibrated measuring cylinder');
    ctx.assertIncludes(html, 'Top-pan Balance (±0.01 g)', 'Cambridge Lab must feature analytical balance');
    ctx.assertIncludes(html, 'triggerCambridgeLabAction', 'Cambridge Lab must trigger dedicated CAIE ATP actions');

    // 3. Script logic assertions
    ctx.assertIncludes(html, 'function renderDedicatedLabBench', 'renderDedicatedLabBench function must exist');
    ctx.assertIncludes(html, 'BRITISH_SUGGESTIONS_BY_SUBJECT', 'BRITISH_SUGGESTIONS_BY_SUBJECT catalog must exist');
  },

  'TC-BRI-07: Parent Portal simplified advice and Year 10E badge formatting for British learners': async (ctx) => {
    const fs = require('fs');
    const path = require('path');
    const serverCode = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');

    // Verify Year 10E / 10C clean badge logic is present
    ctx.assertIncludes(serverCode, "((c.yearGroup || c.grade) >= 10 ? (c.examTier === 'core' ? 'C' : 'E') : '')", 'Server must format Year 10E/10C cleanly');
    ctx.assert(!serverCode.includes('🔒 Tier: EXTENDED (Managed by School)'), 'Sterile school tier lock label must NOT appear');

    // Verify British subject advice blocks exist
    ctx.assertIncludes(serverCode, 'Pure Mathematics & Algebra', 'Parent advice must support British Mathematics');
    ctx.assertIncludes(serverCode, 'Forces, Energy & Waves', 'Parent advice must support British Physics');
    ctx.assertIncludes(serverCode, 'Matter, Reactions & Stoichiometry', 'Parent advice must support British Chemistry');
    ctx.assertIncludes(serverCode, 'Living Organisms & Systems', 'Parent advice must support British Biology');
  }
};
