// constitution.js — Elingu's Constitutional AI Safety System
// This module is the moral backbone of the product.
// It defines what Elingu will NEVER do, no matter what the user types.

const fs = require('fs');
const path = require('path');

// ============================================================
// LAYER 1: Hard Blocklist — Dynamic Topic Filter
// ============================================================
// Loads banned phrases dynamically from blocklist.json.
// If the child's message matches a blocked phrase/word (whole-word only),
// the server blocks the request BEFORE calling the AI API.

let BLOCKED_PHRASES = [];

function loadBlocklist() {
  try {
    const filePath = path.join(__dirname, 'blocklist.json');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const categories = JSON.parse(content);
      // Flatten all categories into a single list
      BLOCKED_PHRASES = Object.values(categories).flat();
      console.log(`⚖️  Loaded ${BLOCKED_PHRASES.length} blocked phrases dynamically.`);
    } else {
      console.warn('⚠️  blocklist.json not found. Using empty blocklist.');
      BLOCKED_PHRASES = [];
    }
  } catch (err) {
    console.error('❌ Failed to load blocklist.json:', err.message);
    BLOCKED_PHRASES = [];
  }
}

// Initial load
loadBlocklist();

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

// Auto-reload blocklist when file changes (dev-friendly, zero per-request overhead)
fs.watchFile(path.join(__dirname, 'blocklist.json'), { interval: 2000 }, () => {
  console.log('🔄 blocklist.json changed — reloading...');
  loadBlocklist();
});

/**
 * Checks if a message contains any blocked content using WHOLE-WORD matching and normalization.
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

2. ABSOLUTE REFUSAL & EMPATHETIC REDIRECTION: NEVER engage with, explain, or educate about unsafe topics like sex, drugs, alcohol, violence, self-harm, gambling, or hate. If a child raises these topics or shares personal/mental health concerns (like bullying, stress, sadness, feeling unloved, or drug offers), you must IMMEDIATELY validate their feelings with warmth and deep empathy (e.g., "Ah, that really hurts...", "Thank you for sharing this with me. You matter."), guide them to talk to a trusted adult (parent, relative, teacher, or school counselor) who can keep them safe, and keep the door open for learning without pressuring them.

3. SOCRATIC METHOD: NEVER give a direct answer to an academic question. ALWAYS respond with a guiding question that helps the child reason their way to the answer.

4. SAFETY FIRST: If you are unsure whether a response is safe for a child, ALWAYS choose the most cautious option. When in doubt, redirect to a trusted adult.

5. BRAND TRUST & HEALTHY BOUNDARIES: You represent Elingu, a trusted educational brand. Every response must be one that a parent, teacher, or school principal would be proud to read aloud. Maintain healthy tutor-student boundaries: be warm and encouraging, but NEVER use overly personal, romantic, or parasocial terms of endearment (e.g. NEVER call the child "nyota yangu", "my star", "my dear", "sweetheart", "darling", "baby", "chief", "boss"). Treat the child with respectful, grounded mentorship.
`;


// ============================================================
// LAYER 3: Dynamic Response Scanner (Local, Config-driven)
// ============================================================
// Loads safety patterns dynamically from audit_rules.json.

let AUDIT_REGEXES = [];
let AUDIT_FLAGS = [];

function loadAuditRules() {
  try {
    const filePath = path.join(__dirname, 'audit_rules.json');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const rules = JSON.parse(content);
      AUDIT_FLAGS = rules.criticalFlags || [];
      AUDIT_REGEXES = (rules.criticalRegexes || []).map(pattern => new RegExp(pattern, 'i'));
    }
  } catch (err) {
    console.error('❌ Failed to load audit_rules.json:', err.message);
  }
}

// Initial load
loadAuditRules();

// Auto-reload audit rules when file changes
fs.watchFile(path.join(__dirname, 'audit_rules.json'), { interval: 2000 }, () => {
  console.log('🔄 audit_rules.json changed — reloading...');
  loadAuditRules();
});

/**
 * Scans a generated AI response for critical red flags.
 * Returns { safe: true } or { safe: false, reason: '...' }
 */
function auditResponse(response) {

  const lowerResponse = response.toLowerCase();

  for (const regex of AUDIT_REGEXES) {
    if (regex.test(lowerResponse)) {
      return { safe: false, reason: `Response matched prohibited critical pattern: ${regex}` };
    }
  }

  for (const flag of AUDIT_FLAGS) {
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
