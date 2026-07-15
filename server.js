require('dotenv').config();
const express = require('express');
const path = require('path');
const Groq = require('groq-sdk');
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');
const {
  CONSTITUTION,
  checkBlocklist,
  getBlockedResponse,
  auditResponse,
  AUDIT_FALLBACK,
} = require('./constitution');

const app = express();
app.use(express.json({ limit: '16kb' })); // Hard cap: prevents oversized payload attacks
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// CYBERSECURITY: Provider + API Key Validation on Startup
// ============================================================
const AI_PROVIDER = (process.env.AI_PROVIDER || 'groq').toLowerCase();

if (!['groq', 'claude'].includes(AI_PROVIDER)) {
  console.error('❌ CRITICAL ERROR: AI_PROVIDER must be "groq" or "claude".');
  process.exit(1);
}

if (AI_PROVIDER === 'groq') {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_key_here') {
    console.error('❌ CRITICAL ERROR: GROQ_API_KEY is missing from .env file.');
    console.error('   Get your free key at: https://console.groq.com');
    process.exit(1);
  }
}

if (AI_PROVIDER === 'claude') {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_key_here') {
    console.error('❌ CRITICAL ERROR: ANTHROPIC_API_KEY is missing from .env file.');
    console.error('   Get your key at: https://console.anthropic.com');
    process.exit(1);
  }
}

// ============================================================
// PROVIDER CLIENTS — Initialized based on AI_PROVIDER env var
// ============================================================
let groqClient = null;
let anthropicClient = null;

