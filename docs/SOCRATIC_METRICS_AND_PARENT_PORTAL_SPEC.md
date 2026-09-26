# Elingu Socratic Performance Metrics & Parent Portal Architecture Specification

**Version:** 1.0  
**Date:** September 2026  
**Audience:** Product Engineering, Curriculum Designers, Pedagogical Auditors, Investors  
**System:** Elingu Socratic AI Tutor for Kenyan Competency-Based Curriculum (CBC)

---

## 1. Executive Summary & Pedagogical Foundations

Elingu is a Socratic AI learning companion designed for Kenyan Junior Secondary School (JSS, Grades 7–9) and Upper Primary (Grade 6) learners. Unlike traditional EdTech apps that spoon-feed answers or act as homework calculators, Elingu **never gives the answer directly**. It guides the student step-by-step through inquiry, cognitive scaffolding, and formative feedback.

To translate these complex, back-and-forth Socratic dialogues into actionable, encouraging, and parent-friendly insights without overwhelming parents with "teacher workbook" density, Elingu uses:
1. **Three Calibrated Socratic Performance Metrics** (Depth, Persistence, Independence).
2. **A Two-Tier Parent Dashboard Architecture** (30-second daily briefing + on-demand Premium deep dive).
3. **A Dual-Tier Safe Box Architecture** (balancing learner emotional wellbeing with automated AI tutor radar).

---

## 2. Socratic Performance Metrics & Difficulty Calibration

