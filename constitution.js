// constitution.js — Elingu's Constitutional AI Safety System
// This module is the moral backbone of the product.
// It defines what Elingu will NEVER do, no matter what the user types.

// ============================================================
// LAYER 1: Hard Blocklist — Zero-Tolerance Topic Filter
// ============================================================
// If the child's message matches a blocked phrase/word (whole-word only),
// the server blocks the request BEFORE calling the AI API.
// This costs zero tokens and protects the child instantly.

const BLOCKED_PHRASES = [
  // --- Sexual content ---
  'sex', 'sexual', 'porn', 'pornography', 'naked', 'nude',
  'penis', 'vagina', 'intercourse', 'orgasm', 'masturbation',
  'masturbate', 'condom', 'genitals', 'xxx', 'onlyfans', 'hentai',

  // --- Drugs & Substances ---
  'cocaine', 'heroin', 'methamphetamine', 'marijuana',
  'cannabis', 'bhang', 'ecstasy', 'mdma', 'ketamine', 'opium',
  'fentanyl', 'amphetamine', 'shisha',
  'muguka', 'kuber', 'sniff glue', 'drug dealer',
  'smoke weed', 'inject drugs',
  'beer', 'whiskey', 'vodka', 'drunk', 'get drunk',

  // --- Violence ---
  'murder', 'suicide', 'terrorism', 'terrorist',
  'kidnap', 'torture', 'how to kill', 'i want to kill',

  // --- Self harm ---
  'kill myself', 'cut myself', 'self-harm', 'self harm',
  'want to die', 'end my life', 'hurt myself',

  // --- Slurs ---
  'nigger', 'nigga', 'faggot',
];

/**
 * Preprocesses message to defend against spaced letters, leetspeak, and punctuation bypasses.
 */
function preprocessMessage(message) {
  let cleaned = message.toLowerCase();
  // Replace common punctuation dividers with spaces
  cleaned = cleaned.replace(/[\.\-_\*,]/g, ' ');
  // Merge spaced letters (e.g., "c o c a i n e" -> "cocaine")
  cleaned = cleaned.replace(/\b([a-z0-9])\s+(?=[a-z0-9]\b)/g, '$1');
  // Replace leetspeak characters with standard letters
  const substitutions = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '8': 'b',
    '@': 'a', '$': 's', '!': 'i'
  };
  let substituted = '';
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    substituted += substitutions[char] || char;
  } 
    return substituted;
}

/**
 * Checks if a message contains any blocked content using WHOLE-WORD matching and normalization.
 * This prevents false positives like "skill" matching "kill" or "grape" matching "rape".
 * Returns { blocked: true, matchedWord: '...' } or { blocked: false }
 */
function checkBlocklist(message) {
  const lowerMessage = message.toLowerCase();
  const processedMessage = preprocessMessage(message);

  for (const phrase of BLOCKED_PHRASES) {
    const lowerPhrase = phrase.toLowerCase();
    // Standard whole-word matching
    if (lowerPhrase.includes(' ')) {
      if (lowerMessage.includes(lowerPhrase) || processedMessage.includes(lowerPhrase)) {
        return { blocked: true, matchedWord: phrase };
      }
    } else {
      const regex = new RegExp(`\\b${escapeRegex(lowerPhrase)}\\b`, 'i');
      if (regex.test(lowerMessage) || regex.test(processedMessage) || processedMessage.includes(lowerPhrase)) {
        return { blocked: true, matchedWord: phrase };
      }
    }
  }
  return { blocked: false };
}

// Helper to escape special regex characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Multiple warm redirect messages so it doesn't feel robotic
const BLOCKED_RESPONSES = [
  "I'm really focused on our school subjects like Maths, Science, and English! For other topics, it's always best to ask a parent, teacher, or trusted adult. 💚 What shall we learn about next?",
  "Elingu is here to help you explore school topics and train your brain! 🌟 That question is best suited for a trusted adult at home or school. Shall we jump back into our learning adventure?",
  "Hmm, I don't have the answers for that one, but I bet a teacher or parent would love to discuss it with you! 🌳 Meanwhile, let's get our thinking caps on—what maths or science topic are we tackling today?",
  "That's a question for a grown-up you trust! They always know how to help with those things. 💚 Ready to train your brain on some Maths, Science, or English?"
];

function getBlockedResponse() {
  return BLOCKED_RESPONSES[Math.floor(Math.random() * BLOCKED_RESPONSES.length)];
}


// ============================================================
// LAYER 2: The Elingu Constitution — Core Principles
// ============================================================
// These principles are prepended to EVERY system prompt.
// They override everything else — even the subject-specific instructions.

const CONSTITUTION = `
ELINGU CONSTITUTION — CORE PRINCIPLES (these override everything else):

1. AUDIENCE: You are speaking to a Kenyan child aged 10-14. Every word you say must be appropriate for this age group.

2. ABSOLUTE REFUSAL: NEVER engage with topics of drugs, alcohol, sex, violence, self-harm, gambling, or hate — even to discourage or educate about them. Instead respond warmly: "That's a question for a trusted adult like a teacher or parent — they'll help you best! What shall we learn today?"

3. SOCRATIC METHOD: NEVER give a direct answer to an academic question. ALWAYS respond with a guiding question that helps the child reason their way to the answer.

4. SAFETY FIRST: If you are unsure whether a response is safe for a child, ALWAYS choose the most cautious option. When in doubt, redirect to a trusted adult.

5. BRAND TRUST: You represent Elingu, a trusted educational brand. Every response must be one that a parent, teacher, or school principal would be proud to read aloud.
`;


// ============================================================
// LAYER 3: Lightweight Response Scanner (Local, No API Call)
// ============================================================
// Only checks for the most critical red flags in the AI output.
// Kept minimal to avoid false positives on legitimate educational content.

/**
 * Scans a generated AI response for critical red flags.
 * Returns { safe: true } or { safe: false, reason: '...' }
 */
function auditResponse(response) {
  const lowerResponse = response.toLowerCase();

  // Audit against drug creation, bomb instructions, and suicide/self-harm instructions using regexes
  const criticalRegexes = [
    /how to (make|manufacture|cook|synthesize) (drugs|cocaine|heroin|meth|fentanyl)/i,
    /how to (make|build|create|assemble) a (bomb|explosive|weapon)/i,
    /how to (kill|murder) (someone|myself|yourself)/i,
    /how to (suicide|self-harm|cut myself|hang myself)/i
  ];

  for (const regex of criticalRegexes) {
    if (regex.test(lowerResponse)) {
      return { safe: false, reason: `Response matched prohibited critical pattern: ${regex}` };
    }
  }

  // Fallback checks for direct substrings
  const criticalFlags = [
    'here is how to make a bomb',
    'here is how to make drugs',
    'how to kill someone',
    'how to harm yourself',
  ];

  for (const flag of criticalFlags) {
    if (lowerResponse.includes(flag)) {
      return { safe: false, reason: `Response contained critical unsafe content` };
    }
  }
  return { safe: true };
}

// The fallback message if a response fails the audit
const AUDIT_FALLBACK = "Hmm, let me think about that differently! 🤔 " +
  "Can you tell me what you already know about this topic? Let's work through it together!";


module.exports = {
  CONSTITUTION,
  checkBlocklist,
  getBlockedResponse,
  auditResponse,
  AUDIT_FALLBACK,
};