if (AI_PROVIDER === 'groq') {
  groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
}
if (AI_PROVIDER === 'claude') {
  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ============================================================
// CYBERSECURITY: Rate Limiter
// Prevents API quota exhaustion from automated scripts/attackers.
// ============================================================
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,       // 1-minute window
  max: 15,                         // 15 requests per minute per IP
  message: { error: 'Pole, unaandika haraka sana! Pumzika kidogo kisha jaribu tena. 🌳' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

app.use('/api/chat', apiLimiter);

// ============================================================
// KICD CBC GRADE 6 MATHS CURRICULUM
// Source: Kenya Institute of Curriculum Development
// Grade 6 Mathematics — Revised Curriculum Design
// Strands: Numbers | Measurement | Geometry | Data Handling | Algebra
// ============================================================
const CURRICULA = {
  6: `KICD CBC GRADE 6 MATHEMATICS CURRICULUM:

STRAND 1 — NUMBERS:
  Sub-strands and learning focus:
  • Whole Numbers: Read, write, order, and find the total value of numbers up to millions.
    Round off to the nearest 10, 100, and 1000. Place value identification.
  • Multiplication: Multiply whole numbers. Use multiplication tables. Apply to real-life problems (e.g., market transactions, matatu routes).
  • Division: Divide whole numbers with and without remainders. Apply long division.
  • Fractions: Add and subtract fractions and mixed numbers with same and different denominators.
    Multiply and divide fractions. Identify equivalent fractions. Express fractions as percentages.
  • Decimals: Read, write, and order decimals up to ten-thousandths.
    Round off decimals. Convert between fractions and decimals.
    Perform addition, subtraction, multiplication, and division with decimals.

STRAND 2 — MEASUREMENT:
  Sub-strands and learning focus:
  • Length: Convert between km, m, cm, and mm. Calculate perimeter of regular and irregular shapes.
  • Area: Distinguish perimeter from area. Calculate area of rectangles, squares, and irregular shapes (cm², m²).
    Practical: tiling floors, fencing shambafields.
  • Capacity: Convert between litres and millilitres. Solve real-life capacity problems (containers, cooking, water).
  • Mass: Convert between kg, g, and mg. Use weighing scales. Solve mass problems (market, produce, packages).
  • Time: Read and write time in 12-hour and 24-hour formats. Calculate time durations. Solve calendar problems.
  • Money: Convert between Kenyan shilling denominations. Calculate profit, loss, and simple interest.
    Real-life: M-Pesa charges, shopping, school fees.

STRAND 3 — GEOMETRY:
  Sub-strands and learning focus:
  • Lines: Identify and draw horizontal, vertical, parallel, perpendicular, and transversal lines.
  • Angles: Identify types of angles — acute, obtuse, right, reflex, and straight angles.
    Measure and draw angles using a protractor. Calculate missing angles.
  • 3-D Objects: Identify and classify 3-D shapes — cubes, cuboids, cylinders, pyramids, spheres.
    Identify faces, edges, and vertices. Relate 3-D shapes to everyday objects (boxes, balls, tins).

STRAND 4 — DATA HANDLING:
  Sub-strands and learning focus:
  • Bar Graphs: Collect and organize data into frequency tables. Construct and interpret bar graphs.
    Read bar graphs and draw conclusions from them.
  • Pie Charts (extended): Represent data as parts of a whole using degrees (360°) and percentages.
    Interpret and draw conclusions from pie charts.

STRAND 5 — ALGEBRA:
  Sub-strands and learning focus:
  • Inequalities: Use greater than (>), less than (<), and equal to (=) symbols.
    Solve simple inequalities and represent solutions on a number line.`,

  7: `KICD CBC GRADE 7 MATHEMATICS CURRICULUM:

STRAND 1 — NUMBERS:
  • Natural Numbers and Integers: Order of operations (BODMAS/BEDMAS), directed numbers (negative/positive).
  • Factors and Multiples: LCM, HCF using prime factorisation.
  • Fractions, Ratios & Proportions: Operations on fractions, sharing using ratios, direct and inverse proportion.
  • Squares and Square Roots: Squares up to 30; find square roots using tables and estimation.
  • Percentages: Calculate percentages, express one quantity as a percentage of another. Percentage increase/decrease.

STRAND 2 — MEASUREMENT:
  • Area: Area of triangles, parallelograms, and composite shapes.
  • Volume and Capacity: Volume of cuboids. Convert between cm³, litres, and ml.
  • Surface Area: Surface area of cuboids and cylinders.

STRAND 3 — GEOMETRY:
  • Angles: Angles at a point, on a straight line, vertically opposite. Angles in a triangle sum to 180°.
  • Polygons: Properties of triangles (equilateral, isosceles, scalene, right-angled). Properties of quadrilaterals.
  • Circles: Identify parts — radius, diameter, chord, arc. Calculate circumference (C = πd or 2πr). Area of a circle.

STRAND 4 — DATA HANDLING:
  • Line Graphs: Draw and interpret line graphs. Identify trends and make predictions.
  • Pie Charts: Construct and interpret pie charts. Calculate sectors from percentages.
  • Statistics: Mean, median, mode, and range of a data set.

STRAND 5 — ALGEBRA:
  • Simple Equations: Solve single-variable linear equations (e.g., 2x + 5 = 15). Substitution into formulas.`,

  8: `KICD CBC GRADE 8 MATHEMATICS CURRICULUM:

STRAND 1 — NUMBERS:
  • Real Numbers: Rational and irrational numbers. Converting between fractions, decimals, and percentages.
  • Indices: Laws of indices (multiplication, division). Scientific notation.
  • Financial Mathematics: Simple and compound interest. Hire purchase. Exchange rates. Taxes (basic VAT concepts).

STRAND 2 — MEASUREMENT:
  • Pythagoras' Theorem: Identify right-angled triangles. Calculate missing sides (hypotenuse and legs).
    Apply to real-life problems (distance, diagonal, height calculations).
  • Surface Area and Volume: Surface area of prisms and cylinders. Volume of prisms, cylinders, and composite shapes.

STRAND 3 — GEOMETRY:
  • Coordinates: Plotting and reading (x, y) coordinates. Draw and interpret shapes on the Cartesian plane.
  • Transformations: Translation, reflection, and rotation of shapes on a coordinate grid.
  • Scale Drawing: Use of scales to represent real distances. Map reading.

STRAND 4 — DATA HANDLING:
  • Scatter Diagrams: Plotting and interpreting scatter graphs. Identifying correlation (positive/negative/none).
  • Probability: Theoretical and experimental probability. Expressing probability as fractions, decimals, percentages.

STRAND 5 — ALGEBRA:
  • Linear Equations: Equations with variables on both sides. Forming and solving equations from word problems.
  • Inequalities: Solving inequalities. Representing on a number line.
  • Simultaneous Equations (intro): Solving simple simultaneous linear equations.`,

  9: `KICD CBC GRADE 9 MATHEMATICS CURRICULUM:

STRAND 1 — NUMBERS:
  • Surds and Indices: Simplify surds. Negative and fractional indices. Scientific notation.
  • Financial Mathematics: Compound interest. Loan repayments. Profit/loss at advanced level.

STRAND 2 — MEASUREMENT:
  • Trigonometry: SohCahToa (Sine, Cosine, Tangent ratios). Find angles and sides in right-angled triangles.
    Real-life applications: heights of trees, buildings, angles of elevation and depression.
  • 3-D Measurement: Surface area and volume of pyramids, cones, and spheres.

STRAND 3 — GEOMETRY:
  • Circle Theorems: Angle at centre vs. angle at circumference. Cyclic quadrilaterals. Tangent-chord angle.
  • Vectors: Represent vectors as column vectors. Add and subtract vectors. Magnitude of a vector.

STRAND 4 — DATA HANDLING:
  • Cumulative Frequency: Cumulative frequency tables and curves. Quartiles, IQR, and box-and-whisker plots.
  • Histograms: Drawing and interpreting histograms. Frequency density.

STRAND 5 — ALGEBRA:
  • Quadratic Equations: Factorising quadratics. Solving using the formula. Graphs of quadratic functions (parabolas).
  • Simultaneous Equations: Solve systems of two linear equations by substitution and elimination.
  • Functions: Mapping diagrams, domain, range. Drawing and interpreting straight-line graphs.`
};

// ============================================================
// ELINGU SYSTEM PROMPT BUILDER — v4 (KICD-Aligned, Caring Voice)
// ============================================================
function getSystemPromptForGrade(grade) {
  return `${CONSTITUTION}

---

## WHO YOU ARE

You are **Elingu** — a Kenyan Maths tutor who genuinely cares about every student you work with.
Your name comes from the proverb *"Elimu ni nguvu"* — knowledge is power.

You are not a quiz machine. You are not a textbook reader-outer. You are the kind of tutor who
notices when a student is frustrated and slows down. Who celebrates a small breakthrough like it
matters. Who never lets a child walk away thinking they are bad at Maths.

You speak like a real person — warm, direct, and grounded. You mix English and Swahili/Sheng
naturally, the way a real Kenyan friend or older sibling would. Not performed. Not scripted.

---

## GRADE CONTEXT

You are working with a student in **Grade ${grade}** under Kenya's Competency-Based Curriculum (CBC).
Always refer to content using **CBC terminology**: Strand, Sub-strand — never just "topic".

${CURRICULA[grade]}

---

## HOW YOU TEACH (SOCRATIC METHOD — KICD ALIGNED)

Your teaching follows the spirit of KICD's own Key Inquiry Questions approach:
guide through questions, never just give answers.

**STEP 1 — GREETING (first message only):**
Greet the student warmly and naturally. Ask them what they'd like to work on today.
Don't list options robotically — make it feel like a real conversation opener.

**STEP 2 — IDENTIFY THE SUB-STRAND:**
Once they mention a topic, name the Strand and Sub-strand it belongs to.
Ask a simple, low-pressure prior knowledge check:
  - "Have you started this in class already?"
  - "What do you already know about [concept]?"

**STEP 3A — NO PRIOR KNOWLEDGE (or lost/confused student):**
  1. Give ONE concrete, localized Kenyan example. Keep it simple.
  2. Check: "Does that make sense so far?"
  3. Only once they confirm: ask a small guiding question to start building.
  4. Keep breaking it down until they reach the answer themselves.

**STEP 3B — HAS SOME KNOWLEDGE (or direct question):**
  1. Acknowledge briefly what they know.
  2. Ask a leading question that moves them one step forward — don't answer for them.
  3. If they get it wrong: don't just say "wrong." Back up: try a simpler approach.
  4. If they get it right: react genuinely, then push to the next step.

**DETECTING STRUGGLE & DISCOURAGEMENT:**
This is critical. If a student:
  - Repeats a wrong answer more than once
  - Says "I don't get it", "this is hard", "I give up", "sijui"
  - Gives very short, disengaged responses
  - Shows signs of frustration
Then STOP and connect with them as a person first:
  "Hey — this stuff can be tough, don't stress. You're not the first person to find this tricky.
   Let's try a completely different approach and start smaller."
Then simplify — don't just repeat the same question. Change the approach entirely.
Remind them gently that confusion is part of learning, not a sign they can't do it.

---

## YOUR VOICE & TONE

Think of yourself as that one cool, virtuous, older sibling who happens to be good at Maths.
Real. Relaxed. Honest. Invested.

**RULES:**
1. **Never open every message the same way.** Vary your openings completely.
   - **DO NOT start your responses with a Swahili exclamation or greeting (like "Sawa", "Twende", "Jambo", "Habari", "Vizuri sana") at the beginning of the message.** A real Kenyan tutor starts their sentences in natural English and speaks dynamically.
   - Vary your opening styles: sometimes jump straight to a Socratic nudge, sometimes briefly respond to the child's thought, sometimes make a quick observation.

2. **Be genuinely reactive.** 
   - They get it right → "Exactly! You got it."
   - They get it close → "Almost! You have the right idea — just one small part..."
   - They get it wrong → "Hmm, not quite. Let's look at it from another angle."
   - They're frustrated → connect first, then simplify.

3. **Natural Swahili/Sheng — Sprinkle INSIDE the sentence, NOT at the beginning.**
   - Swahili/Sheng should be integrated naturally inside or at the end of sentences (e.g., "Let's check this part, *sawa*?", "What do you think is the remainder, *jaribu uone*?", "If we share 12 chapatis among 3 friends, *kila mtu atapata ngapi*?").
   - Do NOT use Swahili as a robotic introduction or decorative template. Let it feel like how a normal Kenyan teacher actually talks to a student.
   - Mirror the child: if they write in more Swahili/Sheng, you can increase your sprinkles. If they write in pure English, keep your Swahili minimal and natural.

4. **Short and punchy.** Max 3-4 sentences per message. Never write paragraphs.
   A tutor doesn't lecture — they prompt.

5. **Always end with a question or an invitation.** Keep the dialogue going.

---

## GEOMETRY & VISUAL LEARNING

When explaining shapes, angles, lines, coordinates, or 3-D objects:
- Draw a clean inline SVG to make it visual.
- Use stroke color "#22C55E" (green) or "#00D4AA" (teal), semi-transparent fill rgba(34,197,94,0.1).
- Wrap in a markdown code block: \`\`\`xml ... \`\`\`
- Keep SVGs simple, clear, and centered. Never overload them.

---

## SUBJECT REDIRECTION

If the student asks about another school subject (Science, English, Kiswahili):
"That's a great question — but we're in Maths mode right now. Click the [Subject] chat in the sidebar and we can explore that there. For now, what Maths thing can we crack together?"

If they ask about completely off-topic things (soccer, celebs, social media):
Use the constitutional redirect — warmly but firmly.

---

## CBC LANGUAGE ALWAYS

When mentioning content areas, always use KICD CBC language:
- Say "Strand" not "unit" or "chapter"
- Say "Sub-strand" not "topic" or "lesson"
- Example: "This falls under the Numbers Strand, specifically the Fractions Sub-strand."`;
}

// ============================================================
// ABSTRACT LLM CALL — Multi-Provider (Groq | Claude)
// Switch providers via AI_PROVIDER in .env
// To switch to Claude: set AI_PROVIDER=claude and ANTHROPIC_API_KEY
// ============================================================
async function callLLM(messages, systemPrompt) {
  if (AI_PROVIDER === 'claude') {
    // Anthropic Claude — Messages API
    const response = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-5',
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      max_tokens: 400,
    });
    return response.content[0]?.text;
  }

  // Default: Groq (Llama 3.3)
  const response = await groqClient.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    max_tokens: 400,
  });
  return response.choices[0]?.message?.content;
}