The Parent Portal measures and visualizes learner performance using three mathematically defined, pedagogically validated metrics:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Socratic Performance Metrics                       │
├──────────────────┬─────────────────────────┬───────────────────────────┤
│ 📊 Depth (1–4)   │ 💪 Persistence (1–5)    │ 🎯 Independence (Status)  │
│ Multi-step rigor │ Effort & grit dots      │ Scaffolding requirement   │
└──────────────────┴─────────────────────────┴───────────────────────────┘
```

---

### 2.1. 📊 Cognitive Depth (Scale: Level 1 to 4)

* **Pedagogical Basis**: Derived from **Webb’s Depth of Knowledge (DOK)** and **Bloom’s Revised Taxonomy**, calibrated against Kenya's **KICD CBC Core Competencies** (specifically *Critical Thinking & Problem Solving*).
* **Mathematical Formula**:
  $$\text{Depth Level} = \min\left(4, \, \max\left(1, \, \lceil \text{turnCount} / 1.5 \rceil\right)\right)$$
* **Levels, Descriptions & Difficulty Thresholds**:

| Depth Level | Socratic Turns | Cognitive Process | KICD CBE Competency Target | Difficulty Calibration |
| :--- | :--- | :--- | :--- | :--- |
| **Level 1** | 1 turn | **Recall & Definition**: Recalling a term, stating a rule or formula. | Foundational knowledge recall | **Very Low** |
| **Level 2** | 2–3 turns | **Basic Application**: Applying a known rule or procedure to a direct, single-step problem. | Applying basic skills | **Moderate** |
| **Level 3** | 4–5 turns | **Strategic Reasoning & Multi-step Inquiry**: Breaking down non-routine problems, managing dependent variables (e.g. inverse variation), identifying and self-correcting intermediate mistakes. | Critical Thinking & Problem Solving (Target standard for JSS 7–9 mastery) | **Challenging** *(Core target)* |
| **Level 4** | 6+ turns | **Extended Synthesis & Generalization**: Deriving formulas autonomously, creating real-world analogies, explaining *why* the rule holds across disciplines (Feynman mastery). | Creativity, Imagination & Self-Efficacy | **Advanced** |

---

### 2.2. 💪 Persistence (Scale: 1 to 5 Dots `●●●●○`)

* **Pedagogical Basis**: Grounded in **Dr. Carol Dweck’s Growth Mindset** research and **Dr. Angela Duckworth’s Grit Scale**. It measures the learner's willingness to sit with productive struggle rather than giving up, guessing blindly, or demanding the answer.
* **Mathematical Formula**:
  $$\text{Effort Dots} = \min\left(5, \, \max\left(1, \, \lceil \text{turnCount} \times 1.1 \rceil\right)\right)$$
* **Scale & Difficulty Calibration**:

| Dots Rating | Indicator | Behavioral Observation | Difficulty Threshold |
| :--- | :--- | :--- | :--- |
| `●○○○○` | **1/5 — Initial Attempt** | Attempted 1 inquiry prompt and paused. | **Low** |
| `●●○○○` | **2/5 — Warming Up** | Maintained focus through 2 back-and-forth turns. | **Normal** |
| `●●●○○` | **3/5 — Solid Focus** | Worked through 3 stages, pushing past initial hesitation. | **Moderate** |
| `●●●●○` | **4/5 — Strong Grit** | Sustained 4–5 rigorous steps, testing hypotheses and revising thinking. | **High Persistence** |
| `●●●●●` | **5/5 — Academic Tenacity** | Pushed through 5+ intensive turns to achieve full conceptual clarity without disengaging. | **Exceptional Tenacity** |

---

### 2.3. 🎯 Independence (Autonomy & Scaffolding Level)

* **Pedagogical Basis**: Based on **Lev Vygotsky’s Zone of Proximal Development (ZPD)** and instructional scaffolding decay. It indicates how much tutor assistance was required to achieve the learning outcome.
* **Classification & Calibration**:

| Status | Turns Range | Scaffolding Level | Pedagogical Meaning |
| :--- | :--- | :--- | :--- |
| **`Getting started 🌱`** | 1 turn | **High Scaffolding** | Early exploration or initial prompt; student is orienting to the problem with close AI guidance. |
| **`Worked through X steps ✓`** | 2–3 turns | **Moderate Scaffolding** | Student worked through guided micro-steps with formative Socratic nudges. |
| **`Independent Derivation ✓`** | 4+ turns | **Minimal Scaffolding** | High autonomy. The student formulated their own deductions and derived the final solution through pure Socratic inquiry without direct assistance. |

---

## 3. Parent Portal Dashboard Architecture

### 3.1. Two-Tier Content Structure
To prevent cognitive overload for working parents, the dashboard divides session data into two distinct tiers:

1. **Tier 1: 30-Second Glanceable Summary (Default View)**
   - **Session Rows**: Shows subject, specific topic, turn pill, strand name, and active time estimate (e.g. `📐 Mathematics: Rates of Work Investigation • 4 turns • ~9 min active`).
   - **Consolidated Tonight's Guide**:
     - Permanently visible directly beneath the session rows (no hide/unhide toggle).
     - Filtered by subject pills (`Topic: [ Mathematics (Focus) ] [ English ]`) on multi-subject days.
     - Features 3 (or 4 on Friday) rounded, glowing smart action tiles:
       1. `🍽 Ask at Dinner` — Open-ended curiosity starter for dinner table discussion.
       2. `💬 Bedtime Praise` — Sincere effort congratulations placed after dinner.
       3. `🏡 Weekend Challenge` — **Strict Friday Rule**: Only surfaces on Fridays (`getDay() === 5` or `?friday=1`) for screen-free home experiments.
       4. `🔄 Let Her Teach` / `Let [Name] Teach` — Feynman inverted role prompt.

2. **Tier 2: On-Demand "Know More" Deep Dive (Exclusive to Premium)**
   - Tapped via the `Know More ▾` pill button on each session row.
   - Smoothly unfolds directly under the specific session.
   - **High-End Bento Grid Layout**:
     - ⏱️ Active Time: `~X min` (Socratic reasoning)
     - 📊 Cognitive Depth: `Level X/4` (Multi-step inquiry)
     - 💪 Persistence: `●●●●○` (Solid grit — clean surface mention)
     - 🎯 Independence: `Independent` (Derived answers ✓)
   - **Two Focused Content Cards**:
     - **Card A (📘 Concept Breakdown)**: Clean, plain-language concept summary without academic jargon.
     - **Card B (🧠 Reasoning Pattern)**: Encouraging, surface-level thinking trait (e.g. *"Analytical & systematic • reasons through numerical ratios and balances operations methodically"*).
   - **Exclusions**:
     - Zero raw Socratic dialogue snippets (avoids clutter).
     - Zero raw frustration calculation formulas.
     - Zero repetitive kitchen/farm contextual snippets in this view.
   - **Preview Gate for Standard & Free**: Displays a sleek dashed preview box explaining Premium benefits with a 1-click upgrade button.

---

## 4. Safe Box Wellbeing Architecture (Standard vs. Premium)

The Safe Box is a dedicated emotional wellbeing and reflection space designed to protect student mental health and build emotional resilience under the pressures of the Kenyan education transition (KPSEA / KJSEA).

### 4.1. Tier Feature Matrix

| Feature | Free Tier | Standard Tier (`KES 700/mo`) | Premium Tier (`KES 1,500/mo`) |
| :--- | :--- | :--- | :--- |
| **Safe Box Access** | ❌ No | ✅ **Included** | ✅ **Included (Safe Box Pro)** |
| **Learner Manual Input** | ❌ None | ✅ Learner can log feelings, worries, and thoughts privately | ✅ Learner can log feelings, worries, and thoughts privately |
| **Automated AI Tutor Detection** | ❌ None | ❌ None (Learner-initiated only) | ✅ **Proactive AI Stress Radar**: Elingu AI tutor monitors the chat wall for emotional distress, self-doubt, and cognitive frustration, automatically logging observations for parent wellbeing reports |
| **Parent Dashboard Notification** | ❌ None | ❌ None | ✅ Discreet emotional pace summary in parent analytics |

### 4.2. Configuration Mapping in Codebase
- **`pricingConfig.js`**:
  - Standard: `safeBox: 'manual'`
  - Premium: `safeBox: 'proactive_ai'`
- **`server.js`**:
  - Standard Plan Box: `<span><strong>Safe Box:</strong> Private learner reflection & feelings space</span>`
  - Premium Plan Box: `<span><strong>Safe Box Pro:</strong> Learner reflection + proactive AI emotional stress radar</span>`

---

## 5. Compliance & Security Safeguards

- **Kenya Data Protection Act 2019 (KDPA)**: All learner inputs, Safe Box logs, and session metrics are protected under strict zero-PII storage principles.
- **Parental Sovereignty**: Insights are non-punitive and framed constructively around growth mindset and effort praise, preventing negative home pressure.
- **Real-Time Responsiveness**: All calculations run instantaneously without impacting core tutor inference latency.
