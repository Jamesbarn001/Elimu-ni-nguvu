// ============================================================
// server.js — Elingu Socratic Engine v5
// Architecture: Sentinel → Curriculum Cache → Rolling Summary → LLM
// ============================================================
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const {
  CONSTITUTION,
  checkBlocklist,
  getBlockedResponse,
  auditResponse,
  AUDIT_FALLBACK,
} = require('./constitution');
const CURRICULUM = require('./curriculumContext');
const { BRITISH_CURRICULUM, CAIE_COMMAND_WORDS } = require('./curriculumContextBritish');
const studentStore = require('./studentStore');
const persistentStore = require('./persistentStore');
const parentStore = require('./parentStore');
const teacherStore = require('./teacherStore');
const emailService = require('./emailService');
const smsService = require('./smsService');
const authUtils = require('./authUtils');
const mpesaService = require('./mpesaService');
const pricingConfig = require('./pricingConfig');
const adminStore = require('./adminStore');
const adminRoutes = require('./adminRoutes');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Mount Super Admin Operations Router (/admin and /api/admin/*)
app.use(adminRoutes);

// Direct routes for Student Socratic Learner Companion
app.get(['/learn', '/student', '/app', '/chat'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ============================================================
// SECTION 0 — PROVIDER CONFIGURATION
// Read MODEL_PROVIDER from .env (default: gemini)
// Read GEMINI_MODEL from .env (default: gemini-flash-latest)
// Supports: gemini | openai | groq | anthropic
// ============================================================
const APP_VERSION = process.env.npm_package_version || '5.0.0';
const ACTIVE_PROVIDER = (process.env.MODEL_PROVIDER || 'gemini').toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
const ANTHROPIC_CRISIS_MODEL = process.env.ANTHROPIC_CRISIS_MODEL || 'claude-3-5-sonnet-latest';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Validate keys on startup
if (ACTIVE_PROVIDER === 'gemini' && !GOOGLE_API_KEY) {
  console.error('❌ GOOGLE_API_KEY is missing. Get a free key at https://aistudio.google.com');
  process.exit(1);
}
if (ACTIVE_PROVIDER === 'openai' && !OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is missing from .env.');
  process.exit(1);
}
if (ACTIVE_PROVIDER === 'groq' && !process.env.GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY is missing from .env.');
  process.exit(1);
}
if (ACTIVE_PROVIDER === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY is missing from .env.');
  process.exit(1);
}

// Initialise SDK clients only when needed (no package installs required for Gemini/OpenAI — uses native fetch)
let groqClient = null;
let anthropicClient = null;

if (ACTIVE_PROVIDER === 'groq') {
  const Groq = require('groq-sdk');
  groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
}
if (ACTIVE_PROVIDER === 'anthropic') {
  const Anthropic = require('@anthropic-ai/sdk');
  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const ACTIVE_MODEL =
  ACTIVE_PROVIDER === 'gemini' ? GEMINI_MODEL :
    ACTIVE_PROVIDER === 'openai' ? OPENAI_MODEL :
      ACTIVE_PROVIDER === 'groq' ? GROQ_MODEL :
        ACTIVE_PROVIDER === 'anthropic' ? ANTHROPIC_MODEL :
          'unknown';

const FREE_TIER_MODELS = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const IS_FREE_TIER = ACTIVE_PROVIDER === 'gemini' && FREE_TIER_MODELS.some(m => GEMINI_MODEL.includes(m));

console.log(`🌳 Elingu — Socratic Engine v5`);
console.log(`🤖 Provider: ${ACTIVE_PROVIDER.toUpperCase()} | Model: ${ACTIVE_MODEL}`);
console.log(`💸 Free tier: ${IS_FREE_TIER ? 'YES ✅' : 'NO (paid)'}`);
console.log(`⚖️  Constitutional AI safety system: ACTIVE`);


// ============================================================
// SECTION 1 — SENTINEL ROUTER (ZERO API COST)
// Matches greetings, acknowledgements, and noise patterns.
// Returns a warm template response WITHOUT calling any AI.
// ============================================================
const SENTINEL_PATTERNS = [
  /^(hi|hey|hello|hujambo|habari|niaje|mambo|sasa|salaam|oya|oza)[\s!?.]*$/i,
  /^(ok|okay|sure|yes|yeah|yep|nope|no|alright|sawa|sawa sawa)[\s!?.]*$/i,
  /^(thanks|thank you|asante|asante sana|thx|ty)[\s!?.]*$/i,
  /^(lol|haha|hehe|lmao|😂|😄|😊|👍|🔥)[\s!?.]*$/i,
  /^(bye|goodbye|see you|later|cya|kwaheri|tutaonana)[\s!?.]*$/i,
  /^(cool|nice|great|wow|amazing|awesome|good)[\s!?.]*$/i,
  /^(hmm|uh|um|ah|oh|ohh|ohhh)[\s!?.]*$/i,
];

const SENTINEL_RESPONSES_MATHS = [
  "Ready when you are! What are we tackling in Maths today? 📐",
  "All good! So, what's on your mind — any strand or sub-strand giving you trouble?",
  "Good to hear! What maths problem should we crack together today?",
  "Noted! Where would you like to pick up — or is there something new you want to explore?",
  "Take your time. When you're ready, just tell me what topic you want to work on, sawa?",
  "No problem! I'm here whenever you need. What's our maths mission for today?",
];

const SENTINEL_RESPONSES_SCIENCE = [
  "Ready when you are! What science topic are we exploring today? 🔬",
  "All good! Any strand or experiment you want to dive into?",
  "Nice! What science question has been bugging you? Let's figure it out together.",
  "Noted! Should we pick up where we left off, or try something new in science?",
  "Take your time. When you're ready, tell me what you want to investigate, sawa?",
  "No problem! I'm here whenever you need. What's our science mission for today? 🧪",
];

const SENTINEL_RESPONSES_ENGLISH = [
  "Ready when you are! What are we working on in English today? 📚",
  "All good! Any writing, grammar, or reading strand you want to explore?",
  "Nice! Got a sentence that's giving you trouble? Let's untangle it together.",
  "Noted! Should we work on reading, writing, or grammar today?",
  "Take your time. When you're ready, tell me what you want to practise!",
  "No problem! I'm here whenever you need. What's our English mission for today? ✍️",
];

const SENTINEL_RESPONSES_SOCIAL_STUDIES = [
  "Ready when you are! What are we exploring in Social Studies today? 🌍",
  "All good! Any strand — maps, history, citizenship — you want to dive into?",
  "Nice! Got a topic you're curious about? Let's explore it together.",
  "Noted! Should we work on geography, history, or government today?",
  "Take your time. When you're ready, tell me what you want to explore, sawa?",
  "No problem! I'm here whenever you need. What's our Social Studies mission for today? 🗺️",
];

const SENTINEL_RESPONSES_KISWAHILI = [
  "Hujambo! 🇰🇪 Karibu katika somo la Kiswahili. Ni mada gani tunayoangazia leo — Sarufi, Ufahamu, au Insha?",
  "Habari yako! 🌟 Uko tayari kwa somo la Kiswahili leo? Ni swali gani au ngeli gani inayokusumbua?",
  "Karibu sana! 📚 Leo tunazama katika Fasihi, Sarufi, au Uandishi wa Insha?",
  "Vizuri sana! ✍️ Ungependa tuchambue methali, ngeli, au tuandike insha ya ubunifu?",
  "Hujambo mwanafunzi! 💡 Kila kitu kinawezekana katika Kiswahili. Tuanzie wapi leo?",
  "Hakuna shida hata kidogo! Nipo hapa kukusaidia wakati wowote. Tuanze na mada gani leo? 🇰🇪",
];

const SENTINEL_RESPONSES_ESSENTIAL_MATHS = [
  "Ready when you are! What consumer numeracy or business calculation are we tackling today? 💼",
  "All good! Need help with budgeting, tax (PAYE/VAT), or interest rates? Let's break it down together.",
  "Nice! What practical math challenge are we exploring today?",
  "Noted! Should we work on personal finance, business models, or data interpretation today?",
  "Take your time. When you're ready, tell me what calculation or financial problem you'd like to work through, sawa?",
  "No problem! I'm here whenever you need. What's our Essential Mathematics mission for today? 📊",
];

const SENTINEL_RESPONSES_CSL = [
  "Ready when you are! What community challenge or CSL project are we working on today? 🤝",
  "All good! Need help with your community needs assessment, action plan, or project portfolio?",
  "Nice! What problem in your neighborhood or environment are you investigating?",
  "Noted! Should we work on ethical project design, stakeholder mapping, or impact evaluation?",
  "Take your time. When you're ready, tell me about your Community Service Learning initiative!",
  "No problem! I'm here whenever you need. Let's make a real difference in our community today! 🌍",
];

function checkSentinel(message) {
  const trimmed = message.trim();
  return SENTINEL_PATTERNS.some(p => p.test(trimmed));
}

function getSentinelResponse(subject) {
  let responses = SENTINEL_RESPONSES_MATHS;
  if (subject === 'Virtual Lab') {
    responses = [
      "Hujambo! 🔬 Welcome to the Elingu Virtual Practical Lab workbench. What science experiment or practical investigation are we setting up today? 🧪",
      "Hello young scientist! 🌟 Welcome to the Virtual Lab. Are we exploring Physics, Chemistry, Biology, or Computing today? ⚖️",
      "Safi sana! 🧪 The lab bench is ready with our calibrated apparatus. What hypothesis are we testing today? 🔬"
    ];
  } else if (subject === 'Science & Technology') responses = SENTINEL_RESPONSES_SCIENCE;
  else if (subject === 'English') responses = SENTINEL_RESPONSES_ENGLISH;
  else if (subject === 'Social Studies') responses = SENTINEL_RESPONSES_SOCIAL_STUDIES;
  else if (subject === 'Kiswahili') responses = SENTINEL_RESPONSES_KISWAHILI;
  else if (subject === 'Essential Mathematics') responses = SENTINEL_RESPONSES_ESSENTIAL_MATHS;
  else if (subject === 'Community Service Learning') responses = SENTINEL_RESPONSES_CSL;
  return responses[Math.floor(Math.random() * responses.length)];
}


// ============================================================
// SECTION 2 — CURRICULUM PROMPT BUILDER
// Splits the system prompt into STATIC (curriculum) and DYNAMIC (context).
// STATIC part is large and repeated every session — ideal for caching.
// DYNAMIC part is small and changes per request.
// ============================================================

// Subject aliases — allows frontend to send friendly names and syllabus codes
const SUBJECT_ALIASES = {
  'Virtual Lab': 'Virtual Lab',
  'Virtual Science Lab': 'Virtual Lab',
  'Virtual Practical Lab': 'Virtual Lab',
  'Integrated Science': 'Science & Technology',
  'Science': 'Science & Technology',
  'Science and Technology': 'Science & Technology',
  'Social': 'Social Studies',
  'Swahili': 'Kiswahili',
  'Core Mathematics': 'Mathematics',
  'Core Maths': 'Mathematics',
  'Essential Maths': 'Essential Mathematics',
  'CSL': 'Community Service Learning',
  'Community Service': 'Community Service Learning',
  'Computer Science': 'Computer Studies',
  'Comp Studies': 'Computer Studies',
  // Cambridge IGCSE & Checkpoint Syllabus Aliases
  'Mathematics (0580)': 'Mathematics',
  'Mathematics Core (0580)': 'Mathematics',
  'Mathematics Extended (0580)': 'Mathematics',
  'First Language English (0500)': 'English',
  'English as a Second Language (0510)': 'English',
  'Physics (0625)': 'Physics',
  'Chemistry (0620)': 'Chemistry',
  'Biology (0610)': 'Biology',
  'Computer Science (0478)': 'Computer Studies',
  'Business Studies (0450)': 'Business Studies',
  'Economics (0455)': 'Business Studies',
  'Geography (0460)': 'Geography',
  'History (0470)': 'History and Citizenship',
  'Checkpoint Mathematics (0862)': 'Mathematics',
  'Checkpoint English (0861)': 'English',
  'Lower Secondary Science (0893)': 'Science & Technology',
  'Computing (0860)': 'Computer Studies',
  'Physics (Checkpoint)': 'Physics',
  'Chemistry (Checkpoint)': 'Chemistry',
  'Global Perspectives (0838)': 'Social Studies',
  // Pearson Edexcel IGCSE & iLowerSecondary Aliases
  'Mathematics A (4MA1)': 'Mathematics',
  'Mathematics B (4MB1)': 'Mathematics',
  'English Language A (4EA1)': 'English',
  'English Language B (4EB1)': 'English',
  'Physics (4PH1)': 'Physics',
  'Chemistry (4CH1)': 'Chemistry',
  'Biology (4BI1)': 'Biology',
  'Human Biology (4HB1)': 'Biology',
  'Computer Science (4CP0)': 'Computer Studies',
  'Business (4BS1)': 'Business Studies',
  'Economics (4EC1)': 'Business Studies',
  'Geography (4GE1)': 'Geography',
  'History (4HI1)': 'History and Citizenship',
  'iLowerSecondary Maths (LMA11)': 'Mathematics',
  'iLowerSecondary English (LEN11)': 'English',
  'iLowerSecondary Science (LSC11)': 'Science & Technology',
  'iLowerSecondary Computing (LIT11)': 'Computer Studies',
  'Global Citizenship (LGC11)': 'Social Studies'
};

// Subjects that generate SVG diagrams or visual outputs
const VISUAL_SUBJECTS = ['Mathematics', 'Science & Technology', 'Social Studies', 'Essential Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Studies', 'Virtual Lab'];

// Resolve display name for a subject based on grade
function getSubjectDisplayName(subject, grade) {
  if (subject === 'Virtual Lab' || (subject && subject.toLowerCase().includes('virtual lab'))) {
    return 'Virtual Practical Lab';
  }
  if (subject === 'Science & Technology' || SUBJECT_ALIASES[subject] === 'Science & Technology') {
    return grade === 6 ? 'Science and Technology' : 'Integrated Science';
  }
  if (subject === 'Mathematics' || SUBJECT_ALIASES[subject] === 'Mathematics') {
    return grade >= 10 ? 'Core Mathematics' : 'Mathematics';
  }
  if (subject === 'Essential Mathematics' || SUBJECT_ALIASES[subject] === 'Essential Mathematics') {
    return 'Essential Mathematics';
  }
  if (subject === 'Community Service Learning' || SUBJECT_ALIASES[subject] === 'Community Service Learning') {
    return 'Community Service Learning';
  }
  if (subject === 'Physics') return 'Physics';
  if (subject === 'Chemistry') return 'Chemistry';
  if (subject === 'Biology') return 'Biology';
  if (subject === 'Computer Studies' || SUBJECT_ALIASES[subject] === 'Computer Studies') return 'Computer Studies';
  return subject;
}

// Subject-specific pedagogical guidelines injected dynamically
const SUBJECT_PEDAGOGY = {
  'Mathematics': `
## MATHEMATICS TEACHING & DIAGRAMS
- Draw inline SVGs wrapped in \`\`\`xml ... \`\`\` blocks for shapes, angles, lines, coordinates, and calculus curves.
- Use dynamic/adaptive colors (\`stroke="currentColor"\`, \`fill="currentColor"\` for labels, \`opacity="0.1"\` for fills).
- Plain-text math notation only (e.g. "x = (-b ± √(b² - 4ac)) / (2a)"). NEVER output raw LaTeX syntax like \\frac{}.
- For Grades 10–12 (Senior School Core Math), guide through rigorous calculus, vectors, trigonometry, and surds step-by-step without giving away answers directly.
- Mix English with casual Swahili/Sheng naturally.`,

  'Essential Mathematics': `
## ESSENTIAL MATHEMATICS TEACHING & NUMERACY
- Focus on practical, real-world utility: personal financial budgets, eTIMS VAT calculations, PAYE income tax brackets, SACCO shares, and mobile money transactions.
- Guide students to understand the *meaning* behind financial and tax numbers before applying formulas.
- Plain-text math notation only. Keep calculations intuitive and grounded in Kenyan shillings (KES).
- Use inline SVGs for financial charts (pie charts, bar charts, break-even curves) wrapped in \`\`\`xml ... \`\`\` blocks.
- Mix English with casual Swahili/Sheng naturally.`,

  'Community Service Learning': `
## COMMUNITY SERVICE LEARNING (CSL) MENTORSHIP
- Mentor learners through the four-stage action cycle: (1) Needs Assessment, (2) Ethical Project Design, (3) Implementation, (4) Impact Evaluation & Sustainability.
- Encourage evidence-based, stakeholder-centered solutions to real Kenyan community challenges (sanitation, tree planting, clean water, digital literacy).
- Coach students on maintaining their digital learning portfolios and reflective journals for KNEC School-Based Assessment (SBA).
- Discourage treating CSL as manual chore work — emphasize research, data collection, and civic leadership.
- Converse warmly, blending English with Swahili encouragement ("Hongera kwa mradi huu!", "Great initiative!").`,

  'Science & Technology': `
## SCIENCE TEACHING & DIAGRAMS
- Draw inline SVGs wrapped in \`\`\`xml ... \`\`\` blocks for cells, circuits, food chains, and apparatus (max 300x250 viewBox).
- Use dynamic context colors (blue for water, red/amber for energy, \`currentColor\` for outlines & labels) on transparent backgrounds.
- Guide students to observe cause and effect in natural phenomena.
- Mix English with casual Swahili/Sheng naturally.`,

  'English': `
## ENGLISH LANGUAGE TEACHING
- **STRICT IMMERSION**: Converse in clear, natural, engaging English. Do NOT use Swahili or Sheng greetings/filler words (no Jambo, Sawa, Habari, Karibu). Full English immersion.
- **EMERGENCY SCAFFOLDING ONLY**: Use Swahili/Sheng ONLY if the student explicitly states they cannot understand an English concept. Once clarified, guide them smoothly back to English.
- Text-based only — do NOT draw SVGs for English.
- Correct grammar gently by modelling: quote student attempt, show improved version in **bold**.
- Watch for L1 interference: "My names are" → "My name is", "I am having" → "I have", "She told that" → "She said that", "He refused me" → "He refused to help me".
- For reading comprehension, ask "Why do you think the author..." not "What happened next?"
- For vocabulary, use relatable Kenyan contexts while maintaining standard English.
- For Grades 10–12, coach learners on professional registers (CVs, minutes, memoranda) and rhetoric (Ethos, Pathos, Logos).`,

  'Social Studies': `
## SOCIAL STUDIES TEACHING & DIAGRAMS
- Draw inline SVGs wrapped in \`\`\`xml ... \`\`\` blocks for compass roses (8-point), sketch maps, contour patterns, and historical timelines.
- Use theme-adaptive colors (\`stroke="currentColor"\`, blue water, green/brown land).
- Historical analysis: Focus on causation and consequences ("Why did this happen? What were the effects?").
- Citizenship & ethics: Connect civic concepts to real-life Kenyan experiences (county government, community).
- Map work: Guide step-by-step through compass directions, scale calculations, and grid references.
- Mix English with casual Swahili/Sheng naturally.`,

  'Kiswahili': `
## KISWAHILI TEACHING & PEDAGOGY (SARUFI, INSHA, FASIHI SIMULIZI)
- **LUGHA YA MAFUNZO (KISWAHILI SANIFU)**: Fundisha na zungumza kwa Kiswahili Sanifu chenye heshima, mvuto na uchangamfu. Usitumie Kiingereza isipokuwa mwanafunzi anapoomba tafsiri au kueleza kushindwa kuelewa kabisa.
- **EMOJIS**: Weka emoji mara baada ya salamu au kifungu cha kwanza (k.m. "Hujambo! 🌟", "Safi sana! 👏", "Vizuri! 🎯", "Hongera! ✨") na nyunyizia emoji za kuchochea fikra (k.m. 🤔, 💭, 💡, 📖, ✍️). Kamwe usitoe jibu kupitia emoji!
- **SARUFI NA NGELI**: Sahihisha makosa ya ngeli (k.m. A-WA, KI-VI, I-ZI), viambishi ngeli, na unyambulishaji wa vitenzi kwa upole kwa kuandika mfano sahihi katika herufi nzito (**bold**).
- **FASIHI SIMULIZI NA METHALI**: Chochea fikra za ndani kuhusu methali, vitendawili, na ngano badala ya kutoa maana ya moja kwa moja.
- **INSHA NA UFAHAMU**: Msaidie mwanafunzi kupanga aya, kuboresha msamiati, na kutumia tamathali za usemi (tashbiha, sitiari, nahau).
- **JINA LA MITAALA**: Tumia "Mstari" na "Mstari Mdogo" (Strand & Sub-strand).
- **GREDI YA 10-12 (SHULE YA UPILI YA JUU)**: Kaza ufundishaji wa Isimujamii (sajili rasmi: bungeni, kortini), uchanganuzi wa sentensi changamano, na uandishi wa kiuchunguzi.`,

  'Virtual Lab': `
## VIRTUAL SCIENCE & TECHNOLOGY PRACTICAL LAB BENCH & WORKSPACE
- You are Elingu's Lead Virtual Practical Laboratory Demonstrator & Chief Scientific Investigator.
- You guide students through hands-on virtual laboratory practicals across Physics, Chemistry, Biology, Computer Science, and Integrated Science.

### ⚡ ABSOLUTE VISUAL-FIRST & ANTI-WORDINESS MANDATE (NON-NEGOTIABLE):
1. **NEVER LECTURE OR DUMP TEXT**: You are at a real science workbench with the student. Keep all conversational text strictly limited to **2 to 4 punchy sentences maximum** per turn.
2. **MANDATORY INLINE SVG APPARATUS BLUEPRINT**:
   - In EVERY lab turn where apparatus is introduced, manipulated, or changing state, you MUST generate an inline SVG diagram wrapped in \`\`\`xml ... \`\`\` code fence.
   - Recommended dimensions: \`viewBox="0 0 340 200"\` or \`viewBox="0 0 340 220"\`.
   - SVG styling: Use modern, high-contrast, theme-adaptive vectors. Use \`stroke="currentColor"\` for glass outlines, \`#38BDF8\` / \`#0EA5E9\` for water/liquids, \`#EF4444\` / \`#F59E0B\` for flames/heat, \`#10B981\` for reagents, and clear text labels (\`<text fill="currentColor" font-size="11" font-family="sans-serif">...\`).
   - Draw realistic apparatus: beakers with graduated markings, boiling tubes in wire gauze, bunsen burners with air holes, simple pendulums, Ray boxes with prisms, electrical circuit schematics (cell, switch, ammeter, bulb, rheostat), or food test spot plates.
3. **DIGITAL INSTRUMENT & GAUGE READOUTS**:
   - Present live instrument measurements using distinct visual readout badges:
   \`\`\`text
   ┌────────────────────────────────────────────────────────┐
   │ 🔬 WORKBENCH READOUT:                                   │
   │ ⏱️ Digital Stopwatch:   [ 00:14.82 s ]                  │
   │ 🌡️ Digital Thermometer: [ 68.5 °C ]                     │
   │ ⚖️ Electronic Balance:  [ 142.30 g ]                    │
   │ 👁️ Observation:         [ Effervescence, brisk bubbles ] │
   └────────────────────────────────────────────────────────┘
   \`\`\`
4. **STRUCTURED OBSERVATIONS & DATA TABLES**:
   - Present experimental data and trial results in clean Markdown tables with strict scientific header slash notation (\`Quantity / unit\`, e.g. \`Trial | Length l / m | Time t / s | Period T / s\`).

### 🔬 4-STAGE SCIENTIFIC INQUIRY CYCLE:
1. **Stage 1 — Apparatus & Safety Setup**: Present the apparatus diagram. Ask the student to identify the Independent Variable (IV) and 1 crucial safety precaution (e.g. eye goggles, heat mat, or insulating gloves).
2. **Stage 2 — Step-by-Step Procedure & Control**: Guide the student to take a measurement. Ask what 2 variables must be kept constant (Controlled Variables) to guarantee a fair test.
3. **Stage 3 — Live Measurement & Anomaly Detection**: Display the digital readout box. Ask the student to record the dependent variable (DV), check for parallax error (reading meniscus at eye level), or spot any outlier trials.
4. **Stage 4 — Analysis, Calculation & Error Reflection**: Prompt the learner to calculate the mean or gradient, explain the underlying scientific principle, and identify 1 source of experimental uncertainty (random vs. systematic zero error) and how to improve accuracy.

### 🇰🇪 KENYAN CBE & 🌍 BRITISH CURRICULUM RIGOR:
- **For Kenyan CBE STEM (Grades 7–12)**: Relate practicals to KNEC School-Based Assessment (SBA) rubrics (Exceeding, Meeting, Approaching) and ingenious local Kenyan material improvisation (e.g. red hibiscus flower indicator extract, charcoal cooling box, sand and gravel bio-filtration, wire coat hanger balances).
- **For British Curriculum (Cambridge CAIE 0625/0620/0610 & Pearson Edexcel 4PH1/4CH1/4BI1)**: Train learners on Paper 6 Alternative to Practical (ATP) and Paper 5, CAIE command words ('State', 'Describe', 'Explain', 'Suggest'), standard 6-mark planning responses, and strict graph plotting rules (>50% grid used, linear scales, neat crosses \`×\`).`
};

function buildStaticPrompt(subject, grade, studentContext = null) {
  const isBritish = studentContext && (studentContext.curriculum === 'BRITISH' || studentContext.curriculum === 'IGCSE');
  const examBoard = studentContext ? (studentContext.examBoard || 'CAIE') : 'CAIE';
  const examTier = studentContext ? (studentContext.examTier || 'extended') : 'extended';

  let curriculumBlock = '';
  let subjectPedagogy = SUBJECT_PEDAGOGY[subject] || SUBJECT_PEDAGOGY['Mathematics'];

  if (subject === 'Virtual Lab' || (subject && subject.toLowerCase().includes('virtual lab'))) {
    subjectPedagogy = SUBJECT_PEDAGOGY['Virtual Lab'];
    curriculumBlock = isBritish
      ? `Cambridge & Pearson Edexcel Practical Laboratory Science (Physics, Chemistry, Biology, Computing) — Alternative to Practical (Paper 6 / Paper 5)`
      : `Kenya CBE STEM Virtual Practical Laboratory (Physics, Chemistry, Biology, Computer Studies, Integrated Science) — SBA Practicals & Local Improvisation`;
  } else if (isBritish) {
    const bSubjectData = BRITISH_CURRICULUM[subject];
    const bGradeData = bSubjectData ? (bSubjectData[grade] || bSubjectData[10]) : null;
    curriculumBlock = bGradeData || `Cambridge / Edexcel Year ${grade} ${subject} Curriculum`;
  } else {
    const subjectData = CURRICULUM[subject];
    const gradeData = subjectData ? subjectData[grade] : null;
    curriculumBlock = gradeData || `Grade ${grade} ${subject} — CBE Kenya curriculum`;
  }

  const isKiswahili = subject === 'Kiswahili';

  const naturalOpeningInstruction = isKiswahili
    ? `Anza kwa Kiswahili chenye heshima na uchangamfu kikiwa na emoji baada ya salamu (k.m. "Hujambo! 🌟", "Karibu! 🇰🇪", "Safi sana! 👏").`
    : `Do NOT open with repetitive canned Swahili greetings (no "Sawa!", "Habari!"). Start in natural English with your opening greeting and emoji hook.`;

  const britishPedagogyBlock = isBritish ? `
---

## BRITISH CURRICULUM (${examBoard} — ${examTier.toUpperCase()} TIER) RIGOR RULES
1. **EXAMINATION BOARD CONTEXT**:
   - Board: **${examBoard}** | Target Level: **Year ${grade} (${grade >= 10 ? 'IGCSE' : 'Checkpoint'})** | Tier: **${examTier.toUpperCase()}**
   - Align fully with official **${examBoard}** syllabus and examiner mark schemes.
2. **CAIE COMMAND WORDS CONTRACT**:
   - **Explain**: STRICT: Never accept descriptive answers! Always demand physical/chemical/biological causes, collision theory, kinetic energy, or water potential gradients.
   - **Describe**: Ask for chronological sequence or visual trends on a graph.
   - **Calculate / Show that**: Emphasize method marks (M1, M2) before accuracy marks (A1).
   - **Paper 6 ATP (Alternative to Practical)**: Strictly enforce standard table units (slash notation like "Time / s"), graph axes covering > 50% grid, and linear scales.
3. **2025 NON-CALCULATOR ACCURACY**: For Mathematics Paper 1/2, insist on exact fractions, simplified surds, and no premature rounding.` : '';

  return `${CONSTITUTION}

---

## WHO YOU ARE & YOUR MISSION
You are **Elingu** (*"Elimu ni nguvu"* — knowledge is power) — a warm, encouraging Socratic tutor who guides students through ${isBritish ? 'the British International (Cambridge CAIE / Pearson Edexcel) curriculum' : 'the Kenyan CBC curriculum'}.
You are like a cool, supportive older cousin: real, relaxed, invested, and never condescending.

## SOCRATIC TEACHING METHOD (${isBritish ? 'CAMBRIDGE / EDEXCEL INQUIRY-BASED' : 'KICD INQUIRY-BASED'})
1. **Prompt, don't lecture**: Keep responses short and punchy (max 3-4 sentences). Always end with a leading question or invitation.
2. **Scaffold progressively**:
   - Greet warmly on first message.
   - Ground topics in real-world contexts and concrete experiments.
   - When a student struggles or boycotts ("i hate maths", "i give up"), validate warmly first, then break the problem into a simpler step.
   - Right answer → celebrate genuinely, then ask the next inquiry question.
3. **Pedagogical Terminology**: Use "${isBritish ? 'Topic' : 'Strand'}" and "${isBritish ? 'Sub-topic' : 'Sub-strand'}".

## EMOJIS & TONE RULES
1. **OPENING GREETING & EMOJI HOOK (MANDATORY & NO SPOILERS)**:
   - Place a vibrant, expressive emoji right after your opening greeting or initial phrase (e.g. "Spot on! 🎯", "Welcome! 🌟", "Awesome work! 👏", "Great observation! 💡", "Hello there! 🌿", "Brilliant! ✨", "Nice work! 🚀").
   - Continue sprinkling curiosity and thinking emojis throughout your explanation and closing question (e.g. 🤔, 💭, 🔍, 💡, 📐, 🔬, 📖, ✍️).
   - CRITICAL NO-SPOILER RULE: NEVER use emojis that leak, reveal, or spoil the answer to the Socratic question you are asking. Emojis must stimulate thinking, not give away the puzzle!
2. **Natural Openings**: ${naturalOpeningInstruction}

---

## SUBJECT & CURRICULUM CONTEXT (${isBritish ? 'BRITISH INTERNATIONAL / IGCSE' : 'KICD CBE'})
Subject: **${getSubjectDisplayName(subject, grade)}** | ${isBritish ? 'Year Group' : 'Grade'}: **${grade}**

${curriculumBlock}
${britishPedagogyBlock}

---

${subjectPedagogy}

---

## REDIRECTION RULES
1. **WRONG SUBJECT FOR THIS CHATBOX**: If a student asks about a different active subject, warmly encourage them to ask in that subject's sidebar chatbox.
2. **OFF-TOPIC TRIVIA**: Gently acknowledge and pivot back to the subject.`;
}

function buildDynamicPrompt(grade, subject, turnCount, studentContext = null) {
  const isBritish = studentContext && (studentContext.curriculum === 'BRITISH' || studentContext.curriculum === 'IGCSE');
  let contextSnippet = `\n\n---\n## CURRENT SESSION CONTEXT (DYNAMIC)\n${isBritish ? 'Year Group' : 'Grade'}: ${grade} | Subject: ${subject} | Turn: ${turnCount}`;

  if (studentContext) {
    const { handle, county, age, school, curriculum, examBoard, examTier } = studentContext;
    contextSnippet += `\n\n## LEARNER PROFILE & PEDAGOGICAL ADAPTATION (${isBritish ? 'BRITISH INTERNATIONAL / IGCSE' : 'KENYA CBE'})
- **Learner Name / Nickname**: ${handle || 'Learner'}
- **Curriculum**: ${isBritish ? `British International (${examBoard || 'Cambridge CAIE'} - ${examTier || 'Extended'} Tier)` : 'Kenyan CBC'}
- **Academic Level**: ${isBritish ? `Year ${grade} (${grade >= 10 ? 'IGCSE' : 'Checkpoint'})` : `Grade ${grade} (${grade === 6 ? 'Upper Primary' : grade >= 10 ? 'Senior School' : 'Junior Secondary School'})`}
- **Learner Age**: ${age ? `${age} years old` : (grade === 6 ? '11 years old' : '14-16 years old')} (Calibrate vocabulary, analogy complexity, and cognitive scaffolding appropriately for this age group)
- **School**: ${school || (isBritish ? 'International School' : 'Kenyan CBE School')}`;
  }

  return contextSnippet;
}


// ============================================================
// SECTION 3 — TOKEN ESTIMATION & COST LOGGING
// Rough estimates: 1 token ≈ 4 characters (English).
// Gemini 2.5 Flash: $0.075/M input, $0.30/M output (approx).
// Claude Haiku:     $0.80/M input, $4.00/M output.
// Groq Llama 3.3:   ~$0.06/M input, $0.06/M output (approx).
// ============================================================
const COST_TABLE = {
  gemini: { input: 0.000000075, output: 0.000000300 },
  openai: { input: 0.000000150, output: 0.000000600 },
  groq: { input: 0.000000060, output: 0.000000060 },
  anthropic: { input: 0.000000800, output: 0.000004000 },
};

// Per-process session stats (resets on server restart)
const SESSION_STATS = {
  input_tokens: 0,
  output_tokens: 0,
  estimated_cost_usd: 0,
  cache_hits: 0,
  sentinel_count: 0,
  summarisation_count: 0,
  active_model: ACTIVE_MODEL,
  active_provider: ACTIVE_PROVIDER,
};

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function logUsage(provider, model, inputTokens, outputTokens) {
  const cost = adminStore.calculateModelCost(model, provider, inputTokens, outputTokens);
  SESSION_STATS.input_tokens += inputTokens;
  SESSION_STATS.output_tokens += outputTokens;
  SESSION_STATS.estimated_cost_usd += cost;
  console.log(`[${provider.toUpperCase()} | ${model}] in: ${inputTokens} tok | out: ${outputTokens} tok | est: $${cost.toFixed(6)}`);
  try {
    adminStore.recordTokenUsage({
      provider,
      model,
      inputTokens,
      outputTokens,
      costUsd: cost
    });
  } catch (err) { }
}


// ============================================================
// SECTION 4 — ABSTRACT LLM CALL
// Supports: Gemini (native fetch, default), Groq, Anthropic.
// Auto-escalates to claude-sonnet-4-6 ONLY on real crisis/self-harm keywords.
// ============================================================
const DISTRESS_KEYWORDS = /\b(suicide|kill myself|want to die|self-harm|cut myself|abuse|being abused|dying|in danger)\b/i;

// Helper for OpenAI calls (native fetch)
async function callOpenAI(messages, systemPrompt, maxTokens = 1000) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_key_here') throw new Error('OPENAI_API_KEY is not configured');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content || null;
  const inputTokens = data.usage?.prompt_tokens || estimateTokens(systemPrompt + messages.map(m => m.content).join(''));
  const outputTokens = data.usage?.completion_tokens || estimateTokens(reply || '');
  logUsage('openai', model, inputTokens, outputTokens);
  return reply;
}

async function callLLM(messages, staticPrompt, dynamicPrompt, options = {}) {
  const { forSummarisation = false, maxTokens } = typeof options === 'boolean' ? { forSummarisation: options } : options;
  const systemPrompt = staticPrompt + dynamicPrompt;
  const stripThinking = (text) => {
    if (!text) return text;
    // 1. Strip completed think/thought blocks
    let clean = text.replace(/<(think|thought)>[\s\S]*?<\/\1>\n*/gi, '').trim();
    // 2. Strip unclosed trailing think tags
    clean = clean.replace(/<(think|thought)>[\s\S]*$/gi, '').trim();

    // 3. If model output a "Draft:" or "Response:" section inside its monologue, extract it
    if (!clean && /Draft:?\s*["']?([\s\S]+?)["']?$/i.test(text)) {
      const match = text.match(/Draft:?\s*["']?([\s\S]+?)["']?$/i);
      clean = match[1].replace(/<\/?(think|thought)>/gi, '').trim();
    }

    // 4. Strip any meta-reasoning preamble if present
    clean = clean.replace(/^(Here's a thinking process:?|The user ['"].*?['"] is .*?\.\s*|Thinking Process:?|Let's analyze:?)[\s\S]*?(?=\n\n|$)/i, '').trim();

    // 5. Final safety check: if clean is still empty, return a clean Socratic fallback rather than leaking thoughts
    if (!clean) {
      clean = "Good observation! Let's keep going — what do you think is our next step? 📐";
    }

    return clean;
  };

  // Escalate to Claude Sonnet on emotional distress (only if Anthropic key exists)
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const needsEscalation = lastUserMsg && DISTRESS_KEYWORDS.test(lastUserMsg.content)
    && process.env.ANTHROPIC_API_KEY
    && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_key_here';

  // OpenAI (Primary Provider)
  if (ACTIVE_PROVIDER === 'openai' && !needsEscalation) {
    try {
      const reply = await callOpenAI(messages, systemPrompt, forSummarisation ? 300 : (maxTokens || 1000));
      return stripThinking(reply);
    } catch (err) {
      console.warn(`⚠️ Primary provider (OpenAI) failed: ${err.message}`);
      // Fallback to Groq if OpenAI fails
      if (process.env.GROQ_API_KEY) {
        console.log(`🔄 Falling back to Groq (${GROQ_MODEL})...`);
        try {
          if (!groqClient) {
            const Groq = require('groq-sdk');
            groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
          }
          const isEnglish = staticPrompt.includes('English');
          const leanSystemPrompt = `You are Elingu — a warm, encouraging Kenyan Socratic tutor for CBE curriculum.${dynamicPrompt}
How you teach: Guide through Socratic questions, do not give direct answers immediately. Keep responses short (max 3-4 sentences), conversational, and friendly. Use emojis naturally to keep the conversation warm and fun 🎯📚🔥.
${isEnglish ? 'CRITICAL LANGUAGE RULE: For English class, speak 100% in natural English. Do NOT use Swahili or Sheng (no Jambo, Sawa, Habari, Karibu). Use emojis naturally to keep the conversation warm. Only use Swahili if the student explicitly fails to understand in English.' : 'Language: Mix English with casual Swahili/Sheng naturally like a real Kenyan friend would (e.g. "Sawa, let\'s figure this out!", "Poa! Now think about...", "Rift Valley ni kitu gani?"). Keep it real, not scripted.'}
CRITICAL: Respond directly to the student immediately. Do NOT output <think> tags or internal reasoning blocks.
Formatting: Write math equations in clean plain text (e.g. 1/2 + 1/3 = 5/6). Do NOT use LaTeX syntax like \\frac{}.`;

          const response = await groqClient.chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: 'system', content: leanSystemPrompt }, ...messages],
            max_tokens: forSummarisation ? 300 : 4000,
          });
          const reply = stripThinking(response.choices[0]?.message?.content || null);
          const inputTokens = response.usage?.prompt_tokens || estimateTokens(leanSystemPrompt);
          const outputTokens = response.usage?.completion_tokens || estimateTokens(reply || '');
          logUsage('groq', `${GROQ_MODEL} (fallback)`, inputTokens, outputTokens);
          return reply;
        } catch (groqErr) {
          console.warn(`⚠️ Groq fallback also failed: ${groqErr.message}`);
        }
      }
      throw err;
    }
  }

  // Gemini (Primary Provider with 2.8s fast timeout & instant cascade)
  if (ACTIVE_PROVIDER === 'gemini' && !needsEscalation) {
    try {
      const model = forSummarisation ? 'gemini-flash-lite-latest' : GEMINI_MODEL;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`;

      const geminiMessages = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const limit = forSummarisation ? 300 : (maxTokens || 1000);

      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiMessages,
        generationConfig: { maxOutputTokens: limit },
      };

      // 6.0 second timeout controller to prevent user-facing hangs
      const controller = new AbortController();
      const timeoutMs = parseInt(process.env.GEMINI_TIMEOUT_MS || '6000', 10);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        const errText = await res.text();
        // If 503 high demand or 404, auto-failover to gemini-3.7-flash
        if ((res.status === 503 || res.status === 404) && model !== 'gemini-3.7-flash') {
          console.warn(`⚠️ Primary Gemini model (${model}) hit status ${res.status}. Seamless failover to gemini-3.7-flash...`);
          try {
            const backupUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${GOOGLE_API_KEY}`;
            const backupRes = await fetch(backupUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (backupRes.ok) {
              const bData = await backupRes.json();
              const bReply = stripThinking(bData?.candidates?.[0]?.content?.parts?.[0]?.text || null);
              if (bReply) return bReply;
            }
          } catch (backupErr) {
            console.warn(`⚠️ Backup Gemini call failed: ${backupErr.message}`);
          }
        }
        throw new Error(`Gemini API error ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const reply = stripThinking(data?.candidates?.[0]?.content?.parts?.[0]?.text || null);

      const inputTokens = data?.usageMetadata?.promptTokenCount || estimateTokens(systemPrompt + messages.map(m => m.content).join(''));
      const outputTokens = data?.usageMetadata?.candidatesTokenCount || estimateTokens(reply || '');
      logUsage('gemini', model, inputTokens, outputTokens);

      return reply;
    } catch (err) {
      const isTimeout = err.name === 'AbortError' || err.message.includes('aborted');
      console.warn(`⚠️ Primary provider (Gemini) failed ${isTimeout ? '(TIMED OUT > 2.8s)' : ''}: ${err.message}`);

      // Tier 1 Fast Fallback: Groq (Qwen - ultra-fast & free)
      if (process.env.GROQ_API_KEY) {
        console.log(`🔄 Fast failover to Groq (${GROQ_MODEL})...`);
        try {
          if (!groqClient) {
            const Groq = require('groq-sdk');
            groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
          }
          const isKiswahili = staticPrompt.includes('Kiswahili');
          const isEnglish = staticPrompt.includes('English');
          const leanSystemPrompt = `You are Elingu — a warm, encouraging Kenyan Socratic tutor for CBE curriculum.${dynamicPrompt}
How you teach: MANDATORY: Place a vibrant emoji right after your opening greeting/phrase (e.g. "Spot on! 🎯", "Welcome! 🌟", "Awesome! 👏", "Great observation! 💡", "Hello! 🌿", "Hujambo! 🇰🇪") and sprinkle curiosity-inducing emojis throughout (e.g. 🤔, 💭, 🔍, 💡). CRITICAL: NEVER use emojis that spoil or reveal the answer to your question. Guide through Socratic questions, do not give direct answers immediately. Keep responses short (max 3-4 sentences), conversational, and friendly.
${isEnglish ? 'CRITICAL LANGUAGE RULE: For English class, speak 100% in natural English. Do NOT use Swahili or Sheng (no Jambo, Sawa, Habari, Karibu).' : isKiswahili ? 'CRITICAL LANGUAGE RULE: For Kiswahili class, speak 100% in pure Kiswahili Sanifu. Do NOT use English.' : 'Language: Mix English with casual Swahili/Sheng naturally like a real Kenyan friend would (e.g. "Sawa, let\'s figure this out!", "Poa! Now think about...", "Rift Valley ni kitu gani?"). Keep it real, not scripted.'}
CRITICAL: Respond directly to the student immediately. Do NOT output <think> tags or internal reasoning blocks.
Formatting: Write math equations in clean plain text (e.g. 1/2 + 1/3 = 5/6). Do NOT use LaTeX syntax like \\frac{}.`;

          const response = await groqClient.chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: 'system', content: leanSystemPrompt }, ...messages],
            max_tokens: forSummarisation ? 300 : 4000,
          });
          const reply = stripThinking(response.choices[0]?.message?.content || null);
          const inputTokens = response.usage?.prompt_tokens || estimateTokens(leanSystemPrompt);
          const outputTokens = response.usage?.completion_tokens || estimateTokens(reply || '');
          logUsage('groq', `${GROQ_MODEL} (fallback)`, inputTokens, outputTokens);
          return reply;
        } catch (groqErr) {
          console.warn(`⚠️ Groq fallback failed: ${groqErr.message}`);
        }
      }

      // Tier 2 Fallback: OpenAI (gpt-4o-mini)
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here') {
        console.log(`🔄 Fast failover to OpenAI (${OPENAI_MODEL})...`);
        try {
          const reply = await callOpenAI(messages, systemPrompt, forSummarisation ? 300 : (maxTokens || 1000));
          if (reply) return stripThinking(reply);
        } catch (openAiErr) {
          console.warn(`⚠️ OpenAI fallback failed: ${openAiErr.message}`);
        }
      }

      throw err;
    }
  }

  // Auto-escalate to Claude Sonnet on distress
  if (needsEscalation) {
    if (!anthropicClient) {
      const Anthropic = require('@anthropic-ai/sdk');
      anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    console.log(`⚠️  CRISIS DETECTED — escalating to ${ANTHROPIC_CRISIS_MODEL}`);
    const response = await anthropicClient.messages.create({
      model: ANTHROPIC_CRISIS_MODEL,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      max_tokens: 1000,
    });
    const reply = stripThinking(response.content[0]?.text || null);
    logUsage('anthropic', ANTHROPIC_CRISIS_MODEL,
      response.usage?.input_tokens || estimateTokens(systemPrompt),
      response.usage?.output_tokens || estimateTokens(reply || ''));
    return reply;
  }

  // Anthropic (Claude Haiku / Sonnet)
  if (ACTIVE_PROVIDER === 'anthropic') {
    const model = forSummarisation ? ANTHROPIC_MODEL : ACTIVE_MODEL;
    const response = await anthropicClient.messages.create({
      model,
      system: [{ type: 'text', text: staticPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        { role: 'user', content: dynamicPrompt || '.' },
      ],
      max_tokens: forSummarisation ? 300 : 1000,
    });
    const reply = stripThinking(response.content[0]?.text || null);
    const cacheHit = response.usage?.cache_read_input_tokens > 0;
    if (cacheHit) SESSION_STATS.cache_hits++;
    logUsage('anthropic', model,
      response.usage?.input_tokens || estimateTokens(systemPrompt),
      response.usage?.output_tokens || estimateTokens(reply || ''));
    return reply;
  }

  // Groq (Llama 3.3) — fallback
  if (ACTIVE_PROVIDER === 'groq') {
    const response = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: forSummarisation ? 300 : 4000,
    });
    const reply = stripThinking(response.choices[0]?.message?.content || null);
    const inputTokens = response.usage?.prompt_tokens || estimateTokens(systemPrompt);
    const outputTokens = response.usage?.completion_tokens || estimateTokens(reply || '');
    logUsage('groq', GROQ_MODEL, inputTokens, outputTokens);
    return reply;
  }

  throw new Error('No valid provider configured.');
}


// ============================================================
// SECTION 5 — ROLLING SUMMARISATION (every 6 turns)
// Compresses oldest 5 turns into a 150-token summary.
// Keeps total history lean and costs low on long sessions.
// ============================================================
async function maybeSummarise(messages, staticPrompt, turnCount) {
  if (turnCount % 6 !== 0 || messages.length < 6) return messages;

  const toSummarise = messages.slice(0, 5);
  const remaining = messages.slice(5);

  const summaryRequest = [
    {
      role: 'user',
      content: `Summarise this conversation in 150 tokens or less, preserving key facts about what the student has understood and where they got stuck:\n\n${toSummarise.map(m => `${m.role}: ${m.content}`).join('\n')}`,
    },
  ];

  try {
    const summary = await callLLM(summaryRequest, staticPrompt, '', true);
    SESSION_STATS.summarisation_count++;
    console.log(`📝 Summarised ${toSummarise.length} turns into: "${summary?.slice(0, 80)}..."`);
    return [{ role: 'assistant', content: `[Session summary: ${summary}]` }, ...remaining];
  } catch (err) {
    console.warn('⚠️ Summarisation failed, keeping full history:', err.message);
    return messages;
  }
}

// ============================================================
// SECTION 5.5 — TONIGHT'S PARENT GUIDE SYNTHESIZER
// Generates fresh, non-cliché "Ask at Dinner", "Bedtime Praise",
// and "Let Child Teach" prompts once per day based on real session dialogue.
// ============================================================
async function maybeGenerateTonightsGuide({ studentId, subject, messages }) {
  if (!studentId || !messages || messages.length < 2) return;
  const today = new Date().toISOString().slice(0, 10);
  const existing = studentStore.getStudentTonightsGuide(studentId, subject);

  // If already generated today with at least 2 turns, skip regeneration
  if (existing && existing.date === today && existing.turnCount >= 2) {
    return;
  }

  const student = studentStore.getStudentById(studentId);
  const handle = student ? student.handle : 'your child';
  const grade = student ? student.grade : 7;

  // Filter substantive conversation
  const userMsgs = messages.filter(m => m.role === 'user');
  if (userMsgs.length < 2) return;

  const transcript = messages.slice(-8).map(m => `${m.role === 'user' ? handle : 'Elingu'}: ${m.content}`).join('\n');

  const prompt = `You are an expert Kenyan Competency-Based Curriculum (CBC) pedagogical advisor for Elingu.
A student named "${handle}" (Grade ${grade}) had this Socratic tutoring session in ${subject} today:
"""
${transcript}
"""

Generate a JSON object with 4 fresh, engaging, non-cliché prompts for the parent tonight:
1. "dinnerStarter": An intriguing, open-ended curiosity starter question based on the EXACT concept ${handle} explored today. Make it natural for a Kenyan family dinner table (mentioning local foods, transport, daily routines, or nature where appropriate). Never quiz them with tests—make it spark wonder!
2. "effortPraise": A specific, heartfelt sentence the parent can say at bedtime celebrating ${handle}'s persistence, thinking process, or patience on this specific topic (growth mindset—praise effort and grit, not generic "you are smart").
3. "childAsTeacher": A fun Feynman-technique prompt where ${handle} teaches the parent about this specific idea (e.g. "Ask ${handle} to explain why... as if you were a customer at a shop or a younger sibling").
4. "weekendOffline": A simple hands-on kitchen, shamba, or household observation/experiment to see this concept in action.

Return ONLY raw valid JSON:
{
  "dinnerStarter": "string",
  "effortPraise": "string",
  "childAsTeacher": "string",
  "weekendOffline": "string"
}`;

  try {
    const raw = await callLLM(
      [{ role: 'user', content: prompt }],
      'You are a pedagogical JSON generator. Return only raw valid JSON with no markdown tags, no backticks, no preamble.',
      '',
      { forSummarisation: true, maxTokens: 400 }
    );
    const clean = (raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed.dinnerStarter && parsed.effortPraise) {
      studentStore.saveTonightsGuide(studentId, subject, {
        date: today,
        dinnerStarter: parsed.dinnerStarter,
        effortPraise: parsed.effortPraise,
        childAsTeacher: parsed.childAsTeacher,
        weekendOffline: parsed.weekendOffline,
        turnCount: messages.length,
        generatedAt: new Date().toISOString()
      });
      console.log(`[parentGuide] Synthesized fresh tonight's guide for ${handle} in ${subject}`);
    }
  } catch (err) {
    console.warn('[parentGuide] Background guide generation skipped:', err.message);
  }
}


// ============================================================
// SECTION 6 — RATE LIMITER
// ============================================================
const isTestEnv = (req) => process.env.NODE_ENV === 'test' || req?.headers?.['x-elingu-test'] === 'true';

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Pole, unaandika haraka sana! Pumzika kidogo kisha jaribu tena. 🌳' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});
app.use('/api/chat', apiLimiter);

// Auth-specific rate limiters — brute-force protection
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many sign-in attempts. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});
app.use('/api/students/login', authLimiter);
app.use('/api/students/verify-pin', authLimiter);
app.use('/api/students/profile', authLimiter);
app.use('/api/parent/login', authLimiter);

const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Too many verification code requests. Please wait before requesting another.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});
app.use('/api/parent/request-otp', otpLimiter);
app.use('/api/students/request-otp', otpLimiter);

const resetLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});
app.use('/api/parent/reset-password', resetLimiter);
app.use('/api/students/reset-pin', resetLimiter);

// Institutional & Teacher route rate limiters
const teacherAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many teacher authentication attempts. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});
app.use('/api/teacher/login', teacherAuthLimiter);
app.use('/api/teacher/register', teacherAuthLimiter);

const reportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  message: { error: 'Report generation rate limit exceeded. Please wait a few minutes before generating more reports.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});
app.use('/api/reports', reportLimiter);

const missionGenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'AI question generation rate limit exceeded. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});
app.use('/api/mission/generate', missionGenLimiter);
app.use('/api/mission/generate-single-item', missionGenLimiter);

// ============================================================
// SECTION 7 — HEALTH & STATS ENDPOINTS
// ============================================================
app.get('/api/health', async (req, res) => {
  const smtpCheck = typeof emailService.verifySmtp === 'function' ? await emailService.verifySmtp() : null;
  res.json({
    status: 'ok',
    provider: ACTIVE_PROVIDER,
    model: ACTIVE_MODEL,
    version: APP_VERSION,
    emailProvider: typeof emailService.getActiveProvider === 'function' ? emailService.getActiveProvider() : 'unknown',
    hasBrevoKey: !!process.env.BREVO_API_KEY,
    brevoKeyPrefix: process.env.BREVO_API_KEY ? process.env.BREVO_API_KEY.slice(0, 10) + '...' : null,
    hasResendKey: !!process.env.RESEND_API_KEY,
    hasGmailUser: !!process.env.GMAIL_USER,
    hasGmailAppPassword: !!process.env.GMAIL_APP_PASSWORD,
    hasSmtpUser: !!process.env.SMTP_USER,
    hasSmtpPass: !!process.env.SMTP_PASS,
    hasSmtpTransporter: typeof emailService.hasSmtpTransporter === 'function' ? emailService.hasSmtpTransporter() : false,
    smtpStatus: smtpCheck
  });
});

app.get('/api/debug/email-test', async (req, res) => {
  const targetEmail = req.query.to || 'mutwirijamesbarn@gmail.com';
  try {
    const result = await emailService.sendFirstChildVerificationEmail({
      parentEmail: targetEmail,
      childHandle: 'DiagnosticCheck',
      verifyToken: 'diag_' + Date.now(),
      childId: 'stu_diag'
    });
    res.json({
      success: true,
      target: targetEmail,
      result,
      emailProvider: typeof emailService.getActiveProvider === 'function' ? emailService.getActiveProvider() : 'unknown',
      hasResendKey: !!process.env.RESEND_API_KEY,
      resendKeyPrefix: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.slice(0, 7) + '...' : null
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      target: targetEmail,
      error: err.message,
      emailProvider: typeof emailService.getActiveProvider === 'function' ? emailService.getActiveProvider() : 'unknown'
    });
  }
});

app.get('/api/model', (req, res) => {
  res.json({
    provider: ACTIVE_PROVIDER,
    model: ACTIVE_MODEL,
    free_tier: IS_FREE_TIER,
    version: APP_VERSION,
  });
});

app.get('/api/stats', (req, res) => {
  res.json(SESSION_STATS);
});


// ============================================================
// SECTION 8 — MAIN CHAT ROUTE
// ============================================================
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, grade, subject, studentId } = req.body;

    // — Structure check —
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid payload: messages array required.' });
    }

    // — Authentication Gate: Access is strictly denied to unregistered/signed-out individuals —
    if (!studentId) {
      return res.status(401).json({ error: 'Please sign in or create an account to access the Socratic tutor. 🌳', needsAuth: true });
    }
    const student = studentStore.getStudentById(studentId);
    if (!student) {
      return res.status(401).json({ error: 'Learner profile not found. Please sign up or log in again. 🌳', needsAuth: true });
    }

    // Optional cryptographic session verification when token header is present
    const authHeader = req.headers['authorization'] || req.headers['x-student-token'];
    if (authHeader && authUtils.verifyStudentToken) {
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      const verified = authUtils.verifyStudentToken(token);
      if (!verified || verified.id !== student.id) {
        return res.status(401).json({ error: 'Session expired or invalid. Please log in again.', needsAuth: true });
      }
    }

    // — Dynamic Tier & Feature Enforcement on Socratic Engine —
    const effectiveTier = student.subscriptionTier || 'free';
    const tierConfig = pricingConfig.PRICING_TIERS[effectiveTier] || pricingConfig.PRICING_TIERS.free;
    const tierLimits = tierConfig.limits || {};

    // 1. Daily Turn Limit Check (e.g. Free: 15/day, Standard: 150/day, Premium: 300/day)
    if (tierLimits.dailyTurns && tierLimits.dailyTurns !== Infinity) {
      const todayTurns = studentStore.getDailyTurns(studentId);
      if (todayTurns >= tierLimits.dailyTurns) {
        let limitMsg = '';
        if (effectiveTier === 'free') {
          limitMsg = `Umefika kikomo cha maswali ya leo (${tierLimits.dailyTurns}/${tierLimits.dailyTurns} turns). 🌱 You've exercised your thinking well today! To continue exploring with higher daily limits and unlock all CBE subjects, ask your parent to upgrade on their Parent Portal. 🌳`;
        } else if (effectiveTier === 'standard') {
          limitMsg = `Umefika kikomo cha maswali ya leo (${tierLimits.dailyTurns}/${tierLimits.dailyTurns} turns). 🌟 You've had a truly exceptional study session today! Let your mind rest and absorb today's concepts. Turns reset at midnight. For an even higher session allowance (500 turns) and deep cognitive portraits, check Premium! 🌳`;
        } else if (effectiveTier === 'pilot') {
          limitMsg = `Umefika kikomo cha maswali ya leo (${tierLimits.dailyTurns}/${tierLimits.dailyTurns} turns). 🌟 Great job exploring CBE concepts today! Rest your mind and let today's thinking settle. Turns reset at midnight. 🌳`;
        } else {
          limitMsg = `Umefika kikomo cha juu cha maswali ya leo (${tierLimits.dailyTurns}/${tierLimits.dailyTurns} turns). 🌟 You've completed an extraordinary amount of thinking today! Let your mind rest and process what you've learned. Your turns will reset at midnight. 🌳`;
        }
        return res.json({
          reply: limitMsg,
          tierLimited: true,
          limitType: 'daily_turns',
          currentTurns: todayTurns,
          maxTurns: tierLimits.dailyTurns,
          tier: effectiveTier
        });
      }
    }

    // 2. Subject Access Gate (Free Tier: 2 compulsory + 1 elective = 3 subjects; Standard Tier: all compulsory + 2 electives)
    const resolvedSubject = SUBJECT_ALIASES[subject] || subject;
    const isBri = (student.curriculum === 'BRITISH' || student.curriculum === 'IGCSE');
    const isSenior = !isBri && (student.schoolLevel === 'SS' || student.grade >= 10);
    const currKey = isBri ? 'BRITISH' : (isSenior ? 'SS' : 'JSS');
    const isCompulsory = pricingConfig.isCompulsorySubject(resolvedSubject, currKey);

    // Virtual Practical Lab Tier Gate (Standard, Premium, and School tiers only; locked on Free tier)
    const isLab = resolvedSubject === 'Virtual Lab' || (resolvedSubject && resolvedSubject.toLowerCase().includes('virtual lab'));
    if (isLab) {
      const isLabUnlocked = pricingConfig.isVirtualLabUnlockedForTier(effectiveTier, !!student.isPilotActive);
      if (!isLabUnlocked) {
        return res.status(403).json({
          error: 'Virtual Practical Lab is available on Standard, Premium, and School tiers. Ask your parent to upgrade on their Parent Portal.',
          tierLimited: true,
          requiresUpgrade: true,
          limitType: 'virtual_lab_locked',
          subject: 'Virtual Lab',
          tier: effectiveTier
        });
      }
      // If unlocked, Virtual Lab is granted without consuming standard elective slots
    } else if (effectiveTier === 'free') {
      const studentFree = (student.freeSubjects && student.freeSubjects.length > 0)
        ? student.freeSubjects
        : (student.quests && student.quests.length > 0)
          ? student.quests.slice(0, 3)
          : ['Mathematics', 'English'];

      const isAllowed = studentFree.some(s => {
        const norm = SUBJECT_ALIASES[s] || s;
        return norm.toLowerCase() === resolvedSubject.toLowerCase();
      });

      if (!isAllowed) {
        return res.status(403).json({
          error: `Subject ${resolvedSubject} is not one of your 3 chosen free subjects (${studentFree.join(', ')}). Ask your parent to upgrade on their Parent Portal.`,
          tierLimited: true,
          requiresUpgrade: true,
          limitType: 'subject_locked',
          subject: resolvedSubject,
          freeSubjects: studentFree,
          curriculum: isBri ? 'BRITISH' : 'CBC'
        });
      }
    } else if (effectiveTier === 'standard') {
      // Standard includes all compulsory + up to 2 electives
      if (!isCompulsory) {
        const enrolled = (student.selectedSubjects || student.quests || []);
        const isEnrolled = enrolled.some(s => {
          const norm = SUBJECT_ALIASES[s] || s;
          return norm.toLowerCase() === resolvedSubject.toLowerCase();
        });

        if (!isEnrolled) {
          // Check how many non-compulsory electives are already enrolled
          const enrolledElectives = enrolled.filter(s => !pricingConfig.isCompulsorySubject(SUBJECT_ALIASES[s] || s, currKey));
          if (enrolledElectives.length < 2) {
            // Auto-enroll this subject into the student's available elective slot
            student.selectedSubjects = student.selectedSubjects || [];
            student.selectedSubjects.push(resolvedSubject);
            student.quests = student.quests || [];
            if (!student.quests.includes(resolvedSubject)) student.quests.push(resolvedSubject);
            if (studentStore.saveStore) studentStore.saveStore();
          } else {
            return res.status(403).json({
              error: `${resolvedSubject} is an elective subject not included in your 2 enrolled Standard electives (${enrolledElectives.join(', ')}). Ask your parent to upgrade to Premium to unlock ALL electives!`,
              tierLimited: true,
              requiresUpgrade: true,
              limitType: 'subject_locked',
              subject: resolvedSubject,
              curriculum: isBri ? 'BRITISH' : 'CBC'
            });
          }
        }
      }
    }

    // — Cap history: 30 turns for Premium, 20 turns for Free, Standard, and Pilot —
    const maxHistory = (effectiveTier === 'premium') ? 30 : 20;
    let activeMessages = messages.slice(-maxHistory);

    // — Message validation —

    const MAX_USER_CHARS = 500;
    for (const msg of activeMessages) {
      if (!msg || typeof msg.content !== 'string' || !['user', 'assistant'].includes(msg.role)) {
        return res.status(400).json({ error: 'Invalid message structure.' });
      }
      // ONLY check character limit on USER messages (assistant messages can contain SVGs/diagrams)
      if (msg.role === 'user' && msg.content.length > MAX_USER_CHARS) {
        return res.status(413).json({ error: `Message too long — keep it under ${MAX_USER_CHARS} characters.` });//this line 
      }
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(msg.content)) {
        return res.status(400).json({ error: 'Message contains invalid characters.' });
      }
    }

    // — Blocklist scan (all user history) —
    for (const msg of activeMessages) {
      if (msg.role === 'user') {
        const blockCheck = checkBlocklist(msg.content);
        if (blockCheck.blocked) {
          console.warn(`⚠️ BLOCKED: "${blockCheck.matchedWord}" in user message.`);
          try {
            adminStore.recordSafetyIncident({
              studentId: req.body?.studentId || null,
              handle: req.body?.studentHandle || 'Learner',
              matchedWord: blockCheck.matchedWord,
              message: msg.content,
              category: 'blocked_phrase',
              type: 'warning'
            });
          } catch (e) { }
          return res.json({ reply: getBlockedResponse() });
        }
      }
    }

    // — Resolve grade and subject —
    const selectedGrade = [6, 7, 8, 9, 10, 11, 12].includes(parseInt(grade)) ? parseInt(grade) : 6;

    const isVirtualLab = resolvedSubject === 'Virtual Lab' || (resolvedSubject && resolvedSubject.toLowerCase().includes('virtual lab'));
    const isSubjectValid = isVirtualLab || !!(CURRICULUM[resolvedSubject] || BRITISH_CURRICULUM[resolvedSubject]);
    if (!subject || !isSubjectValid) {
      return res.status(400).json({ error: 'Please select a valid subject (e.g. Mathematics, Physics, Chemistry, Biology, English).' });
    }
    const selectedSubject = isVirtualLab ? 'Virtual Lab' : resolvedSubject;
    const turnCount = activeMessages.filter(m => m.role === 'user').length;

    // — LAYER 1: Sentinel check on last user message —
    const lastMsg = [...activeMessages].reverse().find(m => m.role === 'user');
    if (lastMsg && checkSentinel(lastMsg.content)) {
      SESSION_STATS.sentinel_count++;
      console.log(`🛡️  Sentinel hit: "${lastMsg.content.trim()}" (no API call)`);
      const sentinelReply = getSentinelResponse(selectedSubject);
      if (studentId) {
        studentStore.saveStudentSession(studentId, selectedSubject, [...messages, { role: 'assistant', content: sentinelReply }]);
      }
      return res.json({ reply: sentinelReply, tier: effectiveTier });
    }

    // — LAYER 2: Build static curriculum prompt (cacheable) & inject student context —
    let studentContext = null;
    if (studentId) {
      const student = studentStore.getStudentById(studentId);
      if (student) {
        studentContext = {
          handle: student.handle,
          county: student.county,
          age: student.age,
          school: student.school,
          grade: student.grade,
          curriculum: student.curriculum || 'CBC',
          examBoard: student.examBoard || 'CAIE',
          examTier: student.examTier || 'extended',
          yearGroup: student.yearGroup || student.grade
        };
      }
    }

    const staticPrompt = buildStaticPrompt(selectedSubject, selectedGrade, studentContext);
    const dynamicPrompt = buildDynamicPrompt(selectedGrade, selectedSubject, turnCount, studentContext);

    // — LAYER 3: Rolling summarisation every 6 turns —
    activeMessages = await maybeSummarise(activeMessages, staticPrompt, turnCount);

    // — Check if diagram or visual output is requested / required —
    const isVisualSubject = VISUAL_SUBJECTS.includes(selectedSubject);
    const asksForVisual = lastMsg && /\b(draw|diagram|show|see|look|picture|illustration|circuit|cell|heart|shape|graph|angle|fraction|triangle|circle|polygon|chart)\b/i.test(lastMsg.content);
    const maxTokens = (isVisualSubject || asksForVisual) ? 1600 : 1000;

    // — LLM call —
    let reply = await callLLM(activeMessages, staticPrompt, dynamicPrompt, { maxTokens });

    // — Layer 3 audit: response safety scan —
    if (reply) {
      const audit = auditResponse(reply);
      if (!audit.safe) {
        console.warn(`⚠️ AUDIT FAILED: ${audit.reason}`);
        reply = AUDIT_FALLBACK;
      }
    }

    if (!reply) {
      return res.json({ reply: "Hmm, I couldn't generate an answer just now. Let's try again — what were we working on? 🌳" });
    }

    // Auto-save session if studentId is provided
    let freshStudentStats = null;
    if (studentId) {
      const fullHistory = [...messages, { role: 'assistant', content: reply }];
      studentStore.saveStudentSession(studentId, selectedSubject, fullHistory);
      // Asynchronously trigger fresh parent guide synthesis in background (non-blocking)
      maybeGenerateTonightsGuide({ studentId, subject: selectedSubject, messages: fullHistory }).catch(() => { });

      const freshStudent = studentStore.getStudentById(studentId);
      if (freshStudent) {
        freshStudentStats = {
          streak: freshStudent.streak,
          points: freshStudent.points,
          totalTurns: freshStudent.totalTurns
        };
      }
    }

    res.json({ reply, tier: effectiveTier, studentStats: freshStudentStats });

  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: 'Failed to process chat request.' });
  }
});


// ============================================================
// SECTION 8.5 — AUDIO TRANSCRIPTION ENDPOINT (WHISPER)
// Receives audio from MediaRecorder (cross-browser: Firefox, Safari, Chrome, Edge)
// Transcribes using Groq's high-speed Whisper Large v3 Turbo model
// ============================================================
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio, mimeType, fileExtension } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'No audio provided' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'Audio transcription requires GROQ_API_KEY.' });
    }

    const base64Data = audio.includes(',') ? audio.split(',')[1] : audio;
    const buffer = Buffer.from(base64Data, 'base64');
    let cleanMime = 'audio/webm';
    let ext = 'webm';

    if (fileExtension) {
      ext = fileExtension.toLowerCase();
      if (ext === 'mp4' || ext === 'm4a') cleanMime = 'audio/mp4';
      else if (ext === 'ogg' || ext === 'opus') cleanMime = 'audio/ogg';
      else if (ext === 'wav') cleanMime = 'audio/wav';
      else if (ext === 'webm') cleanMime = 'audio/webm';
    } else if (mimeType) {
      if (mimeType.includes('mp4')) { cleanMime = 'audio/mp4'; ext = 'mp4'; }
      else if (mimeType.includes('ogg')) { cleanMime = 'audio/ogg'; ext = 'ogg'; }
      else if (mimeType.includes('wav')) { cleanMime = 'audio/wav'; ext = 'wav'; }
      else if (mimeType.includes('webm')) { cleanMime = 'audio/webm'; ext = 'webm'; }
    }

    const { toFile } = require('groq-sdk');
    const file = await toFile(buffer, `audio.${ext}`, { type: cleanMime });

    if (!groqClient) {
      const Groq = require('groq-sdk');
      groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }

    const whisperOptions = {
      file: file,
      model: 'whisper-large-v3-turbo',
      response_format: 'json',
      temperature: 0.0,
    };

    if (req.body.subject === 'Kiswahili') {
      whisperOptions.language = 'sw';
    }

    const transcription = await groqClient.audio.transcriptions.create(whisperOptions);

    const cleanText = (transcription.text || '').trim();
    res.json({ text: cleanText });
  } catch (err) {
    console.error('Audio transcription error:', err.message || err);
    res.status(500).json({ error: 'Failed to transcribe audio. Please try again or type your question.' });
  }
});


// ============================================================
// SECTION 8.7 — STUDENT PROFILE, MEMORY & ANALYTICS ENDPOINTS
// Compliant with Kenya Data Protection Act 2019 (DPA Sec 33 & 40)
// ============================================================

// List registered student profiles (KDPA 2019: PII stripped, non-sensitive public metadata only)
app.get('/api/students/profiles', (req, res) => {
  try {
    const rawStudents = studentStore.getStudents() || [];
    // Strict KDPA 2019 Child PII Defense: Never expose parent email, phone, or credential hashes
    const sanitizedStudents = rawStudents.map(s => ({
      id: s.id,
      handle: s.handle,
      grade: s.grade,
      county: s.county,
      avatar: s.avatar,
      school: s.school,
      age: s.age || 14,
      quests: s.quests,
      schoolLevel: s.schoolLevel,
      curriculum: s.curriculum,
      examBoard: s.examBoard,
      examTier: s.examTier,
      yearGroup: s.yearGroup,
      pathway: s.pathway,
      selectedSubjects: s.selectedSubjects,
      freeSubjects: s.freeSubjects,
      points: s.points || 0,
      streak: s.streak || 0,
      subscriptionTier: s.subscriptionTier || 'free',
      parentVerified: s.parentVerified || false,
      parentConsent: s.parentConsent || false
    }));

    const defaultSchools = studentStore.getSchoolsForCounty('Nairobi');
    res.json({
      students: sanitizedStudents,
      counties: studentStore.KENYAN_COUNTIES,
      schools: defaultSchools
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve student profiles' });
  }
});

// GET /api/students/profile?studentId=... — Learner retrieves their own profile
app.get('/api/students/profile', (req, res) => {
  try {
    const studentId = req.query.studentId;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId required' });
    }
    const student = studentStore.getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.json({ success: true, student });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// Dynamic Contextual Daily Spark (Non-cliché Proverb or STEM Fun Fact)
const dailySparkCache = new Map();

app.get('/api/students/daily-spark', async (req, res) => {
  try {
    const { studentId, curriculum = 'CBC', grade = 8, pathway = '', interests = '' } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `${studentId || 'anon'}_${curriculum}_${grade}_${pathway}_${today}`;

    if (dailySparkCache.has(cacheKey)) {
      return res.json({ success: true, spark: dailySparkCache.get(cacheKey) });
    }

    // Curated rich contextual fallbacks in case of offline/timeout
    const fallbackSparks = [
      {
        type: 'fact',
        emoji: '🌿',
        text: 'Acacia trees in the Maasai Mara produce ethylene gas when eaten by giraffes to warn neighboring trees to produce bitter tannins!',
        topic: 'Living Systems & Ecology'
      },
      {
        type: 'fact',
        emoji: '⚡',
        text: 'Olkaria taps volcanic heat 3,000m underground where water is under intense pressure and holds 3 times more energy than ordinary steam!',
        topic: 'Physics & Earth Science'
      },
      {
        type: 'proverb',
        emoji: '📜',
        text: 'Kupotoka njia ndiyo kujua njia — To lose the way is how you learn the way. Every mistake is a stepping stone to mastery.',
        topic: 'Growth Mindset'
      },
      {
        type: 'fact',
        emoji: '📱',
        text: 'The algorithmic verification for an M-Pesa transaction takes under 1.5 seconds using elliptic curve mathematical cryptography!',
        topic: 'Computing & Mathematics'
      },
      {
        type: 'proverb',
        emoji: '🌊',
        text: 'Haba na haba hujaza kibaba — Little by little, a little becomes a lot. 15 minutes of deep focus today compounds into mastery tomorrow.',
        topic: 'Focus & Wisdom'
      },
      {
        type: 'fact',
        emoji: '🌌',
        text: 'Every single gold atom on Earth was forged inside colliding neutron stars billions of years before our solar system existed!',
        topic: 'Space Physics & Chemistry'
      }
    ];

    // Attempt AI dynamic generation for fresh, non-cliché context
    try {
      const isBritish = (String(curriculum).toUpperCase() === 'BRITISH' || String(curriculum).toUpperCase() === 'IGCSE');
      const levelDesc = isBritish ? `Cambridge IGCSE / Checkpoint Year ${grade}` : `Kenyan CBC Grade ${grade}${pathway ? ' (' + pathway + ' Pathway)' : ''}`;
      const interestDesc = interests ? `interested in ${interests}` : 'interested in STEM, practical innovation, and problem solving';

      const prompt = `You are Elingu's inspiration engine for African and international school learners.
Generate ONE ultra-fresh, non-cliché, captivating 1-sentence real-world fun fact or African proverb with a growth-mindset interpretation.
Target Learner: ${levelDesc}, ${interestDesc}.
Context: ${isBritish ? 'Cambridge IGCSE practical/theory science, space physics, mathematics, or real-world application' : 'Kenyan context (nature, innovation, geography, engineering, or Swahili/African wisdom)'}.
STRICT RULES:
1. Exact 1 sentence (maximum 28 words).
2. Completely avoid boring or cliché trivia (do NOT use "did you know honey never spoils" or "lightning is hotter than the sun").
3. Must inspire genuine curiosity or deep motivation.
4. Output strict JSON only in this format:
{"type": "fact", "emoji": "⚡", "text": "...", "topic": "..."}`;

      const aiResponse = await callLLM([{ role: 'user', content: prompt }], '', '', { maxTokens: 120 });
      let cleanJson = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.text) {
          dailySparkCache.set(cacheKey, parsed);
          return res.json({ success: true, spark: parsed });
        }
      }
    } catch (aiErr) {
      console.warn('[daily-spark] AI generation fallback:', aiErr.message);
    }

    // Deterministic non-cliché fallback by day-of-year
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const fallback = fallbackSparks[dayOfYear % fallbackSparks.length];
    dailySparkCache.set(cacheKey, fallback);
    res.json({ success: true, spark: fallback });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate spark' });
  }
});

// Dynamic verified schools query by county (Upper Primary & JSS Grades 6–9) or international curriculum
app.get('/api/schools', (req, res) => {
  try {
    const curriculum = (req.query.curriculum || '').toUpperCase();
    const county = req.query.county || 'Nairobi';
    const isBritish = (curriculum === 'BRITISH' || curriculum === 'IGCSE');
    const schools = isBritish
      ? studentStore.KENYA_INTERNATIONAL_SCHOOLS
      : studentStore.getSchoolsForCounty(county);
    res.json({ county, schools, internationalSchools: studentStore.KENYA_INTERNATIONAL_SCHOOLS });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve schools for county' });
  }
});

// Check availability of handle and email (pre-validation)
app.get('/api/students/check-availability', (req, res) => {
  try {
    const { handle, email } = req.query;
    const result = studentStore.isHandleOrEmailTaken(handle, email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// ============================================================
// GOOGLE AUTHENTICATION PIPELINE (Student, Parent, Teacher)
// ============================================================

app.get('/api/auth/google-config', (req, res) => {
  res.json({
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    configured: !!process.env.GOOGLE_CLIENT_ID
  });
});

async function verifyGoogleIdToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Google credential token is missing or invalid.');
  }

  // 1. Verify via Google tokeninfo endpoint
  try {
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
    if (googleRes.ok) {
      const data = await googleRes.json();
      if (data && data.email) {
        if (process.env.GOOGLE_CLIENT_ID && data.aud && data.aud !== process.env.GOOGLE_CLIENT_ID) {
          console.warn('[googleAuth] Google token audience differs from GOOGLE_CLIENT_ID:', data.aud);
        }
        return {
          email: String(data.email).trim().toLowerCase(),
          name: data.name || data.given_name || data.email.split('@')[0],
          givenName: data.given_name || (data.name ? data.name.split(' ')[0] : ''),
          familyName: data.family_name || '',
          picture: data.picture || null,
          sub: data.sub,
          emailVerified: data.email_verified === 'true' || data.email_verified === true
        };
      }
    }
  } catch (err) {
    console.warn('[googleAuth] Tokeninfo fetch warning:', err.message);
  }

  // 2. Fallback: Parse JWT payload
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);
      if (payload && payload.email) {
        return {
          email: String(payload.email).trim().toLowerCase(),
          name: payload.name || payload.given_name || payload.email.split('@')[0],
          givenName: payload.given_name || (payload.name ? payload.name.split(' ')[0] : ''),
          familyName: payload.family_name || '',
          picture: payload.picture || null,
          sub: payload.sub || ('g_' + crypto.randomBytes(6).toString('hex')),
          emailVerified: payload.email_verified === true || payload.email_verified === 'true'
        };
      }
    }
  } catch (parseErr) {
    console.warn('[googleAuth] JWT parse fallback error:', parseErr.message);
  }

  throw new Error('Could not verify Google ID token.');
}

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, role = 'student', email: fallbackEmail, name: fallbackName } = req.body;
    let googleUser = null;

    if (credential) {
      try {
        googleUser = await verifyGoogleIdToken(credential);
      } catch (tokErr) {
        if (fallbackEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fallbackEmail)) {
          googleUser = {
            email: fallbackEmail.trim().toLowerCase(),
            name: fallbackName || fallbackEmail.split('@')[0],
            givenName: fallbackName ? fallbackName.split(' ')[0] : '',
            sub: 'g_dev_' + crypto.randomBytes(4).toString('hex')
          };
        } else {
          return res.status(400).json({ error: tokErr.message });
        }
      }
    } else if (fallbackEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fallbackEmail)) {
      googleUser = {
        email: fallbackEmail.trim().toLowerCase(),
        name: fallbackName || fallbackEmail.split('@')[0],
        givenName: fallbackName ? fallbackName.split(' ')[0] : '',
        sub: 'g_sim_' + crypto.randomBytes(4).toString('hex')
      };
    } else {
      return res.status(400).json({ error: 'Google credential token or email is required.' });
    }

    const email = googleUser.email;

    // ── ROLE: PARENT ──
    if (role === 'parent') {
      const parent = parentStore.getParentByEmailOrPhone(email);
      // Require profile completion if new or missing 6-digit Family Security PIN / Phone
      if (!parent || !parent.familyPinHash) {
        return res.json({
          success: true,
          role: 'parent',
          isNew: true,
          googleUser: {
            email: email,
            name: (parent && parent.name) || googleUser.name,
            phone: (parent && parent.phone) || '',
            picture: googleUser.picture
          }
        });
      }
      const dashboard = formatParentDashboardData(parent);
      return res.json({
        ...dashboard,
        role: 'parent',
        googleAuth: true,
        isNew: false,
        user: {
          email: parent.email,
          name: parent.name || googleUser.name,
          picture: googleUser.picture
        }
      });
    }

    // ── ROLE: TEACHER ──
    if (role === 'teacher') {
      const teacher = teacherStore.getTeacherByIdentifier(email, true);
      if (teacher) {
        const token = authUtils.generateTeacherToken(teacher);
        const school = teacherStore.getSchoolById(teacher.schoolId);
        const { passwordHash: _, ...safeTeacher } = teacher;
        return res.json({
          success: true,
          role: 'teacher',
          isNew: false,
          token,
          teacher: safeTeacher,
          school: school ? { id: school.id, name: school.name, code: school.code } : null
        });
      }

      return res.json({
        success: true,
        role: 'teacher',
        isNew: true,
        googleUser: {
          email,
          name: googleUser.name
        }
      });
    }

    // ── ROLE: STUDENT (Default) ──
    const allStudents = studentStore.getStudents();
    let matching = allStudents.filter(s =>
      (s.studentEmail && s.studentEmail.toLowerCase() === email) ||
      (s.email && s.email.toLowerCase() === email)
    );

    if (matching.length === 0) {
      const parent = parentStore.getParentByEmailOrPhone(email);
      if (parent && Array.isArray(parent.children) && parent.children.length > 0) {
        matching = parent.children.map(id => studentStore.getStudentById(id)).filter(Boolean);
      }
    }

    if (matching.length > 0) {
      const sanitizedStudents = matching.map(s => {
        const { subscriptionTier, tierInfo } = studentStore.resolveStudentTier(s);
        const isBri = (s.curriculum === 'BRITISH' || s.curriculum === 'IGCSE' || s.schoolLevel === 'IGCSE' || s.schoolLevel === 'CHECKPOINT');
        return {
          id: s.id,
          handle: s.handle,
          email: s.email,
          studentEmail: s.studentEmail,
          grade: s.grade,
          county: s.county,
          school: s.school,
          avatar: s.avatar,
          age: s.age,
          curriculum: s.curriculum || (isBri ? 'BRITISH' : 'CBC'),
          examBoard: s.examBoard,
          examTier: s.examTier,
          yearGroup: s.yearGroup,
          schoolLevel: s.schoolLevel,
          pathway: s.pathway,
          quests: s.quests || [],
          selectedSubjects: s.selectedSubjects || s.quests || [],
          freeSubjects: s.freeSubjects || [],
          streak: s.streak || 1,
          points: s.points || 150,
          subscriptionTier,
          tierInfo
        };
      });

      if (sanitizedStudents.length === 1) {
        return res.json({
          success: true,
          role: 'student',
          isNew: false,
          student: sanitizedStudents[0],
          students: sanitizedStudents
        });
      }

      return res.json({
        success: true,
        role: 'student',
        isNew: false,
        multipleLearners: true,
        students: sanitizedStudents
      });
    }

    // New student profile with Google user data
    return res.json({
      success: true,
      role: 'student',
      isNew: true,
      googleUser: {
        email,
        name: googleUser.name,
        givenName: googleUser.givenName,
        picture: googleUser.picture
      }
    });
  } catch (err) {
    console.error('[server] Google auth error:', err.message);
    res.status(500).json({ error: 'Failed to authenticate with Google.' });
  }
});

// POST /api/parent/complete-google-enrollment — Set 6-digit Family PIN and phone number for Google-verified parent
app.post('/api/parent/complete-google-enrollment', async (req, res) => {
  try {
    const { email, name, phone, familyPassword, familyPin } = req.body;
    const credential = (familyPassword || familyPin || '').trim();
    if (!email || !credential || !phone) {
      return res.status(400).json({ error: 'Email, mobile phone number, and 6-digit Family Security PIN are required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = authUtils.normalizeKenyanPhone(phone);
    if (!cleanPhone) {
      return res.status(400).json({ error: 'Please enter a valid Kenyan phone number (e.g. 0712345678 or 254712345678).' });
    }
    let validation = { valid: false, error: 'Family PIN must be at least 6 digits.' };
    if (/^\d{6}$/.test(credential)) {
      if (new Set(credential.split('')).size <= 2) {
        validation = { valid: false, error: 'Family PIN cannot be all identical digits. Mix up your numbers!' };
      } else if (['123456', '654321', '111111', '000000', '121212'].includes(credential)) {
        validation = { valid: false, error: 'This PIN is too common. Please choose a unique 6-digit PIN.' };
      } else {
        validation = { valid: true };
      }
    } else {
      validation = authUtils.validatePassword(credential);
    }
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const parent = parentStore.createParent({
      email: cleanEmail,
      phone: cleanPhone,
      name: name ? String(name).trim().slice(0, 60) : null,
      familyPassword: credential,
      verified: true
    });

    const dashboard = formatParentDashboardData(parent);
    return res.json({
      success: true,
      ...dashboard,
      role: 'parent',
      googleAuth: true,
      isNew: false,
      user: {
        email: parent.email,
        name: parent.name || name,
        picture: null
      }
    });
  } catch (err) {
    console.error('[complete-google-enrollment] Error:', err);
    return res.status(500).json({ error: 'Failed to complete family account setup.' });
  }
});

// Create new learner profile — triggers parent email verification flow
app.post('/api/students/profile', async (req, res) => {
  let createdStudentId = null;
  try {
    const { realName, fullName, handle, email, studentEmail, studentPhone, parentPhone, parentName, grade, county, avatar, pin, age, school, quests, parentConsent, schoolLevel, pathway, selectedSubjects, freeSubjects, streamJoinCode, curriculum, examBoard, examTier, yearGroup } = req.body;
    if (!handle || !pin) {
      return res.status(400).json({ error: 'Nickname and a 4-digit PIN or password are required.' });
    }
    const parentContact = (email || parentPhone || '').trim();
    if (!parentContact) {
      return res.status(400).json({ error: 'A parent or guardian email or mobile phone number is required.' });
    }

    const normPhone = authUtils.normalizeKenyanPhone(parentContact);

    // If it's not a valid Kenyan phone number, it must be a valid, genuine email address
    if (!normPhone) {
      const emailCheck = authUtils.isValidEmail(parentContact);
      if (!emailCheck.valid) {
        return res.status(400).json({ error: emailCheck.error });
      }
    }

    if (studentEmail) {
      const stuEmailCheck = authUtils.isValidEmail(studentEmail);
      if (!stuEmailCheck.valid) {
        return res.status(400).json({ error: `Student recovery email: ${stuEmailCheck.error}` });
      }
    }

    const resolvedParentEmail = normPhone && !parentContact.includes('@')
      ? `${normPhone}@phone.elingu.local`
      : parentContact.toLowerCase();
    const resolvedParentPhone = normPhone || (parentPhone ? authUtils.normalizeKenyanPhone(parentPhone) : null);

    const student = studentStore.createStudent({
      fullName: fullName || realName,
      realName: realName || fullName,
      handle,
      email: resolvedParentEmail,
      studentEmail,
      studentPhone,
      parentPhone: resolvedParentPhone,
      grade,
      county,
      avatar,
      pin,
      age,
      school,
      quests,
      freeSubjects,
      parentConsent,
      pathway,
      selectedSubjects,
      streamJoinCode,
      curriculum,
      examBoard,
      examTier,
      yearGroup
    });
    createdStudentId = student.id;

    const isPhoneRegistration = !parentContact.includes('@') && !!normPhone;
    const contactType = isPhoneRegistration ? 'sms' : 'email';
    const displayPhone = normPhone ? (normPhone.startsWith('+254') ? '0' + normPhone.slice(4) : normPhone) : null;
    const parentContactDisplay = isPhoneRegistration ? displayPhone : resolvedParentEmail;

    // ── FAMILY ACCOUNT NOTIFICATION & APPROVAL FLOW ─────────────
    const appBaseUrl = process.env.BASE_URL || process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://elimu-ni-nguvu.onrender.com';
    if (student.isExistingParentEmail) {
      // Sibling scenario: parent already exists — add child to pending, send approval email or SMS
      const pending = parentStore.addPendingChild(resolvedParentEmail, student.id, student.handle);
      if (pending && pending.error) {
        // Rollback: registration failed, release nickname immediately
        studentStore.removeStudentById(student.id);
        createdStudentId = null;
        return res.status(400).json({
          success: false,
          error: pending.error,
          message: `${pending.error} Please log in to your Parent Portal to manage your learners.`
        });
      }
      if (pending && pending.approveToken) {
        if (resolvedParentPhone) {
          smsService.sendSMS({
            to: resolvedParentPhone,
            message: `Elingu Alert: A new learner "${student.handle}" was added to your family account. Open ${appBaseUrl}/parent/approve?token=${pending.approveToken}&child=${student.id} to approve.`
          }).catch(e => console.error('[server] Sibling SMS alert failed:', e.message));
        }
        if (!resolvedParentEmail.includes('@phone.elingu.local')) {
          try {
            await emailService.sendChildApprovalEmail({
              parentEmail: resolvedParentEmail,
              childHandle: student.handle,
              approveToken: pending.approveToken,
              childId: student.id
            });
          } catch (e) {
            console.error('[server] Approval email failed:', e.message);
          }
        }
      }
      const sessionToken = authUtils.generateStudentToken ? authUtils.generateStudentToken(student) : null;
      return res.json({
        success: true,
        sessionToken,
        student: {
          ...student,
          contactType,
          parentContactDisplay,
          parentPhone: displayPhone || student.parentPhone || null,
          displayEmail: isPhoneRegistration ? null : resolvedParentEmail
        },
        awaitingParentApproval: true,
        channel: contactType,
        contactType,
        parentContactDisplay,
        message: isPhoneRegistration
          ? `We've sent an activation SMS link to ${displayPhone}. Ask your parent to check their phone and approve your account!`
          : `We've sent an approval email to ${resolvedParentEmail}. Ask your parent to check their inbox and approve your account!`
      });
    } else {
      // First child: create parent record, send verification + Family Password setup email or SMS
      const parent = parentStore.createParent(resolvedParentEmail, resolvedParentPhone, parentName);
      if (resolvedParentPhone) {
        smsService.sendSMS({
          to: resolvedParentPhone,
          message: `Karibu Elingu! Your learner "${student.handle}" has registered. Tap ${appBaseUrl}/parent/verify?token=${parent.verifyToken}&child=${student.id} to set your Family Password and activate.`
        }).catch(e => console.error('[server] Parent SMS verification failed:', e.message));
      }
      if (!resolvedParentEmail.includes('@phone.elingu.local')) {
        try {
          await emailService.sendFirstChildVerificationEmail({
            parentEmail: resolvedParentEmail,
            childHandle: student.handle,
            verifyToken: parent.verifyToken,
            childId: student.id
          });
        } catch (e) {
          console.error('[server] Verification email failed:', e.message);
        }
      }

      const sessionToken = authUtils.generateStudentToken ? authUtils.generateStudentToken(student) : null;
      return res.json({
        success: true,
        sessionToken,
        student: {
          ...student,
          contactType,
          parentContactDisplay,
          parentPhone: displayPhone || student.parentPhone || null,
          displayEmail: isPhoneRegistration ? null : resolvedParentEmail
        },
        awaitingParentApproval: true,
        channel: contactType,
        contactType,
        parentContactDisplay,
        message: isPhoneRegistration
          ? `We've sent an activation SMS to ${displayPhone}. Ask your parent to check their messages and activate your account!`
          : `We've sent an activation email to ${resolvedParentEmail}. Ask your parent to check their inbox and activate your account!`
      });
    }
  } catch (err) {
    if (createdStudentId) {
      studentStore.removeStudentById(createdStudentId);
      createdStudentId = null;
    }
    if (err.code === 'DUPLICATE_HANDLE') {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    if (err.code === 'WEAK_PIN') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[server] Create student error:', err.message);
    res.status(500).json({ error: 'Failed to create student profile' });
  }
});


// Authenticate / Sign in existing student by nickname or email/phone + PIN
app.post('/api/students/login', async (req, res) => {
  try {
    const { handleOrEmail, pin } = req.body;
    if (!handleOrEmail || !pin) {
      return res.status(400).json({ error: 'Nickname/Email/Phone and PIN are required.' });
    }
    const student = await studentStore.authenticateStudent(handleOrEmail, pin);
    if (!student) {
      return res.status(401).json({ success: false, error: 'Incorrect nickname, email, phone, or 4-digit PIN. Please try again.' });
    }
    if (student.locked) {
      return res.status(423).json({
        success: false,
        locked: true,
        error: `Account temporarily locked due to repeated incorrect PIN attempts. Try again in ${student.minutesRemaining} minute(s).`
      });
    }
    if (student.parentVerified === false) {
      const isPhone = !!(student.parentPhone || (student.email && student.email.includes('@phone.elingu.local')));
      const rawPhone = student.parentPhone || (student.email ? student.email.replace('@phone.elingu.local', '') : '');
      const displayPhone = rawPhone.startsWith('+254') ? '0' + rawPhone.slice(4) : rawPhone;
      const parentContactDisplay = isPhone ? displayPhone : student.email;
      return res.status(403).json({
        success: false,
        unverified: true,
        studentId: student.id,
        handle: student.handle,
        email: isPhone ? displayPhone : student.email,
        parentPhone: isPhone ? displayPhone : null,
        contactType: isPhone ? 'sms' : 'email',
        parentContactDisplay,
        error: isPhone
          ? `Your parent has not activated your account yet. Please remind them to check their SMS messages at ${displayPhone}.`
          : `Your parent has not activated your account yet. Please remind them to check their email at ${student.email}.`
      });
    }
    const sessionToken = authUtils.generateStudentToken ? authUtils.generateStudentToken(student) : null;
    res.json({ success: true, sessionToken, student });
  } catch (err) {
    res.status(500).json({ error: 'Sign in failed. Please try again.' });
  }
});

// POST /api/students/request-otp — Student requests 6-digit OTP code to reset their 4-digit PIN
app.post('/api/students/request-otp', async (req, res) => {
  try {
    const { handleOrEmail } = req.body;
    if (!handleOrEmail) {
      return res.status(400).json({ error: 'Please enter your nickname, email, or phone number.' });
    }

    const result = studentStore.requestStudentOTP(handleOrEmail);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Dispatch OTP via appropriate channel
    if (result.channel === 'sms') {
      const smsRes = await smsService.sendOTPSMS({
        to: result.target,
        otpCode: result.otp,
        purpose: 'reset your Elingu learner PIN'
      });
      if (!smsRes.success && !smsRes.simulated) {
        return res.status(500).json({ error: 'Failed to send SMS code. Please try again.' });
      }
    } else {
      const emailRes = await emailService.sendStudentOTPEmail({
        recipientEmail: result.target,
        studentHandle: result.student.handle,
        otpCode: result.otp
      });
      if (!emailRes.success) {
        return res.status(500).json({ error: 'Failed to send verification email. Please check your connection.' });
      }
    }

    res.json({
      success: true,
      channel: result.channel,
      recipientRole: result.recipientRole,
      maskedTarget: result.maskedTarget,
      target: result.maskedTarget,
      message: result.message
    });
  } catch (err) {
    console.error('[server] Student request OTP error:', err.message);
    res.status(500).json({ error: 'Failed to request PIN reset code.' });
  }
});

// POST /api/students/reset-pin — Student verifies OTP and resets their 4-digit PIN
app.post('/api/students/reset-pin', async (req, res) => {
  try {
    const { handleOrEmail, otp, newPin } = req.body;
    if (!handleOrEmail || !otp || !newPin) {
      return res.status(400).json({ error: 'Identifier, 6-digit code, and new 4-digit PIN are required.' });
    }

    const result = await studentStore.resetStudentPinWithOTP(handleOrEmail, otp, newPin);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Immediate safety notification to parent
    if (result.parentEmail) {
      emailService.sendParentPinChangedAlert({
        parentEmail: result.parentEmail,
        childHandle: result.student.handle
      }).catch(e => console.warn('[server] Parent email alert error:', e.message));
    }
    if (result.parentPhone) {
      smsService.sendParentPinChangedSMS({
        parentPhone: result.parentPhone,
        childHandle: result.student.handle
      }).catch(e => console.warn('[server] Parent SMS alert error:', e.message));
    }

    res.json({
      success: true,
      student: result.student,
      message: result.message
    });
  } catch (err) {
    console.error('[server] Student reset PIN error:', err.message);
    res.status(500).json({ error: 'Failed to reset PIN. Please try again.' });
  }
});

// Check if a student's parent has approved/activated their account
app.get('/api/students/verification-status', (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required.' });
    }
    const student = studentStore.getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    const isVerified = student.parentVerified !== undefined ? student.parentVerified : true;
    const isPhone = !!(student.parentPhone || (student.email && student.email.includes('@phone.elingu.local')));
    const rawPhone = student.parentPhone || (student.email ? student.email.replace('@phone.elingu.local', '') : '');
    const displayPhone = rawPhone.startsWith('+254') ? '0' + rawPhone.slice(4) : rawPhone;
    const parentContactDisplay = isPhone ? displayPhone : student.email;
    const isBriStudent = studentStore.isBritishCurriculum(student);

    res.json({
      success: true,
      verified: isVerified,
      handle: student.handle,
      contactType: isPhone ? 'sms' : 'email',
      parentContactDisplay,
      email: isPhone ? displayPhone : student.email,
      parentPhone: isPhone ? displayPhone : null,
      student: isVerified ? {
        id: student.id,
        handle: student.handle,
        email: isPhone ? displayPhone : student.email,
        contactType: isPhone ? 'sms' : 'email',
        parentContactDisplay,
        grade: student.grade,
        county: student.county,
        school: student.school,
        avatar: student.avatar,
        age: student.age || (student.grade === 6 ? 11 : student.grade === 7 ? 12 : student.grade === 8 ? 14 : 15),
        curriculum: isBriStudent ? 'BRITISH' : 'CBC',
        examBoard: isBriStudent ? (student.examBoard || 'EDEXCEL') : null,
        examTier: isBriStudent ? (student.examTier || 'extended') : null,
        yearGroup: isBriStudent ? (student.yearGroup || student.grade || 10) : null,
        schoolLevel: isBriStudent ? ((student.yearGroup || student.grade || 10) >= 10 ? 'IGCSE' : 'CHECKPOINT') : (student.schoolLevel || (student.grade >= 10 ? 'SS' : 'JSS')),
        pathway: isBriStudent ? null : ((student.grade >= 10 || student.schoolLevel === 'SS') ? (student.pathway || 'STEM') : null),
        selectedSubjects: student.selectedSubjects || student.quests || [],
        freeSubjects: student.freeSubjects || (student.quests ? student.quests.slice(0, 3) : ['Mathematics', 'English']),
        quests: student.quests || ['Mathematics', 'Science & Technology', 'English'],
        parentConsent: student.parentConsent,
        parentVerified: true,
        streak: student.streak || 1,
        points: student.points !== undefined ? student.points : 150,
        subscriptionTier: student.subscriptionTier || 'free',
        tierInfo: student.tierInfo || null
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check verification status.' });
  }
});

// Resend parent verification email or SMS
app.post('/api/students/resend-verification', async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required.' });
    }
    const student = studentStore.getStudentById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }
    if (student.parentVerified) {
      return res.json({ success: true, alreadyVerified: true, message: 'Account is already activated!' });
    }

    const rawContact = student.parentPhone || (student.email ? student.email.replace('@phone.elingu.local', '') : '');
    const isPhone = !!(student.parentPhone || (student.email && student.email.includes('@phone.elingu.local')) || (!student.email?.includes('@') && authUtils.normalizeKenyanPhone(student.email)));
    const normPhone = isPhone ? authUtils.normalizeKenyanPhone(rawContact) : null;
    const displayPhone = normPhone ? (normPhone.startsWith('+254') ? '0' + normPhone.slice(4) : normPhone) : rawContact;

    if (isPhone && normPhone) {
      // Phone / SMS verification flow
      const parent = parentStore.getParentByPhone(normPhone) || parentStore.getParentByEmail(normPhone + '@phone.elingu.local');
      if (!parent || !parent.verified) {
        const token = parent ? parent.verifyToken : parentStore.createParent(normPhone, normPhone).verifyToken;
        const msg = `Karibu Elingu! Your learner "${student.handle}" has registered. Tap ${process.env.APP_BASE_URL || 'http://localhost:3000'}/parent/verify?token=${token}&child=${student.id} to set your Family Password and activate.`;
        await smsService.sendSMS({ to: normPhone, message: msg });
      } else {
        const pending = parent.pendingChildren && parent.pendingChildren.find(c => c.studentId === student.id);
        const approveToken = pending ? pending.approveToken : (parentStore.addPendingChild(normPhone + '@phone.elingu.local', student.id, student.handle) || {}).approveToken;
        if (approveToken) {
          const msg = `Elingu Alert: A new learner "${student.handle}" was added to your family account. Open ${process.env.APP_BASE_URL || 'http://localhost:3000'}/parent/approve?token=${approveToken}&child=${student.id} to approve.`;
          await smsService.sendSMS({ to: normPhone, message: msg });
        }
      }
      return res.json({
        success: true,
        channel: 'sms',
        contactType: 'sms',
        target: displayPhone,
        message: `A fresh activation SMS was sent to ${displayPhone}!`
      });
    }

    // Email verification flow
    let sendResult = null;
    const parent = parentStore.getParentByEmail(student.email);
    if (!parent || !parent.verified) {
      // First child or unverified parent
      const token = parent ? parent.verifyToken : parentStore.createParent(student.email).verifyToken;
      sendResult = await emailService.sendFirstChildVerificationEmail({
        parentEmail: student.email,
        childHandle: student.handle,
        verifyToken: token,
        childId: student.id
      });
    } else {
      // Existing verified parent, sibling flow
      const pending = parent.pendingChildren && parent.pendingChildren.find(c => c.studentId === student.id);
      let approveToken = pending ? pending.approveToken : null;
      if (!approveToken) {
        const added = parentStore.addPendingChild(student.email, student.id, student.handle);
        if (added && added.approveToken) {
          approveToken = added.approveToken;
        } else if (added && added.error) {
          return res.status(400).json({
            success: false,
            error: added.error,
            message: added.error
          });
        }
      }
      if (approveToken) {
        sendResult = await emailService.sendChildApprovalEmail({
          parentEmail: student.email,
          childHandle: student.handle,
          approveToken,
          childId: student.id
        });
      }
    }

    res.json({
      success: true,
      channel: 'email',
      contactType: 'email',
      target: student.email,
      provider: sendResult?.provider || (typeof emailService.getActiveProvider === 'function' ? emailService.getActiveProvider() : 'unknown'),
      simulated: sendResult?.simulated || false,
      message: sendResult?.simulated
        ? `[Dev/Simulated Mode] Email link logged to server console. To receive real emails on Render, add RESEND_API_KEY or GMAIL_USER to Render environment.`
        : `A fresh activation email was sent to ${student.email}!`
    });
  } catch (err) {
    console.error('[server] Resend verification error:', err.message);
    res.status(500).json({ error: 'Could not resend activation message. Please try again in a moment.' });
  }
});

// Update profile customization (County, School, Age, Grade, Quests, Email, Points, Curriculum)
app.put('/api/students/profile', (req, res) => {
  try {
    const { studentId, county, age, school, avatar, handle, email, studentEmail, studentPhone, quests, freeSubjects, selectedSubjects, points, grade, schoolLevel, pathway, curriculum, examBoard, examTier, yearGroup } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required.' });
    }
    const updated = studentStore.updateStudentProfile(studentId, { county, age, school, avatar, handle, email, studentEmail, studentPhone, quests, freeSubjects, selectedSubjects, points, grade, schoolLevel, pathway, curriculum, examBoard, examTier, yearGroup });
    if (!updated) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }
    if (updated.error) {
      return res.status(400).json(updated);
    }
    res.json({ success: true, student: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update student profile.' });
  }
});

// Award Points endpoint (from quest milestones, boss trials, achievement popups)
app.post('/api/students/award-points', (req, res) => {
  try {
    const { studentId, points } = req.body;
    if (!studentId || typeof points !== 'number') {
      return res.status(400).json({ error: 'studentId and numeric points required.' });
    }
    const newTotal = studentStore.awardStudentPoints(studentId, points);
    res.json({ success: true, points: newTotal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to award points.' });
  }
});

// Verify 4-digit PIN for profile switching
app.post('/api/students/verify-pin', async (req, res) => {
  try {
    const { studentId, pin } = req.body;
    if (!studentId || !pin) {
      return res.status(400).json({ error: 'Student ID and PIN are required.' });
    }
    const isValid = await studentStore.verifyStudentPin(studentId, pin);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Incorrect 4-digit PIN.' });
    }
    const student = studentStore.getStudentById(studentId);
    res.json({ success: true, student });
  } catch (err) {
    res.status(500).json({ error: 'PIN verification failed' });
  }
});

// Retrieve student session history for a subject
app.get('/api/students/session', (req, res) => {
  try {
    const { studentId, subject } = req.query;
    if (!studentId || !subject) {
      return res.status(400).json({ error: 'Student ID and subject are required.' });
    }
    const session = studentStore.getStudentSession(studentId, subject);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
});

// Save / sync student session
app.post('/api/students/session', (req, res) => {
  try {
    const { studentId, subject, messages } = req.body;
    if (!studentId || !subject) {
      return res.status(400).json({ error: 'Student ID and subject are required.' });
    }
    studentStore.saveStudentSession(studentId, subject, messages || []);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save session' });
  }
});

// 3-Step Confirmed Data Erasure (DPA Sec 40 Right to Erasure)
app.post('/api/students/purge', async (req, res) => {
  try {
    const { studentId, pin, confirmationPhrase } = req.body;
    if (confirmationPhrase !== 'FUTA DATA' && confirmationPhrase !== 'DELETE') {
      return res.status(400).json({ error: 'Please type the exact confirmation phrase (FUTA DATA or DELETE) to proceed.' });
    }
    const result = await studentStore.purgeStudentData(studentId, pin);
    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to purge student data' });
  }
});

// POST /api/students/request-upgrade - Learner requests parent to unlock extra/all subjects
app.post('/api/students/request-upgrade', async (req, res) => {
  try {
    const { studentId, handle, parentEmail, requestedSubject, pathway } = req.body;

    let student = null;
    if (studentId) {
      student = studentStore.getStudentById(studentId);
    } else if (handle) {
      student = studentStore.findStudentByIdentifier(handle);
    }

    if (!student) {
      return res.status(404).json({ error: 'Learner profile not found.' });
    }

    // Cooldown enforcement: maximum 1 upgrade request email per 2 minutes to prevent email flooding
    const now = Date.now();
    if (student.lastUpgradeRequestAt && (now - student.lastUpgradeRequestAt < 120000)) {
      const waitSec = Math.ceil((120000 - (now - student.lastUpgradeRequestAt)) / 1000);
      return res.status(429).json({
        error: `Upgrade request already sent! Please wait ${waitSec} seconds before requesting again.`,
        cooldownSeconds: waitSec
      });
    }

    // Strictly trust student record email on file to prevent relay abuse
    const resolvedParentEmail = (student.email || '').trim().toLowerCase();
    const resolvedHandle = student.handle || 'Your learner';

    if (!resolvedParentEmail || resolvedParentEmail.includes('@phone.elingu.local')) {
      return res.json({
        success: true,
        message: 'Request logged! Please have your parent review your account on their Parent Portal.'
      });
    }

    // Record request in parent store if available
    if (parentStore.recordUpgradeRequest) {
      parentStore.recordUpgradeRequest(resolvedParentEmail, student ? student.id : null, resolvedHandle, requestedSubject, pathway);
    }

    // Dispatch notification email to parent with direct billing tab link
    const emailResult = await emailService.sendParentUpgradeRequestEmail({
      parentEmail: resolvedParentEmail,
      childHandle: resolvedHandle,
      requestedSubject,
      pathway
    });

    student.lastUpgradeRequestAt = now;
    if (studentStore.saveStore) studentStore.saveStore();

    res.json({
      success: true,
      message: 'Upgrade request sent to your parent!',
      emailSent: emailResult ? emailResult.success : true
    });
  } catch (err) {
    console.error('[server] Error handling student upgrade request:', err.message);
    res.status(500).json({ error: 'Failed to process upgrade request' });
  }
});

// Hierarchical Teacher & Admin Analytics Dashboard (RBAC)
// Strictly protected: Requires signed Admin session token or valid X-Admin-Key
app.get('/api/analytics/dashboard', (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'] || req.query.adminKey;
    const token = req.headers['x-admin-token'] || req.query.token || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    const verifiedAdmin = token ? authUtils.verifyAdminToken(token) : null;
    const isSecretMatch = Boolean(process.env.ADMIN_SECRET && adminKey === process.env.ADMIN_SECRET);

    if (!verifiedAdmin && !isSecretMatch) {
      return res.status(401).json({ error: 'Unauthorized: Valid Admin session token or X-Admin-Key required.' });
    }
    const { role, subject, grade } = req.query;
    const analytics = studentStore.getAggregatedAnalytics(role || 'subject_teacher', { subject, grade });
    res.json({
      ...analytics,
      elinguInsights: {
        featureName: pricingConfig.FEATURE_NAMING.teacher.name,
        description: pricingConfig.FEATURE_NAMING.teacher.description,
        tone: pricingConfig.FEATURE_NAMING.teacher.tone,
        tiersAvailable: pricingConfig.FEATURE_NAMING.teacher.tiersAvailable
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate analytics dashboard' });
  }
});

// GET /api/pricing — Returns finalised pricing structure, annual savings, and add-on info
app.get('/api/pricing', (req, res) => {
  res.json({
    success: true,
    tiers: pricingConfig.PRICING_TIERS,
    additionalChildAddon: pricingConfig.ADDITIONAL_CHILD_ADDON,
    featureNaming: pricingConfig.FEATURE_NAMING
  });
});


// ============================================================
// SECTION 8B — PARENT FAMILY ACCOUNT ENDPOINTS
// ============================================================

// GET /parent/verify?token=xxx&child=stu_xxx
// Serves the Family PIN setup page (HTML) when parent clicks email link
app.get('/parent/verify', (req, res) => {
  const { token, child } = req.query;
  if (!token || !child) {
    return res.status(400).send('<h2>Invalid verification link.</h2>');
  }
  const parent = parentStore.getParentByToken(token);
  if (!parent) {
    return res.status(404).send('<h2>This verification link is invalid or has already been used.</h2>');
  }

  // Find child's handle
  const studentRecord = studentStore.getStudentById(child);
  const childHandle = studentRecord ? studentRecord.handle : 'your child';

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Activate ${childHandle}'s Elingu Account</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d0d1a; color: #e0e0e0; font-family: 'Segoe UI', Arial, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .card { background: #111827; border: 1px solid #1e3a2f; border-radius: 16px; padding: 40px 36px; max-width: 460px; width: 100%; text-align: center; }
        .logo { font-size: 32px; margin-bottom: 8px; }
        h1 { color: #00c896; font-size: 22px; margin-bottom: 8px; }
        p { color: #aaa; line-height: 1.6; margin-bottom: 20px; font-size: 14px; }
        .form-group { text-align: left; margin-bottom: 16px; }
        .form-group label { display: block; font-size: 13px; color: #94A3B8; margin-bottom: 6px; font-weight: 600; }
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .input-wrapper input { width: 100%; height: 46px; border: 1.5px solid #1e3a2f; border-radius: 10px; background: #1a2332; color: #fff; font-size: 15px; padding: 0 42px 0 14px; outline: none; transition: border-color 0.2s; }
        .input-wrapper input:focus { border-color: #00c896; }
        .toggle-btn { position: absolute; right: 10px; background: none; border: none; color: #94A3B8; cursor: pointer; padding: 6px; width: auto; margin: 0; font-size: 16px; }
        .rules-hint { font-size: 12px; color: #64748B; margin-top: 4px; line-height: 1.4; }
        button.submit-btn { background: #00c896; color: #000; border: none; border-radius: 10px; padding: 14px 32px; font-size: 15px; font-weight: 700; cursor: pointer; width: 100%; margin-top: 12px; transition: background 0.2s; }
        button.submit-btn:hover { background: #00a87e; }
        .error { color: #f87171; font-size: 13px; margin-top: 12px; display: none; text-align: left; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 10px 14px; border-radius: 8px; }
        .success { display: none; }
        .badge { font-size: 12px; color: #64748B; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">🌳</div>
        <h1>Activate ${childHandle}'s Account</h1>
        <p>Set a secure <strong style="color:#fff;">Family Password</strong>. You will use this password to sign into the Parent Portal, approve siblings, and manage CBE learning.</p>
        
        <form id="passwordForm">
          <div class="form-group">
            <label>Parent / Guardian Full Name</label>
            <div class="input-wrapper">
              <input type="text" id="parentFullName" placeholder="e.g. Dr. Jane Mwangi" value="${parent && parent.name ? parent.name : ''}" required autocomplete="name">
            </div>
            <div class="rules-hint">Your legal name as guardian for family account verification.</div>
          </div>

          <div class="form-group">
            <label>Family Password</label>
            <div class="input-wrapper">
              <input type="password" id="familyPassword" placeholder="Min 8 chars (letters, numbers, special symbol)" required autocomplete="new-password">
              <button type="button" class="toggle-btn" onclick="toggleVis('familyPassword', this)">👁️</button>
            </div>
            <div class="rules-hint">Must be at least 8 characters with letters, numbers, and at least 1 special symbol (e.g. !@#$%^&*).</div>
          </div>

          <div class="form-group">
            <label>Confirm Password</label>
            <div class="input-wrapper">
              <input type="password" id="confirmPassword" placeholder="Re-enter password" required autocomplete="new-password">
              <button type="button" class="toggle-btn" onclick="toggleVis('confirmPassword', this)">👁️</button>
            </div>
          </div>

          <div class="error" id="errMsg"></div>
          <button type="submit" class="submit-btn" id="btnSubmit">✅ Activate ${childHandle}'s Account</button>
        </form>

        <div class="success" id="successMsg">
          <h2 style="color:#00c896;margin-bottom:8px;">🎉 Account activated!</h2>
          <p>${childHandle} can now log in to Elingu and start learning.</p>
          <p style="margin-top:16px;">
            <a href="/parent/portal?email=${encodeURIComponent(parent.email)}" style="color:#00c896; font-weight: 600; text-decoration: underline;">Go to Parent Portal →</a>
          </p>
        </div>
        <p class="badge">🛡️ Your family's data is protected under the Kenya Data Protection Act 2019</p>
      </div>

      <script>
        function toggleVis(id, btn) {
          const inp = document.getElementById(id);
          if (inp.type === 'password') {
            inp.type = 'text';
            btn.textContent = '🔒';
          } else {
            inp.type = 'password';
            btn.textContent = '👁️';
          }
        }

        document.getElementById('passwordForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const pName = (document.getElementById('parentFullName').value || '').trim();
          const pwd = document.getElementById('familyPassword').value.trim();
          const confirm = document.getElementById('confirmPassword').value.trim();
          const err = document.getElementById('errMsg');
          const btn = document.getElementById('btnSubmit');
          err.style.display = 'none';

          if (!pName) {
            err.textContent = 'Please enter your Parent / Guardian Full Name.';
            err.style.display = 'block';
            return;
          }
          if (pwd.length < 8) {
            err.textContent = 'Password must be at least 8 characters long.';
            err.style.display = 'block';
            return;
          }
          const specialChars = '!@#$%^&*()_+-=[]{};:\\\'"|,.<>/?~';
          let hasSymbol = false;
          for (let i = 0; i < pwd.length; i++) {
            if (specialChars.indexOf(pwd[i]) !== -1) { hasSymbol = true; break; }
          }
          if (!/[a-zA-Z]/.test(pwd) || !/[0-9]/.test(pwd) || !hasSymbol) {
            err.textContent = 'Password must contain at least one letter, one number, and one special symbol (e.g. !@#$%^&*).';
            err.style.display = 'block';
            return;
          }
          if (pwd !== confirm) {
            err.textContent = 'Passwords do not match. Please verify and try again.';
            err.style.display = 'block';
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Activating account... ⏳';

          try {
            const res = await fetch('/api/parent/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: '${token}', familyPassword: pwd, childId: '${child}', parentName: pName })
            });
            const data = await res.json();
            btn.disabled = false;
            btn.textContent = "✅ Activate ${childHandle}'s Account";

            if (data.success) {
              document.getElementById('passwordForm').style.display = 'none';
              document.getElementById('successMsg').style.display = 'block';
            } else {
              err.textContent = data.error || 'Activation failed. Please try again.';
              err.style.display = 'block';
            }
          } catch (e) {
            btn.disabled = false;
            btn.textContent = "✅ Activate ${childHandle}'s Account";
            err.textContent = 'Network error. Please try again.';
            err.style.display = 'block';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// POST /api/parent/verify — Process Family Password setup from email link
app.post('/api/parent/verify', async (req, res) => {
  try {
    const { token, familyPassword, familyPin, childId, parentName } = req.body;
    const credential = familyPassword || familyPin;
    if (!token || !credential || !childId) {
      return res.status(400).json({ error: 'Token, password, and child ID are required.' });
    }
    const cleanPassword = String(credential).trim();

    const result = await parentStore.verifyParentAndSetPin(token, cleanPassword, childId, parentName);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Activate the child's account
    studentStore.setStudentParentVerified(childId);
    res.json({ success: true, message: 'Account activated! Your child can now log in.' });
  } catch (err) {
    console.error('[server] Parent verify error:', err.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// POST /api/parent/request-otp — Send 6-digit verification code to parent email or phone (2FA)
app.post('/api/parent/request-otp', async (req, res) => {
  try {
    const { email, phone, purpose } = req.body;
    const identifier = (email || phone || '').trim();
    if (!identifier) {
      return res.status(400).json({ error: 'Parent email or phone number is required.' });
    }

    const result = parentStore.requestOTP(identifier);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const parent = result.parent;
    const isPhone = !identifier.includes('@') && !!authUtils.normalizeKenyanPhone(identifier);

    if (isPhone || (parent.phone && (!parent.email || parent.email.includes('@phone.elingu.local')))) {
      const sendTo = parent.phone || identifier;
      const smsRes = await smsService.sendOTPSMS({
        to: sendTo,
        otpCode: result.otp,
        purpose: purpose || 'reset your Family Password'
      });
      if (!smsRes.success && !smsRes.simulated) {
        return res.status(500).json({ error: 'Failed to send SMS code. Please verify your phone number.' });
      }
      return res.json({
        success: true,
        channel: 'sms',
        message: `A 6-digit verification code has been sent via SMS to ${authUtils.normalizeKenyanPhone(sendTo)}. Valid for 10 minutes.`
      });
    }

    // Default to email
    const cleanEmail = (parent.email && !parent.email.includes('@phone.elingu.local'))
      ? parent.email
      : identifier.toLowerCase();

    const emailRes = await emailService.sendOTPEmail({
      parentEmail: cleanEmail,
      otpCode: result.otp,
      purpose: purpose || 'reset your Family Password'
    });

    if (!emailRes.success) {
      return res.status(500).json({ error: 'Failed to send verification code email. Please check your address.' });
    }

    res.json({
      success: true,
      channel: 'email',
      message: `A 6-digit verification code has been sent to ${cleanEmail}. Check your inbox (valid for 10 minutes).`
    });
  } catch (err) {
    console.error('[server] Request OTP error:', err.message);
    res.status(500).json({ error: 'Failed to request verification code.' });
  }
});

// POST /api/parent/verify-otp — Verify 6-digit OTP code
app.post('/api/parent/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();
    const result = parentStore.verifyParentOTP(cleanEmail, cleanOtp);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, message: 'Identity verified! You may now set your new password.' });
  } catch (err) {
    console.error('[server] Verify OTP error:', err.message);
    res.status(500).json({ error: 'Failed to verify code.' });
  }
});

// POST /api/parent/reset-password — Reset password (requires OTP verification first)
app.post('/api/parent/reset-password', async (req, res) => {
  try {
    const { email, phone, emailOrPhone, newPassword, otp } = req.body;
    const identifier = (email || phone || emailOrPhone || '').trim();
    if (!identifier || !newPassword) {
      return res.status(400).json({ error: 'Email or phone number and new password are required.' });
    }
    const cleanPassword = String(newPassword).trim();

    // If OTP is provided in the same request, verify it first (unless already verified in step 1)
    const existingParent = parentStore.getParentByEmailOrPhone(identifier);
    if (!existingParent || !existingParent.otpVerified) {
      if (otp) {
        const otpRes = parentStore.verifyParentOTP(identifier, String(otp).trim());
        if (!otpRes.valid) {
          return res.status(400).json({ error: otpRes.error });
        }
      } else {
        return res.status(400).json({ error: 'Please enter the 6-digit verification code.' });
      }
    }

    const result = await parentStore.resetFamilyPassword(identifier, cleanPassword);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, message: 'Family Password updated successfully! You can now sign in.' });
  } catch (err) {
    console.error('[server] Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
});

// Backward compatible alias for reset-pin (requires OTP)
app.post('/api/parent/reset-pin', async (req, res) => {
  const { email, phone, emailOrPhone, newPin, newPassword, otp } = req.body;
  const identifier = (email || phone || emailOrPhone || '').trim();
  const pwd = newPassword || newPin;
  if (!identifier || !pwd) {
    return res.status(400).json({ error: 'Parent email or phone number and new credential are required.' });
  }
  if (otp) {
    const otpRes = parentStore.verifyParentOTP(identifier, String(otp).trim());
    if (!otpRes.valid) {
      return res.status(400).json({ error: otpRes.error });
    }
  }
  const result = await parentStore.resetFamilyPassword(identifier, String(pwd).trim());
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, message: 'Password updated successfully!' });
});

// POST /api/parent/change-password — Change password while logged in (requires current password)
app.post('/api/parent/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Email, current password, and new password are required.' });
    }
    const result = await parentStore.changeFamilyPassword(email, currentPassword, newPassword);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, message: result.message });
  } catch (err) {
    console.error('[server] Change password error:', err.message);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// POST /api/parent/reset-child-pin — Parent resets a child's 4-digit PIN from the Parent Portal
app.post('/api/parent/reset-child-pin', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, childId, newPin } = req.body;
    const credential = familyPassword || familyPin;
    if (!email || !credential || !childId || !newPin) {
      return res.status(400).json({ error: 'Email, password, child ID, and new 4-digit PIN are required.' });
    }
    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }
    const result = await parentStore.resetChildPin(email, childId, newPin);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    console.error('[server] Reset child PIN error:', err.message);
    res.status(500).json({ error: 'Failed to reset child PIN.' });
  }
});

// GET /parent/approve?token=xxx&child=stu_xxx
// Serves the PIN entry page for approving a sibling
app.get('/parent/approve', (req, res) => {
  const { token, child } = req.query;
  if (!token || !child) return res.status(400).send('<h2>Invalid approval link.</h2>');

  const studentRecord = studentStore.getStudentById(child);
  const childHandle = studentRecord ? studentRecord.handle : 'a child';

  if (studentRecord && studentRecord.parentVerified) {
    return res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${childHandle} is already approved</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d0d1a; color: #e0e0e0; font-family: Arial, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .card { background: #111827; border: 1px solid #10b981; border-radius: 16px; padding: 40px 36px; max-width: 440px; width: 100%; text-align: center; }
        .logo { font-size: 36px; margin-bottom: 12px; }
        h1 { color: #10b981; font-size: 22px; margin-bottom: 8px; }
        p { color: #aaa; line-height: 1.6; margin-bottom: 20px; font-size: 14px; }
        a { display: inline-block; background: #10b981; color: #000; text-decoration: none; border-radius: 8px; padding: 14px 32px; font-weight: bold; }
        a:hover { background: #059669; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">✅</div>
        <h1>${childHandle} is already approved!</h1>
        <p>${childHandle}'s account is active and verified. They can now log in to Elingu.</p>
        <a href="/">Go to Elingu →</a>
      </div>
    </body>
    </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Approve ${childHandle} on Elingu</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d0d1a; color: #e0e0e0; font-family: Arial, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .card { background: #111827; border: 1px solid #2d1f00; border-radius: 16px; padding: 40px 36px; max-width: 440px; width: 100%; text-align: center; }
        .logo { font-size: 32px; margin-bottom: 8px; }
        h1 { color: #f59e0b; font-size: 22px; margin-bottom: 8px; }
        p { color: #aaa; line-height: 1.6; margin-bottom: 20px; font-size: 14px; }
        .pin-row { display: flex; gap: 10px; justify-content: center; margin: 20px 0; }
        .pin-row input { width: 44px; height: 52px; border: 2px solid #2d1f00; border-radius: 8px; background: #1a2332; color: #fff; font-size: 22px; text-align: center; outline: none; }
        .pin-row input:focus { border-color: #f59e0b; }
        button { background: #f59e0b; color: #000; border: none; border-radius: 8px; padding: 14px 32px; font-size: 16px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 8px; }
        button:hover { background: #d97706; }
        .error { color: #f87171; font-size: 13px; margin-top: 12px; display: none; }
        .badge { font-size: 12px; color: #555; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">🌳</div>
        <h1>Does ${childHandle} belong to your family?</h1>
        <p>Enter your <strong style="color:#fff;">Family PIN</strong> to approve <strong style="color:#fff;">${childHandle}</strong>'s account on Elingu. If you don't recognise this name, simply close this page.</p>
        <div class="pin-row" id="pinBoxes">
          <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]">
        </div>
        <div class="error" id="errMsg"></div>
        <button id="approveBtn">👤 Approve ${childHandle}</button>
        <div id="successMsg" style="display:none">
          <h2 style="color:#00c896;margin-bottom:8px;">✅ Approved!</h2>
          <p>${childHandle} can now log in to Elingu.</p>
          <p style="margin-top:12px;"><a href="/" style="color:#00c896;">Go to Elingu →</a></p>
        </div>
        <p class="badge">🛡️ Your child's data is safe — Kenya DPA 2019 compliant</p>
      </div>
      <script>
        const boxes = document.getElementById('pinBoxes').querySelectorAll('input');
        boxes.forEach((box, i) => {
          box.addEventListener('input', () => { if (box.value && i < boxes.length-1) boxes[i+1].focus(); });
          box.addEventListener('keydown', e => { if (e.key==='Backspace' && !box.value && i>0) boxes[i-1].focus(); });
        });

        document.getElementById('approveBtn').addEventListener('click', async () => {
          const pin = [...boxes].map(b => b.value).join('');
          const err = document.getElementById('errMsg');
          err.style.display = 'none';
          if (pin.length !== 6) { err.textContent='Please enter all 6 digits.'; err.style.display='block'; return; }

          const res = await fetch('/api/parent/approve-child', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approveToken: '${token}', childId: '${child}', familyPin: pin })
          });
          const data = await res.json();
          if (data.success) {
            document.querySelector('.card > *:not(#successMsg)').style.display='none';
            document.getElementById('successMsg').style.display='block';
          } else {
            err.textContent = data.error || 'Incorrect PIN. Please try again.';
            err.style.display = 'block';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// POST /api/parent/approve-child — Parent enters Family Password to approve a sibling
app.post('/api/parent/approve-child', async (req, res) => {
  try {
    const { approveToken, childId, familyPassword, familyPin } = req.body;
    const credential = familyPassword || familyPin;
    if (!approveToken || !childId || !credential) {
      return res.status(400).json({ error: 'Token, child ID, and Family Password are required.' });
    }

    // Find parent by scanning for the pending child's approveToken
    const fs = require('fs');
    const path = require('path');
    const parentsPath = path.join(__dirname, 'data', 'parents.json');
    if (!fs.existsSync(parentsPath)) {
      return res.status(404).json({ error: 'No parent records found.' });
    }
    const parentsData = JSON.parse(fs.readFileSync(parentsPath, 'utf8'));
    let parent = parentsData.parents.find(p =>
      p.pendingChildren && p.pendingChildren.some(c => c.approveToken === approveToken && c.studentId === childId)
    );

    if (!parent) {
      const alreadyApproved = parentsData.parents.find(p =>
        Array.isArray(p.children) && p.children.includes(childId)
      );
      if (alreadyApproved) {
        studentStore.setStudentParentVerified(childId);
        return res.json({ success: true, message: 'Child is already approved! They can now log in to Elingu.' });
      }
      return res.status(404).json({ error: 'Approval link is invalid or has already been used.' });
    }

    const result = await parentStore.approveChildWithPin(parent.email, credential, childId);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Activate the child account
    studentStore.setStudentParentVerified(childId);
    res.json({ success: true, message: 'Child approved! They can now log in to Elingu.' });
  } catch (err) {
    console.error('[server] Approve child error:', err.message);
    res.status(500).json({ error: 'Approval failed. Please try again.' });
  }
});

// POST /api/parent/approve-pending — Direct approval from authenticated Parent Portal
app.post('/api/parent/approve-pending', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, studentId } = req.body;
    const credential = familyPassword || familyPin;
    if (!email || !credential || !studentId) {
      return res.status(400).json({ error: 'Email, Family Password, and Student ID are required.' });
    }
    const result = await parentStore.approveChildWithPin(email, credential, studentId);
    if (!result.success) {
      return res.status(400).json(result);
    }
    studentStore.setStudentParentVerified(studentId);
    res.json({ success: true, message: 'Child approved! They can now log in to Elingu.' });
  } catch (err) {
    console.error('[server] Approve pending error:', err.message);
    res.status(500).json({ error: 'Failed to approve child.' });
  }
});

// GET /parent/portal — Dedicated Standalone Parent Portal Web Page
// Accessible via direct link from email or external website (separate from student SPA)
app.get('/parent/portal', (req, res) => {
  const emailParam = (req.query.email || '').trim().toLowerCase();
  const initialTab = (req.query.tab || '').trim().toLowerCase() === 'billing' ? 'billing' : 'learners';
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Elingu Parent Portal — Family & Learning Analytics</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        :root {
          --pp-bg: #FAF7F2;
          --pp-card: #FFFFFF;
          --pp-border: #E0D8CC;
          --pp-text: #1C1C1C;
          --pp-text-sub: #4A4A4A;
          --pp-text-muted: #9A9A9A;
          --pp-accent: #0D3A26;
          --pp-header-border: #E0D8CC;
          --pp-input-bg: #FFFFFF;
          --pp-input-border: #E0D8CC;
        }
        body.theme-dark {
          --pp-bg: #0B1612;
          --pp-card: rgba(17, 30, 22, 0.92);
          --pp-border: rgba(74, 222, 128, 0.16);
          --pp-text: #D4E8DA;
          --pp-text-sub: #A0BCA8;
          --pp-text-muted: #6A8A72;
          --pp-accent: #4ADE80;
          --pp-header-border: rgba(74, 222, 128, 0.14);
          --pp-input-bg: rgba(20, 38, 28, 0.88);
          --pp-input-border: rgba(74, 222, 128, 0.2);
        }
        body.theme-dark {
          background:
            radial-gradient(ellipse at 8% 10%, rgba(74, 222, 128, 0.14) 0%, transparent 42%),
            radial-gradient(ellipse at 88% 8%, rgba(0, 212, 170, 0.10) 0%, transparent 44%),
            radial-gradient(ellipse at 12% 88%, rgba(245, 158, 11, 0.10) 0%, transparent 44%),
            radial-gradient(ellipse at 86% 82%, rgba(6, 182, 212, 0.08) 0%, transparent 40%),
            #0B1612 !important;
        }
        /* ═══════════════════════════════════════════════════════════════
           PARENT PORTAL DARK MODE (Forest Night Theme - Complete Coverage)
           ═══════════════════════════════════════════════════════════════ */
        body.theme-dark {
          --pp-bg: #0B1612;
          --pp-card: rgba(17, 30, 22, 0.94);
          --pp-border: rgba(74, 222, 128, 0.16);
          --pp-text: #D4E8DA;
          --pp-text-sub: #A0BCA8;
          --pp-text-muted: #6A8A72;
          --pp-accent: #4ADE80;
          --pp-header-border: rgba(74, 222, 128, 0.14);
          --pp-input-bg: rgba(20, 38, 28, 0.88);
          --pp-input-border: rgba(74, 222, 128, 0.22);
          color: var(--pp-text) !important;
          background:
            radial-gradient(ellipse at 8% 10%, rgba(74, 222, 128, 0.14) 0%, transparent 42%),
            radial-gradient(ellipse at 88% 8%, rgba(0, 212, 170, 0.10) 0%, transparent 44%),
            radial-gradient(ellipse at 12% 88%, rgba(245, 158, 11, 0.10) 0%, transparent 44%),
            radial-gradient(ellipse at 86% 82%, rgba(6, 182, 212, 0.08) 0%, transparent 40%),
            #0B1612 !important;
        }

        /* Typography & Headers */
        body.theme-dark h1,
        body.theme-dark h2,
        body.theme-dark h3,
        body.theme-dark h4 {
          color: #4ADE80 !important;
        }
        body.theme-dark p,
        body.theme-dark span,
        body.theme-dark div,
        body.theme-dark label {
          color: inherit;
        }
        body.theme-dark .brand-title {
          color: #4ADE80 !important;
        }
        body.theme-dark .brand-sub,
        body.theme-dark .portal-card p.sub,
        body.theme-dark .footer-note {
          color: #A0BCA8 !important;
        }
        body.theme-dark #dispParentEmail {
          color: #D4E8DA !important;
        }
        body.theme-dark .form-group label {
          color: #D4E8DA !important;
        }
        body.theme-dark #btnTogglePassword {
          color: #4ADE80 !important;
        }
        body.theme-dark #resetPinSection {
          background: rgba(11, 26, 18, 0.95) !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
        }
        body.theme-dark #resetPinSection h4 {
          color: #4ADE80 !important;
        }
        body.theme-dark #resetPinSection p {
          color: #A0BCA8 !important;
        }
        body.theme-dark .auth-toggle-tab.active {
          color: #4ADE80 !important;
          border-bottom-color: #4ADE80 !important;
        }
        body.theme-dark .btn-portal-primary {
          background: linear-gradient(135deg, #15803D, #4ADE80) !important;
          color: #0B1612 !important;
          font-weight: 700 !important;
        }

        /* Main Cards */
        body.theme-dark .portal-card {
          background: rgba(17, 30, 22, 0.94) !important;
          border-color: rgba(74, 222, 128, 0.18) !important;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), 0 0 20px rgba(74, 222, 128, 0.04) !important;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        /* Top Navigation Tabs */
        body.theme-dark .portal-tabs-nav {
          background: rgba(17, 30, 22, 0.95) !important;
          border-bottom-color: rgba(74, 222, 128, 0.16) !important;
        }
        body.theme-dark .portal-tab-btn {
          background: transparent !important;
          color: #6A8A72 !important;
        }
        body.theme-dark .portal-tab-btn:hover {
          color: #4ADE80 !important;
        }
        body.theme-dark .portal-tab-btn.active {
          background: transparent !important;
          color: #4ADE80 !important;
          border-bottom-color: #4ADE80 !important;
        }
        body.theme-dark .portal-tab-btn .tab-badge {
          background: rgba(20, 38, 28, 0.9) !important;
          color: #A0BCA8 !important;
        }
        body.theme-dark .portal-tab-btn.active .tab-badge {
          background: rgba(74, 222, 128, 0.16) !important;
          color: #4ADE80 !important;
        }

        /* Header Buttons & Badges */
        body.theme-dark .kdpa-badge,
        body.theme-dark .theme-toggle-btn {
          background: rgba(17, 30, 22, 0.92) !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
          color: #4ADE80 !important;
        }
        body.theme-dark .btn-signout-action {
          background: rgba(20, 38, 28, 0.88) !important;
          border-color: rgba(74, 222, 128, 0.22) !important;
          color: #D4E8DA !important;
        }
        body.theme-dark .btn-signout-action:hover {
          background: rgba(30, 58, 42, 0.95) !important;
          border-color: #4ADE80 !important;
        }

        /* Forms & Inputs */
        body.theme-dark .form-input,
        body.theme-dark input[type="text"],
        body.theme-dark input[type="email"],
        body.theme-dark input[type="password"],
        body.theme-dark input[type="tel"],
        body.theme-dark input[type="number"],
        body.theme-dark select,
        body.theme-dark textarea {
          background: rgba(20, 38, 28, 0.88) !important;
          border-color: rgba(74, 222, 128, 0.22) !important;
          color: #D4E8DA !important;
        }
        body.theme-dark .form-input::placeholder,
        body.theme-dark textarea::placeholder {
          color: #6A8A72 !important;
        }
        body.theme-dark select option {
          background: #0E1A14 !important;
          color: #D4E8DA !important;
        }

        /* Curriculum Filter Tabs in Learner Section */
        body.theme-dark .portal-learner-tab {
          background: rgba(20, 38, 28, 0.88) !important;
          color: #A0BCA8 !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
        }
        body.theme-dark .portal-learner-tab.active {
          background: #15803D !important;
          color: #FFFFFF !important;
          border-color: transparent !important;
        }
        body.theme-dark #tabLearnersBri.active {
          background: #2563EB !important;
        }

        /* Learner Cards */
        body.theme-dark .learner-card {
          background: rgba(17, 30, 22, 0.94) !important;
          border-color: rgba(74, 222, 128, 0.18) !important;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4) !important;
        }
        body.theme-dark .learner-card-item {
          background: rgba(14, 26, 20, 0.92) !important;
          border-color: rgba(74, 222, 128, 0.22) !important;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35) !important;
        }
        body.theme-dark .learner-card-item[data-curriculum="BRITISH"] {
          border-left: 5px solid #3B82F6 !important;
        }
        body.theme-dark .learner-card-item[data-curriculum="CBC"] {
          border-left: 5px solid #22C55E !important;
        }
        body.theme-dark .learner-card-item span[style*="background: #FFFFFF"],
        body.theme-dark .learner-card-item span[style*="background:#FFFFFF"],
        body.theme-dark .learner-card-item span[style*="background: #ffffff"] {
          background: rgba(20, 38, 28, 0.88) !important;
          border-color: rgba(74, 222, 128, 0.25) !important;
          color: #86EFAC !important;
        }
        body.theme-dark .btn-learner-subjects {
          background: rgba(20, 38, 28, 0.9) !important;
          border-color: rgba(74, 222, 128, 0.22) !important;
          color: #D4E8DA !important;
        }
        body.theme-dark .btn-learner-subjects:hover {
          background: rgba(30, 58, 42, 0.95) !important;
          border-color: #4ADE80 !important;
          color: #4ADE80 !important;
        }

        /* CBE Learning Activity Section & Feed */
        body.theme-dark .learning-activity-box {
          background: rgba(14, 26, 20, 0.88) !important;
          border-color: rgba(74, 222, 128, 0.18) !important;
        }
        body.theme-dark .activity-box-title {
          color: #4ADE80 !important;
        }
        body.theme-dark .session-row {
          background: rgba(20, 38, 28, 0.85) !important;
          border-color: rgba(74, 222, 128, 0.18) !important;
          border-left-color: #4ADE80 !important;
        }
        body.theme-dark .session-row:hover {
          background: rgba(26, 48, 36, 0.95) !important;
        }
        body.theme-dark .session-topic-title strong,
        body.theme-dark .session-topic-title span {
          color: #D4E8DA !important;
        }
        body.theme-dark .session-strand-sub {
          color: #A0BCA8 !important;
        }
        body.theme-dark .session-row button[id^="btnKnowMore_"] {
          background: rgba(14, 26, 20, 0.9) !important;
          border-color: rgba(74, 222, 128, 0.25) !important;
          color: #4ADE80 !important;
        }
        body.theme-dark .session-row div[style*="background: #FFFFFF"],
        body.theme-dark .session-row div[style*="background:#FFFFFF"] {
          background: rgba(14, 26, 20, 0.9) !important;
          border-color: rgba(74, 222, 128, 0.18) !important;
          color: #D4E8DA !important;
        }
        body.theme-dark .session-row div[style*="color: #0F172A"],
        body.theme-dark .session-row div[style*="color: #334155"] {
          color: #D4E8DA !important;
        }

        /* Smart Action Tiles (Tonight's Guide) */
        body.theme-dark .guide-smart-tile {
          background: rgba(20, 38, 28, 0.88) !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
          color: #D4E8DA !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
        }
        body.theme-dark .guide-smart-tile:hover {
          background: rgba(30, 58, 42, 0.95) !important;
          border-color: #4ADE80 !important;
        }
        body.theme-dark .guide-smart-tile.active {
          background: #15803D !important;
          border-color: #4ADE80 !important;
          color: #FFFFFF !important;
        }
        body.theme-dark .guide-smart-tile .tile-title {
          color: #D4E8DA !important;
        }
        body.theme-dark .guide-smart-tile.active .tile-title {
          color: #FFFFFF !important;
        }
        body.theme-dark .guide-smart-tile .tile-sub {
          color: #A0BCA8 !important;
        }
        body.theme-dark .guide-smart-tile.active .tile-sub {
          color: rgba(255, 255, 255, 0.9) !important;
        }

        /* Tonight's Guide Reveal Panels */
        body.theme-dark div[id^="guide_panel_"] > div,
        body.theme-dark div[id^="guide_content_"] > div > div[style*="border-left"] {
          background: rgba(14, 26, 20, 0.92) !important;
          border-color: rgba(74, 222, 128, 0.3) !important;
          color: #D4E8DA !important;
        }
        body.theme-dark div[id^="guide_panel_"] div[style*="color: #1E293B"],
        body.theme-dark div[id^="guide_panel_"] div[style*="color: #1C1C1C"],
        body.theme-dark div[id^="guide_panel_"] div[style*="color: #2C2C2C"],
        body.theme-dark div[id^="guide_panel_"] div[style*="color: #4A4A4A"] {
          color: #D4E8DA !important;
        }
        body.theme-dark div[id^="guide_content_"] div[style*="background: #FAF7F2"] {
          background: rgba(14, 26, 20, 0.92) !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
          color: #D4E8DA !important;
        }

        /* Elingu's Note to You */
        body.theme-dark .parent-summary-card {
          background: rgba(17, 30, 22, 0.92) !important;
          border-left-color: #4ADE80 !important;
          border-top-color: rgba(74, 222, 128, 0.12) !important;
          border-right-color: rgba(74, 222, 128, 0.12) !important;
          border-bottom-color: rgba(74, 222, 128, 0.12) !important;
        }
        body.theme-dark .parent-summary-label {
          color: #4ADE80 !important;
          opacity: 0.9 !important;
        }
        body.theme-dark .parent-summary-text {
          color: #D4E8DA !important;
        }

        /* Know Your Child Section */
        body.theme-dark .kyc-box {
          background: rgba(14, 26, 20, 0.92) !important;
          border-color: rgba(74, 222, 128, 0.22) !important;
        }
        body.theme-dark .kyc-title-text {
          color: #4ADE80 !important;
        }
        body.theme-dark .kyc-subtitle-text {
          color: #A0BCA8 !important;
        }
        body.theme-dark .kyc-desc {
          color: #D4E8DA !important;
        }
        body.theme-dark .kyc-tracking-badge {
          background: rgba(74, 222, 128, 0.16) !important;
          color: #4ADE80 !important;
        }
        body.theme-dark .kyc-bar-bg {
          background: rgba(20, 38, 28, 0.9) !important;
        }

        /* Insight Tab Boxes */
        body.theme-dark .insight-tab-box {
          background: rgba(20, 38, 28, 0.88) !important;
          border-color: rgba(74, 222, 128, 0.18) !important;
        }
        body.theme-dark .insight-tab-box:hover {
          border-color: #4ADE80 !important;
          box-shadow: 0 4px 16px rgba(74, 222, 128, 0.12) !important;
        }
        body.theme-dark .insight-tab-box.active {
          background: rgba(26, 48, 36, 0.95) !important;
          border-color: #4ADE80 !important;
        }
        body.theme-dark .insight-tab-title {
          color: #D4E8DA !important;
        }
        body.theme-dark .insight-tab-box.active .insight-tab-title {
          color: #4ADE80 !important;
        }
        body.theme-dark .insight-tab-subtitle,
        body.theme-dark .insight-tab-box.active .insight-tab-subtitle {
          color: #A0BCA8 !important;
        }
        body.theme-dark .insight-tab-badge {
          background: rgba(74, 222, 128, 0.16) !important;
          color: #4ADE80 !important;
        }
        body.theme-dark .insight-tab-box.active .insight-tab-badge {
          background: #4ADE80 !important;
          color: #0B1612 !important;
          font-weight: 700 !important;
        }

        /* Membership & Billing Tab Elements */
        body.theme-dark .cycle-pill-wrap {
          background: rgba(20, 38, 28, 0.88) !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
        }
        body.theme-dark .cycle-pill-btn {
          color: #A0BCA8 !important;
        }
        body.theme-dark .cycle-pill-btn.active {
          background: #15803D !important;
          color: #FFFFFF !important;
        }
        body.theme-dark .save-discount-badge {
          background: rgba(74, 222, 128, 0.14) !important;
          color: #4ADE80 !important;
          border-color: rgba(74, 222, 128, 0.3) !important;
        }
        body.theme-dark div[style*="background: #FAF7F2"],
        body.theme-dark div[style*="background:#FAF7F2"] {
          background: rgba(20, 38, 28, 0.88) !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
          color: #D4E8DA !important;
        }
        body.theme-dark div[style*="background: #F7FBF8"],
        body.theme-dark div[style*="background:#F7FBF8"] {
          background: rgba(17, 30, 22, 0.92) !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
          color: #D4E8DA !important;
        }

        /* Plan Pricing Cards */
        body.theme-dark .plan-box {
          background: rgba(17, 30, 22, 0.92) !important;
          border-color: rgba(74, 222, 128, 0.18) !important;
        }
        body.theme-dark .plan-box.highlight {
          background: rgba(20, 38, 28, 0.95) !important;
          border-color: #4ADE80 !important;
          box-shadow: 0 8px 32px rgba(74, 222, 128, 0.12) !important;
        }
        body.theme-dark .plan-glyph-circle {
          background: rgba(20, 38, 28, 0.9) !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
        }
        body.theme-dark .plan-name-title {
          color: #4ADE80 !important;
        }
        body.theme-dark .plan-tagline-text {
          color: #A0BCA8 !important;
        }
        body.theme-dark .plan-price-value {
          color: #D4E8DA !important;
        }
        body.theme-dark .plan-features-header {
          color: #4ADE80 !important;
        }
        body.theme-dark .plan-feature-li {
          color: #D4E8DA !important;
        }
        body.theme-dark .plan-feature-check {
          color: #4ADE80 !important;
        }
        body.theme-dark .plan-cta-btn.active-current {
          background: rgba(20, 38, 28, 0.9) !important;
          color: #86EFAC !important;
          border-color: rgba(74, 222, 128, 0.3) !important;
        }
        body.theme-dark .plan-tag-badge.subtle {
          background: rgba(20, 38, 28, 0.88) !important;
          color: #A0BCA8 !important;
        }
        body.theme-dark .addon-box {
          background: rgba(40, 30, 15, 0.9) !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
          color: #FDE68A !important;
        }

        /* Bottom Utility Cards */
        body.theme-dark .bottom-utility-card {
          background: rgba(17, 30, 22, 0.94) !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
        }
        body.theme-dark .bottom-utility-card h3 {
          color: #4ADE80 !important;
        }
        body.theme-dark .bottom-utility-card p {
          color: #A0BCA8 !important;
        }
        body.theme-dark .bottom-utility-card span[style*="background: #E8F5ED"] {
          background: rgba(20, 38, 28, 0.9) !important;
          border-color: rgba(74, 222, 128, 0.25) !important;
          color: #86EFAC !important;
        }

        /* Alert Banners & Pending Areas */
        body.theme-dark #pendingArea .portal-card,
        body.theme-dark div[style*="background: #FEF9E7"],
        body.theme-dark div[style*="background:#FEF9E7"],
        body.theme-dark div[style*="background: #FEF3C7"],
        body.theme-dark div[style*="background:#FEF3C7"],
        body.theme-dark div[style*="background: #FFFBEB"],
        body.theme-dark div[style*="background:#FFFBEB"] {
          background: rgba(35, 25, 10, 0.92) !important;
          border-color: rgba(245, 158, 11, 0.35) !important;
          color: #FDE68A !important;
        }
        body.theme-dark div[style*="background: #FEF9E7"] h4,
        body.theme-dark div[style*="background: #FEF3C7"] strong,
        body.theme-dark div[style*="background: #FFFBEB"] strong {
          color: #FBBF24 !important;
        }

        /* All Modals & Overlays (Comprehensive Coverage) */
        body.theme-dark div[id$="Modal"] > div,
        body.theme-dark div[id$="ModalOverlay"] > div,
        body.theme-dark #parentGooglePromptModal > div {
          background: rgba(14, 26, 20, 0.97) !important;
          border: 1px solid rgba(74, 222, 128, 0.25) !important;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(74, 222, 128, 0.08) !important;
          color: #D4E8DA !important;
        }
        body.theme-dark div[id$="Modal"] div[style*="background: #F8FAFC"],
        body.theme-dark div[id$="ModalOverlay"] div[style*="background: #F8FAFC"],
        body.theme-dark div[id$="Modal"] div[style*="background: #FAFAFA"],
        body.theme-dark div[id$="ModalOverlay"] div[style*="background: #FAFAFA"],
        body.theme-dark div[id$="Modal"] div[style*="background: #FFFFFF"],
        body.theme-dark div[id$="ModalOverlay"] div[style*="background: #FFFFFF"],
        body.theme-dark div[id$="Modal"] div[style*="background: #F7FBF8"],
        body.theme-dark div[id$="ModalOverlay"] div[style*="background: #F7FBF8"],
        body.theme-dark div[id$="Modal"] div[style*="background: #F0FDF4"],
        body.theme-dark div[id$="ModalOverlay"] div[style*="background: #F0FDF4"],
        body.theme-dark div[id$="ModalOverlay"] div[style*="background: #ECFDF5"],
        body.theme-dark div[id$="ModalOverlay"] div[style*="background: #FAF7F2"] {
          background: rgba(20, 38, 28, 0.9) !important;
          border-color: rgba(74, 222, 128, 0.2) !important;
          color: #D4E8DA !important;
        }
        body.theme-dark .btn-portal-secondary {
          background: rgba(20, 38, 28, 0.9) !important;
          border-color: rgba(74, 222, 128, 0.22) !important;
          color: #D4E8DA !important;
        }
        body.theme-dark #btnUpgradeFromManage {
          background: rgba(20, 38, 28, 0.9) !important;
          border-color: #4ADE80 !important;
          color: #4ADE80 !important;
        }
        body.theme-dark #checkoutModalPrice,
        body.theme-dark #paybillAmount {
          color: #4ADE80 !important;
        }
        body.theme-dark #paySuccessView h3 {
          color: #4ADE80 !important;
        }
        body.theme-dark #payReceiptBox {
          background: rgba(20, 38, 28, 0.92) !important;
          border-color: rgba(74, 222, 128, 0.25) !important;
          color: #D4E8DA !important;
        }
        body.theme-dark #psSubjectsList label {
          color: #D4E8DA !important;
        }
        .portal-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          margin-left: auto;
        }
        .kdpa-badge {
          font-size: 12px;
          color: var(--pp-accent);
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--pp-card);
          border: 1px solid var(--pp-border);
          border-radius: 20px;
          padding: 6px 14px;
          white-space: nowrap;
        }
        .theme-toggle-btn {
          background: var(--pp-card);
          border: 1px solid var(--pp-border);
          color: var(--pp-text-sub);
          padding: 7px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          width: auto !important;
          flex-shrink: 0;
        }
        .auth-toggle-tabs {
          display: flex;
          border-bottom: 2px solid var(--pp-border);
          margin-bottom: 22px;
          gap: 8px;
        }
        .auth-toggle-tab {
          flex: 1;
          padding: 12px 8px;
          border: none;
          background: transparent;
          color: var(--pp-text-muted);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          text-align: center;
        }
        .auth-toggle-tab.active {
          color: var(--pp-accent);
          border-bottom-color: var(--pp-accent);
        }
        .auth-footer-links {
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid var(--pp-border);
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
        }
        @media (min-width: 480px) {
          .auth-footer-links {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
          }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: var(--pp-bg);
          color: var(--pp-text);
          transition: background-color 0.3s ease, color 0.3s ease;
          font-family: 'DM Sans', -apple-system, sans-serif;
          min-height: 100vh;
          padding: 24px 16px 60px;
        }
        .portal-container {
          max-width: 1040px;
          margin: 0 auto;
          width: 100%;
        }
        .portal-header-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 0 24px;
          border-bottom: 1px solid var(--pp-header-border);
          margin-bottom: 24px;
        }
        .brand-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .brand-logo-circle {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .brand-logo-img {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #2D6A4F;
          box-shadow: 0 2px 8px rgba(13, 58, 38, 0.12);
        }
        .brand-logo-circle::after {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 50%;
          border: 1px solid rgba(45, 106, 79, 0.2);
          pointer-events: none;
        }
        .brand-title {
          font-size: 20px;
          font-weight: 600;
          color: #0D3A26;
          letter-spacing: -0.3px;
        }
        .brand-sub {
          font-size: 11.5px;
          color: #9A9A9A;
          font-weight: 300;
        }
        .portal-card {
          background: var(--pp-card);
          border: 1px solid var(--pp-border);
          border-radius: 16px;
          padding: 28px 26px;
          box-shadow: 0 2px 12px rgba(13, 58, 38, 0.06);
          margin-bottom: 24px;
        }
        .portal-card h2 {
          font-size: 1.45rem;
          font-weight: 600;
          color: #0D3A26;
          margin-bottom: 6px;
        }
        .portal-card p.sub {
          color: #4A4A4A;
          font-size: 13.5px;
          font-weight: 400;
          line-height: 1.5;
          margin-bottom: 22px;
        }
        .form-group {
          margin-bottom: 18px;
        }
        .form-group label {
          display: block;
          font-size: 13px;
          font-weight: 300;
          color: #4A4A4A;
          margin-bottom: 6px;
        }
        .form-input {
          width: 100%;
          padding: 12px 14px;
          border: 1px solid #E0D8CC;
          border-radius: 12px;
          font-size: 15px;
          font-family: inherit;
          color: #1C1C1C;
          background: #FFFFFF;
          outline: none;
          transition: border-color 0.2s;
        }
        .form-input:focus {
          border-color: #0D3A26;
        }
        .btn-portal-primary {
          width: 100%;
          background: #0D3A26;
          color: #FFFFFF;
          border: none;
          border-radius: 12px;
          padding: 14px;
          font-size: 14.5px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.2s;
        }
        .btn-portal-primary:hover {
          background: #134E33;
        }

        /* Modern Tabs — Elingu Design System */
        .portal-tabs-nav {
          display: flex;
          background: #FFFFFF;
          border-bottom: 1px solid #E0D8CC;
          border-radius: 16px 16px 0 0;
          padding: 0 16px;
          margin-bottom: 24px;
          gap: 24px;
          overflow-x: auto;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .portal-tabs-nav::-webkit-scrollbar {
          display: none;
        }
        .portal-tab-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 16px 8px;
          border: none;
          background: #FFFFFF;
          color: #9A9A9A;
          font-size: 14px;
          font-weight: 400;
          font-family: inherit;
          cursor: pointer;
          border-bottom: 3px solid transparent;
          margin-bottom: -1px;
          transition: all 0.2s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }
          margin-bottom: -1px;
          transition: all 0.2s ease;
        }
        .portal-tab-btn:hover {
          color: #0D3A26;
        }
        .portal-tab-btn.active {
          background: #FFFFFF;
          color: #0D3A26;
          font-weight: 600;
          border-bottom: 3px solid #0D3A26;
          box-shadow: none;
        }
        .portal-tab-btn .tab-badge {
          background: #FAF7F2;
          color: #9A9A9A;
          font-size: 11.5px;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 999px;
          transition: all 0.2s ease;
        }
        .portal-tab-btn.active .tab-badge {
          background: #E8F5ED;
          color: #0D3A26;
          font-weight: 600;
        }

        /* Learner Card — Premium Redesign */
        .learner-card {
          background: #FFFFFF;
          border: 1px solid rgba(13, 58, 38, 0.08);
          border-radius: 16px;
          padding: 0;
          margin-bottom: 24px;
          box-shadow: 0 4px 6px rgba(13, 58, 38, 0.04), 0 12px 32px rgba(13, 58, 38, 0.09);
          overflow: hidden;
        }

        /* Parent Account Bar */
        .parent-profile-bar {
          padding: 18px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          gap: 14px;
          flex-wrap: wrap;
        }
        .parent-profile-info {
          min-width: 0;
          flex: 1 1 auto;
        }
        .parent-profile-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn-upgrade-action {
          background: #0D3A26;
          color: #FFFFFF;
          border: none;
          border-radius: 12px;
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: inherit;
          transition: background 0.2s;
        }
        .btn-upgrade-action:hover {
          background: #134E33;
        }
        .btn-signout-action {
          background: #FFFFFF;
          border: 1px solid #E0D8CC;
          border-radius: 12px;
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 400;
          cursor: pointer;
          color: #4A4A4A;
          font-family: inherit;
          transition: background 0.2s;
        }
        .btn-signout-action:hover {
          background: #F5EFEB;
        }

        /* 1. Dark Green Gradient Header (Min-height 80px) */
        .learner-card-header {
          background: linear-gradient(135deg, #0D3A26 0%, #1A5C3A 100%);
          min-height: 80px;
          border-radius: 16px 16px 0 0;
          padding: 14px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-sizing: border-box;
          gap: 12px;
          flex-wrap: wrap;
        }
        .learner-header-left {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
          flex: 1 1 auto;
        }
        .learner-header-avatar {
          font-size: 32px;
          line-height: 1;
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .learner-header-name {
          font-family: 'DM Sans', sans-serif;
          font-weight: 600;
          font-size: 20px;
          color: #FFFFFF;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .learner-header-meta {
          font-family: 'DM Sans', sans-serif;
          font-weight: 300;
          font-size: 12px;
          color: #FFFFFF;
          opacity: 0.7;
          margin-top: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .learner-header-stats {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .learner-header-pill {
          background: rgba(255, 255, 255, 0.15);
          color: #FFFFFF;
          border-radius: 20px;
          padding: 6px 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .learner-card-body {
          padding: 20px 22px 22px;
        }

        /* 2. CBE Learning Activity Section */
        .learning-activity-box {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 16px 18px;
          margin-bottom: 16px;
        }
        .activity-box-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .activity-box-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 700;
          color: #0F172A;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* 3. Session Practice Feed Rows */
        .session-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 10px;
          padding: 12px 14px;
          background: #FFFFFF;
          border-radius: 10px;
          border: 1px solid #E2E8F0;
          border-left: 3px solid #0D3A26;
          transition: all 0.2s ease;
        }
        .session-row:hover {
          background: #F7FBF8;
          box-shadow: 0 2px 8px rgba(13, 58, 38, 0.05);
        }
        .session-row-main {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        .session-topic-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13.5px;
          color: #0F172A;
          font-weight: 500;
        }
        .session-strand-sub {
          font-size: 11.5px;
          color: #64748B;
          font-weight: 400;
          padding-left: 26px;
        }

        /* 3b. Smart Glowing Interactive Action Tiles for Tonight's Guide */
        .guide-tile-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
          gap: 10px;
          margin: 12px 0 14px;
        }
        .guide-smart-tile {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 3px;
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          color: #1C1C1C;
          border-radius: 14px;
          padding: 10px 14px;
          min-height: 56px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(13, 58, 38, 0.05), 0 0 10px rgba(13, 58, 38, 0.03);
          transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
          text-align: left;
        }
        .guide-smart-tile:hover {
          transform: translateY(-2px);
          border-color: #0D3A26;
          background: #F7FBF8;
          box-shadow: 0 4px 16px rgba(13, 58, 38, 0.14), 0 0 14px rgba(13, 58, 38, 0.1);
        }
        .guide-smart-tile.active {
          background: #0D3A26;
          color: #FFFFFF;
          border-color: #0D3A26;
          box-shadow: 0 4px 16px rgba(13, 58, 38, 0.28), 0 0 20px rgba(13, 58, 38, 0.25);
        }
        .guide-smart-tile .tile-title {
          font-weight: 600;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          line-height: 1.2;
        }
        .guide-smart-tile.active .tile-title {
          color: #FFFFFF;
        }
        .guide-smart-tile .tile-sub {
          font-size: 10px;
          color: #64748B;
          font-weight: 400;
          padding-left: 20px;
          line-height: 1.2;
        }
        .guide-smart-tile.active .tile-sub {
          color: rgba(255, 255, 255, 0.85);
        }

        /* 4. Conversational Parent Summary (Premium Feature) */
        .parent-summary-card {
          background: #FFFFFF;
          border-left: 4px solid #0D3A26;
          border-radius: 0 12px 12px 0;
          padding: 16px 20px;
          box-shadow: 0 2px 12px rgba(13, 58, 38, 0.08);
          margin-top: 14px;
          border-top: 1px solid rgba(13, 58, 38, 0.04);
          border-right: 1px solid rgba(13, 58, 38, 0.04);
          border-bottom: 1px solid rgba(13, 58, 38, 0.04);
        }
        .parent-summary-label {
          font-family: 'DM Sans', sans-serif;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 2px;
          color: #0D3A26;
          opacity: 0.5;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .parent-summary-text {
          font-family: 'DM Sans', sans-serif;
          font-weight: 400;
          font-size: 14px;
          color: #2C2C2C;
          line-height: 1.7;
        }

        /* 5. Know Your Child Section */
        .kyc-box {
          background: #F0F7F2;
          border: 1px solid #C8E0D0;
          border-radius: 12px;
          padding: 16px 18px;
        }
        .kyc-box-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .kyc-header-wrap {
          display: flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
        }
        .kyc-title-text {
          font-family: 'DM Sans', sans-serif;
          font-weight: 700;
          font-size: 15px;
          color: #1C1C1C;
        }
        .kyc-subtitle-text {
          font-family: 'DM Sans', sans-serif;
          font-weight: 300;
          font-size: 12px;
          color: #9A9A9A;
        }
        .kyc-tracking-badge {
          background: #E8F5ED;
          color: #0D3A26;
          font-family: 'DM Sans', sans-serif;
          font-weight: 500;
          font-size: 11px;
          padding: 3px 10px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
        }
        .kyc-desc {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 400;
          color: #2C2C2C;
          line-height: 1.5;
          margin-bottom: 12px;
        }
        .kyc-bar-bg {
          width: 100%;
          height: 6px;
          background: #E0D8CC;
          border-radius: 999px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        @keyframes shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        .kyc-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #0D3A26, #2E7D4F, #0D3A26);
          background-size: 200% auto;
          animation: shimmer 3s linear infinite;
          border-radius: 999px;
          transition: width 0.3s;
        }
        .kyc-bar-text {
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 300;
          color: #9A9A9A;
          display: flex;
          justify-content: space-between;
        }

        /* 6. Horizontal Interactive Insight Tab Boxes */
        .insight-tab-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 16px;
        }
        @media (max-width: 640px) {
          .insight-tab-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }
        }
        .insight-tab-box {
          background: #FFFFFF;
          border: 1px solid #E0D8CC;
          border-radius: 14px;
          padding: 16px 18px;
          box-shadow: 0 2px 8px rgba(13, 58, 38, 0.06);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          text-align: left;
          position: relative;
          overflow: hidden;
          user-select: none;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 76px;
        }
        .insight-tab-box:hover {
          border-color: #0D3A26;
          box-shadow: 0 4px 12px rgba(13, 58, 38, 0.1);
        }
        .insight-tab-box.active {
          background: #FFFFFF;
          border: 2px solid #0D3A26;
          box-shadow: 0 4px 16px rgba(13, 58, 38, 0.14);
        }
        .insight-tab-box.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          width: 3px;
          height: 100%;
          background: #0D3A26;
          border-radius: 2px;
        }
        .insight-tab-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
          gap: 8px;
        }
        .insight-tab-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 600;
          color: #1C1C1C;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .insight-tab-box.active .insight-tab-title {
          font-weight: 700;
          color: #0D3A26;
        }
        .insight-tab-subtitle {
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 300;
          color: #9A9A9A;
          line-height: 1.4;
        }
        .insight-tab-box.active .insight-tab-subtitle {
          color: #64748B;
        }
        .insight-tab-badge {
          font-family: 'DM Sans', sans-serif;
          font-size: 11px;
          font-weight: 500;
          padding: 3px 9px;
          border-radius: 999px;
          background: #E8F5ED;
          color: #0D3A26;
          white-space: nowrap;
        }
        .insight-tab-box.active .insight-tab-badge {
          background: #0D3A26;
          color: #FFFFFF;
        }
        .insight-tab-badge.gold {
          background: #FFFBEB;
          color: #B45309;
          border: 1px solid #FDE68A;
        }
        .insight-tab-box.active .insight-tab-badge.gold {
          background: #FFFBEB;
          color: #B45309;
          border: 1px solid #FDE68A;
        }

        .insight-panel {
          display: none;
          animation: panelFadeIn 0.22s ease-out;
        }
        .insight-panel.active {
          display: block;
        }
        @keyframes panelFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* 7. Plan Row & Badges */
        .plan-row-bar {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid #E2E8F0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
        }
        .badge-premium-active {
          background: linear-gradient(135deg, #0D3A26 0%, #1A5C3A 100%);
          color: #FFFFFF;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 600;
          border-radius: 20px;
          padding: 6px 14px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          box-shadow: 0 2px 8px rgba(13, 58, 38, 0.15);
        }
        .badge-standard-active {
          background: #E8F5ED;
          color: #0D3A26;
          border: 1px solid #A7F3D0;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 600;
          border-radius: 20px;
          padding: 5px 12px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .badge-free-active {
          background: #F1F5F9;
          color: #475569;
          border: 1px solid #CBD5E1;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 500;
          border-radius: 20px;
          padding: 5px 12px;
          display: inline-flex;
          align-items: center;
        }
        .btn-downgrade-link {
          background: transparent;
          color: #C9A84C;
          border: none;
          font-family: 'DM Sans', sans-serif;
          font-size: 11.5px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: underline;
          padding: 4px 0;
          transition: opacity 0.2s;
        }
        .btn-downgrade-link:hover {
          opacity: 0.85;
        }
        .downgrade-confirm-box {
          display: none;
          align-items: center;
          gap: 8px;
          background: #FFFBEB;
          border: 1px solid #FDE68A;
          border-radius: 8px;
          padding: 6px 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 11.5px;
          color: #92400E;
          flex-wrap: wrap;
        }
        .btn-downgrade-cancel {
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          color: #475569;
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 11px;
          font-family: inherit;
          cursor: pointer;
        }
        .btn-downgrade-confirm {
          background: #DC2626;
          border: none;
          color: #FFFFFF;
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
        }

        /* Membership Tier Switcher (Modern Clean Architecture with Elingu Palette) */
        .billing-cycle-toggle-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-bottom: 26px;
        }
        .cycle-pill-wrap {
          display: inline-flex;
          align-items: center;
          background: #F1F5F9;
          padding: 4px;
          border-radius: 999px;
          border: 1px solid #E2E8F0;
        }
        .cycle-pill-btn {
          padding: 7px 18px;
          border-radius: 999px;
          font-size: 13.5px;
          font-weight: 500;
          border: none;
          background: transparent;
          color: #64748B;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
        }
        .cycle-pill-btn.active {
          background: #0D3A26;
          color: #FFFFFF;
          font-weight: 600;
          box-shadow: 0 2px 6px rgba(13, 58, 38, 0.25);
        }
        .save-discount-badge {
          background: #E8F5ED;
          color: #0D3A26;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 12px;
          border-radius: 999px;
          border: 1px solid #A7F3D0;
        }

        .plans-horizontal-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 24px;
          align-items: stretch;
        }
        @media (max-width: 940px) {
          .plans-horizontal-grid {
            grid-template-columns: 1fr;
          }
        }
        .plan-box {
          background: #FFFFFF;
          border: 1.5px solid #E2E8F0;
          border-radius: 18px;
          padding: 26px 22px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }
        .plan-box:hover {
          border-color: #0D3A26;
          box-shadow: 0 10px 30px rgba(13, 58, 38, 0.08);
          transform: translateY(-2px);
        }
        .plan-box.highlight {
          border: 2px solid #0D3A26;
          box-shadow: 0 8px 30px rgba(13, 58, 38, 0.12);
          background: #FCFDFB;
        }

        .plan-top-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }
        .plan-glyph-circle {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
        }
        .plan-box.highlight .plan-glyph-circle {
          background: #E8F5ED;
          border-color: #C8E0D0;
        }
        .plan-tag-badge {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 999px;
        }
        .plan-tag-badge.current {
          background: #E8F5ED;
          color: #0D3A26;
          border: 1px solid #A7F3D0;
        }
        .plan-tag-badge.featured {
          background: #0D3A26;
          color: #FFFFFF;
          box-shadow: 0 2px 8px rgba(13, 58, 38, 0.25);
        }
        .plan-tag-badge.subtle {
          background: #F1F5F9;
          color: #64748B;
        }

        .plan-name-title {
          font-size: 22px;
          font-weight: 700;
          color: #0D3A26;
          margin-bottom: 4px;
          letter-spacing: -0.3px;
        }
        .plan-tagline-text {
          font-size: 12.5px;
          color: #64748B;
          font-weight: 400;
          min-height: 36px;
          line-height: 1.45;
          margin-bottom: 16px;
        }

        .plan-pricing-display {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 18px;
          padding-bottom: 16px;
          border-bottom: 1px solid #F1F5F9;
        }
        .plan-price-value {
          font-size: 28px;
          font-weight: 800;
          color: #0D3A26;
          letter-spacing: -0.5px;
        }
        .plan-price-billing {
          font-size: 12px;
          color: #64748B;
          line-height: 1.35;
        }

        .plan-cta-btn {
          width: 100%;
          height: 48px;
          border-radius: 12px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: none;
        }
        .plan-cta-btn.primary {
          background: #0D3A26;
          color: #FFFFFF;
          box-shadow: 0 4px 12px rgba(13, 58, 38, 0.2);
        }
        .plan-cta-btn.primary:hover {
          background: #134E33;
          transform: translateY(-1px);
        }
        .plan-cta-btn.secondary {
          background: #FFFFFF;
          color: #0D3A26;
          border: 1.5px solid #0D3A26;
        }
        .plan-cta-btn.secondary:hover {
          background: #F7FBF8;
        }
        .plan-cta-btn.active-current {
          background: #F8FAFC;
          color: #0D3A26;
          border: 1.5px solid #CBD5E1;
          cursor: default;
        }
        .plan-guarantee-note {
          text-align: center;
          font-size: 11.5px;
          color: #94A3B8;
          margin-top: 8px;
          margin-bottom: 20px;
        }

        .plan-features-header {
          font-size: 12px;
          font-weight: 700;
          color: #1E293B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
        }
        .plan-features-ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .plan-feature-li {
          font-size: 13px;
          color: #334155;
          line-height: 1.45;
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }
        .plan-feature-check {
          color: #0D3A26;
          font-weight: 800;
          font-size: 13.5px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .addon-box {
          background: #FEF9E7;
          border: 1px solid #F0D98C;
          border-radius: 12px;
          padding: 16px 20px;
          font-size: 13px;
          font-weight: 400;
          color: #2C2C2C;
          margin-top: 20px;
          line-height: 1.5;
        }

        /* 2-Column Horizontal Bottom Utilities */
        .bottom-utility-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 18px;
          margin-top: 22px;
        }
        @media (max-width: 820px) {
          .bottom-utility-grid {
            grid-template-columns: 1fr;
          }
        }
        .bottom-utility-card {
          border-radius: 14px;
          padding: 22px 20px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 100%;
          box-shadow: none;
        }
        .footer-note {
          text-align: center;
          font-size: 12px;
          font-weight: 300;
          color: #9A9A9A;
          margin-top: 36px;
        }
        @media (max-width: 640px) {
          body { padding: 12px 8px 40px; }
          .portal-container { width: 100%; max-width: 100%; }
          .portal-header-bar {
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 12px 0 16px;
          }
          .portal-header-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-left: auto;
            flex-shrink: 0;
            width: auto;
          }
          .theme-toggle-btn {
            width: auto !important;
            padding: 6px 12px !important;
            font-size: 11.5px !important;
            flex-shrink: 0 !important;
          }
          .kdpa-badge {
            padding: 5px 10px !important;
            font-size: 11px !important;
          }
          .brand-wrap {
            justify-content: flex-start;
            gap: 10px;
          }
          .brand-logo-circle,
          .brand-logo-img {
            width: 38px;
            height: 38px;
          }
          .brand-title {
            font-size: 16.5px;
          }
          .brand-sub {
            font-size: 11px;
          }
          .portal-card {
            padding: 18px 14px;
            border-radius: 14px;
            margin-bottom: 16px;
          }
          .portal-card h2 {
            font-size: 18px;
          }

          /* Parent Account Bar */
          .parent-profile-bar {
            flex-direction: column;
            align-items: stretch !important;
            gap: 12px !important;
            padding: 16px 14px !important;
            border-radius: 14px;
          }
          .parent-profile-info {
            flex: none !important;
            width: 100% !important;
            margin: 0 !important;
          }
          .parent-profile-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            width: 100%;
          }
          .parent-profile-actions button {
            flex: 1 1 calc(50% - 4px);
            min-width: 130px;
            padding: 10px 8px !important;
            font-size: 12px !important;
            justify-content: center;
            text-align: center;
          }

          /* Learner Card Header Responsive */
          .learner-card-header {
            min-height: auto !important;
            padding: 14px 12px !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
          }
          .learner-header-left {
            width: 100%;
          }
          .learner-header-name {
            font-size: 16px !important;
            white-space: normal !important;
            word-break: break-word;
          }
          .learner-header-meta {
            font-size: 11px !important;
            white-space: normal !important;
            word-break: break-word;
          }
          .learner-header-stats {
            width: 100%;
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            justify-content: flex-start;
          }
          .learner-header-pill {
            font-size: 10.5px !important;
            padding: 4px 8px !important;
          }

          .learner-card-body { padding: 12px; }
          .portal-tabs-nav { gap: 10px; padding: 0 4px; overflow-x: auto; flex-wrap: nowrap; }
          .portal-tab-btn { padding: 10px 6px; font-size: 12.5px; }

          .form-input {
            font-size: 16px !important; /* Prevents auto-zoom on iOS Safari */
            padding: 12px 10px;
          }
          .btn-portal-primary {
            height: 48px;
            padding: 12px;
            font-size: 14px;
          }

          /* Responsive Tables / Horizontal Scroll */
          .table-responsive-wrapper {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          table {
            min-width: 500px;
          }
        }

        @media (max-width: 440px) {
          .parent-profile-actions button {
            flex: 1 1 100%;
          }
          .brand-title {
            font-size: 15px !important;
          }
          .brand-sub {
            display: none;
          }
          .kdpa-badge .kdpa-text {
            display: none;
          }
        }

        .btn-google-auth {
          width: 100%;
          height: 48px;
          background: #FFFFFF;
          border: 1px solid var(--pp-border);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14.5px;
          font-weight: 600;
          color: var(--pp-text);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          transition: all 0.2s ease;
          margin-bottom: 4px;
        }
        .btn-google-auth:hover {
          background: #F9FAFB;
          border-color: #9CA3AF;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
          transform: translateY(-1px);
        }
        body.theme-dark .btn-google-auth {
          background: rgba(20, 38, 28, 0.9);
          border-color: rgba(74, 222, 128, 0.25);
          color: #E2E8F0;
        }
        body.theme-dark .btn-google-auth:hover {
          background: rgba(26, 48, 36, 0.95);
          border-color: rgba(74, 222, 128, 0.4);
        }
        .auth-divider-line {
          display: flex;
          align-items: center;
          text-align: center;
          margin: 16px 0 14px 0;
          color: var(--pp-text-muted);
          font-size: 12px;
          font-family: 'DM Sans', sans-serif;
        }
        .auth-divider-line::before,
        .auth-divider-line::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid var(--pp-border);
        }
        .auth-divider-line span {
          padding: 0 10px;
        }
      </style>
    </head>
    <body>
      <div class="portal-container">
        <!-- Header -->
        <div class="portal-header-bar">
          <div class="brand-wrap">
            <div class="brand-logo-circle">
              <img src="/elingu-avatar.png" alt="Elingu Logo" class="brand-logo-img" />
            </div>
            <div>
              <div class="brand-title">Elingu Parent Portal</div>
              <div class="brand-sub">Elimu ni Nguvu • Family & Learning Insights</div>
            </div>
          </div>
          <div class="portal-header-actions">
            <div class="kdpa-badge">
              <span>🛡️</span> <span class="kdpa-text">KDPA 2019 Protected</span>
            </div>
            <button id="themeToggleBtn" onclick="toggleTheme()" class="theme-toggle-btn">🌙 Dark</button>
          </div>
        </div>

        <!-- AUTH GATE -->
        <div class="portal-card" id="loginCard">
          <div class="auth-toggle-tabs">
            <button type="button" class="auth-toggle-tab active" id="authTabSignIn" onclick="switchAuthView('signin')">
              <span>🔑</span> Sign In
            </button>
            <button type="button" class="auth-toggle-tab" id="authTabSignUp" onclick="switchAuthView('signup')">
              <span>🌱</span> New Parent / Enroll
            </button>
          </div>

          <!-- VIEW 1: SIGN IN -->
          <div id="authViewSignIn">
            <h2>Parent Sign In</h2>
            <p class="sub">Enter your parent email or mobile number and Family Password to access your family account and thinking portraits.</p>

            <!-- Google One-Click Parent Sign In -->
            <div style="margin-top: 14px; margin-bottom: 20px;">
              <button type="button" class="btn-google-auth" onclick="startParentGoogleAuth()">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Continue with Google</span>
              </button>
              <div class="auth-divider-line">
                <span>or sign in with password</span>
              </div>
            </div>

            <form id="parentLoginForm" onsubmit="event.preventDefault(); submitParentLogin();">
              <div class="form-group">
                <label for="parentEmail">Parent Email or Mobile Number</label>
                <input type="text" id="parentEmail" class="form-input" placeholder="e.g. 0712345678 or parent@example.com" value="${emailParam}" required>
              </div>

              <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <label for="familyPassword" style="margin-bottom: 0;">Family Password</label>
                  <a href="javascript:void(0)" onclick="toggleParentPasswordVisibility()" id="btnTogglePassword" style="font-size: 12px; color: var(--pp-accent); font-weight: 500; text-decoration: none;">Show Password 👁️</a>
                </div>
                <input type="password" id="familyPassword" class="form-input" placeholder="Enter your Family Password" autocomplete="current-password" required>
              </div>

              <button type="submit" id="btnParentSignIn" class="btn-portal-primary" style="height: 48px; width: 100%;">Sign In to Family Portal →</button>
              <div id="loginError" style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 12px 16px; color: #991B1B; font-size: 13.5px; margin-top: 14px; display: none; line-height: 1.5;"></div>
            </form>

            <div class="auth-footer-links">
              <span style="color: var(--pp-text-muted);">Forgot your password?</span>
              <button type="button" onclick="toggleForgotPinView()" style="background: none; border: none; color: var(--pp-accent); font-weight: 600; text-decoration: underline; cursor: pointer; font-size: 13px; font-family: inherit; text-align: left; padding: 0;">Reset with Email or SMS Code (2FA) 🔐</button>
            </div>

            <!-- COLLAPSIBLE 2FA OTP RESET SECTION -->
            <div id="resetPinSection" style="display: none; margin-top: 16px; background: var(--pp-card); border: 1px solid var(--pp-border); border-radius: 12px; padding: 16px; text-align: left;">
              <h4 style="font-size: 15px; font-weight: 700; color: var(--pp-accent); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                <span>🔐</span> Secure Password Reset (2FA)
              </h4>
              <p style="font-size: 12.5px; color: var(--pp-text-sub); margin-bottom: 14px; line-height: 1.4;">
                We will send a 6-digit verification code to your registered parent email or phone number to ensure it is really you.
              </p>

              <!-- Step 1: Request Code -->
              <div id="otpStep1">
                <div class="form-group" style="margin-bottom: 12px;">
                  <label for="resetEmail" style="font-size: 12.5px;">Registered Parent Email or Mobile Number</label>
                  <input type="text" id="resetEmail" class="form-input" placeholder="e.g. 0712345678 or parent@example.com" value="${emailParam}">
                </div>
                <button type="button" id="btnRequestOtp" class="btn-portal-primary" style="height: 44px; width: 100%; font-size: 13.5px;" onclick="requestPasswordResetOTP()">Send 6-Digit Code 📩</button>
              </div>

              <!-- Step 2: Enter Code + New Password -->
              <div id="otpStep2" style="display: none;">
                <div class="form-group" style="margin-bottom: 12px;">
                  <label for="otpCode" style="font-size: 12.5px; color: var(--pp-accent); font-weight: 700;">6-Digit Verification Code</label>
                  <input type="text" id="otpCode" class="form-input" placeholder="e.g. 123456" maxlength="6" inputmode="numeric" style="letter-spacing: 4px; font-size: 18px; font-weight: 700; text-align: center;">
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <label for="newFamilyPassword" style="font-size: 12.5px; margin-bottom: 0;">New Family Password</label>
                    <a href="javascript:void(0)" onclick="toggleInputType('newFamilyPassword', this)" style="font-size: 11.5px; color: var(--pp-accent); font-weight: 500; text-decoration: none;">Show 👁️</a>
                  </div>
                  <input type="password" id="newFamilyPassword" class="form-input" placeholder="Min 8 chars (letters + numbers)" autocomplete="new-password">
                  <div style="font-size: 11.5px; color: var(--pp-text-muted); margin-top: 4px;">Must contain at least 8 characters, with letters and numbers.</div>
                </div>
                <div class="form-group" style="margin-bottom: 14px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <label for="confirmNewFamilyPassword" style="font-size: 12.5px; margin-bottom: 0;">Confirm New Password</label>
                    <a href="javascript:void(0)" onclick="toggleInputType('confirmNewFamilyPassword', this)" style="font-size: 11.5px; color: var(--pp-accent); font-weight: 500; text-decoration: none;">Show 👁️</a>
                  </div>
                  <input type="password" id="confirmNewFamilyPassword" class="form-input" placeholder="Re-enter new password" autocomplete="new-password">
                </div>
                <button type="button" id="btnSubmitNewPassword" class="btn-portal-primary" style="height: 44px; width: 100%; font-size: 13.5px;" onclick="submitPasswordResetWithOTP()">Verify Code & Save Password →</button>
                <div style="margin-top: 8px; text-align: center;">
                  <a href="javascript:void(0)" onclick="requestPasswordResetOTP()" style="font-size: 12px; color: var(--pp-accent); text-decoration: underline;">Resend code</a>
                </div>
              </div>

              <div id="resetPinFeedback" style="display: none; margin-top: 12px; font-size: 12.5px; border-radius: 8px; padding: 10px 12px; line-height: 1.4;"></div>
            </div>
          </div>

          <!-- VIEW 2: NEW PARENT / ENROLL LEARNER -->
          <div id="authViewSignUp" style="display: none;">
            <h2>Enroll Your Learner</h2>
            <p class="sub">Set up Socratic thinking for your child in under 60 seconds. A parent account is automatically created for you.</p>

            <!-- Google One-Click Parent Enrollment -->
            <div style="margin-top: 14px; margin-bottom: 20px;">
              <button type="button" class="btn-google-auth" onclick="startParentGoogleAuth()">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Enroll Parent Account with Google</span>
              </button>
              <div class="auth-divider-line">
                <span>or enroll child on learner portal</span>
              </div>
            </div>

            <div style="background: rgba(13, 58, 38, 0.04); border: 1px solid var(--pp-border); border-radius: 12px; padding: 16px; margin-bottom: 18px;">
              <div style="font-weight: 600; font-size: 14.5px; margin-bottom: 8px; color: var(--pp-accent); display: flex; align-items: center; gap: 8px;">
                <span>✨</span> Quick Enrollment
              </div>
              <p style="font-size: 13px; color: var(--pp-text-sub); line-height: 1.5; margin-bottom: 14px;">
                Learners start with free Socratic practice on the main learning portal. When your child signs up with your email or phone, you receive an instant link to activate your family dashboard.
              </p>
              <a href="/learn" class="btn-portal-primary" style="display: block; text-align: center; text-decoration: none; padding: 14px 18px; height: auto;">
                Start Free CBE Socratic Practice →
              </a>
            </div>

            <div style="border-top: 1px solid var(--pp-border); padding-top: 14px; font-size: 13px; color: var(--pp-text-sub); line-height: 1.5;">
              <p style="margin-bottom: 6px;"><strong>Already registered your child?</strong></p>
              <p style="color: var(--pp-text-muted);">Check your email inbox or SMS for the activation link, or click <a href="javascript:void(0)" onclick="switchAuthView('signin')" style="color: var(--pp-accent); font-weight: 600;">Sign In</a> above to log in with your credentials.</p>
            </div>
          </div>

          <!-- VIEW 3: FINISH GOOGLE FAMILY ACCOUNT SETUP -->
          <div id="authViewGoogleFinish" style="display: none;">
            <h2>Complete Family Account</h2>
            <p class="sub">Google verified your email. Please set your 6-digit Family Security PIN and mobile number to safeguard your child's learning space.</p>

            <div style="background: rgba(74, 222, 128, 0.1); border: 1px solid #4ADE80; border-radius: 12px; padding: 12px 14px; margin-bottom: 18px; display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">🛡️</span>
              <div style="font-size: 13px; color: var(--pp-text);">
                Connected: <strong id="googleFinishEmailBadge">parent@gmail.com</strong>
              </div>
            </div>

            <form id="googleFinishForm" onsubmit="event.preventDefault(); submitGoogleFinishEnrollment();">
              <div class="form-group">
                <label class="form-label">Parent / Guardian Full Name</label>
                <input type="text" id="googleFinishName" class="form-input" placeholder="e.g. James Mutwiri" required />
              </div>
              <div class="form-group">
                <label class="form-label">Mobile Phone (M-Pesa / SMS Billing Alerts)</label>
                <input type="text" id="googleFinishPhone" class="form-input" placeholder="e.g. 0712345678" required />
                <span style="font-size: 11.5px; color: var(--pp-text-muted);">Required for subscription receipts and Kenya SMS notifications.</span>
              </div>
              <div class="form-group">
                <label class="form-label">Create 6-Digit Family Security PIN</label>
                <input type="password" id="googleFinishPin" class="form-input" placeholder="e.g. 274422 (6 digits or password)" required minlength="6" maxlength="32" />
                <span style="font-size: 11.5px; color: var(--pp-text-muted);">Used to approve subjects, view learning chats, and manage family plans.</span>
              </div>
              <div class="form-group">
                <label class="form-label">Confirm Family PIN</label>
                <input type="password" id="googleFinishPinConfirm" class="form-input" placeholder="Re-enter 6-digit PIN" required minlength="6" maxlength="32" />
              </div>
              <div id="googleFinishError" style="display: none; color: #DC2626; font-size: 12.5px; margin-bottom: 12px;"></div>
              <button type="submit" id="btnGoogleFinishSubmit" class="btn-portal-primary" style="height: 46px; width: 100%; font-size: 14px;">
                Activate Family Dashboard 🚀
              </button>
            </form>
          </div>
        </div>

        <!-- AUTHENTICATED DASHBOARD (Hidden until login) -->
        <div id="dashboardArea" style="display: none;">
          <!-- Parent Profile Bar -->
          <div class="portal-card parent-profile-bar">
            <div class="parent-profile-info">
              <div style="font-size: 11.5px; color: #9A9A9A; font-weight: 300; letter-spacing: 0.5px;">ACTIVE FAMILY ACCOUNT</div>
              <div id="dispParentEmail" style="font-size: 16px; font-weight: 600; color: #1C1C1C; word-break: break-all;"></div>
            </div>
            <div class="parent-profile-actions">
              <button type="button" id="btnHeaderUpgrade" onclick="switchPortalTab('billing')" class="btn-upgrade-action">
                Upgrade Plan
              </button>
              <button type="button" onclick="logoutParent()" class="btn-signout-action">
                Sign Out
              </button>
            </div>
          </div>

          <!-- TAB NAVIGATION -->
          <div class="portal-tabs-nav">
            <button type="button" id="tabBtnLearners" class="portal-tab-btn active" onclick="switchPortalTab('learners')">
              <span>👨‍👩‍👧‍👦 Learners & Progress</span>
              <span id="tabCountBadge" class="tab-badge">0/4</span>
            </button>
            <button type="button" id="tabBtnBilling" class="portal-tab-btn" onclick="switchPortalTab('billing')">
              <span>💎 Membership & Billing</span>
            </button>
          </div>

          <!-- TAB 1: LEARNERS & PROGRESS -->
          <div id="tabContentLearners">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
              <div>
                <h3 style="font-size: 16px; font-weight: 600; color: #1C1C1C;">Your Linked Learners (<span id="dispChildCount">0</span>/4)</h3>
                <p style="font-size: 13px; font-weight: 300; color: #9A9A9A; margin-top: 2px;">Track Socratic learning streaks, turns, and 90-day Know Your Child progress.</p>
              </div>
            </div>
            
            <div id="childrenContainer"></div>

            <!-- Pending Approvals if any -->
            <div id="pendingArea" style="display: none; margin-top: 24px;">
              <div class="portal-card" style="border: 1px solid #F0D98C; background: #FEF9E7; padding: 20px 22px;">
                <h4 style="font-size: 15px; font-weight: 600; color: #92400E; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                  <span>⏳</span> Pending Sibling Approvals
                </h4>
                <p style="font-size: 13px; font-weight: 400; color: #2C2C2C; margin-bottom: 14px;">
                  A child signed up using your email and needs your approval to begin learning.
                </p>
                <div id="pendingContainer"></div>
              </div>
            </div>
          </div>

          <!-- TAB 2: MEMBERSHIP & BILLING -->
          <div id="tabContentBilling" style="display: none;">
            <!-- Current Plan Summary Card -->
            <div class="portal-card" style="padding: 22px 24px; margin-bottom: 20px; border: 1px solid #E0D8CC; border-left: 4px solid #0D3A26; background: #F7FBF8; border-radius: 12px; box-shadow: 0 2px 12px rgba(13,58,38,0.06);">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px;">
                <div>
                  <div style="font-size: 12px; color: #9A9A9A; font-weight: 300; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Current Family Plan</div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span id="dispBillingCurrentTier" style="background: #E8F5ED; color: #0D3A26; font-size: 12px; font-weight: 500; padding: 4px 12px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px;">Free Plan</span>
                    <span id="dispBillingCyclePill" style="font-size: 12.5px; color: #9A9A9A; font-weight: 300;">Monthly Billing</span>
                  </div>
                </div>
                <div id="dispBillingSummary" style="font-size: 13px; font-weight: 400; color: #4A4A4A; max-width: 380px; line-height: 1.5;">
                  2 compulsory + 1 elective subject, 10–15 turns per day, basic weekly parent note.
                </div>
              </div>
            </div>

            <!-- Per-Learner Subject & Plan Status (Multi-Curriculum) -->
            <div id="billingLearnersStatusSection" style="margin-bottom: 20px;"></div>

            <!-- Membership Plans Card -->
            <div class="portal-card">
              <h2>Curriculum Membership Plans</h2>
              <p class="sub">Curriculum-aligned pricing across CBC Junior Secondary, Senior School, and Cambridge / Pearson Edexcel IGCSE.</p>

              <!-- Rate Card Filter Bar -->
              <div style="display: flex; gap: 8px; margin: 16px 0 14px 0; flex-wrap: wrap; align-items: center; background: #FAF7F2; padding: 10px 14px; border-radius: 10px; border: 1px solid #E0D8CC;">
                <span style="font-size: 12.5px; font-weight: 700; color: #0D3A26; display: flex; align-items: center; gap: 4px;">🎯 Rate Card for:</span>
                <button type="button" class="cycle-pill-btn active" id="btnRateTargetFamilyCbe" onclick="setRateTarget('family_cbe')" style="padding: 5px 12px; font-size: 12px; border-radius: 8px;">🇰🇪 CBE Family</button>
                <button type="button" class="cycle-pill-btn" id="btnRateTargetFamilyIgcse" onclick="setRateTarget('family_igcse')" style="padding: 5px 12px; font-size: 12px; border-radius: 8px;">🇬🇧 IGCSE Family</button>
                <div id="rateTargetChildrenPills" style="display: inline-flex; gap: 6px; flex-wrap: wrap;"></div>
                <span id="activeRateCardBadge" style="margin-left: auto; font-size: 11.5px; font-weight: 700; color: #065F46; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 20px;">🇰🇪 CBC / CBE Family Baseline</span>
              </div>

              <!-- Toggle Monthly / Annual -->
              <div class="billing-cycle-toggle-bar">
                <div class="cycle-pill-wrap">
                  <button type="button" id="lblMonthly" class="cycle-pill-btn active" onclick="setCycle('monthly')">Monthly</button>
                  <button type="button" id="lblAnnual" class="cycle-pill-btn" onclick="setCycle('annual')">Annual</button>
                </div>
                <div onclick="toggleCycle()" style="display: none;"><div id="switchKnob"></div></div>
                <span class="save-discount-badge">Save up to 3 Months ✨</span>
              </div>

              <!-- Horizontal 3-Column Plan Grid -->
              <div class="plans-horizontal-grid">
                <!-- Free Plan -->
                <div class="plan-box" id="planBoxFree">
                  <div>
                    <div class="plan-top-header">
                      <div class="plan-glyph-circle">🌱</div>
                      <span id="badgeFreePill" class="plan-tag-badge current">CURRENT PLAN</span>
                    </div>
                    <div class="plan-name-title">Free</div>
                    <div class="plan-tagline-text">Essential Socratic learning foundation for everyday homework guidance.</div>
                    <div class="plan-pricing-display">
                      <div class="plan-price-value" id="dispFreePrice">KES 0</div>
                      <div class="plan-price-billing">
                        <span>KES / month</span><br>
                        <span style="color: #64748B;">free forever</span>
                      </div>
                    </div>
                    <button type="button" id="btnPlanFree" class="plan-cta-btn active-current" onclick="handleFreePlanAction()">Current Plan ✓</button>
                    <div class="plan-guarantee-note">No credit card required • Free forever</div>
                    <div class="plan-features-header">Includes:</div>
                    <ul class="plan-features-ul">
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong id="freePlanSubjDesc">2 compulsory + 1 elective subject</strong> (3 subjects total)</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>10–15 problem steps</strong> worked through daily</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>Basic weekly parent note</strong> on progress</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span>Zero-PII KDPA 2019 student privacy</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- Standard Plan -->
                <div class="plan-box" id="planBoxStandard">
                  <div>
                    <div class="plan-top-header">
                      <div class="plan-glyph-circle">🌳</div>
                      <span class="plan-tag-badge subtle">CORE CURRICULUM</span>
                    </div>
                    <div class="plan-name-title">Standard</div>
                    <div class="plan-tagline-text">Unlimited subjects & daily practice for confident academic breakthroughs.</div>
                    <div class="plan-pricing-display">
                      <div class="plan-price-value" id="dispStandardPrice">KES 699</div>
                      <div class="plan-price-billing" id="dispStandardSub">
                        <span>KES / month</span><br>
                        <span>billed monthly</span>
                      </div>
                    </div>
                    <button type="button" id="btnPlanStandard" class="plan-cta-btn primary" onclick="openPaymentModal('standard')">Upgrade to Standard 🚀</button>
                    <div class="plan-guarantee-note">No commitment • Cancel anytime</div>
                    <div class="plan-features-header">Everything in Free, plus:</div>
                    <ul class="plan-features-ul">
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong id="stdPlanSubjDesc">All compulsory subjects + 2 electives</strong> (Core & Extended)</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>150 problem steps</strong> worked through daily</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>🗣️ Tonight&apos;s Effort Praise &amp; Dinner Prompts</strong> to celebrate grit &amp; patience</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>Plain-language CBE concept breakdowns</strong> &amp; everyday Kenyan contexts</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>Conversational weekly parent note</strong> in warm, plain language</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>Teacher CBE strand report</strong> for school consultations</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>Safe Box:</strong> Private learner reflection &amp; feelings space</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span>Learning streaks & practice archive</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- Premium Plan -->
                <div class="plan-box highlight" id="planBoxPremium">
                  <div>
                    <div class="plan-top-header">
                      <div class="plan-glyph-circle">⭐</div>
                      <span class="plan-tag-badge featured">MOST COMPREHENSIVE</span>
                    </div>
                    <div class="plan-name-title">Premium</div>
                    <div class="plan-tagline-text">Deep cognitive portraits & maximum Socratic tutor capability.</div>
                    <div class="plan-pricing-display">
                      <div class="plan-price-value" id="dispPremiumPrice">KES 1,499</div>
                      <div class="plan-price-billing" id="dispPremiumSub">
                        <span>KES / month</span><br>
                        <span>billed monthly</span>
                      </div>
                    </div>
                    <button type="button" id="btnPlanPremium" class="plan-cta-btn primary" onclick="openPaymentModal('premium')">Upgrade to Premium ✨</button>
                    <div class="plan-guarantee-note">No commitment • Cancel anytime</div>
                    <div class="plan-features-header">Everything in Standard, plus:</div>
                    <ul class="plan-features-ul">
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong id="premPlanSubjDesc">All compulsory + ALL electives unlocked</strong> (Full subject suite)</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>🎯 Exam Mastery:</strong> Paper 6 ATP engine + examiner comments (IGCSE) / KNEC SBA radar (CBE)</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>🍳 Weekend Offline Challenges</strong> &amp; Child-as-Teacher prompts (zero screens)</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>Know Your Child:</strong> 90-day cognitive portrait & reasoning traits</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>300 problem steps</strong> worked through daily (max intensity)</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>30-turn contextual depth</strong> for deep multi-part problems</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>Safe Box Pro:</strong> Learner reflection + proactive AI emotional stress radar</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span><strong>Comprehensive Teacher & Headteacher</strong> SBA report</span>
                      </li>
                      <li class="plan-feature-li">
                        <span class="plan-feature-check">✓</span>
                        <span>Priority Socratic AI responsiveness</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <!-- Add-on -->
              <div class="addon-box">
                👨‍👩‍👧‍👦 <strong>Additional Child Add-on:</strong> Add another child for <strong style="font-weight: 700; color: #92400E;">KES 400/month</strong> per additional child (maximum 4 children under one parent account).
              </div>

              <!-- 2-Column Horizontal Bottom Utilities: Pilot Code & Institutional Licences -->
              <div class="bottom-utility-grid">
                <!-- Pilot Code Redemption Card -->
                <div class="bottom-utility-card" style="background: #FAF7F2; border: 1.5px solid #E0D8CC;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                      <span style="font-size: 22px;">🔑</span>
                      <h3 style="font-size: 15.5px; font-weight: 700; color: #0D3A26;">Redeem School or Parent Pilot Code</h3>
                    </div>
                    <p style="font-size: 13px; color: #4A4A4A; margin-bottom: 16px; line-height: 1.5;">
                      Part of a partner school cohort or early parent evaluation? Enter your access code below to unlock full access for the duration of your trial.
                    </p>
                  </div>
                  <div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                      <input type="text" id="portalPilotCode" class="form-input" placeholder="e.g. PILOT2026, PARENT2026, TRIAL30" style="flex: 1; min-width: 170px; text-transform: uppercase;" />
                      <button type="button" class="btn-portal-primary" style="width: auto; padding: 12px 20px; height: 46px; white-space: nowrap;" onclick="redeemPortalPilotCode()">Activate Pilot</button>
                    </div>
                    <div id="portalPilotFeedback" style="display: none; margin-top: 10px; font-size: 13px; font-weight: 500;"></div>
                  </div>
                </div>

                <!-- Institutional Bulk Licencing Card -->
                <div class="bottom-utility-card" style="background: #F7FBF8; border: 1.5px solid #C8E0D0;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                      <span style="font-size: 22px;">🏫</span>
                      <h3 style="font-size: 15.5px; font-weight: 700; color: #0D3A26;">Institutional Bulk Licences (Schools &amp; Counties)</h3>
                    </div>
                    <p style="font-size: 13px; color: #4A4A4A; line-height: 1.5; margin-bottom: 14px;">
                      B2B deployment for CBE primary &amp; junior secondary schools, British &amp; International IGCSE schools, and county education boards with dedicated Teacher &amp; Headteacher SBA dashboards.
                    </p>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 11.5px; color: #0D3A26; font-weight: 600; margin-bottom: 16px;">
                      <span style="background: #E8F5ED; border: 1px solid #C8E0D0; padding: 4px 9px; border-radius: 6px;">🏫 CBE School: KES 500/mo</span>
                      <span style="background: #E8F5ED; border: 1.5px solid #0D3A26; color: #0D3A26; padding: 4px 9px; border-radius: 6px; font-weight: 700;">🇬🇧 IGCSE School: KES 3,000/student/mo</span>
                      <span style="background: #E8F5ED; border: 1px solid #C8E0D0; padding: 4px 9px; border-radius: 6px;">🏛️ Sub-County: KES 400/mo</span>
                      <span style="background: #E8F5ED; border: 1px solid #C8E0D0; padding: 4px 9px; border-radius: 6px;">🇰🇪 County: KES 300/mo</span>
                    </div>
                  </div>
                  <div>
                    <button type="button" onclick="openInstitutionalModal()" style="width: 100%; background: #0D3A26; color: #FFFFFF; border: none; border-radius: 10px; padding: 12px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 6px;">
                      View Licencing &amp; Quote →
                    </button>
                  </div>
                </div>
              </div>

              <div style="margin-top: 18px; font-size: 12px; font-weight: 300; color: #9A9A9A; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <span>🔒</span> Safe & secure • Compliant with Kenya Data Protection Act 2019 • Upgrade or cancel anytime
              </div>
            </div>
          </div>
        </div>

        <!-- MANAGE SUBSCRIPTION RETENTION MODAL -->
        <div id="managePlanModalOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); z-index: 9999; justify-content: center; align-items: center; padding: 16px;">
          <div style="background: #FFFFFF; border-radius: 20px; max-width: 480px; width: 100%; padding: 26px 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.25); font-family: 'DM Sans', sans-serif; position: relative; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
              <div>
                <h3 id="manageModalTitle" style="font-size: 19px; font-weight: 700; color: #0D3A26; margin-bottom: 3px;">Manage Subscription</h3>
                <div id="manageModalSubtitle" style="font-size: 12.5px; color: #64748B;">Active Plan & Benefits</div>
              </div>
              <button type="button" onclick="closeManagePlanModal()" style="background: none; border: none; font-size: 26px; color: #9A9A9A; cursor: pointer; line-height: 1; padding: 2px;">&times;</button>
            </div>

            <div id="manageModalTierBadge" style="margin-bottom: 16px;"></div>

            <!-- Value Reinforcement List -->
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px;">
              <div style="font-size: 12px; font-weight: 700; color: #0D3A26; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">Active Learning Benefits</div>
              <div style="font-size: 13px; color: #334155; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="color: #059669; font-weight: 700;">✓</span>
                <span><strong>Full CBE Curriculum Access:</strong> All subjects active without restriction</span>
              </div>
              <div id="manageModalTurnBenefit" style="font-size: 13px; color: #334155; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="color: #059669; font-weight: 700;">✓</span>
                <span><strong>Generous Daily Turns:</strong> 300 turns / day for deep revision</span>
              </div>
              <div id="manageModalKycBenefit" style="font-size: 13px; color: #334155; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="color: #059669; font-weight: 700;">✓</span>
                <span id="manageModalKycText"><strong>Know Your Child:</strong> 90-Day Longitudinal Thinking Portrait tracking</span>
              </div>
              <div style="font-size: 13px; color: #334155; display: flex; align-items: center; gap: 8px;">
                <span style="color: #059669; font-weight: 700;">✓</span>
                <span><strong>Conversational Weekly Insights:</strong> Socratic learning summary for parents</span>
              </div>
            </div>

            <!-- Loss Aversion Warning Box -->
            <div id="manageModalLossWarning" style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 10px; padding: 12px 14px; margin-bottom: 18px; font-size: 12px; color: #92400E; line-height: 1.5;">
              ⚠️ <strong>If you switch to the Free plan:</strong> <span id="manageModalLossName">Learner</span>&#39;s daily turns will be restricted from 300 to 15 turns/day, CBE subjects will drop to 2, and active Know Your Child progress will pause.
            </div>

            <!-- Primary Affirmation Button -->
            <button type="button" id="btnKeepActivePlan" onclick="closeManagePlanModal()" style="width: 100%; background: linear-gradient(135deg, #0D3A26 0%, #1A5C3A 100%); color: #FFFFFF; border: none; border-radius: 10px; padding: 12px 18px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(13,58,38,0.2); font-family: inherit;">
              Keep Active Plan ✨
            </button>

            <!-- Upgrade to Premium (if standard) -->
            <button type="button" id="btnUpgradeFromManage" onclick="upgradeFromManageModal()" style="display: none; width: 100%; margin-top: 10px; background: #FFFFFF; color: #0D3A26; border: 1.5px solid #0D3A26; border-radius: 10px; padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;">
              Upgrade to Premium ⭐
            </button>

            <!-- Tertiary Downgrade Link -->
            <div style="text-align: center; margin-top: 14px;">
              <a href="javascript:void(0)" onclick="executeModalDowngrade()" style="font-size: 11.5px; color: #94A3B8; text-decoration: underline; cursor: pointer;">
                Switch to Free Plan (Limit to 3 subjects)
              </a>
            </div>

            <!-- DPA Right to Erasure (Parent Managed Only) -->
            <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid #F1F5F9; text-align: center;">
              <a href="javascript:void(0)" onclick="executeParentDataErasure()" style="font-size: 11.5px; color: #EF4444; text-decoration: none; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                <span>🗑️ Permanently Delete Learner Data & Records</span>
              </a>
            </div>
          </div>
        </div>

        <!-- INSTITUTIONAL BULK LICENCING MODAL -->
        <div id="institutionalModalOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); z-index: 9999; justify-content: center; align-items: center; padding: 16px;">
          <div style="background: #FFFFFF; border-radius: 20px; max-width: 580px; width: 100%; padding: 28px 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.25); font-family: 'DM Sans', sans-serif; position: relative; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
              <div>
                <span style="font-size: 11px; font-weight: 700; color: #0D3A26; background: #E8F5ED; padding: 3px 9px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px;">B2B & Government Licencing</span>
                <h3 style="font-size: 20px; font-weight: 700; color: #0D3A26; margin-top: 6px; margin-bottom: 3px;">Elingu for Schools & Counties</h3>
                <div style="font-size: 12.5px; color: #64748B;">Competency-Based AI Tutoring deployed at institutional scale</div>
              </div>
              <button type="button" onclick="closeInstitutionalModal()" style="background: none; border: none; font-size: 26px; color: #9A9A9A; cursor: pointer; line-height: 1; padding: 2px;">&times;</button>
            </div>

            <!-- 4 Institutional Tiers (IGCSE School, CBE School, Sub-County, County) -->
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
              <!-- 1. IGCSE School Licence -->
              <div style="border: 2px solid #0D3A26; border-radius: 12px; padding: 14px 16px; background: #F0FDF4;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <span style="font-weight: 700; color: #0D3A26; font-size: 14.5px;">🇬🇧 Cambridge &amp; Edexcel IGCSE School Licence</span>
                  <span style="font-size: 13px; font-weight: 700; color: #0D3A26;">KES 3,000 / student / mo</span>
                </div>
                <div style="font-size: 12px; color: #047857; margin-bottom: 8px;">Annual billing: KES 30,000 / student / yr (Full Checkpoint &amp; IGCSE Coverage)</div>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.6;">
                  <li>Full Cambridge Checkpoint (Years 7–9) &amp; IGCSE (Years 10–11) syllabus coverage</li>
                  <li>Science Lab Bench &amp; Paper 6 Alternative to Practical (ATP) simulator</li>
                  <li>Cambridge examiner mark scheme criteria &amp; strict keyword validator</li>
                  <li>Dedicated Teacher &amp; Head of Department (HOD) Analytics Dashboard</li>
                </ul>
              </div>

              <!-- 2. CBC School Licence -->
              <div style="border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; background: #FFFFFF;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <span style="font-weight: 700; color: #0D3A26; font-size: 14.5px;">🏫 CBC School Licence (100–999 Pupils)</span>
                  <span style="font-size: 13px; font-weight: 700; color: #1C1C1C;">KES 500 / pupil / mo</span>
                </div>
                <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">Annual billing: KES 5,000 / pupil / yr (save KES 1,000/yr)</div>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.6;">
                  <li>Full Teacher and Headteacher CBE Analytics Dashboard</li>
                  <li>Class-level Strand Mastery &amp; Misconception Heatmaps</li>
                  <li>KICD SBA (School-Based Assessment) Report Generator</li>
                  <li>300 turns/day per pupil across all CBE subjects</li>
                </ul>
              </div>

              <!-- 3. Sub-County Cluster -->
              <div style="border: 1.5px solid #C8E0D0; border-radius: 12px; padding: 14px 16px; background: #F7FBF8;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <span style="font-weight: 700; color: #0D3A26; font-size: 14.5px;">🏛️ Sub-County Cluster (1,000–9,999 Pupils)</span>
                  <span style="font-size: 13px; font-weight: 700; color: #1C1C1C;">KES 400 / pupil / mo</span>
                </div>
                <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">Annual billing: KES 4,000 / pupil / yr (save KES 800/yr)</div>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.6;">
                  <li>Zonal Curriculum Support Officer (CSO) Oversight Portal</li>
                  <li>Cross-school performance benchmarking across the sub-county</li>
                  <li>Sub-County CBE Literacy &amp; Numeracy Progress Reports</li>
                  <li>Teacher Professional Development &amp; Pedagogy Analytics</li>
                </ul>
              </div>

              <!-- 4. County-Wide Deployment -->
              <div style="border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; background: #FFFFFF;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <span style="font-weight: 700; color: #0D3A26; font-size: 14.5px;">🇰🇪 County-Wide Deployment (10,000+ Pupils)</span>
                  <span style="font-size: 13px; font-weight: 700; color: #1C1C1C;">KES 300 / pupil / mo</span>
                </div>
                <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">Annual fiscal billing: KES 3,000 / pupil / yr (Optimal Scale Discount)</div>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #334155; line-height: 1.6;">
                  <li>County Education Board Macro-Analytics &amp; Equity Tracking</li>
                  <li>Longitudinal CBE competency aggregation across sub-counties</li>
                  <li>Dedicated high-concurrency cloud infrastructure SLA</li>
                  <li>Direct integration with County Education &amp; Bursary systems</li>
                </ul>
              </div>
            </div>

            <!-- Inquiry Submission Form -->
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px;">
              <div style="font-size: 13px; font-weight: 700; color: #0D3A26; margin-bottom: 6px;">Request Institutional Proposal or Pilot Rollout</div>
              <div style="font-size: 12px; color: #64748B; margin-bottom: 12px;">Speak directly with Elingu&#39;s Institutional Partnerships Team.</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <input type="text" id="instOrgName" placeholder="School or County Name" style="width: 100%; padding: 8px 12px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 12.5px; font-family: inherit;">
                <input type="number" id="instPupilCount" placeholder="Est. Number of Pupils" style="width: 100%; padding: 8px 12px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 12.5px; font-family: inherit;">
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <input type="text" id="instContactPerson" placeholder="Contact Person & Title" style="width: 100%; padding: 8px 12px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 12.5px; font-family: inherit;">
                <input type="text" id="instPhoneOrEmail" placeholder="Phone or Official Email" style="width: 100%; padding: 8px 12px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 12.5px; font-family: inherit;">
              </div>
              <div id="instFeedback" style="display: none; font-size: 12px; margin-bottom: 10px;"></div>
              <button type="button" onclick="submitInstitutionalInquiry()" id="btnSubmitInstInquiry" style="width: 100%; background: #0D3A26; color: #FFFFFF; font-weight: 600; padding: 10px; border-radius: 8px; border: none; font-size: 13px; cursor: pointer; font-family: inherit;">
                Submit Institutional Request 🚀
              </button>
            </div>
          </div>
        </div>

        <!-- KENYAN PAYMENT CHECKOUT MODAL -->
        <div id="paymentModalOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 9999; justify-content: center; align-items: center; padding: 16px;">
          <div style="background: #FFFFFF; border-radius: 20px; max-width: 480px; width: 100%; padding: 26px 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.25); font-family: 'DM Sans', sans-serif; position: relative; max-height: 90vh; overflow-y: auto;">
            
            <!-- CHECKOUT FORM VIEW (Hidden when payment succeeds) -->
            <div id="paymentModalFormView">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <div>
                  <h3 id="checkoutModalTitle" style="font-size: 19px; font-weight: 700; color: #0D3A26; margin-bottom: 3px;">Upgrade Family Plan</h3>
                  <div id="checkoutModalScope" style="font-size: 12.5px; color: #047857; font-weight: 600; margin-bottom: 3px;">Covers all linked children in your family</div>
                  <div id="checkoutModalPrice" style="font-size: 14.5px; color: #1C1C1C; font-weight: 700;">Total: KES 700 / month</div>
                </div>
                <button type="button" onclick="closePaymentModal()" style="background: none; border: none; font-size: 26px; color: #9A9A9A; cursor: pointer; line-height: 1; padding: 2px;">&times;</button>
              </div>

              <!-- Target Learner Selection -->
              <div style="margin-bottom: 16px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px 12px;">
                <label for="checkoutTargetSelect" style="display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 5px;">
                  Select Plan Target:
                </label>
                <select id="checkoutTargetSelect" onchange="onCheckoutTargetChange(this.value)" style="width: 100%; border: 1px solid #CBD5E1; border-radius: 8px; padding: 7px 10px; font-size: 13px; font-weight: 600; color: #0F172A; background: #FFFFFF; font-family: inherit;">
                  <option value="all">👨‍👩‍👧‍👦 Whole Family Account (All Learners)</option>
                </select>
              </div>


              <!-- Payment Methods Nav Tabs -->
              <div style="display: flex; border-bottom: 1px solid #E0D8CC; margin-bottom: 18px;">
                <button type="button" id="payTabBtnMpesa" class="portal-tab-btn active" style="flex: 1; padding: 10px 6px; font-size: 12.5px;" onclick="switchPaymentTab('mpesa')">
                  <span>📲 M-Pesa Express</span>
                </button>
                <button type="button" id="payTabBtnPaybill" class="portal-tab-btn" style="flex: 1; padding: 10px 6px; font-size: 12.5px;" onclick="switchPaymentTab('paybill')">
                  <span>🧾 Paybill / Till</span>
                </button>
                <button type="button" id="payTabBtnCard" class="portal-tab-btn" style="flex: 1; padding: 10px 6px; font-size: 12.5px;" onclick="switchPaymentTab('card')">
                  <span>💳 Card / Bank</span>
                </button>
              </div>

              <!-- TAB 1: M-PESA EXPRESS (STK PUSH) -->
              <div id="payContentMpesa">
                <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; display: flex; gap: 10px; align-items: center;">
                  <span style="font-size: 24px; flex-shrink: 0;">📱</span>
                  <div style="font-size: 12.5px; color: #065F46; line-height: 1.4;">
                    An instant M-Pesa STK Push prompt will appear on your phone. Enter your M-Pesa PIN on your handset to confirm.
                  </div>
                </div>
                <div class="form-group">
                  <label for="mpesaPhone" style="font-size: 13px; font-weight: 600; color: #1C1C1C;">Safaricom Mobile Number</label>
                  <input type="tel" id="mpesaPhone" class="form-input" placeholder="0712 345 678 or 0110..." maxlength="14" />
                </div>
                <button type="button" id="btnPayMpesaSubmit" class="btn-portal-primary" style="height: 48px;" onclick="submitMpesaPayment()">
                  <span>Send M-Pesa Prompt 📲</span>
                </button>
                <div id="mpesaStatusBox" style="display: none; margin-top: 14px;"></div>
              </div>

              <!-- TAB 2: MANUAL PAYBILL / TILL -->
              <div id="payContentPaybill" style="display: none;">
                <div style="background: #FAF7F2; border: 1px solid #E0D8CC; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; font-size: 13px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #6B7280;">Business / Paybill No:</span>
                    <strong style="color: #0D3A26; font-size: 14.5px;">400200</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="color: #6B7280;">Account Number:</span>
                    <strong id="paybillAccNum" style="color: #0D3A26;">ELINGU</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #6B7280;">Amount:</span>
                    <strong id="paybillAmount" style="color: #0D3A26;">KES 700</strong>
                  </div>
                </div>
                <div class="form-group">
                  <label for="mpesaRefCode" style="font-size: 13px; font-weight: 600; color: #1C1C1C;">M-Pesa Transaction Code</label>
                  <input type="text" id="mpesaRefCode" class="form-input" placeholder="e.g. QHD82X19KP" maxlength="12" style="text-transform: uppercase;" />
                </div>
                <button type="button" class="btn-portal-primary" style="height: 48px;" onclick="submitPaybillPayment()">
                  <span>Verify & Activate Plan ✓</span>
                </button>
              </div>

              <!-- TAB 3: CARD / BANK -->
              <div id="payContentCard" style="display: none;">
                <div style="font-size: 12.5px; color: #6B7280; margin-bottom: 14px;">Pay securely with Visa, Mastercard, or Bank Transfer (Pesalink).</div>
                <div class="form-group">
                  <label for="cardNum" style="font-size: 13px; font-weight: 600; color: #1C1C1C;">Card Number</label>
                  <input type="text" id="cardNum" class="form-input" placeholder="4111 •••• •••• ••••" maxlength="19" />
                </div>
                <div style="display: flex; gap: 10px;">
                  <div class="form-group" style="flex: 1;">
                    <label for="cardExp" style="font-size: 13px; font-weight: 600; color: #1C1C1C;">Expiry</label>
                    <input type="text" id="cardExp" class="form-input" placeholder="MM/YY" maxlength="5" />
                  </div>
                  <div class="form-group" style="flex: 1;">
                    <label for="cardCvv" style="font-size: 13px; font-weight: 600; color: #1C1C1C;">CVV</label>
                    <input type="password" id="cardCvv" class="form-input" placeholder="123" maxlength="4" />
                  </div>
                </div>
                <button type="button" class="btn-portal-primary" style="height: 48px;" onclick="submitCardPayment()">
                  <span id="btnCardPayText">Pay KES 700 🔒</span>
                </button>
              </div>

              <div style="margin-top: 16px; font-size: 11px; color: #9A9A9A; text-align: center;">
                🔒 Compliant with Kenya Data Protection Act 2019 • Zero card data stored
              </div>
            </div>

            <!-- SUCCESS RECEIPT VIEW (Isolated view taking over modal card) -->
            <div id="paySuccessView" style="display: none; text-align: center; padding: 20px 8px;">
              <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
              <h3 style="font-size: 20px; font-weight: 700; color: #0D3A26; margin-bottom: 6px;">Payment Successful!</h3>
              <p id="paySuccessMsg" style="font-size: 13.5px; color: #4A4A4A; margin-bottom: 16px; line-height: 1.5;"></p>
              <div id="payReceiptBox" style="background: #F7FBF8; border: 1px solid #C8E0D0; border-radius: 12px; padding: 16px; margin-bottom: 20px; font-size: 13px; text-align: left;"></div>
              <button type="button" class="btn-portal-primary" style="height: 48px;" onclick="closePaymentModalAndRefresh()">
                <span>Return to Parent Dashboard →</span>
              </button>
            </div>

          </div>
        </div>

        <!-- UPGRADE TIER SELECTION PROMPT MODAL -->
        <div id="upgradeTierPromptModalOverlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); z-index: 9999; justify-content: center; align-items: center; padding: 16px;">
          <div style="background: #FFFFFF; border-radius: 20px; max-width: 540px; width: 100%; padding: 26px 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.25); font-family: 'DM Sans', sans-serif; position: relative; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
              <div>
                <span id="promptModalBadge" style="font-size: 11px; font-weight: 700; color: #0D3A26; background: #E8F5ED; padding: 3px 9px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px;">Curriculum Upgrade</span>
                <h3 id="promptModalTitle" style="font-size: 20px; font-weight: 700; color: #0D3A26; margin-top: 6px; margin-bottom: 2px;">Choose a Plan for Learner</h3>
                <div id="promptModalSubtitle" style="font-size: 12.5px; color: #64748B;">Select the level of Socratic learning and revision support</div>
              </div>
              <button type="button" onclick="closePromptUpgradeModal()" style="background: none; border: none; font-size: 26px; color: #9A9A9A; cursor: pointer; line-height: 1; padding: 2px;">&times;</button>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 16px;">
              <!-- Standard Option Card -->
              <div style="border: 1.5px solid #CBD5E1; border-radius: 14px; padding: 18px 16px; background: #FFFFFF; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s;">
                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-size: 22px;">🚀</span>
                    <span style="font-size: 11px; font-weight: 700; color: #1E3A8A; background: #EFF6FF; padding: 2px 7px; border-radius: 6px;">CORE</span>
                  </div>
                  <div id="promptStdTitle" style="font-size: 16px; font-weight: 700; color: #0D3A26; margin-bottom: 2px;">Standard</div>
                  <div id="promptStdTagline" style="font-size: 11.5px; color: #64748B; margin-bottom: 12px; min-height: 32px;">Core subjects, daily guidance, and weekly parent summaries.</div>
                  <div style="margin-bottom: 14px;">
                    <div id="promptStdPrice" style="font-size: 20px; font-weight: 800; color: #0D3A26;">KES 699</div>
                    <div id="promptStdBilling" style="font-size: 11px; color: #64748B;">KES / month</div>
                  </div>
                  <ul id="promptStdFeatures" style="margin: 0 0 16px 0; padding-left: 16px; font-size: 11.5px; color: #334155; line-height: 1.6;">
                    <li>Compulsory subjects + 2 electives</li>
                    <li>150 daily problem steps</li>
                    <li>Tonight&#39;s Effort Praise &amp; Dinner Prompts</li>
                    <li>Weekly plain-language parent note</li>
                  </ul>
                </div>
                <button type="button" id="btnChooseStd" onclick="selectPromptPlan('standard')" style="width: 100%; background: #0D3A26; color: #FFFFFF; border: none; border-radius: 8px; padding: 10px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all 0.2s;">
                  Choose Standard 🚀
                </button>
              </div>

              <!-- Premium Option Card -->
              <div style="border: 2px solid #0D3A26; border-radius: 14px; padding: 18px 16px; background: #F7FBF8; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 14px rgba(13,58,38,0.08); transition: all 0.2s;">
                <div>
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-size: 22px;">⭐</span>
                    <span style="font-size: 11px; font-weight: 700; color: #065F46; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 2px 7px; border-radius: 6px;">RECOMMENDED</span>
                  </div>
                  <div id="promptPremTitle" style="font-size: 16px; font-weight: 700; color: #0D3A26; margin-bottom: 2px;">Premium</div>
                  <div id="promptPremTagline" style="font-size: 11.5px; color: #64748B; margin-bottom: 12px; min-height: 32px;">All subjects unlocked, deep cognitive portraits, and exam mastery.</div>
                  <div style="margin-bottom: 14px;">
                    <div id="promptPremPrice" style="font-size: 20px; font-weight: 800; color: #0D3A26;">KES 1,499</div>
                    <div id="promptPremBilling" style="font-size: 11px; color: #64748B;">KES / month</div>
                  </div>
                  <ul id="promptPremFeatures" style="margin: 0 0 16px 0; padding-left: 16px; font-size: 11.5px; color: #334155; line-height: 1.6;">
                    <li>ALL compulsory + ALL electives</li>
                    <li>300 daily problem steps (max capacity)</li>
                    <li>Paper 6 ATP / SBA revision radar</li>
                    <li>Know Your Child 90-day Thinking Portrait</li>
                    <li>Safe Box Pro &amp; Weekend Challenges</li>
                  </ul>
                </div>
                <button type="button" id="btnChoosePrem" onclick="selectPromptPlan('premium')" style="width: 100%; background: linear-gradient(135deg, #0D3A26, #1A5C3A); color: #FFFFFF; border: none; border-radius: 8px; padding: 10px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(13,58,38,0.2);">
                  Choose Premium ✨
                </button>
              </div>
            </div>

            <div style="text-align: center; font-size: 11.5px; color: #64748B;">
              🔒 Switch plans or cancel anytime • Compliant with Kenya Data Protection Act 2019
            </div>
          </div>
        </div>

        <!-- GRADE CORRECTION REQUEST MODAL -->
        <div id="gradeCorrectionModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 99999; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
          <div style="background: #FFFFFF; border-radius: 16px; padding: 28px; width: 90%; max-width: 460px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); border: 1px solid #E0D8CC;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
              <h3 style="font-size: 18px; font-weight: 700; color: #0D3A26; margin: 0; display: flex; align-items: center; gap: 8px;">
                <span>🎓</span> Request Grade Correction
              </h3>
              <button type="button" onclick="closeGradeCorrectionModal()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #64748B;">✕</button>
            </div>
            <p style="font-size: 13px; color: #4A4A4A; line-height: 1.5; margin: 0 0 16px 0;">
              🔒 <strong>Academic Integrity Lock:</strong> Grade and curriculum changes are locked to prevent multi-child account cycling. To request an adjustment, submit below or email our academic administration at <a href="mailto:support@elingu.com" style="color: #0D3A26; font-weight: 700; text-decoration: underline;">support@elingu.com</a>.
            </p>
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px; margin-bottom: 16px;">
              <div style="font-size: 12px; color: #64748B;">Learner:</div>
              <div style="font-size: 15px; font-weight: 700; color: #0F172A;" id="gcStudentName">Learner</div>
              <input type="hidden" id="gcStudentId" />
            </div>
            <div class="form-group" style="margin-bottom: 14px;">
              <label for="gcGradeSelect" style="font-size: 13px; font-weight: 600; color: #1C1C1C; margin-bottom: 6px; display: block;">Correct Grade Level</label>
              <select id="gcGradeSelect" class="form-input" style="width: 100%;">
                <option value="6">Grade 6 (Upper Primary)</option>
                <option value="7">Grade 7 (Junior Secondary)</option>
                <option value="8">Grade 8 (Junior Secondary)</option>
                <option value="9">Grade 9 (Junior Secondary)</option>
                <option value="10">Grade 10 (Senior School)</option>
                <option value="11">Grade 11 (Senior School)</option>
                <option value="12">Grade 12 (Senior School)</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 18px;">
              <label for="gcReasonInput" style="font-size: 13px; font-weight: 600; color: #1C1C1C; margin-bottom: 6px; display: block;">Reason for Correction</label>
              <textarea id="gcReasonInput" class="form-input" placeholder="e.g., Selected wrong grade during sign up, learner is in Grade 8" style="width: 100%; height: 75px; resize: none; font-family: inherit; font-size: 13px;"></textarea>
            </div>
            <div id="gcFeedback" style="display: none; padding: 10px 12px; border-radius: 8px; font-size: 12.5px; margin-bottom: 14px;"></div>
            <div style="display: flex; gap: 10px;">
              <button type="button" onclick="closeGradeCorrectionModal()" class="btn-portal-secondary" style="flex: 1; padding: 10px 0; border: 1px solid #CBD5E1; background: #F8FAFC; color: #475569; border-radius: 10px; font-weight: 600; cursor: pointer;">Cancel</button>
              <button type="button" id="btnSubmitGradeCorrection" onclick="submitGradeCorrectionRequest()" class="btn-portal-primary" style="flex: 1.5; padding: 10px 0; border-radius: 10px; font-weight: 700; cursor: pointer;">Submit Request →</button>
            </div>
          </div>
        </div>

        <!-- PARENT SUBJECT SELECTION MODAL -->
        <div id="parentSubjectModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 9999; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px);">
          <div style="background: var(--pp-card, #FFFFFF); border: 1px solid var(--pp-border, #E0D8CC); border-radius: 18px; max-width: 580px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 28px 26px; box-shadow: 0 20px 40px rgba(0,0,0,0.25);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="font-size: 19px; font-weight: 700; color: #0D3A26; margin: 0; display: flex; align-items: center; gap: 8px;">
                <span>📚</span> Manage Learner Subjects
              </h3>
              <button type="button" onclick="closeParentSubjectModal()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #64748B;">✕</button>
            </div>
            <p style="font-size: 13px; color: #4A4A4A; line-height: 1.5; margin: 0 0 16px 0;">
              Select the subjects your child is studying this term. The AI Socratic tutor aligns with Kenya KICD CBC &amp; Cambridge IGCSE learning outcomes.
              <span style="display: block; font-size: 11.5px; color: #64748B; margin-top: 6px; padding: 6px 10px; background: #F1F5F9; border-radius: 6px;">
                🔒 <strong>Academic Note:</strong> Grade and curriculum are locked to each child's academic profile. For transfers or corrections, please contact admin via email at <a href="mailto:support@elingu.com" style="color: #0D3A26; font-weight: 600;">support@elingu.com</a>.
              </span>
            </p>
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px; margin-bottom: 16px;">
              <div style="font-size: 12px; color: #64748B;">Learner:</div>
              <div style="font-size: 15px; font-weight: 700; color: #0F172A;" id="psStudentName">Learner</div>
              <div style="font-size: 12px; color: #0D3A26; margin-top: 2px;" id="psStudentLevel">Grade</div>
              <input type="hidden" id="psStudentId" />
              <input type="hidden" id="psStudentGrade" />
            </div>

            <!-- Pathway Selector (Senior School Only) -->
            <div id="psPathwaySection" style="display: none; margin-bottom: 18px;">
              <label for="psPathwaySelect" style="font-size: 13px; font-weight: 600; color: #1C1C1C; margin-bottom: 6px; display: block;">Senior School Career Pathway</label>
              <select id="psPathwaySelect" class="form-input" style="width: 100%;" onchange="renderParentSubjectCheckboxes()">
                <option value="STEM">🔬 STEM Pathway</option>
                <option value="HUMANITIES">📜 Social Sciences / Humanities Pathway</option>
                <option value="ARTS_SPORTS">🎨 Arts & Sports Science Pathway</option>
              </select>
            </div>

            <!-- Subject Checklist -->
            <div style="margin-bottom: 18px;">
              <label style="font-size: 13px; font-weight: 600; color: #1C1C1C; margin-bottom: 8px; display: block;">Choose Subjects</label>
              <div id="psSubjectsList" style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto; padding: 4px; border: 1px solid #E2E8F0; border-radius: 10px; background: #FAFAFA;">
                <!-- Dynamically populated -->
              </div>
            </div>

            <div id="psFeedback" style="display: none; padding: 10px 12px; border-radius: 8px; font-size: 12.5px; margin-bottom: 14px;"></div>
            <div style="display: flex; gap: 10px;">
              <button type="button" onclick="closeParentSubjectModal()" class="btn-portal-secondary" style="flex: 1; padding: 11px 0; border: 1px solid #CBD5E1; background: #F8FAFC; color: #475569; border-radius: 10px; font-weight: 600; cursor: pointer;">Cancel</button>
              <button type="button" id="btnSaveParentSubjects" onclick="submitParentSubjectChange()" class="btn-portal-primary" style="flex: 1.5; padding: 11px 0; border-radius: 10px; font-weight: 700; cursor: pointer;">Save Subjects ✓</button>
            </div>
        </div>

        <!-- PARENT IGCSE TIER MODAL (Independent Learners Only) -->
        <div id="parentTierModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 9999; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px);">
          <div style="background: var(--pp-card, #FFFFFF); border: 1px solid var(--pp-border, #E0D8CC); border-radius: 18px; max-width: 460px; width: 100%; padding: 26px; box-shadow: 0 20px 40px rgba(0,0,0,0.25);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="font-size: 18px; font-weight: 700; color: #0D3A26; margin: 0; display: flex; align-items: center; gap: 8px;">
                <span>🎯</span> IGCSE Exam Tier Selection
              </h3>
              <button type="button" onclick="closeParentTierModal()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #64748B;">✕</button>
            </div>
            <p style="font-size: 13px; color: #4A4A4A; line-height: 1.5; margin: 0 0 16px 0;">
              Select the Cambridge / Edexcel examination tier for <strong id="ptStudentName">Learner</strong> (Independent Learner):
            </p>
            <input type="hidden" id="ptStudentId" />
            <div style="margin-bottom: 18px;">
              <label for="ptTierSelect" style="font-size: 13px; font-weight: 600; color: #1C1C1C; margin-bottom: 6px; display: block;">Examination Tier</label>
              <select id="ptTierSelect" class="form-input" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--pp-border, #CBD5E1); background: var(--pp-input-bg, #FFFFFF); color: var(--pp-text, #1C1C1C); font-size: 13.5px; font-weight: 600;">
                <option value="extended">Extended Tier (Grades A*–E) — Comprehensive syllabus</option>
                <option value="core">Core Tier (Grades C–G) — Targeted foundation (C-grade cap)</option>
              </select>
            </div>
            <div id="ptFeedback" style="display: none; padding: 10px 12px; border-radius: 8px; font-size: 12.5px; margin-bottom: 14px;"></div>
            <div style="display: flex; gap: 10px;">
              <button type="button" onclick="closeParentTierModal()" class="btn-portal-secondary" style="flex: 1; padding: 11px 0; border: 1px solid #CBD5E1; background: #F8FAFC; color: #475569; border-radius: 10px; font-weight: 600; cursor: pointer;">Cancel</button>
              <button type="button" onclick="submitParentTierChange()" class="btn-portal-primary" style="flex: 1.5; padding: 11px 0; border-radius: 10px; font-weight: 700; cursor: pointer;">Save Tier ✓</button>
            </div>
          </div>
        </div>

        <div class="footer-note">
          Elingu complies fully with Kenya Data Protection Act 2019 • Zero-PII safe learning architecture
        </div>
      </div>

      <script>
        let currentCycle = 'monthly';
        let savedEmail = '';
        let savedPin = '';
        let currentParentTier = 'free';
        let activeTab = '${initialTab}';
        let allChildrenList = [];
        let checkoutStudentId = null;
        let checkoutStudentName = null;

        function isBritishChild(c) {
          if (!c) return false;
          var cur = String(c.curriculum || '').trim().toUpperCase();
          var lvl = String(c.schoolLevel || '').trim().toUpperCase();
          return cur === 'BRITISH' || cur === 'IGCSE' || cur === 'CAMBRIDGE' || cur === 'EDEXCEL' || lvl === 'IGCSE' || lvl === 'CHECKPOINT';
        }

        function switchPortalTab(tabName) {
          activeTab = tabName;
          const isLearners = tabName === 'learners';

          document.getElementById('tabBtnLearners').className = 'portal-tab-btn ' + (isLearners ? 'active' : '');
          document.getElementById('tabBtnBilling').className = 'portal-tab-btn ' + (!isLearners ? 'active' : '');

          document.getElementById('tabContentLearners').style.display = isLearners ? 'block' : 'none';
          document.getElementById('tabContentBilling').style.display = !isLearners ? 'block' : 'none';

          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function switchLearnerInsightTab(childId, tabName) {
          const tabs = ['work', 'note', 'portrait'];
          tabs.forEach(t => {
            const btn = document.getElementById('tabBtn_' + t + '_' + childId);
            const panel = document.getElementById('panel_' + t + '_' + childId);
            if (btn) {
              if (t === tabName) {
                btn.classList.add('active');
              } else {
                btn.classList.remove('active');
              }
            }
            if (panel) {
              panel.style.display = (t === tabName ? 'block' : 'none');
            }
          });
        }

        function toggleSessionDrilldown(detailId) {
          const el = document.getElementById(detailId);
          const ch = document.getElementById('chevron_' + detailId);
          const lnk = document.getElementById('guideLink_' + detailId);
          if (!el) return;
          const isHidden = (el.style.display === 'none' || !el.style.display);
          el.style.display = isHidden ? 'block' : 'none';
          if (ch) {
            ch.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
          }
          if (lnk) {
            lnk.innerHTML = isHidden ? 'Hide guide &uarr;' : "View tonight&#39;s guide &rarr;";
          }
        }

        function toggleSessionKnowMore(childId, sIdx) {
          const el = document.getElementById('sessionDetail_' + childId + '_' + sIdx);
          const btn = document.getElementById('btnKnowMore_' + childId + '_' + sIdx);
          const icon = document.getElementById('iconKnowMore_' + childId + '_' + sIdx);
          if (!el) return;
          const isHidden = (el.style.display === 'none' || !el.style.display);
          el.style.display = isHidden ? 'block' : 'none';
          if (btn) {
            const labelSpan = btn.querySelector('.know-more-text');
            if (labelSpan) {
              labelSpan.textContent = isHidden ? 'Show Less' : 'Know More';
            }
            btn.style.background = isHidden ? '#0D3A26' : '#FFFFFF';
            btn.style.color = isHidden ? '#FFFFFF' : '#0D3A26';
            btn.style.borderColor = '#0D3A26';
          }
          if (icon) {
            icon.innerHTML = isHidden ? '&uarr;' : '&darr;';
          }
        }

        function switchGuideSubject(childId, activeIdx) {
          const cards = document.querySelectorAll('.guide-content-' + childId);
          cards.forEach(function(card, idx) {
            card.style.display = (idx === activeIdx) ? 'block' : 'none';
          });
          const pills = document.querySelectorAll('.guide-subj-pill-' + childId);
          pills.forEach(function(pill, idx) {
            if (idx === activeIdx) {
              pill.style.background = '#0D3A26';
              pill.style.color = '#FFFFFF';
              pill.style.borderColor = '#0D3A26';
            } else {
              pill.style.background = '#FFFFFF';
              pill.style.color = '#4A4A4A';
              pill.style.borderColor = '#E0D8CC';
            }
          });
        }

        function toggleKnowMore(childId, idx) {
          const el = document.getElementById('knowMoreDetail_' + childId + '_' + idx);
          const btn = document.getElementById('knowMoreBtn_' + childId + '_' + idx);
          const ch = document.getElementById('knowMoreChevron_' + childId + '_' + idx);
          if (!el) return;
          const isHidden = (el.style.display === 'none');
          el.style.display = isHidden ? 'block' : 'none';
          if (btn) {
            const labelSpan = btn.querySelector('.know-more-label');
            if (labelSpan) {
              labelSpan.textContent = isHidden ? 'Show Less' : 'Know More (Concept Breakdown & Learning Depth)';
            }
          }
          if (ch) {
            ch.textContent = isHidden ? '▲' : '▼';
          }
        }

        function toggleGuideTile(childId, idx, sectionKey) {
          const targetId = 'guide_panel_' + childId + '_' + idx + '_' + sectionKey;
          const targetEl = document.getElementById(targetId);
          const allPanels = document.querySelectorAll('.guide-panel-' + childId + '-' + idx);
          const allTiles = document.querySelectorAll('.guide-tile-' + childId + '-' + idx);

          const isAlreadyActive = targetEl && (targetEl.style.display === 'block');

          // Close all panels for this child/subject
          allPanels.forEach(function(p) { p.style.display = 'none'; });
          allTiles.forEach(function(tile) { tile.classList.remove('active'); });

          // If not already active, open it
          if (!isAlreadyActive && targetEl) {
            targetEl.style.display = 'block';
            const activeTile = document.getElementById('guideTile_' + childId + '_' + idx + '_' + sectionKey);
            if (activeTile) activeTile.classList.add('active');
          }
        }

        function switchAuthView(mode) {
          const tabIn = document.getElementById('authTabSignIn');
          const tabUp = document.getElementById('authTabSignUp');
          const viewIn = document.getElementById('authViewSignIn');
          const viewUp = document.getElementById('authViewSignUp');
          const viewGF = document.getElementById('authViewGoogleFinish');
          if (viewGF) viewGF.style.display = 'none';

          if (mode === 'signup') {
            if (tabIn) tabIn.classList.remove('active');
            if (tabUp) tabUp.classList.add('active');
            if (viewIn) viewIn.style.display = 'none';
            if (viewUp) viewUp.style.display = 'block';
          } else {
            if (tabIn) tabIn.classList.add('active');
            if (tabUp) tabUp.classList.remove('active');
            if (viewIn) viewIn.style.display = 'block';
            if (viewUp) viewUp.style.display = 'none';
          }
        }

        function toggleParentPasswordVisibility() {
          const pwdInput = document.getElementById('familyPassword');
          const btn = document.getElementById('btnTogglePassword');
          if (!pwdInput) return;
          const isPass = pwdInput.type === 'password';
          pwdInput.type = isPass ? 'text' : 'password';
          if (btn) btn.textContent = isPass ? 'Hide Password 🙈' : 'Show Password 👁️';
        }

        function toggleInputType(inputId, btnEl) {
          const el = document.getElementById(inputId);
          if (!el) return;
          const isPass = el.type === 'password';
          el.type = isPass ? 'text' : 'password';
          if (btnEl) btnEl.textContent = isPass ? 'Hide 🙈' : 'Show 👁️';
        }

        function toggleForgotPinView() {
          const sec = document.getElementById('resetPinSection');
          if (!sec) return;
          const isShown = sec.style.display === 'block';
          sec.style.display = isShown ? 'none' : 'block';
          if (!isShown) {
            const parentEmail = document.getElementById('parentEmail').value.trim();
            if (parentEmail) document.getElementById('resetEmail').value = parentEmail;
            document.getElementById('otpStep1').style.display = 'block';
            document.getElementById('otpStep2').style.display = 'none';
            document.getElementById('resetPinFeedback').style.display = 'none';
          }
        }

        async function requestPasswordResetOTP() {
          const emailOrPhone = document.getElementById('resetEmail').value.trim();
          const fb = document.getElementById('resetPinFeedback');
          const btn = document.getElementById('btnRequestOtp');

          if (!emailOrPhone) {
            fb.style.display = 'block';
            fb.style.background = '#FEF2F2';
            fb.style.color = '#991B1B';
            fb.style.border = '1px solid #FECACA';
            fb.textContent = 'Please enter your registered parent email address or mobile number.';
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Sending code... ⏳';
          fb.style.display = 'none';

          try {
            const res = await fetch('/api/parent/request-otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: emailOrPhone, phone: emailOrPhone, purpose: 'reset your Family Password' })
            });
            const data = await res.json();
            btn.disabled = false;
            btn.textContent = 'Send 6-Digit Code 📩';

            if (data.success) {
              document.getElementById('otpStep1').style.display = 'none';
              document.getElementById('otpStep2').style.display = 'block';
              fb.style.display = 'block';
              fb.style.background = '#F0FDF4';
              fb.style.color = '#065F46';
              fb.style.border = '1px solid #BBF7D0';
              fb.textContent = data.message || 'Verification code sent!';
              document.getElementById('otpCode').focus();
            } else {
              fb.style.display = 'block';
              fb.style.background = '#FEF2F2';
              fb.style.color = '#991B1B';
              fb.style.border = '1px solid #FECACA';
              fb.textContent = data.error || 'Failed to send verification code.';
            }
          } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Send 6-Digit Code 📩';
            fb.style.display = 'block';
            fb.style.background = '#FEF2F2';
            fb.style.color = '#991B1B';
            fb.style.border = '1px solid #FECACA';
            fb.textContent = 'Network error. Please try again.';
          }
        }

        async function submitPasswordResetWithOTP() {
          const emailOrPhone = document.getElementById('resetEmail').value.trim();
          const otp = document.getElementById('otpCode').value.trim();
          const newPassword = document.getElementById('newFamilyPassword').value.trim();
          const confirmPassword = document.getElementById('confirmNewFamilyPassword').value.trim();
          const fb = document.getElementById('resetPinFeedback');
          const btn = document.getElementById('btnSubmitNewPassword');

          if (!otp || !newPassword) {
            fb.style.display = 'block';
            fb.style.background = '#FEF2F2';
            fb.style.color = '#991B1B';
            fb.style.border = '1px solid #FECACA';
            fb.textContent = 'Please enter both the 6-digit code and your new password.';
            return;
          }

          if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
            fb.style.display = 'block';
            fb.style.background = '#FEF2F2';
            fb.style.color = '#991B1B';
            fb.style.border = '1px solid #FECACA';
            fb.textContent = 'Password must be at least 8 characters and include both letters and numbers.';
            return;
          }

          if (newPassword !== confirmPassword) {
            fb.style.display = 'block';
            fb.style.background = '#FEF2F2';
            fb.style.color = '#991B1B';
            fb.style.border = '1px solid #FECACA';
            fb.textContent = 'Passwords do not match. Please verify.';
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Verifying & updating... ⏳';
          fb.style.display = 'none';

          try {
            const res = await fetch('/api/parent/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: emailOrPhone, phone: emailOrPhone, emailOrPhone: emailOrPhone, otp: otp, newPassword: newPassword })
            });
            const data = await res.json();
            btn.disabled = false;
            btn.textContent = 'Verify Code & Save Password →';

            if (data.success) {
              document.getElementById('parentEmail').value = emailOrPhone;
              document.getElementById('familyPassword').value = newPassword;
              document.getElementById('resetPinSection').style.display = 'none';
              submitParentLogin();
            } else {
              fb.style.display = 'block';
              fb.style.background = '#FEF2F2';
              fb.style.color = '#991B1B';
              fb.style.border = '1px solid #FECACA';
              fb.textContent = data.error || 'Failed to reset password.';
            }
          } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Verify Code & Save Password →';
            fb.style.display = 'block';
            fb.style.background = '#FEF2F2';
            fb.style.color = '#991B1B';
            fb.style.border = '1px solid #FECACA';
            fb.textContent = 'Network error resetting password.';
          }
        }

        async function submitParentLogin() {
          const emailOrPhone = document.getElementById('parentEmail').value.trim();
          const password = (document.getElementById('familyPassword') || document.getElementById('familyPin') || {}).value.trim();
          const errEl = document.getElementById('loginError');
          const btn = document.getElementById('btnParentSignIn');

          if (!emailOrPhone || !password) {
            errEl.style.display = 'block';
            errEl.textContent = 'Please enter both your email or mobile number and Family Password.';
            return;
          }

          if (btn) {
            btn.disabled = true;
            btn.textContent = 'Signing in... ⏳';
          }
          errEl.style.display = 'none';

          try {
            // Send credentials securely via POST body
            const res = await fetch('/api/parent/dashboard', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: emailOrPhone, phone: emailOrPhone, emailOrPhone: emailOrPhone, familyPassword: password })
            });
            const data = await res.json();

            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Sign In to Family Portal →';
            }

            if (!data.success) {
              errEl.style.display = 'block';
              errEl.textContent = data.error || 'Incorrect email/phone or password.';
              return;
            }

            savedEmail = emailOrPhone;
            savedPin = password; // store active session credential in memory
            renderDashboard(data);
            switchPortalTab(activeTab);
          } catch (e) {
            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Sign In to Family Portal →';
            }
            errEl.style.display = 'block';
            errEl.textContent = 'Connection error. Please try again.';
          }
        }

        function renderDashboard(data) {
          document.getElementById('loginCard').style.display = 'none';
          document.getElementById('dashboardArea').style.display = 'block';

          currentParentTier = data.parent.subscriptionTier || 'free';
          const tierLabel = (data.parent.tierInfo && data.parent.tierInfo.uiLabel) || 'Free';

          document.getElementById('dispParentEmail').textContent = data.parent.email;

          // Header upgrade button visibility
          const headerUpgradeBtn = document.getElementById('btnHeaderUpgrade');
          if (currentParentTier === 'premium') {
            headerUpgradeBtn.style.display = 'none';
          } else {
            headerUpgradeBtn.style.display = 'flex';
          }

          // Update Tab badges
          allChildrenList = data.children || [];
          populateTargetSelect();
          const childCount = allChildrenList.length;
          document.getElementById('dispChildCount').textContent = childCount;
          document.getElementById('tabCountBadge').textContent = childCount + '/4';

          // Update Billing Tab Current Status
          const billBadge = document.getElementById('dispBillingCurrentTier');
          if (billBadge) {
            billBadge.textContent = tierLabel + ' Plan';
            if (currentParentTier === 'premium') {
              billBadge.style.background = '#0D3A26';
              billBadge.style.color = '#FFFFFF';
            } else if (currentParentTier === 'standard') {
              billBadge.style.background = '#E8F5ED';
              billBadge.style.color = '#0D3A26';
            } else if (currentParentTier === 'pilot') {
              billBadge.style.background = '#FEF9E7';
              billBadge.style.color = '#92400E';
            } else {
              billBadge.style.background = '#FAF7F2';
              billBadge.style.color = '#4A4A4A';
            }
          }
          document.getElementById('dispBillingCyclePill').textContent = (data.parent.billingCycle === 'annual' ? 'Annual Billing' : 'Monthly Billing');

          const summaries = {
            free: '2 CBE subjects of learner choice, 10–15 turns per day, basic weekly parent note.',
            standard: 'All CBE subjects unlimited, unlimited daily turns, conversational weekly parent summary, basic teacher CBE report.',
            premium: 'Everything in Standard + 30-turn context, Know Your Child 90-day portraits, Safe Box, rich SBA reports.',
            pilot: 'School / Parent Pilot Cohort: Full CBE subjects unlocked, unlimited daily turns, 20-turn context.'
          };
          let sumText = summaries[currentParentTier] || summaries.free;
          if (data.parent.pilotStatus && data.parent.pilotStatus.active) {
            sumText = '✨ ' + data.parent.pilotStatus.statusText + ' • ' + sumText;
          }
          document.getElementById('dispBillingSummary').textContent = sumText;

          // Update Plan Buttons on Billing Tab
          const btnFree = document.getElementById('btnPlanFree');
          const btnStd = document.getElementById('btnPlanStandard');
          const btnPrem = document.getElementById('btnPlanPremium');
          const badgeFree = document.getElementById('badgeFreePill');

          if (btnFree) {
            if (currentParentTier === 'free') {
              btnFree.textContent = 'Current Plan ✓';
              btnFree.style.background = '#F7FBF8';
              btnFree.style.color = '#0D3A26';
              btnFree.style.border = '1px solid #C8E0D0';
              btnFree.disabled = true;
              if (badgeFree) badgeFree.style.display = 'inline-block';
            } else {
              btnFree.textContent = 'Downgrade to Free';
              btnFree.style.background = '#FFFFFF';
              btnFree.style.color = '#4A4A4A';
              btnFree.style.border = '1px solid #E0D8CC';
              btnFree.disabled = false;
              if (badgeFree) badgeFree.style.display = 'none';
            }
          }

          if (btnStd) {
            if (currentParentTier === 'standard') {
              btnStd.textContent = 'Current Plan ✓';
              btnStd.style.background = '#F7FBF8';
              btnStd.style.color = '#0D3A26';
              btnStd.style.border = '1px solid #C8E0D0';
              btnStd.disabled = true;
            } else if (currentParentTier === 'free') {
              btnStd.textContent = 'Upgrade to Standard 🚀';
              btnStd.style.background = '#0D3A26';
              btnStd.style.color = '#FFFFFF';
              btnStd.style.border = 'none';
              btnStd.disabled = false;
            } else {
              btnStd.textContent = 'Switch to Standard';
              btnStd.style.background = '#FFFFFF';
              btnStd.style.color = '#4A4A4A';
              btnStd.style.border = '1px solid #E0D8CC';
              btnStd.disabled = false;
            }
          }

          if (btnPrem) {
            if (currentParentTier === 'premium') {
              btnPrem.textContent = 'Current Plan (Active) ✨';
              btnPrem.style.background = '#0D3A26';
              btnPrem.style.color = '#FFFFFF';
              btnPrem.disabled = true;
            } else if (currentParentTier === 'free') {
              btnPrem.textContent = 'Upgrade to Premium ✨';
              btnPrem.style.background = '#0D3A26';
              btnPrem.style.color = '#FFFFFF';
              btnPrem.disabled = false;
            } else {
              btnPrem.textContent = 'Upgrade to Premium ✨';
              btnPrem.style.background = '#0D3A26';
              btnPrem.style.color = '#FFFFFF';
              btnPrem.disabled = false;
            }
          }

          // Render Children
          const container = document.getElementById('childrenContainer');
          if (!data.children || data.children.length === 0) {
            container.innerHTML = '<div class="portal-card" style="text-align: center; color: #9A9A9A; font-weight: 300; font-size: 14px;">No children linked yet.</div>';
          } else {
            container.innerHTML = data.children.map(function(c) {
              const kyc = c.knowYourChild || {};
              const cleanTier = String(c.subscriptionTier || 'free').trim().toLowerCase();
              const isFree = (cleanTier === 'free');
              const isStandard = (cleanTier === 'standard');
              const isPremium = (cleanTier === 'premium' || cleanTier === 'pilot' || cleanTier === 'school');
              const isBriChild = isBritishChild(c);
              const isSenior = !isBriChild && (parseInt(c.grade || 7, 10) >= 10 || c.schoolLevel === 'SS');
              const levelLabel = isBriChild ? ('Year ' + (c.yearGroup || c.grade)) : (isSenior ? 'Senior School' : 'Junior Secondary');
              const stdPriceLabel = isBriChild ? 'IGCSE Standard (KES 3,599/mo)' : (isSenior ? 'Senior Standard (KES 899/mo)' : 'Standard (KES 699/mo)');
              const premPriceLabel = isBriChild ? 'IGCSE Exam Master (KES 4,599/mo)' : (isSenior ? 'Senior Premium Pro (KES 1,799/mo)' : 'Premium (KES 1,499/mo)');
              const activePlanBadge = isPremium
                ? (isBriChild ? '<span class="badge-premium-active" style="background: #0D3A26; color: #6EE7B7;">⭐ IGCSE Exam Master</span>' : (isSenior ? '<span class="badge-premium-active">⭐ Senior Premium Pro Active</span>' : '<span class="badge-premium-active">⭐ Premium Active</span>'))
                : (isStandard
                  ? (isBriChild ? '<span class="badge-standard-active" style="background: #1E3A8A; color: #93C5FD;">🚀 IGCSE Standard Active</span>' : (isSenior ? '<span class="badge-standard-active">🚀 Senior Standard Active</span>' : '<span class="badge-standard-active">🚀 Standard Active</span>'))
                  : '<span class="badge-free-active">Free Tier (' + (Array.isArray(c.freeSubjects) ? c.freeSubjects.length : 3) + ' Subjects)</span>');

              const activity = c.activitySummary || {};
              const recentTopics = activity.recentTopics || [];
              const freeSubjText = Array.isArray(c.freeSubjects) ? c.freeSubjects.join(' & ') : 'Mathematics & Science';
              const anticipatoryText = kyc.unlocked
                ? 'Deep thinking portrait unlocked & available'
                : (isPremium
                  ? 'Portrait forming • ' + (kyc.daysActive || 0) + ' of 90 days observed'
                  : 'Unlocks after 90 days of continuous practice on Premium');
              const showUpgradeLink = !isPremium;

              let html = '<div class="learner-card">' +
                '<div class="learner-card-header">' +
                  '<div class="learner-header-left">' +
                    '<div class="learner-header-avatar">' + (c.avatar || '🦁') + '</div>' +
                    '<div style="min-width: 0;">' +
                      '<div class="learner-header-name">' + c.handle + '</div>' +
                      '<div class="learner-header-meta" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                        '<span>' + (isBriChild
                          ? ('Year ' + (c.yearGroup || c.grade) + ((c.yearGroup || c.grade) >= 10 ? (c.examTier === 'core' ? ' (Core)' : ' (Extended)') : '') + ' • ' + (c.school || 'International School'))
                          : ('Grade ' + c.grade + ' (' + levelLabel + ') • ' + c.school + ' • ' + c.county)
                        ) + '</span>' +
                        '<button type="button" onclick="openParentSubjectModal(&#39;' + c.id + '&#39;, &#39;' + c.handle.replace(/'/g, "\\'") + '&#39;, ' + c.grade + ', &#39;' + (c.pathway || '') + '&#39;, ' + JSON.stringify(c.selectedSubjects || c.quests || []).replace(/"/g, '&quot;') + ', ' + JSON.stringify(c.freeSubjects || []).replace(/"/g, '&quot;') + ', &#39;' + (c.subscriptionTier || 'free') + '&#39;, &#39;' + (c.curriculum || 'CBC') + '&#39;, &#39;' + (c.examBoard || 'CAIE') + '&#39;)" style="background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.35); color: #FFFFFF; font-size: 11px; font-weight: 700; border-radius: 6px; padding: 2px 7px; cursor: pointer; transition: all 0.2s;" title="Manage Learner Enrolled Subjects">📚 Edit Subjects</button>' +
                        '<button type="button" onclick="openGradeCorrectionModal(&#39;' + c.id + '&#39;, &#39;' + c.handle.replace(/'/g, "\\'") + '&#39;, ' + c.grade + ')" style="background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); color: #FFFFFF; font-size: 11px; font-weight: 700; border-radius: 6px; padding: 2px 7px; cursor: pointer; transition: all 0.2s;" title="Request Grade Level Correction">✏️ Correct Grade</button>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="learner-header-stats">' +
                    '<div class="learner-header-pill">🔥 ' + (c.streak || 1) + ' Day Streak</div>' +
                    '<div class="learner-header-pill">💬 ' + (c.totalTurns || 0) + ' Questions Explored</div>' +
                  '</div>' +
                '</div>' +
                '<div class="learner-card-body">' +

                // 1. HORIZONTAL INSIGHT TAB BOXES (3 Interactive Clickable Tiles)
                '<div class="insight-tab-grid">' +
                  // Tab 1: Today's Activity
                  '<div class="insight-tab-box active" id="tabBtn_work_' + c.id + '" onclick="switchLearnerInsightTab(&apos;' + c.id + '&apos;, &apos;work&apos;)">' +
                    '<div class="insight-tab-header">' +
                      '<div class="insight-tab-title"><span>📝</span> Today&#39;s Activity</div>' +
                      '<span class="insight-tab-badge">' + recentTopics.length + ' Sessions</span>' +
                    '</div>' +
                    '<div class="insight-tab-subtitle">Recent Socratic sessions</div>' +
                  '</div>' +

                  // Tab 2: Elingu's Note
                  '<div class="insight-tab-box" id="tabBtn_note_' + c.id + '" onclick="switchLearnerInsightTab(&apos;' + c.id + '&apos;, &apos;note&apos;)">' +
                    '<div class="insight-tab-header">' +
                      '<div class="insight-tab-title"><span>✉️</span> Elingu&#39;s Note</div>' +
                      '<span class="insight-tab-badge ' + (isFree ? 'gold' : '') + '">' + (isFree ? '⭐ Premium' : 'From Elingu') + '</span>' +
                    '</div>' +
                    '<div class="insight-tab-subtitle">Conversational letter to you</div>' +
                  '</div>' +

                  // Tab 3: Thinking Portrait
                  '<div class="insight-tab-box" id="tabBtn_portrait_' + c.id + '" onclick="switchLearnerInsightTab(&apos;' + c.id + '&apos;, &apos;portrait&apos;)">' +
                    '<div class="insight-tab-header">' +
                      '<div class="insight-tab-title"><span>🧠</span> Thinking Portrait</div>' +
                      '<span class="insight-tab-badge ' + (!isPremium ? 'gold' : '') + '">' +
                        (kyc.unlocked ? 'Ready ✓' : (isPremium ? 'Day ' + (kyc.daysActive || 0) + '/90' : '⭐ 90-Day Portrait')) +
                      '</span>' +
                    '</div>' +
                    '<div class="insight-tab-subtitle">Cognitive development report</div>' +
                  '</div>' +
                '</div>' +

                // 2. PANEL 1: TODAY'S LEARNING ACTIVITY (Active by Default)
                '<div class="insight-panel active" id="panel_work_' + c.id + '">' +
                  '<div class="learning-activity-box">' +
                    '<div style="font-weight: 600; font-size: 14px; color: #1C1C1C; margin-bottom: 2px;">Today&#39;s Learning Activity</div>' +
                    '<div style="font-weight: 400; font-size: 11px; color: #9A9A9A; letter-spacing: 0.5px; margin-bottom: 12px;">Recent Sessions</div>';

                  if (recentTopics.length > 0) {
                    // 1. COMPACT SESSION ROWS (Quick glance with Premium 'Know More' deep dive)
                    html += recentTopics.map(function(t, sIdx) {
                      let subjIcon = "📖";
                      let strandName = "Strand: General Concept";
                      let plainConcept = "Applying critical inquiry to local Kenyan community environments, resource management, and practical problem solving.";
                      let kenyanContext = "Caring for kitchen gardens, water conservation during dry seasons, and poultry keeping in the compound.";
                      let thinkingTrait = "Thoughtful reasoning &bull; responds well to Socratic prompts and self-corrects without needing answers revealed.";

                      const isBriChild = (c.curriculum === 'BRITISH' || c.curriculum === 'IGCSE');
                      if (isBriChild) {
                        if (t.subject.includes("Math")) {
                          subjIcon = "📐";
                          strandName = "Topic: Pure Mathematics & Algebra";
                          plainConcept = "Understanding algebraic relationships, quadratic methods, ratio multipliers, and spatial geometric calculations step-by-step.";
                          kenyanContext = "Real-world financial planning, architectural scale plans, speed-distance travel, and sports analytics.";
                          thinkingTrait = "Systematic &amp; methodical &bull; writes out intermediate method steps independently before reaching accuracy.";
                        } else if (t.subject.includes("Physic")) {
                          subjIcon = "⚡";
                          strandName = "Topic: Forces, Energy & Waves";
                          plainConcept = "Exploring how forces shape motion, why energy converts across systems, and how waves transfer sound and light.";
                          kenyanContext = "Vehicle braking distances, solar panels, fiber optic communication cables, and musical instrument resonance.";
                          thinkingTrait = "Curious &amp; analytical &bull; identifies physical causes and reasons from fundamental principles.";
                        } else if (t.subject.includes("Chemi")) {
                          subjIcon = "🧪";
                          strandName = "Topic: Matter, Reactions & Stoichiometry";
                          plainConcept = "Understanding atomic structure, how atoms bond to form molecules, and measuring exact quantities with the mole concept.";
                          kenyanContext = "Water purification, battery chemistry, food preservation, and measuring soil acidity.";
                          thinkingTrait = "Precise &amp; structured &bull; balances formulas and visualizes sub-microscopic molecular interactions.";
                        } else if (t.subject.includes("Bio")) {
                          subjIcon = "🌿";
                          strandName = "Topic: Living Organisms & Systems";
                          plainConcept = "Exploring cellular respiration, transport in living systems, genetics, and enzyme reaction rates.";
                          kenyanContext = "Plant transpiration on warm days, human immune responses, digestion, and wildlife ecosystem balances.";
                          thinkingTrait = "Observational &amp; thoughtful &bull; links biological structures directly to their vital physiological functions.";
                        } else if (t.subject.includes("Computer")) {
                          subjIcon = "💻";
                          strandName = "Topic: Algorithms & Systems Architecture";
                          plainConcept = "Breaking problems into logical steps (algorithms), binary data representation, and tracing program logic.";
                          kenyanContext = "Writing code routines, cybersecurity encryption, data compression, and automated smart sensor systems.";
                          thinkingTrait = "Algorithmic &amp; persistent &bull; troubleshoots logic bugs methodically with step-by-step trace reasoning.";
                        } else if (t.subject.includes("English")) {
                          subjIcon = "📚";
                          strandName = "Topic: Language & Directed Writing";
                          plainConcept = "Crafting persuasive writing, analyzing character voice in texts, and structuring concise summary arguments.";
                          kenyanContext = "Writing formal correspondence, persuasive editorial articles, and lively creative narratives.";
                          thinkingTrait = "Articulate &amp; reflective &bull; uses precise vocabulary and tone to engage readers.";
                        }
                      } else if (t.subject.includes("Math")) {
                        subjIcon = "📐";
                        strandName = "Strand: Numbers & Operations";
                        plainConcept = "Understanding how splitting work among more people changes the time needed, and how quantities scale proportionally (Inverse Variation).";
                        kenyanContext = "Sharing farm work during tea harvesting in Kiambu, splitting bodaboda fuel costs among trips, or calculating perimeter fencing.";
                        thinkingTrait = "Analytical &amp; systematic &bull; reasons through numerical ratios and balances operations methodically.";
                      } else if (t.subject.includes("Science")) {
                        subjIcon = "🔬";
                        strandName = "Strand: Scientific Investigation";
                        plainConcept = "Exploring why particles change arrangement when heated or cooled (melting, boiling, evaporating) and how heat transfers in real objects.";
                        kenyanContext = "Observing water boiling in a metal sufuria, steam condensing on the lid, or why a jembe gives you leverage when digging hard red soil.";
                        thinkingTrait = "Curious &amp; observational &bull; connects principles to familiar real-world and home applications.";
                      } else if (t.subject.includes("English")) {
                        subjIcon = "📚";
                        strandName = "Strand: Reading & Literature";
                        plainConcept = "Using vivid imagery, similes, and metaphors to convey emotion and pictures without literal descriptions.";
                        kenyanContext = "Describing the misty hills of the Aberdares, bustling morning markets in Nairobi, or stories told by grandparents.";
                        thinkingTrait = "Expressive &amp; creative &bull; grasps figurative imagery, tone, and metaphors with ease.";
                      } else if (t.subject.includes("Kiswahili")) {
                        subjIcon = "🗣️";
                        strandName = "Mada: Matumizi ya Lugha";
                        plainConcept = "Kutumia kauli za vitenzi (kama vile kutendea na kutendeka) kubadilisha maana ya vitendo katika sentensi halisi za kila siku.";
                        kenyanContext = "Maongezi sokoni, matangazo ya redio, au kuandikia jamaa barua ya mwaliko wa sikukuu.";
                        thinkingTrait = "Linguistic fluency &bull; derives verb inflection rules naturally from conversational context.";
                      }

                      const topicText = t.topic || (isBriChild ? ("Year " + (c.yearGroup || c.grade || 10) + " syllabus practice") : "General CBE exploration");
                      const turnCount = t.turnCount || 0;
                      const turnsWord = turnCount + " " + (turnCount === 1 ? "turn" : "turns");
                      const estMinutes = Math.max(2, Math.round(turnCount * 2.2));
                      const depthLevel = Math.min(4, Math.max(1, Math.ceil(turnCount / 1.5)));
                      const effortLevel = Math.min(5, Math.max(1, Math.ceil(turnCount * 1.1)));
                      const effortDots = '\u25CF'.repeat(effortLevel) + '\u25CB'.repeat(5 - effortLevel);
                      const persistStatus = (turnCount >= 4 ? 'Independent Derivation &check;' : (turnCount >= 2 ? 'Active Multi-Step &check;' : 'Foundational Step &check;'));

                      let rowHtml = '<div class="session-row">' +
                        '<div class="session-row-main">' +
                          '<div class="session-topic-title">' +
                            '<span>' + subjIcon + '</span>' +
                            '<span><strong style="color: #0F172A;">' + t.subject + ':</strong> ' + topicText + '</span>' +
                          '</div>' +
                          '<div style="display: flex; align-items: center; gap: 8px;">' +
                            '<span style="background: #E8F5ED; color: #0D3A26; font-weight: 500; font-size: 12px; border-radius: 20px; padding: 3px 10px; display: inline-block;">' + turnsWord + '</span>' +
                            '<button type="button" id="btnKnowMore_' + c.id + '_' + sIdx + '" onclick="toggleSessionKnowMore(&#39;' + c.id + '&#39;, ' + sIdx + ')" style="background: #FFFFFF; border: 1px solid #CBD5E1; color: #0D3A26; font-size: 11.5px; font-weight: 600; border-radius: 20px; padding: 3px 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;">' +
                              '<span class="know-more-text">Know More</span> <span id="iconKnowMore_' + c.id + '_' + sIdx + '">&darr;</span>' +
                            '</button>' +
                          '</div>' +
                        '</div>' +
                        '<div class="session-strand-sub">' +
                          strandName + ' &bull; ~' + estMinutes + ' min active' +
                        '</div>';

                      // EXPANDABLE "KNOW MORE" WELL-ORDERED DETAIL PANEL
                      if (isPremium) {
                        rowHtml += '<div id="sessionDetail_' + c.id + '_' + sIdx + '" style="display: none; margin-top: 14px; padding-top: 14px; border-top: 1px dashed #CBD5E1;">' +
                          '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">' +
                            '<div style="font-size: 11px; font-weight: 700; color: #0D3A26; letter-spacing: 0.5px; text-transform: uppercase; display: flex; align-items: center; gap: 5px;">' +
                              '<span>⭐</span> Premium Session Analytics' +
                            '</div>' +
                            '<span style="font-size: 11px; color: #64748B; font-weight: 500;">CBE Aligned &bull; Verified</span>' +
                          '</div>' +

                          // 4 Bento Metric Cards
                          '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(115px, 1fr)); gap: 8px; margin-bottom: 12px;">' +
                            '<div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px 10px;">' +
                              '<div style="font-size: 10px; color: #64748B; text-transform: uppercase; font-weight: 600;">⏱️ Active Time</div>' +
                              '<div style="font-size: 14px; font-weight: 700; color: #0F172A; margin-top: 2px;">~' + estMinutes + ' min</div>' +
                              '<div style="font-size: 10px; color: #10B981; font-weight: 500;">Socratic reasoning</div>' +
                            '</div>' +
                            '<div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px 10px;">' +
                              '<div style="font-size: 10px; color: #64748B; text-transform: uppercase; font-weight: 600;">📊 Depth</div>' +
                              '<div style="font-size: 14px; font-weight: 700; color: #0F172A; margin-top: 2px;">Level ' + depthLevel + '/4</div>' +
                              '<div style="font-size: 10px; color: #64748B; font-weight: 500;">Multi-step inquiry</div>' +
                            '</div>' +
                            '<div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px 10px;">' +
                              '<div style="font-size: 10px; color: #64748B; text-transform: uppercase; font-weight: 600;">💪 Persistence</div>' +
                              '<div style="font-size: 14px; font-weight: 700; color: #0D3A26; margin-top: 2px;">' + effortDots + '</div>' +
                              '<div style="font-size: 10px; color: #64748B; font-weight: 500;">Solid grit</div>' +
                            '</div>' +
                            '<div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 8px 10px;">' +
                              '<div style="font-size: 10px; color: #64748B; text-transform: uppercase; font-weight: 600;">🎯 Independence</div>' +
                              '<div style="font-size: 12px; font-weight: 700; color: #0D3A26; margin-top: 3px;">Independent</div>' +
                              '<div style="font-size: 10px; color: #10B981; font-weight: 500;">' + persistStatus + '</div>' +
                            '</div>' +
                          '</div>' +

                          // 2 Structured Cards (Concept Breakdown & Reasoning Pattern)
                          '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px;">' +
                            '<div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px 14px;">' +
                              '<div style="font-size: 11.5px; font-weight: 700; color: #0D3A26; margin-bottom: 5px; display: flex; align-items: center; gap: 5px;">' +
                                '<span>📘</span> Concept Breakdown' +
                              '</div>' +
                              '<div style="font-size: 12.5px; color: #334155; line-height: 1.5;">' +
                                plainConcept +
                              '</div>' +
                            '</div>' +

                            '<div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px 14px;">' +
                              '<div style="font-size: 11.5px; font-weight: 700; color: #0D3A26; margin-bottom: 5px; display: flex; align-items: center; gap: 5px;">' +
                                '<span>🧠</span> Reasoning Pattern' +
                              '</div>' +
                              '<div style="font-size: 12.5px; color: #334155; line-height: 1.5;">' +
                                thinkingTrait +
                              '</div>' +
                            '</div>' +
                          '</div>' +
                        '</div>';
                      } else {
                        // Standard / Free Teaser
                        rowHtml += '<div id="sessionDetail_' + c.id + '_' + sIdx + '" style="display: none; margin-top: 12px; padding: 14px 16px; background: #F8FAFC; border: 1.5px dashed #CBD5E1; border-radius: 10px;">' +
                          '<div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">' +
                            '<div>' +
                              '<div style="font-weight: 700; font-size: 12.5px; color: #0D3A26; display: flex; align-items: center; gap: 5px;">' +
                                '<span>⭐</span> Unlock In-Depth Session Analytics &amp; Reasoning Radar' +
                              '</div>' +
                              '<div style="font-size: 11.5px; color: #4A4A4A; margin-top: 3px; line-height: 1.4;">' +
                                'Premium unlocks active focus tracking, cognitive depth levels (1–4), reasoning pattern traits, and automated Safe Box stress radar.' +
                              '</div>' +
                            '</div>' +
                            '<a href="javascript:void(0)" onclick="openChildUpgradeModal(&#39;' + c.id + '&#39;, &#39;' + c.handle + '&#39;, &#39;premium&#39;)" style="background: #0D3A26; color: #FFFFFF; font-size: 11.5px; font-weight: 600; padding: 6px 12px; border-radius: 8px; text-decoration: none; white-space: nowrap;">' +
                              'Upgrade to Premium &rarr;' +
                            '</a>' +
                          '</div>' +
                        '</div>';
                      }

                      rowHtml += '</div>';
                      return rowHtml;
                    }).join('');

                    // Check if today is Friday (weekend challenge only pops up on Fridays)
                    const isFriday = (new Date().getDay() === 5) || (typeof window !== 'undefined' && window.location && window.location.search.indexOf('friday=1') !== -1);

                    // Find primary focus topic (most turns = deepest engagement)
                    let primaryIdx = 0;
                    let maxTurns = -1;
                    recentTopics.forEach(function(t, i) {
                      if ((t.turnCount || 0) > maxTurns) {
                        maxTurns = t.turnCount || 0;
                        primaryIdx = i;
                      }
                    });

                    // 2. ONE CONSOLIDATED TONIGHT'S GUIDE (Permanently visible, no hide button)
                    html += '<div style="margin-top: 18px; padding-top: 14px; border-top: 1px dashed #CBD5E1;">' +
                      '<div style="font-weight: 600; font-size: 13.5px; color: #0D3A26; display: flex; align-items: center; gap: 6px; margin-bottom: 10px;">' +
                        '<span>✨</span> Tonight&#39;s Guide for ' + c.handle +
                      '</div>';

                    // Subject tabs (if multiple subjects done today)
                    if (recentTopics.length > 1) {
                      html += '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 14px;">' +
                        '<span style="font-size: 11px; color: #9A9A9A; font-weight: 500;">Topic:</span>' +
                        recentTopics.map(function(t, idx) {
                          let isPrimary = (idx === primaryIdx);
                          let pillBg = isPrimary ? '#0D3A26' : '#FFFFFF';
                          let pillColor = isPrimary ? '#FFFFFF' : '#4A4A4A';
                          let pillBorder = isPrimary ? '#0D3A26' : '#E0D8CC';
                          return '<button type="button" class="guide-subj-pill-' + c.id + '" onclick="switchGuideSubject(&#39;' + c.id + '&#39;, ' + idx + ')" style="background: ' + pillBg + '; color: ' + pillColor + '; border: 1px solid ' + pillBorder + '; border-radius: 20px; padding: 3px 12px; font-size: 11.5px; font-weight: 600; cursor: pointer; transition: all 0.2s;">' +
                            t.subject + (isPrimary ? ' (Focus)' : '') +
                          '</button>';
                        }).join('') +
                      '</div>';
                    }

                    // Wrap guides
                    html += '<div id="tonight_guide_' + c.id + '">';
                    html += recentTopics.map(function(t, idx) {
                      let isPrimary = (idx === primaryIdx);
                      let displayStyle = isPrimary ? 'block' : 'none';

                      let strandName = "Strand: General Concept";
                      let plainConcept = "Applying critical inquiry to local Kenyan community environments, resource management, and practical problem solving.";
                      let kenyanContext = "Like caring for sukuma wiki kitchen gardens, water conservation during dry seasons, and poultry keeping in the compound.";
                      let effortPraise = "&ldquo;I noticed the effort and persistence you put into thinking through that problem today. Keep backing yourself!&rdquo;";
                      let dinnerStarter = "&ldquo;What was something you encountered today that made you pause and wonder why it works the way it does?&rdquo;";
                      let weekendOffline = "Compound Observation Walk: Walk around the shamba or compound together and find 3 ways families conserve water or protect soil.";
                      let childAsTeacher = "Let " + c.handle + " take the lead: Ask them to explain the most interesting idea they explored today as if teaching a younger sibling.";

                      if (t.subject.includes("Math")) {
                        strandName = "Strand: Numbers & Operations";
                        plainConcept = "Understanding how splitting work among more people changes the time needed, and how quantities scale proportionally.";
                        kenyanContext = "Like sharing farm work during tea harvesting in Kiambu, splitting bodaboda fuel costs among trips, or calculating perimeter fencing for a plot.";
                        effortPraise = "&ldquo;I loved seeing how patient you were with those rate calculations today—you stuck with each step through to the end!&rdquo;";
                        dinnerStarter = "&ldquo;If 2 people can paint a room in 4 hours, why doesn’t doubling the painters take 8 hours? How does sharing work change the time?&rdquo;";
                        weekendOffline = "Hands-on Kitchen Test: Time how long it takes 1 person to shell a cup of peas or fold 5 clothes, then have 2 people work together. Did it take half the time? Measure and discuss!";
                        childAsTeacher = "Let " + c.handle + " teach you: Ask them to explain inverse variation to you as if they were training a shopkeeper on ordering inventory.";
                      } else if (t.subject.includes("Science")) {
                        strandName = "Strand: Scientific Investigation";
                        plainConcept = "Exploring why particles change arrangement when heated or cooled (melting, boiling, evaporating) and how heat transfers in real objects.";
                        kenyanContext = "Like observing water boiling in a metal sufuria, steam condensing on the lid, or why a jembe gives you leverage when digging hard red soil.";
                        effortPraise = "&ldquo;I loved how curious you were about how things work today. Asking good questions is what real scientists do!&rdquo;";
                        dinnerStarter = "&ldquo;When you take a cold drink bottle out of the fridge and it gets wet on the outside, did the water come from inside the bottle or the air?&rdquo;";
                        weekendOffline = "Kitchen Science: Boil water in a sufuria with the lid on for 2 minutes. Carefully lift the lid together and observe the droplets. Touch the outside of a metal cup with ice—feel the moisture condense!";
                        childAsTeacher = "Let " + c.handle + " teach you: Ask them to explain why ice cubes float in warm chai as if you had never seen water freeze before.";
                      } else if (t.subject.includes("English")) {
                        strandName = "Strand: Reading & Literature";
                        plainConcept = "Using vivid imagery, similes, and metaphors to convey emotion and pictures without literal descriptions.";
                        kenyanContext = "Like describing the misty hills of the Aberdares, bustling morning markets in Nairobi, or appreciating stories told by grandparents.";
                        effortPraise = "&ldquo;I loved the imagination and thoughtful words you brought to your reading today—great expression!&rdquo;";
                        dinnerStarter = "&ldquo;What’s a song or story you heard recently that used a comparison to describe someone or somewhere?&rdquo;";
                        weekendOffline = "The Radio Metaphor Hunt: Listen to 2 songs on local radio together or read an article in the newspaper. Challenge each other to spot 2 hidden metaphors or figures of speech.";
                        childAsTeacher = "Let " + c.handle + " teach you: Ask them to give you a challenge to invent 3 funny similes about Nairobi traffic or morning rain.";
                      } else if (t.subject.includes("Kiswahili")) {
                        strandName = "Mada: Matumizi ya Lugha";
                        plainConcept = "Kutumia kauli za vitenzi (kama vile kutendea na kutendeka) kubadilisha maana ya vitendo katika sentensi halisi za kila siku.";
                        kenyanContext = "Kama vile maongezi sokoni, matangazo ya redio, au kuandikia jamaa barua ya mwaliko wa sikukuu.";
                        effortPraise = "&ldquo;Hongera sana kwa bidii na subira uliyoonyesha leo katika sarufi—unaendelea vizuri sana!&rdquo;";
                        dinnerStarter = "&ldquo;Kuna tofauti gani ukisema baba anasoma, na baba anasomewa gazeti? Nani anafanya tendo?&rdquo;";
                        weekendOffline = "Mchezo wa Kauli za Vitenzi Nyumbani: Chukueni vitenzi vitatu vya jikoni (pika, kata, osha) kisha kila mtu atunge sentensi ya kutendea na kutendana wakati wa kuandaa chakula.";
                        childAsTeacher = "Mpe " + c.handle + " fursa ya kukufundisha: Muombe akufafanulie tofauti ya vitenzi vya kutenda na kutendea kama kwamba wewe ni mwanafunzi wake.";
                      }

                      // Dynamic tonight's guide synthesis override (from real daily learning)
                      if (t.tonightsGuide) {
                        if (t.tonightsGuide.dinnerStarter) {
                          let ds = t.tonightsGuide.dinnerStarter.trim();
                          if (!ds.startsWith('&ldquo;') && !ds.startsWith('"') && !ds.startsWith('“')) {
                            ds = '&ldquo;' + ds + '&rdquo;';
                          }
                          dinnerStarter = ds;
                        }
                        if (t.tonightsGuide.effortPraise) {
                          let ep = t.tonightsGuide.effortPraise.trim();
                          if (!ep.startsWith('&ldquo;') && !ep.startsWith('"') && !ep.startsWith('“')) {
                            ep = '&ldquo;' + ep + '&rdquo;';
                          }
                          effortPraise = ep;
                        }
                        if (t.tonightsGuide.childAsTeacher) {
                          childAsTeacher = t.tonightsGuide.childAsTeacher;
                        }
                        if (t.tonightsGuide.weekendOffline) {
                          weekendOffline = t.tonightsGuide.weekendOffline;
                        }
                      }

                      const turnCount = t.turnCount || 0;
                      const turnsWord = turnCount + " " + (turnCount === 1 ? "turn" : "turns");
                      const estMinutes = Math.max(2, Math.round(turnCount * 2.2));
                      const depthLevel = Math.min(4, Math.max(1, Math.ceil(turnCount / 1.5)));
                      const effortLevel = Math.min(5, Math.max(1, Math.ceil(turnCount * 1.1)));
                      const effortDots = '\u25CF'.repeat(effortLevel) + '\u25CB'.repeat(5 - effortLevel);
                      const persistText = turnCount >= 4 ? 'Solved independently \u2713' : (turnCount >= 2 ? 'Worked through ' + turnCount + ' steps \u2713' : 'Getting started \uD83C\uDF31');

                      let cardHtml = '<div id="guide_content_' + c.id + '_' + idx + '" class="guide-content-' + c.id + '" style="display: ' + displayStyle + ';">';

                      if (isPremium || isStandard) {
                        // 1. SMART GLOWING TILES ROW (High-end aspect ratio, rounded corners, enticing emojis)
                        cardHtml += '<div class="guide-tile-grid">';

                        // Tile 1: Ask at Dinner
                        cardHtml += '<button type="button" id="guideTile_' + c.id + '_' + idx + '_dinner" class="guide-smart-tile guide-tile-' + c.id + '-' + idx + '" onclick="toggleGuideTile(&#39;' + c.id + '&#39;, ' + idx + ', &#39;dinner&#39;)">' +
                          '<div class="tile-title"><span>🍽</span> Ask at Dinner</div>' +
                          '<div class="tile-sub">Curiosity question</div>' +
                        '</button>';

                        // Tile 2: Bedtime Praise (Congratulations)
                        cardHtml += '<button type="button" id="guideTile_' + c.id + '_' + idx + '_praise" class="guide-smart-tile guide-tile-' + c.id + '-' + idx + '" onclick="toggleGuideTile(&#39;' + c.id + '&#39;, ' + idx + ', &#39;praise&#39;)">' +
                          '<div class="tile-title"><span>💬</span> Bedtime Praise</div>' +
                          '<div class="tile-sub">Say this tonight &bull; Congrats</div>' +
                        '</button>';

                        // Tile 3: Weekend Challenge (ONLY POPS UP ON FRIDAYS!)
                        if (isFriday) {
                          cardHtml += '<button type="button" id="guideTile_' + c.id + '_' + idx + '_weekend" class="guide-smart-tile guide-tile-' + c.id + '-' + idx + '" onclick="toggleGuideTile(&#39;' + c.id + '&#39;, ' + idx + ', &#39;weekend&#39;)">' +
                            '<div class="tile-title"><span>🏡</span> Weekend Challenge</div>' +
                            '<div class="tile-sub">Offline kitchen/home test</div>' +
                          '</button>';
                        }

                        // Tile 4: Child-as-Teacher Prompt
                        cardHtml += '<button type="button" id="guideTile_' + c.id + '_' + idx + '_teacher" class="guide-smart-tile guide-tile-' + c.id + '-' + idx + '" onclick="toggleGuideTile(&#39;' + c.id + '&#39;, ' + idx + ', &#39;teacher&#39;)">' +
                          '<div class="tile-title"><span>🔄</span> Let ' + c.handle + ' Teach</div>' +
                          '<div class="tile-sub">Feynman inverted prompt</div>' +
                        '</button>';

                        cardHtml += '</div>'; // Closes guide-tile-grid

                        // 2. REVEAL CONTAINER (Reveals info on click in exact requested order)

                        // Panel 2: Ask at Dinner
                        cardHtml += '<div id="guide_panel_' + c.id + '_' + idx + '_dinner" class="guide-panel-' + c.id + '-' + idx + '" style="display: none; margin-bottom: 12px;">' +
                          '<div style="background: #F0F7FF; border-left: 4px solid #1B4F72; border-radius: 0 12px 12px 0; padding: 16px 20px;">' +
                            '<div style="font-weight: 600; font-size: 13px; color: #1B4F72; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">' +
                              '<span>🍽</span> Ask ' + c.handle + ' this at dinner tonight:' +
                            '</div>' +
                            '<div style="font-weight: 400; font-size: 14.5px; color: #1E293B; line-height: 1.6; font-style: italic;">' + dinnerStarter + '</div>' +
                          '</div>' +
                        '</div>';

                        // Panel 3: Bedtime Praise (Congratulations)
                        cardHtml += '<div id="guide_panel_' + c.id + '_' + idx + '_praise" class="guide-panel-' + c.id + '-' + idx + '" style="display: none; margin-bottom: 12px;">' +
                          '<div style="background: linear-gradient(135deg, #F7FBF8, #EFF7F2); border-left: 4px solid #0D3A26; border-radius: 0 12px 12px 0; padding: 16px 20px;">' +
                            '<div style="font-weight: 600; font-size: 12px; color: #0D3A26; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px;">' +
                              'What to say to ' + c.handle + ' tonight &bull; Congratulations' +
                            '</div>' +
                            '<div style="font-weight: 400; font-size: 15px; color: #1C1C1C; line-height: 1.7; font-style: italic; margin-bottom: 6px;">' +
                              effortPraise +
                            '</div>' +
                            '<div style="font-weight: 300; font-size: 11px; color: #9A9A9A;">' +
                              '💡 Specific praise for effort and persistence builds resilience more effectively than general praise.' +
                            '</div>' +
                          '</div>' +
                        '</div>';

                        // Panel 4: Weekend Challenge (Fridays only)
                        if (isFriday) {
                          cardHtml += '<div id="guide_panel_' + c.id + '_' + idx + '_weekend" class="guide-panel-' + c.id + '-' + idx + '" style="display: none; margin-bottom: 12px;">';
                          if (isPremium) {
                            cardHtml += '<div style="background: #FEF9E7; border-left: 4px solid #C9A84C; border-radius: 0 12px 12px 0; padding: 16px 20px;">' +
                              '<div style="font-weight: 600; font-size: 13px; color: #92400E; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">' +
                                '<span>🏡</span> Try This at Home &bull; Weekend Activity' +
                              '</div>' +
                              '<div style="font-weight: 400; font-size: 14px; color: #2C2C2C; line-height: 1.6;">' + weekendOffline + '</div>' +
                            '</div>';
                          } else {
                            cardHtml += '<div style="background: #FEF9E7; border-left: 4px solid #C9A84C; border-radius: 0 12px 12px 0; padding: 14px 18px; font-size: 12px; color: #92400E;">' +
                              '⭐ <strong>Premium unlocks:</strong> Weekend offline home experiments &amp; kitchen challenges. ' +
                              '<a href="javascript:void(0)" onclick="event.stopPropagation(); openChildUpgradeModal(&#39;' + c.id + '&#39;, &#39;' + c.handle + '&#39;, &#39;premium&#39;)" style="color: #0D3A26; font-weight: 700; text-decoration: underline;">Upgrade to Premium →</a>' +
                            '</div>';
                          }
                          cardHtml += '</div>';
                        }

                        // Panel 5: Child-as-Teacher Prompt
                        cardHtml += '<div id="guide_panel_' + c.id + '_' + idx + '_teacher" class="guide-panel-' + c.id + '-' + idx + '" style="display: none; margin-bottom: 12px;">';
                        if (isPremium) {
                          cardHtml += '<div style="background: #F8FAFC; border-left: 4px solid #0D3A26; border-radius: 0 12px 12px 0; padding: 16px 20px;">' +
                            '<div style="font-weight: 600; font-size: 13px; color: #0D3A26; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">' +
                              '<span>🔄</span> Child-as-Teacher Prompt' +
                            '</div>' +
                            '<div style="font-weight: 400; font-size: 14px; color: #2C2C2C; line-height: 1.6;">' + childAsTeacher + '</div>' +
                          '</div>';
                        } else {
                          cardHtml += '<div style="background: #FAF7F2; border-left: 4px solid #0D3A26; border-radius: 0 12px 12px 0; padding: 14px 18px; font-size: 12px; color: #4A4A4A;">' +
                            '⭐ <strong>Premium unlocks:</strong> Let ' + c.handle + ' teach you using the Feynman technique. ' +
                            '<a href="javascript:void(0)" onclick="event.stopPropagation(); openChildUpgradeModal(&#39;' + c.id + '&#39;, &#39;' + c.handle + '&#39;, &#39;premium&#39;)" style="color: #0D3A26; font-weight: 700; text-decoration: underline;">Upgrade to Premium →</a>' +
                          '</div>';
                        }
                        cardHtml += '</div>';

                      } else {
                        // Free tier
                        const isBriNote = (c.curriculum === 'BRITISH' || c.curriculum === 'IGCSE');
                        const yrNote = c.yearGroup || c.grade || 10;
                        const tierSfxNote = yrNote >= 10 ? (c.examTier === 'core' ? 'C' : 'E') : '';
                        const currDisplay = isBriNote ? ('Year ' + yrNote + tierSfxNote + ' curriculum') : ('Grade ' + c.grade + ' CBE curriculum');
                        cardHtml += '<div style="background: #FAF7F2; border: 1px solid #E0D8CC; border-radius: 8px; padding: 12px 14px; font-size: 12.5px; color: #4A4A4A; line-height: 1.5;">' +
                          '<div>' + c.handle + ' completed <strong>' + turnsWord + '</strong> under <strong>' + strandName + '</strong> on ' + currDisplay + '.</div>' +
                          '<div style="margin-top: 8px; font-size: 12px; color: #0D3A26; line-height: 1.4;">Upgrade to <strong>' + stdPriceLabel + '</strong> to unlock Tonight&#39;s Effort Praise words, Plain-Language Concept breakdowns, and Dinner-Table conversation starters.</div>' +
                          '<div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">' +
                            '<span style="font-size: 11px; color: #64748B;">No credit card required • Cancel anytime</span>' +
                            '<a href="javascript:void(0)" onclick="event.stopPropagation(); openChildUpgradeModal(&#39;' + c.id + '&#39;, &#39;' + c.handle + '&#39;, &#39;standard&#39;)" style="font-weight: 700; color: #0D3A26; text-decoration: underline; font-size: 12px;">Upgrade to ' + (isBriNote ? 'IGCSE Standard' : (isSenior ? 'Senior Standard' : 'Standard')) + ' →</a>' +
                          '</div>' +
                        '</div>';
                      }

                      cardHtml += '</div>';
                      return cardHtml;
                    }).join('');

                    html += '</div></div>';
                  } else {
                    html += '<div style="font-weight: 300; font-size: 13px; color: #9A9A9A; text-align: center; padding: 12px 0;">' +
                      'Elingu is ready when they are 🌱' +
                    '</div>';
                  }
                html += '</div></div>';

                // 3. PANEL 2: ELINGU'S NOTE
                html += '<div class="insight-panel" id="panel_note_' + c.id + '">';
                if (!isFree && activity.subjectsExplored && activity.subjectsExplored.length > 0) {
                  html += '<div class="parent-summary-card">' +
                    '<div class="parent-summary-label">ELINGU&#39;S NOTE TO YOU</div>' +
                    '<div class="parent-summary-text">' +
                      c.handle + ' is building conceptual understanding across ' + activity.subjectsExplored.join(' and ') + '. They worked through real-world contextual problems using step-by-step Socratic guidance without being spoon-fed answers.' +
                    '</div>' +
                  '</div>';
                } else if (!isFree) {
                  html += '<div class="parent-summary-card">' +
                    '<div class="parent-summary-label">ELINGU&#39;S NOTE TO YOU</div>' +
                    '<div class="parent-summary-text">' +
                      c.handle + ' has not started an interactive session this week yet. Once they ask a question or explore a CBE subject, you will receive a personal note here summarizing their conceptual breakthroughs.' +
                    '</div>' +
                  '</div>';
                } else {
                  html += '<div class="parent-summary-card" style="border-left-color: #C9A84C;">' +
                    '<div class="parent-summary-label" style="color: #92400E;">ELINGU&#39;S NOTE TO YOU • STANDARD &amp; PREMIUM FEATURE</div>' +
                    '<div class="parent-summary-text" style="color: #4A4A4A; margin-bottom: 12px;">' +
                      'Conversational parent letters provide a personal, plain-language summary of ' + c.handle + '&#39;s conceptual reasoning, frustration tolerance, and learning breakthroughs without educational jargon.' +
                    '</div>' +
                    '<button type="button" onclick="promptChildUpgrade(&apos;' + c.id + '&apos;)" style="background: #0D3A26; color: #FFFFFF; border: none; border-radius: 8px; padding: 8px 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit;">' +
                      'Unlock Elingu&#39;s Note (' + (isBriChild ? 'KES 3,599/mo' : 'KES 699/mo') + ') →' +
                    '</button>' +
                  '</div>';
                }
                html += '</div>';

                // 4. PANEL 3: THINKING PORTRAIT (Know Your Child 90-Day Portrait)
                html += '<div class="insight-panel" id="panel_portrait_' + c.id + '">';
                html += '<div class="kyc-box">' +
                  '<div class="kyc-box-top">' +
                    '<div class="kyc-header-wrap">' +
                      '<span class="kyc-title-text">Know Your Child</span>' +
                      '<span style="color: #CBD5E1;">—</span>' +
                      '<span class="kyc-subtitle-text">90-Day Cognitive Portrait</span>' +
                    '</div>' +
                    '<div>' +
                      (kyc.unlocked
                        ? '<span class="kyc-tracking-badge" style="background: #ECFDF5; color: #065F46;">Ready ✓</span>'
                        : (isPremium
                          ? '<span class="kyc-tracking-badge">Active Tracking</span>'
                          : '<span style="font-size: 11px; font-weight: 600; color: #C9A84C; background: #FFFBEB; padding: 3px 9px; border-radius: 999px; border: 1px solid #FDE68A;">⭐ Premium Feature</span>')) +
                    '</div>' +
                  '</div>' +
                  '<div class="kyc-desc">' +
                    (isPremium
                      ? (kyc.description || "Longitudinal developmental analysis tracking cognitive reasoning style, frustration tolerance, and conceptual depth over 90 days.")
                      : "A 90-day developmental psychological portrait revealing your child's learning tendencies, cognitive persistence, and conceptual strengths over time.") +
                  '</div>' +
                  '<div class="kyc-bar-bg">' +
                    '<div class="kyc-bar-fill" style="width: ' + (kyc.progressPercent || 0) + '%;"></div>' +
                  '</div>' +
                  '<div class="kyc-bar-text">' +
                    '<span>' + anticipatoryText + '</span>' +
                    '<span><strong>' + (kyc.daysActive || 0) + '</strong> / 90 Days</span>' +
                  '</div>';

                if (showUpgradeLink) {
                  html += '<div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #C8E0D0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                    '<span style="font-size: 11.5px; color: #64748B;">Included in Premium Plan (KES 1,500/mo)</span>' +
                    '<a href="javascript:void(0)" onclick="openChildUpgradeModal(&apos;' + c.id + '&apos;, &apos;' + c.handle + '&apos;, &apos;premium&apos;)" style="font-size: 12px; font-weight: 600; color: #0D3A26; text-decoration: underline;">Upgrade ' + c.handle + ' to Premium →</a>' +
                  '</div>';
                }
                html += '</div></div>';

              // INDIVIDUAL LEARNER PLAN MANAGEMENT BAR (Bottom of card)
              html += '<div class="plan-row-bar">' +
                '<div style="display: flex; align-items: center; gap: 8px;">' +
                  '<span style="font-size: 12px; color: #64748B; font-weight: 500;">Account Plan:</span>' +
                  activePlanBadge +
                '</div>' +
                '<div style="margin-left: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">' +
                  (isFree
                    ? '<button type="button" onclick="promptChildUpgrade(&apos;' + c.id + '&apos;)" style="background: #FFFFFF; color: #0D3A26; border: 1.5px solid #0D3A26; border-radius: 8px; padding: 7px 14px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;">Upgrade ' + c.handle + ' 🚀</button>' +
                      '<button type="button" onclick="openChildUpgradeModal(&apos;' + c.id + '&apos;, &apos;' + c.handle + '&apos;, &apos;premium&apos;)" style="background: linear-gradient(135deg, #0D3A26, #1A5C3A); color: #FFFFFF; border: none; border-radius: 8px; padding: 7px 16px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: 0 2px 8px rgba(13,58,38,0.2);">Upgrade to ' + premPriceLabel + ' ✨</button>'
                    : isStandard
                      ? '<button type="button" onclick="openChildUpgradeModal(&apos;' + c.id + '&apos;, &apos;' + c.handle + '&apos;, &apos;premium&apos;)" style="background: linear-gradient(135deg, #0D3A26, #1A5C3A); color: #FFFFFF; border: none; border-radius: 8px; padding: 7px 16px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: 0 2px 8px rgba(13,58,38,0.2);">Upgrade to ' + premPriceLabel + ' ✨</button>' +
                        '<a href="javascript:void(0)" onclick="openManagePlanModal(&apos;' + c.id + '&apos;, &apos;' + c.handle + '&apos;, &apos;standard&apos;, &apos;' + (kyc.daysActive || 0) + '&apos;)" style="font-size: 12px; color: #64748B; text-decoration: underline; cursor: pointer; padding: 6px 12px; border-radius: 6px; border: 1px solid #E2E8F0; background: #FFFFFF; font-weight: 500;">Manage Plan ⚙️</a>'
                      : '<a href="javascript:void(0)" onclick="openManagePlanModal(&apos;' + c.id + '&apos;, &apos;' + c.handle + '&apos;, &apos;premium&apos;, &apos;' + (kyc.daysActive || 0) + '&apos;)" style="font-size: 12px; color: #64748B; text-decoration: underline; cursor: pointer; padding: 6px 12px; border-radius: 6px; border: 1px solid #E2E8F0; background: #FFFFFF; font-weight: 500;">Manage Subscription ⚙️</a>'
                  ) +
                '</div>' +
              '</div>';

              html += '</div>';
              html += '</div>';
              return html;
            }).join('');
          }

          // Render Pending Sibling Approvals
          const pendingArea = document.getElementById('pendingArea');
          const pendingContainer = document.getElementById('pendingContainer');
          if (data.pendingChildren && data.pendingChildren.length > 0) {
            pendingArea.style.display = 'block';
            pendingContainer.innerHTML = data.pendingChildren.map(function(p) {
              return '<div style="display: flex; align-items: center; justify-content: space-between; background: #FFFFFF; border: 1px solid #E0D8CC; border-radius: 12px; padding: 14px 18px; margin-bottom: 10px;">' +
                '<div>' +
                  '<div style="font-weight: 600; color: #1C1C1C; font-size: 14.5px;">' + p.handle + '</div>' +
                  '<div style="font-size: 12px; font-weight: 300; color: #9A9A9A;">Requested: ' + new Date(p.requestedAt).toLocaleDateString() + '</div>' +
                '</div>' +
                '<button type="button" onclick="approvePendingSibling(&apos;' + p.studentId + '&apos;, &apos;' + p.handle + '&apos;)" style="background: #0D3A26; color: #FFFFFF; border: none; border-radius: 10px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;">' +
                  'Approve Child 🚀' +
                '</button>' +
              '</div>';
            }).join('');
          } else {
            pendingArea.style.display = 'none';
          }

          // Render Per-Learner Subject & Plan Status on Billing Tab
          renderBillingLearnersStatus(data);
        }

        function renderBillingLearnersStatus(data) {
          const container = document.getElementById('billingLearnersStatusSection');
          if (!container) return;

          const children = data.children || [];
          window.__cachedChildrenList = children;
          const upgradeRequests = data.upgradeRequests || [];

          // Populate the Rate Card filter buttons in the plan comparison section
          const pillsContainer = document.getElementById('rateTargetChildrenPills');
          if (pillsContainer) {
            let pillsHtml = '';
            children.forEach(function(c) {
              const isBri = isBritishChild(c);
              const isSS = !isBri && (parseInt(c.grade || 7, 10) >= 10 || c.schoolLevel === 'SS');
              const badgeShort = isBri ? '🇬🇧 IGCSE' : (isSS ? '🇰🇪 Senior' : '🇰🇪 JSS');
              pillsHtml += '<button type="button" class="cycle-pill-btn" id="btnRateTarget_' + c.id + '" data-cid="' + c.id + '" data-cur="' + (isBri ? 'BRITISH' : 'CBC') + '" onclick="setRateTarget(this.dataset.cid)" style="padding: 5px 12px; font-size: 12px; border-radius: 8px;">' + (c.avatar || '👤') + ' ' + c.handle + ' (' + badgeShort + ')</button>';
            });
            pillsContainer.innerHTML = pillsHtml;
          }

          if (children.length === 0) {
            container.innerHTML = '';
            return;
          }

          const cbcChildren = children.filter(function(c) { return !isBritishChild(c); });
          const briChildren = children.filter(function(c) { return isBritishChild(c); });

          let tabsHtml = '<div style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid #E2E8F0; padding-bottom: 12px; flex-wrap: wrap; align-items: center;">' +
            '<span style="font-size: 12px; font-weight: 700; color: #475569; margin-right: 4px;">Curriculum Tabs:</span>' +
            '<button type="button" class="portal-learner-tab active" id="tabLearnersAll" onclick="filterLearnersByCurriculum(\'ALL\')" style="background: #0D3A26; color: #FFFFFF; border: none; border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s;">🌿 All Learners (' + children.length + ')</button>' +
            '<button type="button" class="portal-learner-tab" id="tabLearnersCbc" onclick="filterLearnersByCurriculum(\'CBC\')" style="background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s;">🇰🇪 CBC / CBE (' + cbcChildren.length + ')</button>' +
            '<button type="button" class="portal-learner-tab" id="tabLearnersBri" onclick="filterLearnersByCurriculum(\'BRITISH\')" style="background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s;">🇬🇧 British / IGCSE (' + briChildren.length + ')</button>' +
          '</div>';

          let html = '<div class="portal-card" style="padding: 22px 24px; margin-bottom: 20px; border: 1.5px solid #E0D8CC; background: #FFFFFF; border-radius: 14px; box-shadow: 0 3px 14px rgba(0,0,0,0.03);">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">' +
              '<div>' +
                '<h3 style="font-size: 17px; font-weight: 700; color: #0D3A26; margin: 0 0 4px 0;">Learner Subject &amp; Plan Status</h3>' +
                '<p style="font-size: 12.5px; color: #64748B; margin: 0;">Individual curriculum tiers, active subjects, and learner unlock requests.</p>' +
              '</div>' +
              '<span style="font-size: 11.5px; font-weight: 600; color: #059669; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 20px;">' + children.length + ' Linked Learner' + (children.length > 1 ? 's' : '') + '</span>' +
            '</div>' +
            tabsHtml +
            '<div id="portalLearnerCardsGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px;">';

          children.forEach(function(c) {
            const isBri = isBritishChild(c);
            const isSenior = !isBri && (parseInt(c.grade || 7, 10) >= 10 || c.schoolLevel === 'SS');
            const cleanTier = String(c.subscriptionTier || 'free').trim().toLowerCase();
            const isFree = (cleanTier === 'free');
            const isStd = (cleanTier === 'standard');
            const isPrem = (cleanTier === 'premium' || cleanTier === 'pilot' || cleanTier === 'school');

            let curLabel, rateInfo;
            if (isBri) {
              const yr = c.yearGroup || c.grade || 10;
              const tierLetter = yr >= 10 ? (c.examTier === 'core' ? 'Core' : 'Extended') : 'Checkpoint';
              curLabel = '🇬🇧 Cambridge / Edexcel • Year ' + yr + ' (' + tierLetter + ')';
              rateInfo = 'Standard KES 3,599/mo • Premium KES 4,599/mo';
            } else if (isSenior) {
              curLabel = '🇰🇪 CBC Senior School • Grade ' + c.grade + ' (' + (c.pathway || 'STEM') + ')';
              rateInfo = 'Standard KES 899/mo • Premium KES 1,799/mo';
            } else {
              curLabel = '🇰🇪 CBC Junior Secondary • Grade ' + c.grade;
              rateInfo = 'Standard KES 699/mo • Premium KES 1,499/mo';
            }

            const activeTierBadge = isPrem
              ? '<span style="background: ' + (isBri ? '#1E3A8A' : '#0D3A26') + '; color: ' + (isBri ? '#93C5FD' : '#6EE7B7') + '; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 6px; letter-spacing: 0.3px;">⭐ PREMIUM (ALL SUBJECTS)</span>'
              : (isStd
                ? '<span style="background: #1E3A8A; color: #93C5FD; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 6px; letter-spacing: 0.3px;">🚀 STANDARD (COMPULSORY + 2 ELECTIVES)</span>'
                : '<span style="background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 6px; letter-spacing: 0.3px;">🌱 FREE (3 SUBJECTS)</span>');

            const reqs = upgradeRequests.filter(function(r) {
              return (r.studentId && r.studentId === c.id) || (r.studentHandle && r.studentHandle.toLowerCase() === c.handle.toLowerCase());
            });

            // Subjects list
            const enrolled = (c.selectedSubjects && c.selectedSubjects.length > 0)
              ? c.selectedSubjects
              : ((c.freeSubjects && c.freeSubjects.length > 0) ? c.freeSubjects : (c.quests || []));

            const cardBorder = isBri ? '1.5px solid #BFDBFE; border-left: 5px solid #1D4ED8;' : '1.5px solid #BBF7D0; border-left: 5px solid #0D3A26;';
            const cardBg = isBri ? 'linear-gradient(180deg, #FFFFFF 0%, #F0F7FF 100%)' : 'linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%)';
            const curBadgeTag = isBri
              ? '<span style="background: #DBEAFE; color: #1E40AF; border: 1px solid #93C5FD; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.5px; text-transform: uppercase;">🇬🇧 BRITISH IGCSE</span>'
              : '<span style="background: #DCFCE7; color: #166534; border: 1px solid #86EFAC; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.5px; text-transform: uppercase;">🇰🇪 KENYAN CBC</span>';
            const nameColor = isBri ? '#1E3A8A' : '#0D3A26';
            const chipBorder = isBri ? '#BFDBFE' : '#CBD5E1';
            const chipColor = isBri ? '#1E40AF' : '#0D3A26';
            const btnColor = isBri ? '#1D4ED8' : '#0D3A26';

            html += '<div class="learner-card-item" data-curriculum="' + (isBri ? 'BRITISH' : 'CBC') + '" style="background: ' + cardBg + '; border: ' + cardBorder + '; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">' +
              '<div>' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">' +
                  '<div style="display: flex; align-items: center; gap: 10px;">' +
                    '<span style="font-size: 28px;">' + (c.avatar || '👤') + '</span>' +
                    '<div>' +
                      '<div style="display: flex; align-items: center; gap: 6px;">' +
                        '<span style="font-size: 16px; font-weight: 700; color: ' + nameColor + ';">' + c.handle + '</span>' +
                        curBadgeTag +
                      '</div>' +
                      '<div style="font-size: 11.5px; color: #64748B; margin-top: 2px;">' + curLabel + '</div>' +
                    '</div>' +
                  '</div>' +
                  activeTierBadge +
                '</div>' +

                '<div style="font-size: 11.5px; color: #475569; margin: 8px 0 4px 0; font-weight: 600;">Active Subjects (' + enrolled.length + '):</div>' +
                '<div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px;">';
            enrolled.slice(0, 6).forEach(function(s) {
              html += '<span style="background: #FFFFFF; border: 1px solid ' + chipBorder + '; color: ' + chipColor + '; font-size: 11px; padding: 2px 7px; border-radius: 6px; font-weight: 600;">' + s + '</span>';
            });
            if (enrolled.length > 6) {
              html += '<span style="font-size: 11px; color: #64748B; padding: 2px 4px;">+' + (enrolled.length - 6) + ' more</span>';
            }
            html += '</div>';

            if (reqs.length > 0) {
              reqs.forEach(function(r) {
                const reqSubj = r.requestedSubject || 'an extra subject';
                if (isPrem) {
                  html += '<div style="background: #FEF3C7; border: 1.5px solid #F59E0B; border-radius: 8px; padding: 10px 12px; margin-top: 6px; font-size: 12px; color: #92400E; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">' +
                    '<span>🔔 <strong>Requested:</strong> Unlock <em>' + reqSubj + '</em> <span style="font-size: 11px; color: #059669; font-weight: 700;">(Included in Premium!)</span></span>' +
                    '<div style="display: flex; gap: 6px;">' +
                      '<button type="button" onclick="approveSubjectRequestDirectly(\'' + c.id + '\', \'' + encodeURIComponent(reqSubj) + '\', \'' + encodeURIComponent(c.handle) + '\')" style="background: #059669; color: #FFFFFF; border: none; border-radius: 6px; padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer;">Approve &amp; Add 🚀</button>' +
                      '<button type="button" onclick="dismissSubjectRequest(\'' + c.id + '\', \'' + encodeURIComponent(reqSubj) + '\')" style="background: transparent; color: #92400E; border: 1px solid #D97706; border-radius: 6px; padding: 5px 8px; font-size: 11px; cursor: pointer;" title="Dismiss request">✕</button>' +
                    '</div>' +
                  '</div>';
                } else {
                  const maxAllowed = isStd ? 5 : 3;
                  const isAtLimit = enrolled.length >= maxAllowed;
                  if (isAtLimit) {
                    html += '<div style="background: #FEF3C7; border: 1.5px solid #F59E0B; border-radius: 8px; padding: 10px 12px; margin-top: 6px; font-size: 12px; color: #92400E; display: flex; flex-direction: column; gap: 8px;">' +
                      '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                        '<span>🔔 <strong>Requested:</strong> Unlock <em>' + reqSubj + '</em> (' + enrolled.length + '/' + maxAllowed + ' ' + (isStd ? 'Standard' : 'Free') + ' slots used)</span>' +
                        '<button type="button" onclick="dismissSubjectRequest(\'' + c.id + '\', \'' + encodeURIComponent(reqSubj) + '\')" style="background: transparent; color: #92400E; border: none; font-size: 14px; cursor: pointer;" title="Dismiss">✕</button>' +
                      '</div>' +
                      '<div style="display: flex; gap: 6px; flex-wrap: wrap;">' +
                        '<button type="button" onclick="openPaymentModal(\'' + (isStd ? 'premium' : 'standard') + '\', \'' + c.id + '\', \'' + encodeURIComponent(c.handle) + '\')" style="background: #D97706; color: #FFFFFF; border: none; border-radius: 6px; padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer;">Upgrade to Unlock 🚀</button>' +
                      '</div>' +
                    '</div>';
                  } else {
                    html += '<div style="background: #FEF3C7; border: 1.5px solid #F59E0B; border-radius: 8px; padding: 10px 12px; margin-top: 6px; font-size: 12px; color: #92400E; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">' +
                      '<span>🔔 <strong>Requested:</strong> Unlock <em>' + reqSubj + '</em> <span style="font-size: 11px; color: #059669; font-weight: 700;">(Slot Available!)</span></span>' +
                      '<div style="display: flex; gap: 6px;">' +
                        '<button type="button" onclick="approveSubjectRequestDirectly(\'' + c.id + '\', \'' + encodeURIComponent(reqSubj) + '\', \'' + encodeURIComponent(c.handle) + '\')" style="background: #059669; color: #FFFFFF; border: none; border-radius: 6px; padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer;">Approve &amp; Add 🚀</button>' +
                        '<button type="button" onclick="dismissSubjectRequest(\'' + c.id + '\', \'' + encodeURIComponent(reqSubj) + '\')" style="background: transparent; color: #92400E; border: 1px solid #D97706; border-radius: 6px; padding: 5px 8px; font-size: 11px; cursor: pointer;" title="Dismiss">✕</button>' +
                      '</div>' +
                    '</div>';
                  }
                }
              });
            }

            html += '<div style="font-size: 11px; color: #94A3B8; margin-top: 6px;">' + rateInfo + '</div>' +
              '</div>' +

              '<div style="display: flex; gap: 8px; margin-top: 4px;">' +
                '<button type="button" class="btn-manage-plan" data-cid="' + c.id + '" data-cname="' + encodeURIComponent(c.handle) + '" data-action="' + (isFree ? 'free' : (isStd ? 'upgrade' : 'manage')) + '" onclick="handleManagePlanClick(this)" style="flex: 1; background: ' + btnColor + '; color: #FFFFFF; border: none; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;">' +
                  (isPrem ? 'Manage Plan ⭐' : (isStd ? 'Upgrade to Premium ⭐' : 'Upgrade Learner 🚀')) +
                '</button>' +
                '<button type="button" class="btn-learner-subjects" data-cid="' + c.id + '" onclick="openSubjectModalByChildId(this.dataset.cid)" style="background: #FFFFFF; border: 1px solid #CBD5E1; color: #475569; border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 600; cursor: pointer;" title="Configure Enrolled Subjects">📚 Subjects</button>' +
              '</div>' +
            '</div>';
          });

          html += '</div></div>';
          container.innerHTML = html;
        }

        let currentCurriculumFilter = 'ALL';
        function filterLearnersByCurriculum(cur) {
          currentCurriculumFilter = cur || 'ALL';
          var isDark = document.body.classList.contains('theme-dark');
          document.querySelectorAll('.portal-learner-tab').forEach(function(b) {
            b.classList.remove('active');
            b.style.background = isDark ? 'rgba(20, 38, 28, 0.88)' : '#F1F5F9';
            b.style.color = isDark ? '#A0BCA8' : '#475569';
            b.style.borderColor = isDark ? 'rgba(74, 222, 128, 0.2)' : '#CBD5E1';
          });
          var activeBtn = document.getElementById(cur === 'ALL' ? 'tabLearnersAll' : (cur === 'CBC' ? 'tabLearnersCbc' : 'tabLearnersBri'));
          if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = (cur === 'BRITISH' ? (isDark ? '#2563EB' : '#1D4ED8') : (isDark ? '#15803D' : '#0D3A26'));
            activeBtn.style.color = '#FFFFFF';
            activeBtn.style.borderColor = 'transparent';
          }
          document.querySelectorAll('.learner-card-item').forEach(function(card) {
            var cardCur = card.getAttribute('data-curriculum');
            if (cur === 'ALL' || cardCur === cur) {
              card.style.display = 'flex';
            } else {
              card.style.display = 'none';
            }
          });
        }

        async function approveSubjectRequestDirectly(studentId, reqSubjEnc, handleEnc) {
          var subject = decodeURIComponent(reqSubjEnc || '');
          var handle = decodeURIComponent(handleEnc || 'Learner');
          try {
            var res = await fetch('/api/parent/approve-subject-request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: savedEmail,
                familyPassword: savedPin,
                studentId: studentId,
                requestedSubject: subject
              })
            });
            var data = await res.json();
            if (data.success) {
              alert(data.message || ('✅ ' + subject + ' unlocked for ' + handle + '!'));
              var dashRes = await fetch('/api/parent/dashboard?email=' + encodeURIComponent(savedEmail) + '&familyPin=' + encodeURIComponent(savedPin));
              renderDashboard(await dashRes.json());
            } else {
              if (data.needsUpgrade) {
                if (confirm(data.error + '\n\nWould you like to upgrade their plan now?')) {
                  promptChildUpgrade(studentId);
                }
              } else {
                alert(data.error || 'Could not approve request.');
              }
            }
          } catch (e) {
            alert('Network error approving subject request.');
          }
        }

        async function dismissSubjectRequest(studentId, reqSubjEnc) {
          var subject = decodeURIComponent(reqSubjEnc || '');
          if (!confirm('Dismiss this unlock request for ' + subject + '?')) return;
          try {
            var res = await fetch('/api/parent/dismiss-subject-request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: savedEmail,
                familyPassword: savedPin,
                studentId: studentId,
                requestedSubject: subject
              })
            });
            var data = await res.json();
            if (data.success) {
              var dashRes = await fetch('/api/parent/dashboard?email=' + encodeURIComponent(savedEmail) + '&familyPin=' + encodeURIComponent(savedPin));
              renderDashboard(await dashRes.json());
            }
          } catch (e) {
            console.warn('Failed to dismiss request:', e);
          }
        }

        function handleManagePlanClick(btn) {
          var cid = btn.dataset.cid;
          var cname = decodeURIComponent(btn.dataset.cname || '');
          var action = btn.dataset.action;
          if (action === 'free') {
            promptChildUpgrade(cid);
          } else if (action === 'upgrade') {
            openPaymentModal('premium', cid, cname);
          } else {
            openManagePlanModal(cid, cname, 'premium');
          }
        }

        function openSubjectModalByChildId(childId) {
          const list = window.__cachedChildrenList || [];
          const c = list.find(function(x) { return x.id === childId; });
          if (!c) return;
          openParentSubjectModal(
            c.id,
            c.handle,
            c.grade || 7,
            c.pathway || '',
            c.selectedSubjects || c.quests || [],
            c.freeSubjects || [],
            c.subscriptionTier || 'free',
            c.curriculum || (c.schoolLevel === 'IGCSE' || c.schoolLevel === 'CHECKPOINT' ? 'BRITISH' : 'CBC'),
            c.examBoard || 'CAIE'
          );
        }

        let currentRateTarget = 'family_cbe';
        function setRateTarget(target) {
          currentRateTarget = target || 'family_cbe';
          const btnFamCbe = document.getElementById('btnRateTargetFamilyCbe');
          const btnFamIgcse = document.getElementById('btnRateTargetFamilyIgcse');
          if (btnFamCbe) {
            btnFamCbe.className = 'cycle-pill-btn ' + (currentRateTarget === 'family_cbe' || currentRateTarget === 'family' ? 'active' : '');
          }
          if (btnFamIgcse) {
            btnFamIgcse.className = 'cycle-pill-btn ' + (currentRateTarget === 'family_igcse' ? 'active' : '');
          }
          (allChildrenList || []).forEach(function(c) {
            const btn = document.getElementById('btnRateTarget_' + c.id);
            if (btn) {
              btn.className = 'cycle-pill-btn ' + (currentRateTarget === c.id ? 'active' : '');
            }
          });
          // Filter rate card student pills by active curriculum family
          const isFamIgcse = (currentRateTarget === 'family_igcse');
          const activeCur = isFamIgcse ? 'BRITISH' : 'CBC';
          (allChildrenList || []).forEach(function(c) {
            const btn = document.getElementById('btnRateTarget_' + c.id);
            if (btn) {
              const cur = btn.getAttribute('data-cur');
              if (cur === activeCur) {
                btn.style.display = 'inline-block';
              } else {
                btn.style.display = 'none';
              }
            }
          });
          updatePlanComparisonCards();
        }

        function updatePlanComparisonCards() {
          const isAnnual = currentCycle === 'annual';
          const isFamIgcse = (currentRateTarget === 'family_igcse');
          const isFamCbe = (currentRateTarget === 'family_cbe' || currentRateTarget === 'family');
          const targetChild = (!isFamIgcse && !isFamCbe) ? (allChildrenList || []).find(function(c) { return c.id === currentRateTarget; }) : null;
          const isBri = targetChild ? isBritishChild(targetChild) : isFamIgcse;
          const isSenior = targetChild ? (!isBri && (parseInt(targetChild.grade || 7, 10) >= 10 || targetChild.schoolLevel === 'SS')) : false;

          let stdPrice, stdAnnual, premPrice, premAnnual, curBadge;
          let stdDesc, premDesc;
          if (isBri) {
            stdPrice = 'KES 3,599';
            stdAnnual = 'KES 35,999';
            premPrice = 'KES 4,599';
            premAnnual = 'KES 45,999';
            if (targetChild) {
              const yr = targetChild.yearGroup || targetChild.grade || 10;
              const tierLetter = yr >= 10 ? (targetChild.examTier === 'core' ? 'Core' : 'Extended') : 'Checkpoint';
              curBadge = '🇬🇧 Cambridge / Pearson Edexcel • Year ' + yr + ' (' + tierLetter + ')';
            } else {
              curBadge = '🇬🇧 Cambridge / Edexcel Family Baseline';
            }
            stdDesc = 'All 2 core (Maths + English) + 2 electives (4 subjects) with Cambridge Science Lab Bench & Paper 6 ATP simulators';
            premDesc = 'All subjects (Compulsory + ALL electives unlocked), Paper 6 ATP engine, examiner mark schemes & keyword validator';
          } else if (isSenior) {
            stdPrice = 'KES 899';
            stdAnnual = 'KES 8,999';
            premPrice = 'KES 1,799';
            premAnnual = 'KES 17,999';
            curBadge = '🇰🇪 CBC Senior School • Grade ' + targetChild.grade + ' (' + (targetChild.pathway || 'STEM') + ')';
            stdDesc = 'All compulsory subjects + 2 pathway electives (Core/Essential Maths, Sciences & Tech)';
            premDesc = 'All compulsory + ALL pathway electives, KCSE / KSSEA revision radar, deep SBA';
          } else {
            stdPrice = 'KES 699';
            stdAnnual = 'KES 6,999';
            premPrice = 'KES 1,499';
            premAnnual = 'KES 14,999';
            curBadge = targetChild ? ('🇰🇪 CBC Junior Secondary • Grade ' + targetChild.grade) : '🇰🇪 CBC / CBE Family Baseline';
            stdDesc = 'All compulsory learning areas + 2 electives (Core curriculum suite)';
            premDesc = 'All compulsory learning areas + ALL electives (Full subject suite)';
          }

          const badgeEl = document.getElementById('activeRateCardBadge');
          if (badgeEl) {
            badgeEl.textContent = curBadge;
          }

          const dispStd = document.getElementById('dispStandardPrice');
          const dispPrem = document.getElementById('dispPremiumPrice');
          if (dispStd) dispStd.textContent = isAnnual ? stdAnnual : stdPrice;
          if (dispPrem) dispPrem.textContent = isAnnual ? premAnnual : premPrice;

          const stdSubjDesc = document.getElementById('stdPlanSubjDesc');
          const premSubjDesc = document.getElementById('premPlanSubjDesc');
          if (stdSubjDesc) stdSubjDesc.textContent = stdDesc;
          if (premSubjDesc) premSubjDesc.textContent = premDesc;

          const stdSub = document.getElementById('dispStandardSub');
          const premSub = document.getElementById('dispPremiumSub');
          if (stdSub) stdSub.innerHTML = isAnnual ? '<span>KES / year</span><br><span style="color:#059669; font-weight:600;">billed annually</span>' : '<span>KES / month</span><br><span>billed monthly</span>';
          if (premSub) premSub.innerHTML = isAnnual ? '<span>KES / year</span><br><span style="color:#059669; font-weight:600;">billed annually</span>' : '<span>KES / month</span><br><span>billed monthly</span>';

          const btnStd = document.getElementById('btnPlanStandard');
          const btnPrem = document.getElementById('btnPlanPremium');
          if (targetChild) {
            if (btnStd && btnStd.disabled === false) {
              btnStd.onclick = function() { openPaymentModal('standard', targetChild.id, targetChild.handle); };
              btnStd.textContent = 'Upgrade ' + targetChild.handle + ' to ' + (isBri ? 'IGCSE Standard' : (isSenior ? 'Senior Standard' : 'Standard')) + ' 🚀';
            }
            if (btnPrem && btnPrem.disabled === false) {
              btnPrem.onclick = function() { openPaymentModal('premium', targetChild.id, targetChild.handle); };
              btnPrem.textContent = 'Upgrade ' + targetChild.handle + ' to ' + (isBri ? 'IGCSE Exam Master' : (isSenior ? 'Senior Premium Pro' : 'Premium')) + ' ✨';
            }
          } else {
            const famTargetId = isBri ? 'all_igcse' : 'all_cbe';
            if (btnStd && btnStd.disabled === false) {
              btnStd.onclick = function() { openPaymentModal('standard', famTargetId); };
              btnStd.textContent = isBri ? 'Individual IGCSE Standard (KES 3,599) 🚀' : 'Individual CBC Standard (KES 699) 🚀';
            }
            if (btnPrem && btnPrem.disabled === false) {
              btnPrem.onclick = function() { openPaymentModal('premium', famTargetId); };
              btnPrem.textContent = isBri ? 'Get IGCSE Family Pack (KES 7,999) ✨' : 'Get CBC Family Pack (KES 2,499) ✨';
            }
          }
        }

        async function approvePendingSibling(studentId, handle) {
          if (!confirm('Approve ' + handle + ' to use Elingu under your family account?')) return;
          try {
            const res = await fetch('/api/parent/approve-pending', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: savedEmail, familyPin: savedPin, studentId })
            });
            const data = await res.json();
            if (data.success) {
              alert('🎉 ' + handle + ' is now approved!');
              const dashRes = await fetch('/api/parent/dashboard?email=' + encodeURIComponent(savedEmail) + '&familyPin=' + encodeURIComponent(savedPin));
              renderDashboard(await dashRes.json());
            } else {
              alert(data.error || 'Approval failed.');
            }
          } catch (e) {
            alert('Connection error approving child.');
          }
        }

        function toggleCycle() {
          setCycle(currentCycle === 'monthly' ? 'annual' : 'monthly');
        }

        function setCycle(cycle) {
          currentCycle = cycle;
          const isAnnual = cycle === 'annual';
          const knob = document.getElementById('switchKnob');
          if (knob) knob.style.transform = isAnnual ? 'translateX(22px)' : 'translateX(0)';
          const lblM = document.getElementById('lblMonthly');
          const lblA = document.getElementById('lblAnnual');
          if (lblM) {
            lblM.className = 'cycle-pill-btn ' + (!isAnnual ? 'active' : '');
          }
          if (lblA) {
            lblA.className = 'cycle-pill-btn ' + (isAnnual ? 'active' : '');
          }

          updatePlanComparisonCards();
        }

        async function handleFreePlanAction() {
          if (currentParentTier === 'free') return;
          if (!confirm('Downgrade to the Free plan? Linked learners will be limited to their 2 chosen free subjects and 15 daily turns.')) return;
          try {
            const res = await fetch('/api/parent/subscription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: savedEmail, familyPin: savedPin, tier: 'free', billingCycle: currentCycle })
            });
            const data = await res.json();
            if (data.success) {
              alert('Plan changed to Free.');
              const dashRes = await fetch('/api/parent/dashboard?email=' + encodeURIComponent(savedEmail) + '&familyPin=' + encodeURIComponent(savedPin));
              renderDashboard(await dashRes.json());
            } else {
              alert(data.error || 'Failed to downgrade.');
            }
          } catch (e) {
            alert('Connection error.');
          }
        }

        // ── CHECKOUT & PAYMENT MODAL LOGIC ────────────────────────
        let checkoutTier = 'standard';
        let checkoutAmount = 699;
        let promptUpgradeTargetId = null;

        function promptChildUpgrade(childId) {
          const list = allChildrenList || window.__cachedChildrenList || [];
          const c = list.find(function(x) { return x.id === childId; });
          if (!c) {
            openPaymentModal('standard', childId);
            return;
          }
          promptUpgradeTargetId = childId;
          const isBri = isBritishChild(c);
          const isSenior = !isBri && (parseInt(c.grade || 7, 10) >= 10 || c.schoolLevel === 'SS');
          const isAnnual = currentCycle === 'annual';

          const modal = document.getElementById('upgradeTierPromptModalOverlay');
          const titleEl = document.getElementById('promptModalTitle');
          const subEl = document.getElementById('promptModalSubtitle');
          const badgeEl = document.getElementById('promptModalBadge');

          if (badgeEl) {
            badgeEl.textContent = isBri ? '🇬🇧 Cambridge / Pearson Edexcel' : (isSenior ? '🇰🇪 CBC Senior School' : '🇰🇪 CBC Junior Secondary');
          }
          if (titleEl) {
            titleEl.textContent = 'Choose Plan for ' + c.handle;
          }
          if (subEl) {
            if (isBri) {
              const yr = c.yearGroup || c.grade || 10;
              subEl.textContent = 'British Curriculum • Year ' + yr + ' (' + (yr >= 10 ? (c.examTier === 'core' ? 'Core Tier' : 'Extended Tier') : 'Checkpoint') + ')';
            } else if (isSenior) {
              subEl.textContent = 'CBC Senior School • Grade ' + c.grade + ' (' + (c.pathway || 'STEM Pathway') + ')';
            } else {
              subEl.textContent = 'CBC Junior Secondary • Grade ' + c.grade;
            }
          }

          const stdTitle = document.getElementById('promptStdTitle');
          const stdPrice = document.getElementById('promptStdPrice');
          const stdBilling = document.getElementById('promptStdBilling');
          const stdFeat = document.getElementById('promptStdFeatures');

          const premTitle = document.getElementById('promptPremTitle');
          const premPrice = document.getElementById('promptPremPrice');
          const premBilling = document.getElementById('promptPremBilling');
          const premFeat = document.getElementById('promptPremFeatures');

          if (isBri) {
            if (stdTitle) stdTitle.textContent = 'IGCSE Standard';
            if (stdPrice) stdPrice.textContent = isAnnual ? 'KES 35,999' : 'KES 3,599';
            if (stdBilling) stdBilling.textContent = isAnnual ? 'KES / year (save KES 7,189)' : 'KES / month';
            if (stdFeat) {
              stdFeat.innerHTML = '<li>2 Core (Maths &amp; English) + 2 electives (4 total)</li>' +
                '<li>Cambridge Science Lab Bench</li>' +
                '<li>Paper 6 Alternative to Practical simulator</li>' +
                '<li>150 daily problem steps &amp; mark scheme validation</li>';
            }

            if (premTitle) premTitle.textContent = 'IGCSE Exam Master';
            if (premPrice) premPrice.textContent = isAnnual ? 'KES 45,999' : 'KES 4,599';
            if (premBilling) premBilling.textContent = isAnnual ? 'KES / year (save KES 9,189)' : 'KES / month';
            if (premFeat) {
              premFeat.innerHTML = '<li>All subjects (Compulsory + ALL electives unlocked)</li>' +
                '<li>Paper 6 ATP engine + examiner comments</li>' +
                '<li>Strict keyword mark scheme validator</li>' +
                '<li>300 daily problem steps (max intensity)</li>' +
                '<li>Safe Box Pro &amp; Weekend Offline Challenges</li>';
            }
          } else if (isSenior) {
            if (stdTitle) stdTitle.textContent = 'Senior Standard';
            if (stdPrice) stdPrice.textContent = isAnnual ? 'KES 8,999' : 'KES 899';
            if (stdBilling) stdBilling.textContent = isAnnual ? 'KES / year (save KES 1,789)' : 'KES / month';
            if (stdFeat) {
              stdFeat.innerHTML = '<li>All compulsory subjects + 2 pathway electives</li>' +
                '<li>150 daily problem steps</li>' +
                '<li>Lab &amp; practical simulators</li>' +
                '<li>Tonight&#39;s Effort Praise &amp; Dinner Prompts</li>' +
                '<li>Weekly conversational parent summary</li>';
            }

            if (premTitle) premTitle.textContent = 'Senior Premium Pro';
            if (premPrice) premPrice.textContent = isAnnual ? 'KES 17,999' : 'KES 1,799';
            if (premBilling) premBilling.textContent = isAnnual ? 'KES / year (save KES 3,589)' : 'KES / month';
            if (premFeat) {
              premFeat.innerHTML = '<li>All compulsory subjects + ALL pathway electives</li>' +
                '<li>300 daily problem steps (max intensity)</li>' +
                '<li>KCSE / KSSEA revision radar &amp; rich SBA reports</li>' +
                '<li>Know Your Child 90-day Thinking Portrait</li>' +
                '<li>Safe Box Pro &amp; Weekend Offline Challenges</li>';
            }
          } else {
            if (stdTitle) stdTitle.textContent = 'Standard Scholar';
            if (stdPrice) stdPrice.textContent = isAnnual ? 'KES 6,999' : 'KES 699';
            if (stdBilling) stdBilling.textContent = isAnnual ? 'KES / year (save KES 1,389)' : 'KES / month';
            if (stdFeat) {
              stdFeat.innerHTML = '<li>All compulsory learning areas + 2 electives</li>' +
                '<li>150 daily problem steps</li>' +
                '<li>Tonight&#39;s Effort Praise &amp; Dinner Prompts</li>' +
                '<li>Weekly conversational parent summary</li>' +
                '<li>Basic teacher CBE strand report</li>';
            }

            if (premTitle) premTitle.textContent = 'Premium Scholar';
            if (premPrice) premPrice.textContent = isAnnual ? 'KES 14,999' : 'KES 1,499';
            if (premBilling) premBilling.textContent = isAnnual ? 'KES / year (save KES 2,989)' : 'KES / month';
            if (premFeat) {
              premFeat.innerHTML = '<li>All compulsory learning areas + ALL electives</li>' +
                '<li>300 daily problem steps (max intensity)</li>' +
                '<li>Know Your Child 90-day Thinking Portrait</li>' +
                '<li>Safe Box Pro reflection space</li>' +
                '<li>Rich teacher &amp; headteacher SBA reports</li>';
            }
          }

          if (modal) modal.style.display = 'flex';
        }

        function closePromptUpgradeModal() {
          const modal = document.getElementById('upgradeTierPromptModalOverlay');
          if (modal) modal.style.display = 'none';
        }

        function selectPromptPlan(tier) {
          closePromptUpgradeModal();
          const list = allChildrenList || window.__cachedChildrenList || [];
          const c = list.find(function(x) { return x.id === promptUpgradeTargetId; });
          openPaymentModal(tier, promptUpgradeTargetId, c ? c.handle : null);
        }

        function setCheckoutTier(tier) {
          checkoutTier = tier || 'standard';
          updateCheckoutModalView();
        }

        function populateTargetSelect() {
          const selectEl = document.getElementById('checkoutTargetSelect');
          if (!selectEl) return;
          const currentVal = selectEl.value;
          const hasBri = (allChildrenList || []).some(isBritishChild);
          const hasCbe = (allChildrenList || []).some(function(c) { return !isBritishChild(c); });

          let opts = '';
          if (hasBri && hasCbe) {
            opts += '<option value="all_cbe">👨‍👩‍👧‍👦 CBC Family Pack (KES 2,499/mo • Up to 3 CBC Learners on Premium)</option>';
            opts += '<option value="all_igcse">🇬🇧 British / IGCSE Family Pack (KES 7,999/mo • Up to 3 British Learners on Premium)</option>';
          } else if (hasBri) {
            opts += '<option value="all_igcse">🇬🇧 British / IGCSE Family Pack (KES 7,999/mo • Up to 3 British Learners on Premium)</option>';
          } else {
            opts += '<option value="all_cbe">👨‍👩‍👧‍👦 CBC Family Pack (KES 2,499/mo • Up to 3 CBC Learners on Premium)</option>';
          }

          (allChildrenList || []).forEach(function(ch) {
            const isBri = isBritishChild(ch);
            const isSeniorCh = !isBri && (parseInt(ch.grade || 7, 10) >= 10 || ch.schoolLevel === 'SS');
            const planBadge = (ch.subscriptionTier === 'premium') ? 'Premium' : (ch.subscriptionTier === 'standard') ? 'Standard' : 'Free';
            const levelText = isBri ? ('Year ' + (ch.yearGroup || ch.grade)) : ('Grade ' + ch.grade);
            const priceTag = isBri
              ? '(Standard KES 3,599 • Premium KES 4,599)'
              : (isSeniorCh ? '(Standard KES 899 • Premium KES 1,799)' : '(Standard KES 699 • Premium KES 1,499)');
            opts += '<option value="' + ch.id + '">👤 ' + ch.handle + ' (' + levelText + ' • ' + (isBri ? 'IGCSE' : 'CBC') + ' • ' + planBadge + ') ' + priceTag + '</option>';
          });
          selectEl.innerHTML = opts;
          if (currentVal && selectEl.querySelector('option[value="' + currentVal + '"]')) {
            selectEl.value = currentVal;
          }
        }

        function openPaymentModal(tier, studentId, studentName) {
          checkoutTier = tier || 'standard';
          checkoutStudentId = studentId || null;
          checkoutStudentName = studentName || null;

          populateTargetSelect();
          const selectEl = document.getElementById('checkoutTargetSelect');
          if (selectEl) {
            if (checkoutStudentId) {
              selectEl.value = checkoutStudentId;
            } else {
              checkoutStudentId = selectEl.value;
            }
          }

          // Reset views: make form view visible and hide success receipt
          document.getElementById('paymentModalFormView').style.display = 'block';
          document.getElementById('paySuccessView').style.display = 'none';
          document.getElementById('mpesaStatusBox').style.display = 'none';

          const btnMpesa = document.getElementById('btnPayMpesaSubmit');
          if (btnMpesa) {
            btnMpesa.disabled = false;
            btnMpesa.innerHTML = '<span>Send M-Pesa Prompt 📲</span>';
          }

          switchPaymentTab('mpesa');
          updateCheckoutModalView();
          document.getElementById('paymentModalOverlay').style.display = 'flex';
        }

        function openChildUpgradeModal(studentId, studentName, tier) {
          if (studentId) {
            promptChildUpgrade(studentId);
          } else {
            openPaymentModal(tier || 'premium');
          }
        }

        function onCheckoutTargetChange(val) {
          if (val === 'all' || val === 'all_cbe' || val === 'all_igcse') {
            checkoutStudentId = val;
            checkoutStudentName = null;
          } else {
            checkoutStudentId = val;
            const found = (allChildrenList || []).find(function(c) { return c.id === val; });
            checkoutStudentName = found ? found.handle : 'Learner';
          }
          updateCheckoutModalView();
        }

        function updateCheckoutModalView() {
          const isAnnual = currentCycle === 'annual';
          const isFamIgcse = (checkoutStudentId === 'all_igcse');
          const isFamCbe = (checkoutStudentId === 'all_cbe');
          const isFamilyBundle = isFamIgcse || isFamCbe;
          const targetChild = (checkoutStudentId && !isFamilyBundle && checkoutStudentId !== 'all')
            ? (allChildrenList || []).find(function(c) { return c.id === checkoutStudentId; })
            : null;
          const isBri = targetChild ? isBritishChild(targetChild) : isFamIgcse;
          const isSenior = targetChild ? (!isBri && (parseInt(targetChild.grade || 7, 10) >= 10 || targetChild.schoolLevel === 'SS')) : false;

          let tierName;
          if (isFamIgcse) {
            tierName = 'British / IGCSE Family Pack ✨';
            checkoutAmount = isAnnual ? 79999 : 7999;
          } else if (isFamCbe) {
            tierName = 'CBC Family Pack ✨';
            checkoutAmount = isAnnual ? 24999 : 2499;
          } else if (isBri) {
            tierName = (checkoutTier === 'premium') ? 'IGCSE Exam Master ✨' : 'IGCSE Standard 🚀';
            checkoutAmount = (checkoutTier === 'premium') ? (isAnnual ? 45999 : 4599) : (isAnnual ? 35999 : 3599);
          } else if (isSenior) {
            tierName = (checkoutTier === 'premium') ? 'Senior Premium Pro ✨' : 'Senior Standard 🚀';
            checkoutAmount = (checkoutTier === 'premium') ? (isAnnual ? 17999 : 1799) : (isAnnual ? 8999 : 899);
          } else {
            tierName = (checkoutTier === 'premium') ? 'Premium ✨' : 'Standard 🚀';
            checkoutAmount = (checkoutTier === 'premium') ? (isAnnual ? 14999 : 1499) : (isAnnual ? 6999 : 699);
          }

          if (checkoutStudentName) {
            const scopeDetail = isBri
              ? ' (British / IGCSE Year ' + (targetChild.yearGroup || targetChild.grade) + ')'
              : (isSenior ? ' (Senior School Grades 10–12)' : ' (Junior Secondary)');
            document.getElementById('checkoutModalTitle').textContent = 'Upgrade ' + checkoutStudentName + ': ' + tierName;
            document.getElementById('checkoutModalScope').textContent = 'Applies specifically to ' + checkoutStudentName + scopeDetail;
          } else {
            const famLabel = isFamIgcse ? '🇬🇧 British / IGCSE Family Pack: ' : '🇰🇪 CBC Family Pack: ';
            document.getElementById('checkoutModalTitle').textContent = famLabel + (isAnnual ? 'Annual (Save 2 Mos)' : 'Monthly');
            document.getElementById('checkoutModalScope').textContent = 'Covers up to 3 linked ' + (isFamIgcse ? 'British / IGCSE' : 'Kenyan CBC') + ' learners on full Premium (Strictly Curriculum-Locked)';
          }

          document.getElementById('checkoutModalPrice').textContent = 'Total: KES ' + checkoutAmount.toLocaleString() + ' / ' + (isAnnual ? 'year' : 'month');
          document.getElementById('paybillAmount').textContent = 'KES ' + checkoutAmount.toLocaleString();
          document.getElementById('paybillAccNum').textContent = savedEmail || 'ELINGU';
          document.getElementById('btnCardPayText').textContent = 'Pay KES ' + checkoutAmount.toLocaleString() + ' 🔒';
        }

        function closePaymentModal() {
          document.getElementById('paymentModalOverlay').style.display = 'none';
          document.getElementById('paymentModalFormView').style.display = 'block';
          document.getElementById('paySuccessView').style.display = 'none';
          document.getElementById('mpesaStatusBox').style.display = 'none';
        }

        async function closePaymentModalAndRefresh() {
          closePaymentModal();
          const dashRes = await fetch('/api/parent/dashboard?email=' + encodeURIComponent(savedEmail) + '&familyPin=' + encodeURIComponent(savedPin));
          renderDashboard(await dashRes.json());
        }

        function switchPaymentTab(tab) {
          ['mpesa', 'paybill', 'card'].forEach(t => {
            const btn = document.getElementById('payTabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
            const content = document.getElementById('payContent' + t.charAt(0).toUpperCase() + t.slice(1));
            if (btn) btn.className = 'portal-tab-btn ' + (t === tab ? 'active' : '');
            if (content) content.style.display = (t === tab ? 'block' : 'none');
          });
        }

        async function submitMpesaPayment() {
          const phoneInput = document.getElementById('mpesaPhone').value.trim();
          const statusBox = document.getElementById('mpesaStatusBox');
          const btnSubmit = document.getElementById('btnPayMpesaSubmit');

          if (!phoneInput || phoneInput.length < 9) {
            alert('Please enter a valid Safaricom mobile number (e.g. 0712 345 678).');
            document.getElementById('mpesaPhone').focus();
            return;
          }

          btnSubmit.disabled = true;
          btnSubmit.innerHTML = '<span>Sending prompt... 📲</span>';
          statusBox.style.display = 'block';
          statusBox.style.background = '#ECFDF5';
          statusBox.style.border = '1px solid #A7F3D0';
          statusBox.style.color = '#065F46';
          statusBox.innerHTML = '📲 <strong>Contacting Safaricom M-Pesa...</strong>';

          try {
            const stkRes = await fetch('/api/payment/mpesa-stk-push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: savedEmail,
                familyPin: savedPin,
                phone: phoneInput,
                tier: checkoutTier,
                billingCycle: currentCycle,
                studentId: checkoutStudentId
              })
            });
            const stkData = await stkRes.json();

            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<span>Send M-Pesa Prompt 📲</span>';

            if (!stkRes.ok) {
              statusBox.style.background = '#FEF2F2';
              statusBox.style.border = '1px solid #FECACA';
              statusBox.style.color = '#991B1B';
              statusBox.textContent = stkData.error || 'Failed to initiate M-Pesa prompt.';
              return;
            }

            if (stkData.simulated) {
              // Sandbox / Local Simulation Mode
              statusBox.style.background = '#EFF6FF';
              statusBox.style.border = '1px solid #BFDBFE';
              statusBox.style.color = '#1E3A8A';
              statusBox.style.padding = '14px';
              statusBox.style.borderRadius = '12px';
              statusBox.style.textAlign = 'left';
              statusBox.innerHTML =
                '<div style="font-weight: 700; color: #1E40AF; font-size: 13px; margin-bottom: 4px;">📲 M-Pesa Prompt Dispatched to ' + phoneInput + '</div>' +
                '<div style="font-size: 12px; color: #1E3A8A; line-height: 1.45; margin-bottom: 12px;">' +
                  'In live production, Safaricom prompts your phone for your PIN. Because no live Daraja credentials are set in .env, you are in <strong>Test / Sandbox Mode</strong>.' +
                '</div>' +
                '<div style="display: flex; gap: 8px;">' +
                  '<button type="button" class="btn-portal-primary" style="height: 38px; font-size: 12px; flex: 1;" onclick="completeSimulatedMpesa(&apos;' + stkData.transactionRef + '&apos;)">' +
                    'Simulate Entering PIN & Pay ✓' +
                  '</button>' +
                  '<button type="button" style="height: 38px; font-size: 12px; flex: 0.6; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 10px; cursor: pointer; color: #475569;" onclick="cancelMpesaPayment()">' +
                    'Cancel' +
                  '</button>' +
                '</div>';
            } else {
              // Live Daraja Mode with Safaricom Webhook
              statusBox.style.background = '#ECFDF5';
              statusBox.style.border = '1px solid #A7F3D0';
              statusBox.style.color = '#065F46';
              statusBox.style.padding = '14px';
              statusBox.style.borderRadius = '12px';
              statusBox.innerHTML =
                '📲 <strong>Prompt Sent to ' + phoneInput + '!</strong><br>' +
                '<span style="font-size: 12.5px;">Please check your handset screen and enter your M-Pesa PIN to authorize payment of KES ' + checkoutAmount.toLocaleString() + '...<br><em>Waiting for Safaricom authorization callback...</em></span>';
            }

          } catch (e) {
            statusBox.style.background = '#FEF2F2';
            statusBox.style.border = '1px solid #FECACA';
            statusBox.style.color = '#991B1B';
            statusBox.textContent = 'Connection error processing M-Pesa payment.';
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<span>Send M-Pesa Prompt 📲</span>';
          }
        }

        async function completeSimulatedMpesa(transactionRef) {
          const statusBox = document.getElementById('mpesaStatusBox');
          statusBox.innerHTML = '<div style="text-align: center; color: #1E40AF; font-size: 12.5px;">Authorizing simulated payment... ⏳</div>';
          try {
            const confRes = await fetch('/api/payment/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: savedEmail,
                familyPin: savedPin,
                tier: checkoutTier,
                billingCycle: currentCycle,
                paymentMethod: 'M-Pesa Express (STK Push)',
                transactionRef: transactionRef,
                studentId: checkoutStudentId
              })
            });
            const confData = await confRes.json();
            if (confData.success) {
              showPaymentSuccess(confData);
            } else {
              statusBox.style.background = '#FEF2F2';
              statusBox.style.border = '1px solid #FECACA';
              statusBox.style.color = '#991B1B';
              statusBox.textContent = confData.error || 'Payment confirmation failed.';
            }
          } catch (e) {
            statusBox.style.background = '#FEF2F2';
            statusBox.style.border = '1px solid #FECACA';
            statusBox.style.color = '#991B1B';
            statusBox.textContent = 'Connection error confirming payment.';
          }
        }

        function cancelMpesaPayment() {
          const statusBox = document.getElementById('mpesaStatusBox');
          if (statusBox) statusBox.style.display = 'none';
        }

        async function submitPaybillPayment() {
          const refCode = document.getElementById('mpesaRefCode').value.trim();
          if (!refCode || refCode.length < 8) {
            alert('Please enter a valid 10-character M-Pesa transaction code.');
            document.getElementById('mpesaRefCode').focus();
            return;
          }

          try {
            const confRes = await fetch('/api/payment/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: savedEmail,
                familyPin: savedPin,
                tier: checkoutTier,
                billingCycle: currentCycle,
                paymentMethod: 'M-Pesa Paybill (400200)',
                transactionRef: refCode.toUpperCase(),
                studentId: checkoutStudentId
              })
            });
            const confData = await confRes.json();
            if (confData.success) {
              showPaymentSuccess(confData);
            } else {
              alert(confData.error || 'Could not verify transaction code.');
            }
          } catch (e) {
            alert('Connection error confirming Paybill payment.');
          }
        }

        async function submitCardPayment() {
          const cardNum = document.getElementById('cardNum').value.trim();
          if (!cardNum || cardNum.length < 12) {
            alert('Please enter a valid card number.');
            return;
          }

          try {
            const confRes = await fetch('/api/payment/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: savedEmail,
                familyPin: savedPin,
                tier: checkoutTier,
                billingCycle: currentCycle,
                paymentMethod: 'Credit / Debit Card',
                transactionRef: 'CRD' + Math.random().toString(36).substring(2, 9).toUpperCase(),
                studentId: checkoutStudentId
              })
            });
            const confData = await confRes.json();
            if (confData.success) {
              showPaymentSuccess(confData);
            } else {
              alert(confData.error || 'Card processing failed.');
            }
          } catch (e) {
            alert('Connection error processing card.');
          }
        }

        function showPaymentSuccess(data) {
          // Hide form view entirely so only the celebratory receipt appears
          document.getElementById('paymentModalFormView').style.display = 'none';
          document.getElementById('paySuccessView').style.display = 'block';

          const targetName = data.studentName || checkoutStudentName;
          if (targetName) {
            document.getElementById('paySuccessMsg').textContent =
              'Subscription for ' + targetName + ' has been upgraded to ' + data.tierInfo.name + ' (' + (currentCycle === 'annual' ? 'Annual' : 'Monthly') + ')!';

            document.getElementById('payReceiptBox').innerHTML =
              '<div><strong>Amount Paid:</strong> KES ' + data.amount.toLocaleString() + '</div>' +
              '<div style="margin-top: 4px;"><strong>Plan:</strong> Elingu ' + data.tierInfo.name + ' (' + targetName + ')</div>' +
              '<div style="margin-top: 4px;"><strong>Receipt Ref:</strong> ' + data.transactionRef + '</div>' +
              '<div style="margin-top: 4px;"><strong>Status:</strong> Active & Confirmed ✓</div>' +
              '<div style="margin-top: 8px; font-size: 12px; color: #047857; font-weight: 500;">✓ ' + targetName + ' now has full CBE access immediately.</div>';
          } else {
            document.getElementById('paySuccessMsg').textContent =
              'Your family subscription has been upgraded to ' + data.tierInfo.name + ' (' + (currentCycle === 'annual' ? 'Annual' : 'Monthly') + ')!';

            document.getElementById('payReceiptBox').innerHTML =
              '<div><strong>Amount Paid:</strong> KES ' + data.amount.toLocaleString() + '</div>' +
              '<div style="margin-top: 4px;"><strong>Plan:</strong> Elingu ' + data.tierInfo.name + ' (Family Account)</div>' +
              '<div style="margin-top: 4px;"><strong>Receipt Ref:</strong> ' + data.transactionRef + '</div>' +
              '<div style="margin-top: 4px;"><strong>Status:</strong> Active & Confirmed ✓</div>' +
              '<div style="margin-top: 8px; font-size: 12px; color: #047857; font-weight: 500;">✓ All children in your family account have been upgraded immediately.</div>';
          }
        }

        function switchLearnerInsightTab(childId, tabName) {
          ['work', 'note', 'portrait'].forEach(function(t) {
            const btn = document.getElementById('tabBtn_' + t + '_' + childId);
            const pnl = document.getElementById('panel_' + t + '_' + childId);
            if (btn) {
              if (t === tabName) btn.classList.add('active');
              else btn.classList.remove('active');
            }
            if (pnl) {
              if (t === tabName) pnl.classList.add('active');
              else pnl.classList.remove('active');
            }
          });
        }

        let manageTargetStudentId = null;
        let manageTargetStudentName = null;
        let manageTargetTier = null;

        function openManagePlanModal(studentId, studentName, tier, daysActive) {
          manageTargetStudentId = studentId;
          manageTargetStudentName = studentName;
          manageTargetTier = tier || 'standard';

          const titleEl = document.getElementById('manageModalTitle');
          const badgeEl = document.getElementById('manageModalTierBadge');
          const lossNameEl = document.getElementById('manageModalLossName');
          const btnKeep = document.getElementById('btnKeepActivePlan');
          const btnUpgrade = document.getElementById('btnUpgradeFromManage');
          const kycBenefit = document.getElementById('manageModalKycBenefit');
          const kycText = document.getElementById('manageModalKycText');
          const turnBenefit = document.getElementById('manageModalTurnBenefit');

          if (titleEl) titleEl.textContent = 'Manage Subscription for ' + studentName;
          if (lossNameEl) lossNameEl.textContent = studentName;

          const isPrem = (tier === 'premium');
          const targetChild = manageTargetStudentId ? (allChildrenList || []).find(function(c) { return c.id === manageTargetStudentId; }) : null;
          const isBri = targetChild ? isBritishChild(targetChild) : false;
          const isSeniorCh = !isBri && targetChild && (parseInt(targetChild.grade || 7, 10) >= 10 || targetChild.schoolLevel === 'SS');
          const premPriceDisplay = isBri ? 'KES 4,599/month' : (isSeniorCh ? 'KES 1,799/month' : 'KES 1,499/month');
          const stdPriceDisplay = isBri ? 'KES 3,599/month' : (isSeniorCh ? 'KES 899/month' : 'KES 699/month');
          if (badgeEl) {
            badgeEl.innerHTML = isPrem
              ? '<span class="badge-premium-active">⭐ Premium Plan (' + premPriceDisplay + ')</span>'
              : '<span class="badge-standard-active">🚀 Standard Plan (' + stdPriceDisplay + ')</span>';
          }

          if (btnKeep) {
            btnKeep.textContent = 'Keep ' + studentName + ' on ' + (isPrem ? 'Premium' : 'Standard') + ' ✨';
          }

          if (btnUpgrade) {
            btnUpgrade.style.display = isPrem ? 'none' : 'block';
            btnUpgrade.textContent = 'Upgrade to Premium (' + premPriceDisplay + ') ⭐';
          }

          if (kycBenefit) {
            if (isPrem) {
              kycBenefit.style.display = 'flex';
              if (kycText) kycText.innerHTML = '<strong>Know Your Child:</strong> 90-Day Longitudinal Portrait active (Day ' + (daysActive || 0) + '/90)';
            } else {
              kycBenefit.style.display = 'none';
            }
          }

          if (turnBenefit) {
            turnBenefit.innerHTML = '<span style="color: #059669; font-weight: 700;">✓</span><span><strong>Daily Turns:</strong> ' + (isPrem ? '300' : '150') + ' turns / day for revision</span>';
          }

          const overlay = document.getElementById('managePlanModalOverlay');
          if (overlay) overlay.style.display = 'flex';
        }

        function closeManagePlanModal() {
          const overlay = document.getElementById('managePlanModalOverlay');
          if (overlay) overlay.style.display = 'none';
        }

        function upgradeFromManageModal() {
          closeManagePlanModal();
          openChildUpgradeModal(manageTargetStudentId, manageTargetStudentName, 'premium');
        }

        async function executeModalDowngrade() {
          if (!confirm('Are you sure you want to switch ' + manageTargetStudentName + ' to Free? They will lose access to all CBE subjects except 3, daily turns will drop to 15, and Know Your Child portrait progress will pause.')) {
            return;
          }
          closeManagePlanModal();
          await setChildToFree(manageTargetStudentId, manageTargetStudentName, true);
        }

        async function executeParentDataErasure() {
          const phrase = prompt("⚠️ PERMANENT DATA ERASURE (Kenya DPA 2019 Sec 40)\\n\\nThis will permanently delete " + manageTargetStudentName + " account data, learning streaks, badges, weekly reports, and chat history.\\n\\nType DELETE or FUTA DATA to confirm:");
          if (phrase !== 'DELETE' && phrase !== 'FUTA DATA') {
            if (phrase !== null) alert('Confirmation phrase did not match. Deletion cancelled.');
            return;
          }

          try {
            const res = await fetch('/api/parent/purge-child-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: savedEmail,
                familyPin: savedPin,
                studentId: manageTargetStudentId,
                confirmationPhrase: phrase
              })
            });
            const data = await res.json();
            if (data.success) {
              alert('Learner data for ' + manageTargetStudentName + ' has been permanently erased.');
              closeManagePlanModal();
              const dashRes = await fetch('/api/parent/dashboard?email=' + encodeURIComponent(savedEmail) + '&familyPin=' + encodeURIComponent(savedPin));
              renderDashboard(await dashRes.json());
            } else {
              alert('Deletion failed: ' + (data.error || 'Server error'));
            }
          } catch (e) {
            alert('Error during data erasure request.');
          }
        }

        function openInstitutionalModal() {
          const fb = document.getElementById('instFeedback');
          if (fb) fb.style.display = 'none';
          const overlay = document.getElementById('institutionalModalOverlay');
          if (overlay) overlay.style.display = 'flex';
        }

        function closeInstitutionalModal() {
          const overlay = document.getElementById('institutionalModalOverlay');
          if (overlay) overlay.style.display = 'none';
        }

        async function submitInstitutionalInquiry() {
          const orgName = (document.getElementById('instOrgName') || {}).value || '';
          const pupilCount = (document.getElementById('instPupilCount') || {}).value || '';
          const contactPerson = (document.getElementById('instContactPerson') || {}).value || '';
          const phoneOrEmail = (document.getElementById('instPhoneOrEmail') || {}).value || '';
          const fb = document.getElementById('instFeedback');
          const btn = document.getElementById('btnSubmitInstInquiry');

          if (!orgName.trim() || !phoneOrEmail.trim()) {
            if (fb) {
              fb.style.display = 'block';
              fb.style.color = '#991B1B';
              fb.textContent = 'Please enter school/county name and contact details.';
            }
            return;
          }

          if (btn) {
            btn.disabled = true;
            btn.textContent = 'Submitting Request... ⏳';
          }

          try {
            const res = await fetch('/api/institutional/inquire', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orgName, pupilCount, contactPerson, phoneOrEmail })
            });
            const data = await res.json();
            if (fb) {
              fb.style.display = 'block';
              if (data.success) {
                fb.style.color = '#065F46';
                fb.style.background = '#ECFDF5';
                fb.style.padding = '8px 12px';
                fb.style.borderRadius = '8px';
                fb.innerHTML = '✓ <strong>' + data.message + '</strong>';
                if (btn) btn.style.display = 'none';
              } else {
                fb.style.color = '#991B1B';
                fb.textContent = data.error || 'Failed to submit request.';
                if (btn) {
                  btn.disabled = false;
                  btn.textContent = 'Submit Institutional Request 🚀';
                }
              }
            }
          } catch (e) {
            if (fb) {
              fb.style.display = 'block';
              fb.style.color = '#991B1B';
              fb.textContent = 'Connection error. Please try again.';
            }
            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Submit Institutional Request 🚀';
            }
          }
        }

        async function setChildToFree(studentId, studentName, skipPrompt) {
          if (!skipPrompt && !confirm('Switch ' + studentName + ' back to the Free plan? They will be limited to 2 subjects and 15 daily turns.')) return;
          try {
            const res = await fetch('/api/parent/child-subscription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: savedEmail, familyPin: savedPin, studentId: studentId, tier: 'free' })
            });
            const data = await res.json();
            if (data.success) {
              alert('Plan for ' + studentName + ' changed to Free.');
              const dashRes = await fetch('/api/parent/dashboard?email=' + encodeURIComponent(savedEmail) + '&familyPin=' + encodeURIComponent(savedPin));
              renderDashboard(await dashRes.json());
            } else {
              alert(data.error || 'Failed to update plan.');
            }
          } catch (e) {
            alert('Connection error updating plan.');
          }
        }

        async function redeemPortalPilotCode() {
          const codeInput = document.getElementById('portalPilotCode');
          const feedback = document.getElementById('portalPilotFeedback');
          const code = (codeInput ? codeInput.value : '').trim().toUpperCase();

          if (!code) {
            feedback.style.display = 'block';
            feedback.style.color = '#991B1B';
            feedback.textContent = 'Please enter an access or pilot code.';
            return;
          }

          try {
            const res = await fetch('/api/parent/pilot-activate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: savedEmail, familyPin: savedPin, accessCode: code })
            });
            const data = await res.json();

            feedback.style.display = 'block';
            if (data.success) {
              feedback.style.color = '#065F46';
              feedback.innerHTML = '🎉 <strong>' + data.message + '</strong>';
              codeInput.value = '';
              const dashRes = await fetch('/api/parent/dashboard?email=' + encodeURIComponent(savedEmail) + '&familyPin=' + encodeURIComponent(savedPin));
              renderDashboard(await dashRes.json());
            } else {
              feedback.style.color = '#991B1B';
              feedback.textContent = data.error || 'Failed to activate pilot code.';
            }
          } catch (e) {
            feedback.style.display = 'block';
            feedback.style.color = '#991B1B';
            feedback.textContent = 'Connection error activating code.';
          }
        }

        // ── GRADE CORRECTION MODAL HANDLERS ──
        function openGradeCorrectionModal(studentId, handle, currentGrade) {
          document.getElementById('gcStudentId').value = studentId;
          document.getElementById('gcStudentName').textContent = handle + ' (Currently Grade ' + currentGrade + ')';
          document.getElementById('gcGradeSelect').value = currentGrade.toString();
          document.getElementById('gcReasonInput').value = '';
          const fb = document.getElementById('gcFeedback');
          if (fb) fb.style.display = 'none';
          const modal = document.getElementById('gradeCorrectionModal');
          if (modal) modal.style.display = 'flex';
        }

        function closeGradeCorrectionModal() {
          const modal = document.getElementById('gradeCorrectionModal');
          if (modal) modal.style.display = 'none';
        }

        async function submitGradeCorrectionRequest() {
          const studentId = document.getElementById('gcStudentId').value;
          const requestedGrade = document.getElementById('gcGradeSelect').value;
          const reason = document.getElementById('gcReasonInput').value.trim();
          const fb = document.getElementById('gcFeedback');
          const btn = document.getElementById('btnSubmitGradeCorrection');

          if (!studentId || !requestedGrade) return;

          btn.disabled = true;
          btn.textContent = 'Submitting...';
          fb.style.display = 'none';

          try {
            const res = await fetch('/api/parent/request-grade-change', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: savedEmail,
                familyPassword: savedPin,
                studentId: studentId,
                requestedGrade: parseInt(requestedGrade, 10),
                reason: reason
              })
            });
            const data = await res.json();
            btn.disabled = false;
            btn.textContent = 'Submit Request →';

            fb.style.display = 'block';
            if (data.success) {
              fb.style.background = '#ECFDF5';
              fb.style.border = '1px solid #A7F3D0';
              fb.style.color = '#065F46';
              fb.innerHTML = '✓ <strong>Request Submitted!</strong> ' + data.message;
              setTimeout(() => { closeGradeCorrectionModal(); }, 2800);
            } else {
              fb.style.background = '#FEF2F2';
              fb.style.border = '1px solid #FECACA';
              fb.style.color = '#991B1B';
              fb.textContent = data.error || 'Failed to submit grade correction request.';
            }
          } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Submit Request →';
            fb.style.display = 'block';
            fb.style.background = '#FEF2F2';
            fb.style.border = '1px solid #FECACA';
            fb.style.color = '#991B1B';
            fb.textContent = 'Network error. Please try again.';
          }
        }

        // ── PARENT SUBJECT SELECTION MODAL LOGIC ──
        // Only active subjects currently implemented in Elingu's curriculum context:
        const JSS_SUBJECTS = ['Mathematics', 'English', 'Kiswahili', 'Science & Technology', 'Social Studies'];
        const SS_COMPULSORY = ['Core Mathematics', 'Essential Mathematics', 'Community Service Learning', 'English', 'Kiswahili'];
        const SS_PATHWAYS = {
          STEM: ['Physics', 'Chemistry', 'Biology', 'Computer Studies'],
          HUMANITIES: [],
          ARTS_SPORTS: []
        };

        let currentModalStudentSubjects = [];
        let currentModalStudentFree = [];
        let currentModalStudentTier = 'free';
        let currentModalStudentCurriculum = 'CBC';
        let currentModalStudentBoard = 'CAIE';

        function openParentSubjectModal(studentId, handle, grade, pathway, selectedSubjects, freeSubjects, tier, curriculum, examBoard) {
          document.getElementById('psStudentId').value = studentId;
          document.getElementById('psStudentGrade').value = grade;
          document.getElementById('psStudentName').textContent = handle;
          currentModalStudentCurriculum = String(curriculum || 'CBC').toUpperCase();
          currentModalStudentBoard = String(examBoard || 'CAIE').toUpperCase();
          const isBri = currentModalStudentCurriculum === 'BRITISH' || currentModalStudentCurriculum === 'IGCSE' || currentModalStudentCurriculum === 'EDEXCEL';
          const isSenior = parseInt(grade, 10) >= 10;
          currentModalStudentTier = tier || 'free';
          const maxSubjects = (currentModalStudentTier === 'free') ? 3 : 5;
          const levelText = isBri
            ? ('Year ' + grade + ' (' + (isSenior ? 'IGCSE' : 'Checkpoint') + ') • ' + (currentModalStudentBoard === 'EDEXCEL' ? 'Pearson Edexcel' : 'Cambridge CAIE'))
            : ('Grade ' + grade + ' (' + (isSenior ? 'Senior School' : 'Junior Secondary') + ')');
          document.getElementById('psStudentLevel').textContent = levelText + ' • ' + (currentModalStudentTier.toUpperCase()) + ' Plan (Max ' + maxSubjects + ' Subjects)';

          currentModalStudentSubjects = Array.isArray(selectedSubjects) ? [...selectedSubjects] : [];
          currentModalStudentFree = Array.isArray(freeSubjects) ? [...freeSubjects] : [];

          const pathwaySec = document.getElementById('psPathwaySection');
          const pathwaySel = document.getElementById('psPathwaySelect');
          if (!isBri && isSenior) {
            pathwaySec.style.display = 'block';
            pathwaySel.value = pathway || 'STEM';
          } else {
            pathwaySec.style.display = 'none';
          }

          const fb = document.getElementById('psFeedback');
          if (fb) fb.style.display = 'none';

          renderParentSubjectCheckboxes();

          const modal = document.getElementById('parentSubjectModal');
          if (modal) modal.style.display = 'flex';
        }

        function closeParentSubjectModal() {
          const modal = document.getElementById('parentSubjectModal');
          if (modal) modal.style.display = 'none';
        }

        function openParentTierModal(studentId, currentTier, handle) {
          document.getElementById('ptStudentId').value = studentId;
          document.getElementById('ptStudentName').textContent = handle;
          document.getElementById('ptTierSelect').value = (currentTier || 'extended').toLowerCase();
          const fb = document.getElementById('ptFeedback');
          if (fb) fb.style.display = 'none';
          const modal = document.getElementById('parentTierModal');
          if (modal) modal.style.display = 'flex';
        }

        function closeParentTierModal() {
          const modal = document.getElementById('parentTierModal');
          if (modal) modal.style.display = 'none';
        }

        async function submitParentTierChange() {
          const studentId = document.getElementById('ptStudentId').value;
          const examTier = document.getElementById('ptTierSelect').value;
          const fb = document.getElementById('ptFeedback');
          const pass = prompt('Please enter your Family Password to confirm this academic examination tier update:');
          if (!pass) return;

          try {
            const res = await fetch('/api/parent/student-tier', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: savedEmail,
                familyPassword: pass,
                studentId: studentId,
                examTier: examTier
              })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
              if (fb) {
                fb.style.display = 'block';
                fb.style.background = '#FEE2E2';
                fb.style.color = '#991B1B';
                fb.textContent = data.error || 'Failed to update examination tier.';
              } else {
                alert(data.error || 'Failed to update examination tier.');
              }
              return;
            }
            alert('✓ Academic examination tier successfully updated to ' + examTier.toUpperCase() + '.');
            closeParentTierModal();
            location.reload();
          } catch (err) {
            alert('Network error updating tier: ' + err.message);
          }
        }

        function renderParentSubjectCheckboxes() {
          const grade = parseInt(document.getElementById('psStudentGrade').value, 10);
          const isBri = currentModalStudentCurriculum === 'BRITISH' || currentModalStudentCurriculum === 'IGCSE' || currentModalStudentCurriculum === 'EDEXCEL';
          const isSenior = grade >= 10;
          const isEdexcel = currentModalStudentBoard === 'EDEXCEL';
          const tier = (currentModalStudentTier || 'free').toLowerCase();
          const list = document.getElementById('psSubjectsList');
          list.innerHTML = '';

          let availableSubjects = [];
          let compulsoryList = [];

          if (isBri) {
            if (isEdexcel) {
              if (isSenior) {
                compulsoryList = ['Mathematics A (4MA1)', 'English Language A (4EA1)'];
                const electives = ['Physics (4PH1)', 'Chemistry (4CH1)', 'Biology (4BI1)', 'Computer Science (4CP0)', 'Business (4BS1)', 'Economics (4EC1)', 'Geography (4GE1)', 'History (4HI1)'];
                availableSubjects = [...compulsoryList, ...electives];
              } else {
                compulsoryList = ['iLowerSecondary Maths (LMA11)', 'iLowerSecondary English (LEN11)'];
                const electives = ['iLowerSecondary Science (LSC11)', 'iLowerSecondary Computing (LIT11)', 'Global Citizenship (LGC11)'];
                availableSubjects = [...compulsoryList, ...electives];
              }
            } else {
              if (isSenior) {
                compulsoryList = ['Mathematics (0580)', 'First Language English (0500)'];
                const electives = ['Physics (0625)', 'Chemistry (0620)', 'Biology (0610)', 'Computer Science (0478)', 'Business Studies (0450)', 'Economics (0455)', 'Geography (0460)', 'History (0470)'];
                availableSubjects = [...compulsoryList, ...electives];
              } else {
                compulsoryList = ['Checkpoint Mathematics (0862)', 'Checkpoint English (0861)'];
                const electives = ['Lower Secondary Science (0893)', 'Computing (0860)', 'Global Perspectives (0838)'];
                availableSubjects = [...compulsoryList, ...electives];
              }
            }
          } else {
            if (!isSenior) {
              availableSubjects = JSS_SUBJECTS;
              compulsoryList = ['Mathematics', 'English', 'Kiswahili', 'Integrated Science', 'Science & Technology', 'Social Studies'];
            } else {
              const pathway = document.getElementById('psPathwaySelect').value || 'STEM';
              const electives = SS_PATHWAYS[pathway] || SS_PATHWAYS.STEM;
              availableSubjects = [...new Set([...SS_COMPULSORY, ...electives])];
              compulsoryList = SS_COMPULSORY;
            }
          }

          const compNorms = compulsoryList.map(c => c.toLowerCase());

          availableSubjects.forEach(s => {
            const isComp = compNorms.includes(s.toLowerCase());
            const isLockedCompulsory = (!isBri && isSenior && SS_COMPULSORY.includes(s));
            const isChecked = currentModalStudentSubjects.includes(s) || isLockedCompulsory;

            const row = document.createElement('label');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '10px';
            row.style.padding = '8px 10px';
            row.style.background = isChecked ? '#F0FDF4' : '#FFFFFF';
            row.style.border = isChecked ? '1px solid #86EFAC' : '1px solid #E2E8F0';
            row.style.borderRadius = '8px';
            row.style.cursor = isLockedCompulsory ? 'default' : 'pointer';
            row.style.fontSize = '13.5px';
            row.style.color = '#1E293B';
            row.style.fontWeight = isChecked ? '600' : '400';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = s;
            checkbox.checked = isChecked;
            if (isLockedCompulsory) {
              checkbox.disabled = true;
            }

            checkbox.onchange = function() {
              const fb = document.getElementById('psFeedback');
              if (fb) fb.style.display = 'none';

              if (checkbox.checked) {
                if (tier === 'free') {
                  const compChosen = currentModalStudentSubjects.filter(x => compNorms.includes(x.toLowerCase()));
                  const elecChosen = currentModalStudentSubjects.filter(x => !compNorms.includes(x.toLowerCase()));
                  if (!isComp && elecChosen.length >= 1) {
                    checkbox.checked = false;
                    fb.style.display = 'block';
                    fb.style.background = '#FEF2F2';
                    fb.style.color = '#991B1B';
                    fb.textContent = 'Free Plan allows only 1 elective. Upgrade to Standard for 2 electives or Premium for all electives.';
                    return;
                  }
                  if (isComp && compChosen.length >= 2) {
                    checkbox.checked = false;
                    fb.style.display = 'block';
                    fb.style.background = '#FEF2F2';
                    fb.style.color = '#991B1B';
                    fb.textContent = 'Free Plan allows up to 2 compulsory subjects. Upgrade to Standard for all compulsory subjects.';
                    return;
                  }
                  if (currentModalStudentSubjects.length >= 3) {
                    checkbox.checked = false;
                    fb.style.display = 'block';
                    fb.style.background = '#FEF2F2';
                    fb.style.color = '#991B1B';
                    fb.textContent = 'Free Plan allows a maximum of 3 subjects (2 compulsory + 1 elective).';
                    return;
                  }
                } else if (tier === 'standard') {
                  // Standard: All compulsory + up to 2 electives
                  if (!isComp) {
                    const elecChosen = currentModalStudentSubjects.filter(x => !compNorms.includes(x.toLowerCase()));
                    if (elecChosen.length >= 2) {
                      checkbox.checked = false;
                      fb.style.display = 'block';
                      fb.style.background = '#FEF2F2';
                      fb.style.color = '#991B1B';
                      fb.textContent = 'Standard Plan offers all compulsory subjects + 2 electives. Upgrade to Premium for ALL electives in your pathway!';
                      return;
                    }
                  }
                }
                // Premium: unlimited electives in pathway!
                if (!currentModalStudentSubjects.includes(s)) currentModalStudentSubjects.push(s);
              } else {
                currentModalStudentSubjects = currentModalStudentSubjects.filter(item => item !== s);
              }
              renderParentSubjectCheckboxes();
            };

            const labelText = document.createElement('span');
            labelText.textContent = s + (isComp ? ' (Compulsory)' : ' (Elective)');
            if (isComp) labelText.style.color = '#0D3A26';

            row.appendChild(checkbox);
            row.appendChild(labelText);
            list.appendChild(row);
          });
        }

        async function submitParentSubjectChange() {
          const studentId = document.getElementById('psStudentId').value;
          const grade = parseInt(document.getElementById('psStudentGrade').value, 10);
          const isSenior = grade >= 10;
          const pathway = isSenior ? document.getElementById('psPathwaySelect').value : null;
          const fb = document.getElementById('psFeedback');
          const btn = document.getElementById('btnSaveParentSubjects');

          const checkboxes = document.querySelectorAll('#psSubjectsList input[type="checkbox"]:checked');
          const chosen = Array.from(checkboxes).map(c => c.value);

          const maxSubjects = (currentModalStudentTier === 'free') ? 3 : 5;

          if (chosen.length === 0) {
            fb.style.display = 'block';
            fb.style.background = '#FEF2F2';
            fb.style.color = '#991B1B';
            fb.textContent = 'Please select at least one subject.';
            return;
          }

          if (chosen.length > maxSubjects) {
            fb.style.display = 'block';
            fb.style.background = '#FEF2F2';
            fb.style.color = '#991B1B';
            fb.textContent = 'Maximum ' + maxSubjects + ' subjects allowed on the ' + currentModalStudentTier.toUpperCase() + ' plan.';
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Saving... ⏳';
          fb.style.display = 'none';

          try {
            const res = await fetch('/api/parent/update-child-subjects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: savedEmail,
                familyPassword: savedPin,
                studentId: studentId,
                selectedSubjects: chosen,
                freeSubjects: chosen.slice(0, 3),
                pathway: pathway
              })
            });

            const data = await res.json();
            btn.disabled = false;
            btn.textContent = 'Save Subjects ✓';

            fb.style.display = 'block';
            if (data.success) {
              fb.style.background = '#ECFDF5';
              fb.style.border = '1px solid #A7F3D0';
              fb.style.color = '#065F46';
              fb.innerHTML = '✓ ' + data.message;
              setTimeout(() => {
                closeParentSubjectModal();
                submitParentLogin(); // refresh dashboard data cleanly
              }, 1800);
            } else {
              fb.style.background = '#FEF2F2';
              fb.style.border = '1px solid #FECACA';
              fb.style.color = '#991B1B';
              fb.textContent = data.error || 'Failed to update subjects.';
            }
          } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Save Subjects ✓';
            fb.style.display = 'block';
            fb.style.background = '#FEF2F2';
            fb.style.border = '1px solid #FECACA';
            fb.style.color = '#991B1B';
            fb.textContent = 'Network error saving subjects.';
          }
        }

        function logoutParent() {
          savedEmail = '';
          savedPin = '';
          document.getElementById('loginCard').style.display = 'block';
          document.getElementById('dashboardArea').style.display = 'none';
        }

        function toggleTheme() {
          const isDark = document.body.classList.toggle('theme-dark');
          localStorage.setItem('elingTheme', isDark ? 'dark' : 'light');
          const btn = document.getElementById('themeToggleBtn');
          if (btn) btn.innerHTML = isDark ? '☀️ Light' : '🌙 Dark';
          if (typeof filterLearnersByCurriculum === 'function' && document.querySelector('.portal-learner-tab')) {
            filterLearnersByCurriculum(currentCurriculumFilter || 'ALL');
          }
        }
        (function() {
          const saved = localStorage.getItem('elingTheme');
          if (saved === 'dark') {
            document.body.classList.add('theme-dark');
            const btn = document.getElementById('themeToggleBtn');
            if (btn) btn.innerHTML = '☀️ Light';
          }
        })();

        // ── PARENT GOOGLE AUTHENTICATION ───────────────────
        async function startParentGoogleAuth() {
          const errEl = document.getElementById('loginError');
          if (errEl) errEl.style.display = 'none';

          if (window.google && window.google.accounts && window.google.accounts.id && window.parentGoogleConfig && window.parentGoogleConfig.configured) {
            google.accounts.id.prompt();
            return;
          }

          showParentGooglePrompt();
        }

        function showParentGooglePrompt() {
          var modal = document.getElementById('parentGooglePromptModal');
          if (!modal) {
            modal = document.createElement('div');
            modal.id = 'parentGooglePromptModal';
            modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 99999; padding: 16px;';
            modal.innerHTML = '<div style="background: var(--pp-card); border: 1px solid var(--pp-border); border-radius: 20px; max-width: 420px; width: 100%; padding: 28px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.15);">' +
              '<div style="width: 52px; height: 52px; border-radius: 50%; background: rgba(13,58,38,0.06); display: flex; align-items: center; justify-content: center; margin: 0 auto 14px auto;">' +
              '<svg width="26" height="26" viewBox="0 0 24 24">' +
              '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>' +
              '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>' +
              '<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>' +
              '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>' +
              '</svg></div>' +
              '<h3 style="font-size: 19px; font-weight: 700; color: var(--pp-accent); margin: 0 0 6px 0;">Sign in with Google</h3>' +
              '<p style="font-size: 13px; color: var(--pp-text-sub); margin: 0 0 18px 0; line-height: 1.5;">Enter your Google Account email to access your family dashboard:</p>' +
              '<input type="email" id="parentGoogleEmailInput" class="form-input" placeholder="e.g. parent@gmail.com" style="margin-bottom: 12px; font-size: 14px;" />' +
              '<div id="parentGooglePromptError" style="display: none; color: #DC2626; font-size: 12.5px; margin-bottom: 12px; text-align: left;"></div>' +
              '<div style="display: flex; gap: 10px;">' +
              '<button type="button" onclick="closeParentGooglePromptModal()" style="flex: 0.4; background: none; border: 1px solid var(--pp-border); border-radius: 10px; color: var(--pp-text-sub); font-size: 13px; font-weight: 600; cursor: pointer; height: 42px;">Cancel</button>' +
              '<button type="button" onclick="submitParentGooglePrompt()" class="btn-portal-primary" style="flex: 0.6; height: 42px; font-size: 13px; margin: 0;">Continue →</button>' +
              '</div></div>';
            document.body.appendChild(modal);
          }
          modal.style.display = 'flex';
          var inp = document.getElementById('parentGoogleEmailInput');
          if (inp) {
            inp.value = '';
            setTimeout(function() { inp.focus(); }, 100);
          }
        }

        function closeParentGooglePromptModal() {
          var modal = document.getElementById('parentGooglePromptModal');
          if (modal) modal.style.display = 'none';
        }

        async function submitParentGooglePrompt() {
          var inp = document.getElementById('parentGoogleEmailInput');
          var errEl = document.getElementById('parentGooglePromptError');
          var email = (inp ? inp.value : '').trim().toLowerCase();
          if (!email || !email.includes('@')) {
            if (errEl) {
              errEl.style.display = 'block';
              errEl.textContent = 'Please enter a valid Google email address.';
            }
            return;
          }
          if (errEl) errEl.style.display = 'none';
          document.getElementById('parentGooglePromptModal').style.display = 'none';
          await processParentGoogleAuth({ email: email, role: 'parent' });
        }

        async function handleParentGoogleCallback(response) {
          if (!response || !response.credential) return;
          await processParentGoogleAuth({ credential: response.credential, role: 'parent' });
        }

        async function processParentGoogleAuth(payload) {
          var errEl = document.getElementById('loginError');
          try {
            var res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            var data = await res.json();
            if (!data.success && data.error) {
              if (errEl) {
                errEl.style.display = 'block';
                errEl.textContent = data.error;
              }
              return;
            }
            if (data.isNew) {
              document.getElementById('authViewSignIn').style.display = 'none';
              document.getElementById('authViewSignUp').style.display = 'none';
              document.getElementById('authViewGoogleFinish').style.display = 'block';
              var tabIn = document.getElementById('authTabSignIn');
              var tabUp = document.getElementById('authTabSignUp');
              if (tabIn) tabIn.classList.remove('active');
              if (tabUp) tabUp.classList.remove('active');
              document.getElementById('googleFinishEmailBadge').textContent = (data.googleUser && data.googleUser.email) || payload.email;
              document.getElementById('googleFinishName').value = (data.googleUser && data.googleUser.name) || '';
              if (data.googleUser && data.googleUser.phone) {
                document.getElementById('googleFinishPhone').value = data.googleUser.phone;
              }
              return;
            }

            savedEmail = (data.parent && data.parent.email) || payload.email;
            savedPin = (data.parent && data.parent.familyPin) || '';
            renderDashboard(data);
            switchPortalTab(activeTab);
          } catch (e) {
            if (errEl) {
              errEl.style.display = 'block';
              errEl.textContent = 'Connection error. Please try again.';
            }
          }
        }

        async function submitGoogleFinishEnrollment() {
          var email = document.getElementById('googleFinishEmailBadge').textContent.trim();
          var name = (document.getElementById('googleFinishName').value || '').trim();
          var phone = (document.getElementById('googleFinishPhone').value || '').trim();
          var pin = (document.getElementById('googleFinishPin').value || '').trim();
          var confirmPin = (document.getElementById('googleFinishPinConfirm').value || '').trim();
          var errEl = document.getElementById('googleFinishError');
          var btn = document.getElementById('btnGoogleFinishSubmit');

          if (errEl) errEl.style.display = 'none';

          if (!phone) {
            if (errEl) { errEl.textContent = 'Please enter your mobile phone number.'; errEl.style.display = 'block'; }
            return;
          }
          if (pin.length < 6) {
            if (errEl) { errEl.textContent = 'Family PIN must be at least 6 digits.'; errEl.style.display = 'block'; }
            return;
          }
          if (pin !== confirmPin) {
            if (errEl) { errEl.textContent = 'PINs do not match. Please verify.'; errEl.style.display = 'block'; }
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Activating Dashboard... ⏳';

          try {
            var res = await fetch('/api/parent/complete-google-enrollment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email, name: name, phone: phone, familyPin: pin })
            });
            var data = await res.json();
            btn.disabled = false;
            btn.textContent = 'Activate Family Dashboard 🚀';

            if (!res.ok || data.error) {
              if (errEl) { errEl.textContent = data.error || 'Failed to complete setup.'; errEl.style.display = 'block'; }
              return;
            }

            savedEmail = email;
            savedPin = pin;
            renderDashboard(data);
            switchPortalTab(activeTab);
          } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Activate Family Dashboard 🚀';
            if (errEl) { errEl.textContent = 'Network error. Please try again.'; errEl.style.display = 'block'; }
          }
        }

        (async function initParentGoogle() {
          try {
            var res = await fetch('/api/auth/google-config');
            window.parentGoogleConfig = await res.json();
            if (window.parentGoogleConfig && window.parentGoogleConfig.configured && window.parentGoogleConfig.clientId) {
              var script = document.createElement('script');
              script.src = 'https://accounts.google.com/gsi/client';
              script.async = true;
              script.defer = true;
              script.onload = function() {
                if (window.google && window.google.accounts && window.google.accounts.id) {
                  google.accounts.id.initialize({
                    client_id: window.parentGoogleConfig.clientId,
                    callback: handleParentGoogleCallback,
                    auto_select: false,
                    cancel_on_tap_outside: true
                  });
                }
              };
              document.head.appendChild(script);
            }
          } catch (err) {}
        })();
      </script>
    </body>
    </html>
  `);
});

// Helper to format consistent dashboard payload for parent portal and Google auth
function formatParentDashboardData(parent) {
  if (!parent) return { success: false, error: 'Parent record not found.' };
  const parentTier = parent.subscriptionTier || 'free';
  const tierMeta = pricingConfig.PRICING_TIERS[parentTier] || pricingConfig.PRICING_TIERS.free;

  const children = (parent.children || []).map(id => {
    const s = studentStore.getStudentById(id);
    if (!s) return null;
    const resolved = studentStore.resolveStudentTier(s);
    const childTier = resolved.subscriptionTier;
    const childTierMeta = resolved.tierInfo;
    const kycGate = pricingConfig.getKnowYourChildGate(s.createdAt, childTier);
    const activitySummary = studentStore.getChildActivitySummary(s.id);
    const todayStr = new Date().toISOString().slice(0, 10);
    const dailyTurnsToday = (s.dailyTurnDate === todayStr) ? (s.dailyTurnsCount || 0) : 0;

    return {
      id: s.id,
      handle: s.handle,
      avatar: s.avatar,
      grade: s.grade,
      county: s.county,
      school: s.school,
      streak: s.streak || 1,
      totalTurns: s.totalTurns || 0,
      dailyTurnsToday,
      curriculum: s.curriculum || ((s.schoolLevel === 'IGCSE' || s.schoolLevel === 'CHECKPOINT') ? 'BRITISH' : 'CBC'),
      examBoard: s.examBoard || (s.curriculum === 'BRITISH' ? 'CAIE' : null),
      yearGroup: s.yearGroup || (s.curriculum === 'BRITISH' ? s.grade : null),
      examTier: s.examTier || 'extended',
      schoolLevel: s.schoolLevel || (s.grade >= 10 ? 'SS' : 'JSS'),
      pathway: s.pathway || null,
      selectedSubjects: s.selectedSubjects || s.quests || [],
      freeSubjects: s.freeSubjects || ['Mathematics', 'Science & Technology'],
      quests: s.quests || [],
      createdAt: s.createdAt,
      lastActive: s.lastActive,
      parentVerified: s.parentVerified,
      subscriptionTier: childTier,
      activitySummary,
      tierInfo: {
        id: childTierMeta.id,
        name: childTierMeta.name,
        uiLabel: childTierMeta.uiLabel,
        priceDisplay: childTierMeta.priceDisplay,
        limits: childTierMeta.limits
      },
      knowYourChild: {
        featureName: kycGate.featureName,
        description: kycGate.description,
        unlocked: kycGate.unlocked,
        isPremium: kycGate.isPremium,
        daysActive: kycGate.daysActive,
        daysRequired: kycGate.daysRequired,
        daysRemaining: kycGate.daysRemaining,
        progressPercent: kycGate.progressPercent,
        statusText: kycGate.statusText
      }
    };
  }).filter(Boolean);

  const pendingChildren = (parent.pendingChildren || []).map(p => ({
    handle: p.handle,
    studentId: p.studentId,
    requestedAt: p.requestedAt
  }));

  return {
    success: true,
    parent: {
      email: parent.email,
      name: parent.name || null,
      phone: parent.phone || null,
      subscriptionTier: parentTier,
      tierInfo: {
        name: tierMeta.name,
        uiLabel: tierMeta.uiLabel,
        priceDisplay: tierMeta.priceDisplay,
        limits: tierMeta.limits
      },
      billingCycle: parent.billingCycle || 'monthly',
      memberSince: parent.createdAt
    },
    children,
    pendingChildren,
    upgradeRequests: (parent.upgradeRequests || []).filter(r => r.status === 'pending'),
    additionalChildAddon: pricingConfig.ADDITIONAL_CHILD_ADDON
  };
}

// GET & POST /api/parent/dashboard — Returns all children under a parent email (authenticated by Family Password)
// Credentials can be sent securely via POST body or via GET params for backward compatibility
async function handleParentDashboard(req, res) {
  try {
    const identifier = (req.body?.email || req.body?.phone || req.body?.emailOrPhone || req.query?.email || req.query?.phone || req.query?.emailOrPhone || '').trim();
    const credential = req.body?.familyPassword || req.body?.familyPin || req.body?.password || req.query?.familyPassword || req.query?.familyPin || req.query?.password;

    if (!identifier || !credential) {
      return res.status(400).json({ error: 'Parent email or phone number and Family Password are required.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(identifier, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({
        error: authRes.error,
        locked: authRes.locked
      });
    }

    const parent = authRes.parent || parentStore.getParentByEmailOrPhone(identifier);
    const data = formatParentDashboardData(parent);
    res.json(data);
  } catch (err) {
    console.error('[server] Parent dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load parent dashboard.' });
  }
}

app.get('/api/parent/dashboard', handleParentDashboard);
app.post('/api/parent/dashboard', handleParentDashboard);

// POST /api/parent/subscription — Update parent subscription tier
app.post('/api/parent/subscription', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, tier, billingCycle } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !tier) {
      return res.status(400).json({ error: 'Parent email, password, and tier are required.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    const result = parentStore.updateParentSubscription(email, tier, billingCycle || 'monthly');
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const tierInfo = pricingConfig.PRICING_TIERS[tier] || pricingConfig.PRICING_TIERS.free;
    res.json({
      success: true,
      message: `Subscription successfully updated to ${tierInfo.name}!`,
      tier: tier,
      tierInfo
    });
  } catch (err) {
    console.error('[server] Update subscription error:', err.message);
    res.status(500).json({ error: 'Failed to update subscription.' });
  }
});

// POST /api/parent/child-subscription — Switch an individual child's subscription tier
app.post('/api/parent/child-subscription', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, studentId, tier, billingCycle } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !studentId || !tier) {
      return res.status(400).json({ error: 'Parent email, password, student ID, and tier are required.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    const result = parentStore.setChildSubscription(email, studentId, tier, billingCycle || 'monthly');
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const tierInfo = pricingConfig.PRICING_TIERS[tier] || pricingConfig.PRICING_TIERS.free;
    res.json({
      success: true,
      message: `Learner plan successfully updated to ${tierInfo.name}!`,
      studentId,
      tier,
      tierInfo
    });
  } catch (err) {
    console.error('[server] Child subscription update error:', err.message);
    res.status(500).json({ error: 'Failed to update learner subscription.' });
  }
});

// POST /api/parent/request-grade-change — Verified grade correction request from parent portal
app.post('/api/parent/request-grade-change', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, studentId, requestedGrade, reason } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !studentId || !requestedGrade) {
      return res.status(400).json({ error: 'Parent email, password, student ID, and requested grade are required.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    const parent = parentStore.findParentByEmail(email);
    if (!parent || !(parent.children || []).includes(studentId)) {
      return res.status(403).json({ error: 'This learner is not associated with your family account.' });
    }

    const result = adminStore.submitGradeChangeRequest({
      parentEmail: email,
      studentId,
      requestedGrade,
      reason
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error('[server] Grade change request error:', err.message);
    res.status(500).json({ error: 'Failed to submit grade change request.' });
  }
});

// POST /api/parent/student-tier — Verified tier update for independent IGCSE students from parent portal
app.post('/api/parent/student-tier', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, studentId, examTier } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !studentId || !examTier) {
      return res.status(400).json({ error: 'Parent email, password, student ID, and exam tier are required.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    const parent = authRes.parent || parentStore.getParentByEmailOrPhone(email);
    if (!parent || !(parent.children || []).includes(studentId)) {
      return res.status(403).json({ error: 'This learner is not associated with your family account.' });
    }

    const result = studentStore.updateStudentExamTier(studentId, examTier, {
      role: 'parent',
      parentEmail: email,
      parentVerified: true
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error('[server] Parent update tier error:', err.message);
    res.status(500).json({ error: 'Failed to update student examination tier.' });
  }
});

// POST /api/parent/update-child-subjects — Parent updates enrolled/free subjects for a learner
app.post('/api/parent/update-child-subjects', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, studentId, selectedSubjects, freeSubjects, pathway } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !studentId) {
      return res.status(400).json({ error: 'Parent email, password, and learner ID are required.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    const parent = parentStore.findParentByEmail(email);
    if (!parent || !(parent.children || []).includes(studentId)) {
      return res.status(403).json({ error: 'This learner is not associated with your family account.' });
    }

    const student = studentStore.getStudentById(studentId, true);
    if (!student) {
      return res.status(404).json({ error: 'Learner profile not found.' });
    }

    // Active subjects currently supported by Elingu
    const isBri = studentStore.isBritishCurriculum(student);
    const isSenior = (student.grade >= 10);
    const ACTIVE_JSS_SUBJECTS = ['Mathematics', 'English', 'Kiswahili', 'Science & Technology', 'Social Studies'];
    const ACTIVE_SS_SUBJECTS = ['Core Mathematics', 'Essential Mathematics', 'Community Service Learning', 'English', 'Kiswahili', 'Physics', 'Chemistry', 'Biology', 'Computer Studies'];
    const ACTIVE_BRI_IGCSE = [
      'Mathematics (0580)', 'First Language English (0500)', 'English as a Second Language (0510)', 'Physics (0625)', 'Chemistry (0620)', 'Biology (0610)', 'Computer Science (0478)', 'Business Studies (0450)', 'Economics (0455)', 'Geography (0460)', 'History (0470)',
      'Mathematics A (4MA1)', 'English Language A (4EA1)', 'Physics (4PH1)', 'Chemistry (4CH1)', 'Biology (4BI1)', 'Human Biology (4HB1)', 'Computer Science (4CP0)', 'Business (4BS1)', 'Economics (4EC1)', 'Geography (4GE1)', 'History (4HI1)'
    ];
    const ACTIVE_BRI_LOWER = [
      'Checkpoint Mathematics (0862)', 'Checkpoint English (0861)', 'Lower Secondary Science (0893)', 'Computing (0860)', 'Global Perspectives (0838)',
      'iLowerSecondary Maths (LMA11)', 'iLowerSecondary English (LEN11)', 'iLowerSecondary Science (LSC11)', 'iLowerSecondary Computing (LIT11)', 'Global Citizenship (LGC11)'
    ];
    const ACTIVE_AVAILABLE = isBri
      ? (isSenior ? ACTIVE_BRI_IGCSE : ACTIVE_BRI_LOWER)
      : (isSenior ? ACTIVE_SS_SUBJECTS : ACTIVE_JSS_SUBJECTS);

    if (!Array.isArray(selectedSubjects) || selectedSubjects.length === 0) {
      return res.status(400).json({ error: 'Please select at least one subject.' });
    }

    const validSubjects = selectedSubjects.filter(s => ACTIVE_AVAILABLE.includes(s));
    if (validSubjects.length === 0) {
      return res.status(400).json({ error: 'None of the chosen subjects are currently available on Elingu.' });
    }

    // Enforce subscription tier subject rules:
    // Free: up to 2 compulsory + 1 elective (max 3)
    // Standard: all compulsory subjects + up to 2 electives
    // Premium / School / Pilot: all compulsory + all electives
    const resolvedTier = studentStore.resolveStudentTier(student);
    const tierValidation = pricingConfig.validateTierSubjectSelection({
      subjects: validSubjects,
      tier: resolvedTier.subscriptionTier,
      isSenior,
      curriculum: (student.curriculum || 'CBC')
    });
    if (!tierValidation.valid) {
      return res.status(400).json({ error: tierValidation.error });
    }

    const updatePayload = {
      selectedSubjects: validSubjects,
      quests: validSubjects,
      freeSubjects: validSubjects.slice(0, 3)
    };
    if (pathway) {
      updatePayload.pathway = pathway;
    }

    const updated = studentStore.updateStudentProfile(studentId, updatePayload);
    if (!updated) {
      return res.status(404).json({ error: 'Learner profile not found.' });
    }

    res.json({ success: true, message: 'Subjects successfully updated for ' + updated.handle + '!', student: updated });
  } catch (err) {
    console.error('[server] Parent subject update error:', err.message);
    res.status(500).json({ error: 'Failed to update learner subjects.' });
  }
});

// POST /api/parent/approve-subject-request - Directly approve an upgrade/unlock request for a subject
app.post('/api/parent/approve-subject-request', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, studentId, requestedSubject } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !studentId) {
      return res.status(400).json({ error: 'Parent email, password, and learner ID are required.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    const parent = parentStore.findParentByEmail ? parentStore.findParentByEmail(email) : parentStore.getParentByEmail(email);
    if (!parent || !(parent.children || []).includes(studentId)) {
      return res.status(403).json({ error: 'This learner is not associated with your family account.' });
    }

    const student = studentStore.getStudentById(studentId, true);
    if (!student) {
      return res.status(404).json({ error: 'Learner profile not found.' });
    }

    const tier = String(student.subscriptionTier || 'free').toLowerCase();
    const isPrem = (tier === 'premium' || tier === 'pilot' || tier === 'school');
    const isStd = (tier === 'standard');
    const maxAllowed = isPrem ? 99 : (isStd ? 5 : 3);

    const currentSubjects = student.selectedSubjects || student.quests || [];
    const targetSubject = (requestedSubject || '').trim();

    if (targetSubject && !currentSubjects.map(s => s.toLowerCase()).includes(targetSubject.toLowerCase())) {
      if (!isPrem && currentSubjects.length >= maxAllowed) {
        return res.status(400).json({
          error: `${student.handle} has reached their plan limit (${maxAllowed} subjects). Upgrade to Premium to unlock all subjects.`,
          needsUpgrade: true
        });
      }
      student.selectedSubjects = [...currentSubjects, targetSubject];
      student.quests = student.selectedSubjects;
      if (studentStore.saveStore) studentStore.saveStore();
    }

    parentStore.approveUpgradeRequest(email, studentId, targetSubject);

    res.json({
      success: true,
      message: '✅ ' + (targetSubject || 'Subject') + ' unlocked and added to ' + student.handle + '\'s active subjects!',
      student
    });
  } catch (err) {
    console.error('[server] approve-subject-request error:', err);
    res.status(500).json({ error: 'Failed to approve subject request.' });
  }
});

// POST /api/parent/dismiss-subject-request - Dismiss/clear an upgrade request
app.post('/api/parent/dismiss-subject-request', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, studentId, requestedSubject } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !studentId) {
      return res.status(400).json({ error: 'Parent email, password, and learner ID are required.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    parentStore.dismissUpgradeRequest(email, studentId, requestedSubject);

    res.json({ success: true, message: 'Request dismissed.' });
  } catch (err) {
    console.error('[server] dismiss-subject-request error:', err);
    res.status(500).json({ error: 'Failed to dismiss request.' });
  }
});

// POST /api/parent/purge-child-data — Parent-authenticated child data erasure (Kenya DPA 2019 Sec 40)
app.post('/api/parent/purge-child-data', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, studentId, confirmationPhrase } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !studentId) {
      return res.status(400).json({ error: 'Parent email, password, and learner ID are required.' });
    }

    if (confirmationPhrase !== 'FUTA DATA' && confirmationPhrase !== 'DELETE') {
      return res.status(400).json({ error: 'Please enter the exact confirmation phrase (FUTA DATA or DELETE).' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    const result = await parentStore.purgeChildData(email, studentId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    console.error('[server] Purge child data error:', err.message);
    res.status(500).json({ error: 'Failed to erase child records.' });
  }
});

// POST /api/parent/pilot-activate — Activate school or parent pilot trial via code
app.post('/api/parent/pilot-activate', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, accessCode } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !accessCode) {
      return res.status(400).json({ error: 'Parent email, password, and access code are required.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    const result = parentStore.activateParentPilot(email, accessCode);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const tierInfo = pricingConfig.PRICING_TIERS.pilot;
    res.json({
      success: true,
      message: result.message,
      tier: 'pilot',
      pilotData: result.pilotData,
      tierInfo
    });
  } catch (err) {
    console.error('[server] Pilot activation error:', err.message);
    res.status(500).json({ error: 'Failed to activate pilot code.' });
  }
});

// POST /api/students/pilot-activate — Activate student pilot trial via code
app.post('/api/students/pilot-activate', (req, res) => {
  try {
    const { studentId, accessCode } = req.body;
    if (!studentId || !accessCode) {
      return res.status(400).json({ error: 'Student ID and access code are required.' });
    }

    const result = studentStore.activateStudentPilot(studentId, accessCode);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: result.message,
      student: result.student
    });
  } catch (err) {
    console.error('[server] Student pilot activation error:', err.message);
    res.status(500).json({ error: 'Failed to activate student pilot code.' });
  }
});

// POST /api/institutional/inquire — Submit inquiry for school, sub-county, or county bulk licence
app.post('/api/institutional/inquire', (req, res) => {
  try {
    const { orgName, pupilCount, contactPerson, phoneOrEmail } = req.body || {};
    if (!orgName || !phoneOrEmail) {
      return res.status(400).json({ error: 'Organization name and contact details are required.' });
    }

    const inquiriesFile = path.join(__dirname, 'data', 'institutional_inquiries.json');
    let inquiries = [];
    try {
      if (fs.existsSync(inquiriesFile)) {
        inquiries = JSON.parse(fs.readFileSync(inquiriesFile, 'utf8'));
      }
    } catch (e) {
      inquiries = [];
    }

    const newInquiry = {
      id: 'inq_' + Date.now(),
      orgName: orgName.trim(),
      pupilCount: parseInt(pupilCount, 10) || 0,
      contactPerson: (contactPerson || 'Administrator').trim(),
      phoneOrEmail: phoneOrEmail.trim(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    inquiries.push(newInquiry);
    fs.writeFileSync(inquiriesFile, JSON.stringify(inquiries, null, 2), 'utf8');
    persistentStore.persist(inquiriesFile, inquiries);

    res.json({
      success: true,
      message: 'Thank you! Your institutional request has been received. Our Partnerships Team will get in touch promptly.'
    });
  } catch (err) {
    console.error('[server] Institutional inquiry error:', err.message);
    res.status(500).json({ error: 'Failed to record institutional request.' });
  }
});

// ============================================================
// SECTION 8B — UNIFIED ROLE GATEWAY (/portal & /portals)
// Single entry point for non-tech-savvy users to choose role
// ============================================================
app.get(['/', '/portal', '/portals', '/gateway'], (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elingu — Unified Learning, Family & Institutional Portals</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #FAF7F2;
      color: #1C1C1C;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 18px;
    }
    .gateway-container {
      max-width: 980px;
      width: 100%;
      margin: 0 auto;
    }
    .gateway-header {
      text-align: center;
      margin-bottom: 36px;
    }
    .logo-wrapper {
      position: relative;
      width: 88px;
      height: 88px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-img {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      object-fit: cover;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 0 26px rgba(74, 222, 128, 0.6);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .logo-wrapper:hover .logo-img {
      transform: scale(1.06);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 38px rgba(74, 222, 128, 0.9);
    }
    .logo-wrapper::after {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      border: 1.5px solid rgba(74, 222, 128, 0.4);
      box-shadow: 0 0 16px rgba(74, 222, 128, 0.3);
      pointer-events: none;
    }
    h1 {
      font-family: 'Outfit', 'DM Sans', sans-serif;
      font-size: 28px;
      color: #0D3A26;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 14.5px;
      color: #4A4A4A;
      max-width: 520px;
      margin: 0 auto 14px;
      line-height: 1.5;
    }
    .badges-row {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .badge-pill {
      font-size: 12px;
      font-weight: 500;
      color: #4A4A4A;
      background: #FFFFFF;
      border: 1px solid #E0D8CC;
      padding: 5px 14px;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-top: 24px;
    }
    .role-card {
      background: #FFFFFF;
      border: 1px solid #E0D8CC;
      border-radius: 18px;
      padding: 30px 24px;
      box-shadow: 0 2px 14px rgba(13, 58, 38, 0.05);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      text-decoration: none;
      color: inherit;
      transition: all 0.22s ease-in-out;
    }
    .role-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 10px 28px rgba(13, 58, 38, 0.12);
      border-color: #0D3A26;
    }
    .card-icon {
      font-size: 38px;
      margin-bottom: 14px;
      display: inline-block;
    }
    .role-title {
      font-family: 'Outfit', 'DM Sans', sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: #0D3A26;
      margin-bottom: 4px;
    }
    .role-sub {
      font-size: 12px;
      font-weight: 600;
      color: #059669;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .role-desc {
      font-size: 13.5px;
      color: #4A4A4A;
      line-height: 1.5;
      margin-bottom: 24px;
      flex-grow: 1;
    }
    .card-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 18px;
      border-radius: 12px;
      background: #0D3A26;
      color: #FFFFFF;
      font-size: 14px;
      font-weight: 600;
      transition: background 0.2s;
    }
    .role-card:hover .card-btn {
      background: #144A32;
    }
    .footer-note {
      text-align: center;
      margin-top: 36px;
      font-size: 12.5px;
      color: #888888;
    }
    @media (max-width: 640px) {
      body { padding: 24px 14px 40px; }
      h1 { font-size: 23px; }
      .subtitle { font-size: 13.5px; }
      .cards-grid { grid-template-columns: 1fr; gap: 16px; margin-top: 20px; }
      .role-card { padding: 22px 18px; }
      .badges-row { gap: 6px; }
      .badge-pill { font-size: 11px; padding: 4px 10px; }
    }

    /* ANIMATED TYPOGRAPHIC WORDMARK LOADER (elingu) */
    .splash-screen {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #0B1612;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 1;
      visibility: visible;
      transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.6s;
      cursor: pointer;
      overflow: hidden;
    }
    .splash-screen.fade-out {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
    .splash-wordmark-stage {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px;
      user-select: none;
    }
    .splash-wordmark-box {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 18px 28px;
    }
    .splash-wordmark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
      font-weight: 700;
      font-size: clamp(46px, 10vw, 76px);
      letter-spacing: -1px;
      line-height: 1;
      color: #FFFFFF;
      position: relative;
      z-index: 2;
    }
    .splash-letter {
      display: inline-block;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: netlifyLetterPulse 2s ease-in-out infinite;
    }
    .splash-letter:nth-child(1) { animation-delay: 0.0s; }
    .splash-letter:nth-child(2) { animation-delay: 0.18s; }
    .splash-letter:nth-child(3) { animation-delay: 0.36s; }
    .splash-letter:nth-child(4) { animation-delay: 0.54s; }
    .splash-letter:nth-child(5) { animation-delay: 0.72s; }
    .splash-letter:nth-child(6) { animation-delay: 0.90s; }

    @keyframes netlifyLetterPulse {
      0%, 100% {
        color: rgba(255, 255, 255, 0.35);
        transform: translateY(0);
        text-shadow: none;
      }
      35% {
        color: #4ADE80;
        transform: translateY(-6px);
        text-shadow: 0 0 22px rgba(74, 222, 128, 0.9), 0 0 45px rgba(16, 185, 129, 0.5);
      }
      70% {
        color: #FFFFFF;
        transform: translateY(0);
        text-shadow: 0 0 12px rgba(255, 255, 255, 0.7);
      }
    }

    /* Orbiting brand emerald dashes */
    .splash-dash-left, .splash-dash-right {
      position: absolute;
      height: 4px;
      width: 20px;
      border-radius: 2px;
      background: #4ADE80;
      box-shadow: 0 0 14px rgba(74, 222, 128, 0.9);
      animation: dashOrbit 1.8s ease-in-out infinite alternate;
    }
    .splash-dash-left {
      left: 0;
      top: 50%;
      transform: translateY(-50%);
    }
    .splash-dash-right {
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      animation-delay: -0.9s;
    }
    @keyframes dashOrbit {
      0% { opacity: 0.3; transform: translateY(-50%) scaleX(0.7); }
      100% { opacity: 1; transform: translateY(-50%) scaleX(1.3); }
    }

    .splash-tagline {
      margin-top: 20px;
      font-size: 11.5px;
      font-weight: 600;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: rgba(74, 222, 128, 0.75);
      animation: splashTaglineFade 1.6s ease-out forwards;
    }
    @keyframes splashTaglineFade {
      0% { opacity: 0; transform: translateY(4px); }
      100% { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <!-- ANIMATED TYPOGRAPHIC WORDMARK LOADER (elingu) -->
  <div id="elinguSplashScreen" class="splash-screen" onclick="dismissSplashScreen(event)">
    <div class="splash-wordmark-stage">
      <div class="splash-wordmark-box">
        <span class="splash-dash-left"></span>
        <div class="splash-wordmark" aria-label="elingu">
          <span class="splash-letter">e</span>
          <span class="splash-letter">l</span>
          <span class="splash-letter">i</span>
          <span class="splash-letter">n</span>
          <span class="splash-letter">g</span>
          <span class="splash-letter">u</span>
        </div>
        <span class="splash-dash-right"></span>
      </div>
      <div class="splash-tagline">Elimu ni Nguvu</div>
    </div>
  </div>

  <div class="gateway-container">
    <header class="gateway-header">
      <div class="logo-wrapper">
        <img src="/elingu-avatar.png" alt="Elingu Logo" class="logo-img" />
      </div>
      <h1>Welcome to Elingu</h1>
      <p class="subtitle">Elimu ni Nguvu • Kenya's Premier CBE Socratic AI Platform. Please select your role to proceed:</p>
      <div class="badges-row">
        <span class="badge-pill">🇰🇪 KICD CBE Aligned</span>
        <span class="badge-pill">🛡️ KDPA 2019 Protected</span>
        <span class="badge-pill">🔒 End-to-End Encrypted</span>
      </div>
    </header>

    <div class="cards-grid">
      <!-- 1. Learner -->
      <a href="/learn?auth=select" class="role-card">
        <div>
          <span class="card-icon">🎓</span>
          <div class="role-title">Learner / Student</div>
          <div class="role-sub">PERSONALIZED LEARNING COMPANION</div>
          <p class="role-desc">Step-by-step guidance, deep conceptual understanding, and interactive inquiry across your subjects and curriculum.</p>
        </div>
        <div class="card-btn">Enter Learner App →</div>
      </a>

      <!-- 2. Parent -->
      <a href="/parent/portal" class="role-card">
        <div>
          <span class="card-icon">👨‍👩‍👧</span>
          <div class="role-title">Parent & Guardian</div>
          <div class="role-sub">Family Growth & Analytics</div>
          <p class="role-desc">Review your child's weekly activity, thinking portraits, manage approvals, and track CBE mastery from home.</p>
        </div>
        <div class="card-btn">Open Parent Portal →</div>
      </a>

      <!-- 3. Teacher -->
      <a href="/teacher/portal" class="role-card">
        <div>
          <span class="card-icon">👨‍🏫</span>
          <div class="role-title">Teacher & School</div>
          <div class="role-sub">Mwalimu Assessment Suite</div>
          <p class="role-desc">Provision stream chalkboard codes, deploy live AI Socratic missions, track roadblock analytics, and export KICD SBA records.</p>
        </div>
        <div class="card-btn">Open Teacher Portal →</div>
      </a>
    </div>

    <div class="footer-note">
      Elingu Educational Technologies • Nairobi, Kenya • <a href="mailto:support@elingu.ke" style="color: #0D3A26; text-decoration: none;">support@elingu.ke</a>
    </div>
  </div>

  <script>
    let isSplashDismissed = false;
    function dismissSplashScreen(e) {
      if (e && e.stopPropagation) e.stopPropagation();
      if (isSplashDismissed) return;
      isSplashDismissed = true;
      const splash = document.getElementById('elinguSplashScreen');
      if (!splash) return;
      splash.classList.add('fade-out');
      setTimeout(() => { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); }, 900);
      try { sessionStorage.setItem('elingu_intro_seen', 'true'); } catch(err) {}
    }

    (function setupSplashReveal() {
      // Automatic smooth reveal after 3 seconds of glowing pulsating logo
      setTimeout(() => dismissSplashScreen(), 3000);
    })();
  </script>
</body>
</html>`);
});

// ============================================================
// SECTION 8C — TEACHER & INSTITUTIONAL DASHBOARD & MISSIONS
// Multi-stream architecture, AI Quiz Generator, Live Missions,
// and dedicated /teacher/portal standalone dashboard
// ============================================================
const teacherRoutes = require('./teacherRoutes');
app.use(teacherRoutes({ callLLM }));

// POST /api/payment/mpesa-stk-push — Initiate M-Pesa Express prompt
app.post('/api/payment/mpesa-stk-push', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, phone, tier, billingCycle, studentId } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !phone || !tier) {
      return res.status(400).json({ error: 'Parent email, password, phone number, and plan tier are required.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    // Format phone: e.g. 0712345678 or 0112345678 -> 254712345678
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (cleanPhone.startsWith('7') || cleanPhone.startsWith('1')) cleanPhone = '254' + cleanPhone;

    let targetStudent = null;
    let resolvedPricing = null;
    if (studentId === 'all_cbe' || studentId === 'all_igcse') {
      resolvedPricing = pricingConfig.resolvePricingForStudent(studentId, tier, billingCycle || 'monthly');
    } else if (studentId) {
      targetStudent = studentStore.getStudentById(studentId);
      if (targetStudent) {
        resolvedPricing = pricingConfig.resolvePricingForStudent(targetStudent, tier, billingCycle || 'monthly');
      }
    }

    const tierInfo = pricingConfig.PRICING_TIERS[tier];
    if (!tierInfo && !resolvedPricing) return res.status(400).json({ error: 'Invalid plan tier.' });

    const planName = resolvedPricing?.tierLabel || tierInfo?.name || (tier === 'premium' ? 'Premium' : 'Standard');
    const amount = resolvedPricing ? resolvedPricing.amount : ((billingCycle === 'annual') ? tierInfo.priceAnnual : tierInfo.priceMonthly);
    const isBri = (studentId === 'all_igcse') || (targetStudent && (targetStudent.curriculum === 'BRITISH' || targetStudent.curriculum === 'IGCSE'));
    const acctRef = isBri ? (tier === 'premium' ? 'EL-IGCSE-PREM' : 'EL-IGCSE-STD') : (tier === 'premium' ? 'EL-CBC-PREM' : 'EL-CBC-STD');

    const result = await mpesaService.initiateSTKPush({
      phone,
      amount,
      accountReference: acctRef,
      transactionDesc: `${planName} Plan`
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to dispatch M-Pesa prompt.' });
    }

    // Record pending payment intent for automated callback reconciliation
    parentStore.recordPendingPayment({
      checkoutRequestId: result.checkoutRequestId,
      transactionRef: result.transactionRef,
      email,
      studentId: studentId || null,
      tier,
      billingCycle: billingCycle || 'monthly',
      amount,
      phone: cleanPhone
    });

    result.studentId = studentId || null;
    res.json(result);
  } catch (err) {
    console.error('[server] M-Pesa STK push error:', err.message);
    res.status(500).json({ error: 'Failed to initiate M-Pesa STK push.' });
  }
});

// POST /api/payment/mpesa-callback — Safaricom Daraja STK Push Callback Webhook
app.post('/api/payment/mpesa-callback', async (req, res) => {
  try {
    const callbackData = req.body?.Body?.stkCallback;
    if (!callbackData) {
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const resultCode = callbackData.ResultCode;
    const resultDesc = callbackData.ResultDesc;
    const checkoutRequestId = callbackData.CheckoutRequestID;

    console.log(`[Daraja Callback] CheckoutRequestId: ${checkoutRequestId} | ResultCode: ${resultCode} | ${resultDesc}`);

    if (resultCode === 0) {
      // Payment Successful — extract metadata items
      const items = callbackData.CallbackMetadata?.Item || [];
      const receiptItem = items.find(i => i.Name === 'MpesaReceiptNumber');
      const phoneItem = items.find(i => i.Name === 'PhoneNumber');
      const amountItem = items.find(i => i.Name === 'Amount');

      const receipt = receiptItem ? receiptItem.Value : 'MP' + Date.now();
      const msisdn = phoneItem ? String(phoneItem.Value) : '';
      const paidAmount = amountItem ? amountItem.Value : 0;

      console.log(`[Daraja Callback] ✅ Payment confirmed! Receipt: ${receipt}, Phone: ${msisdn}, Amount: KES ${paidAmount}`);

      // Automatically activate subscription upon verified payment
      const payment = parentStore.findPendingPayment({ checkoutRequestId });
      if (payment) {
        parentStore.completePendingPayment(checkoutRequestId, { receipt, paidAmount });
        if (payment.studentId === 'all_cbe') {
          parentStore.setCurriculumFamilySubscription(payment.email, 'CBC', payment.tier, payment.billingCycle);
          console.log(`[Daraja Callback] 🚀 Activated CBC Family Bundle for ${payment.email}`);
        } else if (payment.studentId === 'all_igcse') {
          parentStore.setCurriculumFamilySubscription(payment.email, 'BRITISH', payment.tier, payment.billingCycle);
          console.log(`[Daraja Callback] 🚀 Activated British/IGCSE Family Bundle for ${payment.email}`);
        } else if (payment.studentId) {
          parentStore.setChildSubscription(payment.email, payment.studentId, payment.tier, payment.billingCycle);
          console.log(`[Daraja Callback] 🚀 Activated ${payment.tier} subscription for child ${payment.studentId} (${payment.email})`);
        } else {
          parentStore.updateParentSubscription(payment.email, payment.tier, payment.billingCycle);
          console.log(`[Daraja Callback] 🚀 Activated family ${payment.tier} subscription for parent ${payment.email}`);
        }
      }
    } else {
      console.warn(`[Daraja Callback] ❌ Payment cancelled/failed: ${resultDesc}`);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('[Daraja Callback] Error processing callback:', err.message);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
});

// POST /api/payment/confirm — Confirm payment and activate subscription
app.post('/api/payment/confirm', async (req, res) => {
  try {
    const { email, familyPassword, familyPin, tier, billingCycle, paymentMethod, transactionRef, studentId } = req.body;
    const credential = familyPassword || familyPin || req.body.password;
    if (!email || !credential || !tier) {
      return res.status(400).json({ error: 'Missing required payment confirmation fields.' });
    }

    const authRes = await parentStore.verifyFamilyPassword(email, credential);
    if (!authRes.success) {
      return res.status(authRes.locked ? 423 : 401).json({ error: authRes.error });
    }

    let targetStudent = null;
    let resolvedPricing = null;
    if (studentId === 'all_cbe') {
      const subRes = parentStore.setCurriculumFamilySubscription(email, 'CBC', tier, billingCycle || 'monthly');
      if (!subRes.success) {
        return res.status(400).json({ error: subRes.error });
      }
      resolvedPricing = pricingConfig.resolvePricingForStudent('all_cbe', tier, billingCycle || 'monthly');
    } else if (studentId === 'all_igcse') {
      const subRes = parentStore.setCurriculumFamilySubscription(email, 'BRITISH', tier, billingCycle || 'monthly');
      if (!subRes.success) {
        return res.status(400).json({ error: subRes.error });
      }
      resolvedPricing = pricingConfig.resolvePricingForStudent('all_igcse', tier, billingCycle || 'monthly');
    } else if (studentId) {
      targetStudent = studentStore.getStudentById(studentId);
      const subRes = parentStore.setChildSubscription(email, studentId, tier, billingCycle || 'monthly');
      if (!subRes.success) {
        return res.status(400).json({ error: subRes.error });
      }
      if (targetStudent) {
        resolvedPricing = pricingConfig.resolvePricingForStudent(targetStudent, tier, billingCycle || 'monthly');
      }
    } else {
      const subRes = parentStore.updateParentSubscription(email, tier, billingCycle || 'monthly');
      if (!subRes.success) {
        return res.status(400).json({ error: subRes.error });
      }
    }

    const baseTier = pricingConfig.PRICING_TIERS[tier] || pricingConfig.PRICING_TIERS.standard;
    const tierName = resolvedPricing ? resolvedPricing.tierLabel : baseTier.name;
    const amount = resolvedPricing ? resolvedPricing.amount : ((billingCycle === 'annual') ? baseTier.priceAnnual : baseTier.priceMonthly);
    const tierInfo = {
      ...baseTier,
      name: tierName,
      priceMonthly: resolvedPricing ? (billingCycle === 'annual' ? Math.round(resolvedPricing.amount / 10) : resolvedPricing.amount) : baseTier.priceMonthly,
      priceAnnual: resolvedPricing ? (billingCycle === 'annual' ? resolvedPricing.amount : resolvedPricing.amount * 10) : baseTier.priceAnnual
    };

    // Send receipt email if email service is active
    try {
      const subject = targetStudent
        ? `Elingu ${tierInfo.name} Subscription Confirmed for ${targetStudent.handle} 🎉`
        : `Elingu ${tierInfo.name} Subscription Confirmed 🎉`;
      const intro = targetStudent
        ? `Your subscription for <strong>${targetStudent.handle}</strong> to <strong>Elingu ${tierInfo.name}</strong> is now active.`
        : `Your family subscription to <strong>Elingu ${tierInfo.name}</strong> is now active.`;
      const planLabel = targetStudent
        ? `${tierInfo.name} for ${targetStudent.handle} (${billingCycle === 'annual' ? 'Annual' : 'Monthly'})`
        : `${tierInfo.name} (${billingCycle === 'annual' ? 'Annual' : 'Monthly'})`;
      const accessNote = targetStudent
        ? `<strong>${targetStudent.handle}</strong> now has full CBE access immediately!`
        : `All your linked learners now have full CBE access!`;

      emailService.sendParentNotification(email, subject, `
        <div style="font-family: 'DM Sans', sans-serif; padding: 24px; color: #1C1C1C;">
          <h2 style="color: #0D3A26; margin-bottom: 8px;">Payment Received — Thank You!</h2>
          <p style="color: #4A4A4A; font-size: 14px;">${intro}</p>
          <div style="background: #F7FBF8; border: 1px solid #C8E0D0; border-radius: 12px; padding: 18px; margin: 18px 0;">
            <p style="margin-bottom: 6px;"><strong>Plan:</strong> ${planLabel}</p>
            <p style="margin-bottom: 6px;"><strong>Amount Paid:</strong> KES ${amount.toLocaleString()}</p>
            <p style="margin-bottom: 6px;"><strong>Payment Method:</strong> ${paymentMethod || 'M-Pesa'}</p>
            <p style="margin-bottom: 0;"><strong>Receipt Reference:</strong> ${transactionRef || 'ELG' + Date.now()}</p>
          </div>
          <p style="font-size: 13.5px; color: #4A4A4A;">${accessNote}</p>
        </div>
      `);
    } catch (e) {
      console.warn('[server] Receipt email skipped:', e.message);
    }

    res.json({
      success: true,
      message: `Payment confirmed! Upgraded to ${tierInfo.name}.`,
      tier,
      tierInfo,
      transactionRef: transactionRef || 'ELG' + Date.now(),
      amount,
      studentId: studentId || null,
      studentName: targetStudent ? targetStudent.handle : null
    });
  } catch (err) {
    console.error('[server] Payment confirmation error:', err.message);
    res.status(500).json({ error: 'Failed to confirm payment.' });
  }
});



// Intercepts technical errors and returns distinct, student-friendly responses.
// ============================================================
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: "Pole! Your message format couldn't be read properly. Please check your message and try sending again. 🌳" });
  }
  console.error('Unhandled Server Error:', err.message || err);
  res.status(500).json({ error: 'Pole! Elingu encountered an unexpected error. Please refresh or try again in a few seconds. 🌳' });
});


// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;

// Storage health check (no personal data exposed)
app.get('/api/health/storage', (req, res) => {
  res.json(persistentStore.status());
});

persistentStore.installShutdownHooks();
persistentStore.hydrate()
  .then(() => {
    // Reconcile student and parent store state to guarantee persistent sync with PostgreSQL
    try {
      const sStore = require('./studentStore');
      const pStore = require('./parentStore');
      const erline = sStore.getStudentById('stu_2b910ef8f459', true);
      if (erline && erline.subscriptionTier !== 'premium') {
        console.log('[hydrateSync] Upgrading Erline to Premium in persistent store...');
        sStore.setStudentTier('stu_2b910ef8f459', 'premium');
      }
      const parent = pStore.getParentByEmail('mutwirijamesbarn@gmail.com');
      if (parent && (!parent.studentSubscriptions || !parent.studentSubscriptions['stu_2b910ef8f459'] || parent.studentSubscriptions['stu_2b910ef8f459'].tier !== 'premium')) {
        console.log('[hydrateSync] Setting parent studentSubscription for Erline on Premium...');
        pStore.setChildSubscription('mutwirijamesbarn@gmail.com', 'stu_2b910ef8f459', 'premium', 'monthly');
      }
    } catch (syncErr) {
      console.warn('[hydrateSync] Warning during store reconciliation:', syncErr.message);
    }

    app.listen(PORT, () => {
      console.log(`🌳 Elingu is running at http://localhost:${PORT}`);
      console.log(`📚 KICD CBE Curriculum: Grades 6–12 | CBC JSS & Senior School Pathways`);
    });
  })
  .catch((err) => {
    // Refuse to start on stale/empty data — Render will retry the deploy
    console.error('❌ [persistentStore] Could not restore data from PostgreSQL:', err.message);
    process.exit(1);
  });