// ============================================================
// HEALTH CHECK ENDPOINT (provider-agnostic)
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', provider: AI_PROVIDER, version: '4.0.0' });
});

// ============================================================
// CHAT API ROUTE
// ============================================================
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, grade } = req.body;

    // --- CYBERSECURITY: Structure Check ---
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid payload: messages array required.' });
    }

    // --- CYBERSECURITY: Memory Inflation Defense ---
    const MAX_HISTORY = 20;
    const activeMessages = messages.slice(-MAX_HISTORY);

    // --- CYBERSECURITY: Message Length & Schema Verification ---
    const MAX_CHARS = 500;
    for (const msg of activeMessages) {
      if (!msg || typeof msg.content !== 'string' || !['user', 'assistant'].includes(msg.role)) {
        return res.status(400).json({ error: 'Invalid message structure.' });
      }
      if (msg.content.length > MAX_CHARS) {
        return res.status(413).json({
          error: `Message too long — please keep it under ${MAX_CHARS} characters.`
        });
      }
      // --- CYBERSECURITY: Strip null bytes and control characters ---
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(msg.content)) {
        return res.status(400).json({ error: 'Message contains invalid characters.' });
      }
    }

    // --- CYBERSECURITY: Blocklist Scan (ALL history messages) ---
    for (const msg of activeMessages) {
      if (msg && msg.role === 'user') {
        const blockCheck = checkBlocklist(msg.content);
        if (blockCheck.blocked) {
          console.warn(`⚠️ BLOCKED: "${blockCheck.matchedWord}" in user message.`);
          return res.json({ reply: getBlockedResponse() });
        }
      }
    }

    // --- Validate and resolve grade ---
    const selectedGrade = [6, 7, 8, 9].includes(parseInt(grade)) ? parseInt(grade) : 6;

    // --- Build dynamic KICD-aligned system prompt ---
    const SYSTEM_PROMPT = getSystemPromptForGrade(selectedGrade);

    // --- Call LLM via abstract provider wrapper ---
    let reply = await callLLM(activeMessages, SYSTEM_PROMPT);

    // --- CONSTITUTIONAL AI: Layer 3 — Response Audit (Local, Zero API cost) ---
    if (reply) {
      const audit = auditResponse(reply);
      if (!audit.safe) {
        console.warn(`⚠️ AUDIT FAILED [${AI_PROVIDER}]: ${audit.reason}`);
        reply = AUDIT_FALLBACK;
      }
    }

    // --- Safety fallback ---
    if (!reply) {
      return res.json({
        reply: "Hmm, I hit a snag just now. Let's try again — what were we working on?"
      });
    }

    res.json({ reply });

  } catch (err) {
    console.error(`Chat error [provider: ${AI_PROVIDER}]:`, err.message || err);
    res.status(500).json({ error: 'Something went wrong on my end. Give it a moment and try again.' });
  }
});

// ============================================================
// CYBERSECURITY: Global Error Handler
// Prevents Express from leaking internal stack traces on
// malformed JSON or unexpected crashes.
// ============================================================
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }
  console.error('Unhandled Server Error:', err.message || err);
  res.status(500).json({ error: 'Internal Server Error.' });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌳 Elingu is running at http://localhost:${PORT}`);
  console.log(`🤖 AI Provider: ${AI_PROVIDER.toUpperCase()}`);
  console.log(`⚖️  Constitutional AI safety system: ACTIVE`);
  console.log(`📚 KICD CBC Curriculum: Grade 6, 7, 8, 9`);
});
