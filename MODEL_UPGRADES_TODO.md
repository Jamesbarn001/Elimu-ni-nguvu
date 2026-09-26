# 🚀 Elingu Model Provider Upgrades & Architecture Ideas

This document outlines key improvements to Elingu's LLM engine to make model configuration flexible, resilient to model deprecation, and expandable to OpenAI (ChatGPT) and DeepSeek.

---

## 📋 TODO & Roadmap

### 1. ⚙️ Replace Hardcoded Models with Environment Variables (`.env`)
**Goal:** Prevent server breakage when API providers deprecate or update model version names.

- [x] Add `.env` fallback defaults in `server.js`:
  ```javascript
  const GEMINI_MODEL           = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const GROQ_MODEL             = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const ANTHROPIC_MODEL        = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
  const ANTHROPIC_CRISIS_MODEL = process.env.ANTHROPIC_CRISIS_MODEL || 'claude-3-5-sonnet-latest';
  ```
- [x] Update `callLLM(...)` to reference these variables instead of hardcoded strings like `'claude-sonnet-4-6'` or `'claude-haiku-4-5'`.

---

### 2. 🟢 Add OpenAI (ChatGPT) Support
**Goal:** Give users the option to run Elingu using OpenAI models.

- [ ] Install `openai` package or use `fetch` for OpenAI API calls.
- [ ] Configure `ACTIVE_PROVIDER === 'openai'`:
  - **`gpt-4o-mini`**: Primary model for fast, affordable, high-volume tutoring ($0.15/1M tokens). Excellent at Swahili & Sheng.
  - **`gpt-4o`**: Optional model for generating precise inline SVG diagrams (Math shapes & Science apparatus).
  - **`o3-mini`**: Optional reasoning model for complex Grade 8–9 STEM/Math problem solving.

---

### 3. 🛡️ Multi-Tier Smart Fallback Chain
**Goal:** Ensure 100% server uptime even if a model hits rate limits (`429`), quota limits, or model access errors (`404` / `403`).

- [x] Implement automatic fallback logic:
  1. **Primary Model** (Configured via `.env`: Gemini, Anthropic, or Groq)
  2. **Secondary Fallback** (Free-tier model: Groq `llama-3.3-70b-versatile`)
  3. **Sentinel Fallback** (Safe local response, no API needed)

---

### 4. 🧠 Explore DeepSeek Integration (Math & Science Specialist)
**Goal:** Leverage DeepSeek for ultra-low cost, high-precision STEM tutoring.

- [ ] Evaluate `deepseek-chat` (DeepSeek-V3) for Grade 6-9 Science & Math ($0.14/1M tokens).
- [ ] Evaluate `deepseek-reasoner` (DeepSeek-R1) for step-by-step Socratic reasoning on complex problems.

---

## 📊 Summary Comparison Matrix

| Provider | Model | Ideal Use Case in Elingu | Pricing / Tier |
| :--- | :--- | :--- | :--- |
| **Google** | `gemini-flash-latest` | Default free-tier chat, long context, CBC curriculum | Free Tier |
| **Groq** | `llama-3.3-70b-versatile` | Ultra-fast response speed (<500ms), fallback model | Free Tier |
| **OpenAI** | `gpt-4o-mini` | Reliable Socratic chat, Swahili/Sheng dialogue | ~$0.15 / 1M tokens |
| **OpenAI** | `gpt-4o` | High-quality SVG visual diagram generation | ~$2.50 / 1M tokens |
| **DeepSeek** | `deepseek-chat` | High-precision Mathematics & Science logic | ~$0.14 / 1M tokens |
| **Anthropic**| `claude-3-5-sonnet` | Crisis escalation, maximum empathy & safety | ~$3.00 / 1M tokens |
