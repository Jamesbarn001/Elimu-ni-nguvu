# Elingu — Master External Tools & Infrastructure Architecture

**Last Updated:** September 30, 2026  
**Document Status:** Production Reference  
**Project:** Elingu (Elimu ni Nguvu) — Socratic AI Learning Companion for Kenyan & International Curricula

---

## 1. Architecture Overview

Elingu is designed with a **hybrid, high-resilience infrastructure**. It avoids single-vendor lock-in by implementing multi-provider AI failovers, dual-channel communication pipelines, and zero-downtime deployment workflows.

```mermaid
flowchart TD
    subgraph Client["📱 Learner, Parent & Teacher Frontends"]
        SPA["Student Web App (public/index.html)"]
        ParentPortal["Parent & Guardian Portal (/parent/portal)"]
        TeacherPortal["Teacher & School Portal (/teacher/portal)"]
        AdminDashboard["Super Admin Analytics (/api/analytics/dashboard)"]
    end

    subgraph Backend["⚙️ Core Node.js Engine (server.js)"]
        ExpressRouter["Express.js Server & RBAC Router"]
        SafetyRadar["Constitutional AI & Safety Radar (constitution.js)"]
        RateMatrix["Dynamic Rate Card Pricing Matrix (pricingConfig.js)"]
        Store["Data Access Layer (studentStore, parentStore, teacherStore)"]
    end

    subgraph AI["🧠 1. AI & LLM Reasoning Engines"]
        Gemini["Google Gemini API (Primary Socratic Loop)"]
        Claude["Anthropic Claude API (Deep Reasoning & Child Well-being Radar)"]
        OpenAI["OpenAI API (GPT-4o mini Fast Backup)"]
        Groq["Groq API (Ultra-Fast LPU Failover)"]
        Imagen["Google Imagen (Visual Diagrams & Badge Assets)"]
    end

    subgraph Messaging["📩 2. Communication & Notifications"]
        Nodemailer["Nodemailer (Free Gmail SMTP Transport)"]
        Resend["Resend API (Transactional HTML Email Service)"]
        SMS["Safaricom SMS / Africa's Talking (Parent Phone OTPs)"]
    end

    subgraph Fintech["💳 3. Mobile Money & Payments"]
        Daraja["Safaricom M-PESA Daraja API (STK Push & Webhooks)"]
    end

    subgraph CloudInfra["☁️ 4. Hosting & Deployment"]
        Render["Render.com (Production Web Service & Auto-Deploy)"]
        GitHub["GitHub (Version Control & CI/CD Pipeline)"]
    end

    subgraph Database["🗄️ 5. Persistence Layer"]
        Postgres["PostgreSQL / pg (Cloud Database)"]
        JSONDB["Embedded JSON File Store (Zero-config Storage)"]
    end

    Client <--> ExpressRouter
    ExpressRouter <--> AI
    ExpressRouter <--> Messaging
    ExpressRouter <--> Fintech
    ExpressRouter <--> Database
    CloudInfra -.-> Backend
```

---

## 2. Comprehensive Directory of External Tools

### 2.1 AI & Large Language Model (LLM) Engines

| Service / Tool | Exact Package / Driver | Primary Role in Elingu | Failover Order | Cost / Quota Tier | Configuration Location |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Gemini** | `@google/genai` (v2.8.0) | **Primary Socratic Tutor**: Powers the step-by-step CBC quest conversations for Grades 6–12 (`gemini-flash-lite-latest` / `gemini-2.0-flash`). | 1st (Default) | Free tier available via Google AI Studio (15 RPM / 1M TPM). | `GOOGLE_API_KEY`, `GEMINI_MODEL` in `.env` |
| **Anthropic Claude** | `@anthropic-ai/sdk` (v0.110.0) | **Safety Radar & Deep Reasoning**: Automatically triggers on child emotional distress detection (Safe Box) and handles complex CBE/KCSE pedagogical explanations (Claude 3.5 Sonnet & Claude Haiku). | Specialized trigger | Pay-per-token API. | `ANTHROPIC_API_KEY` in `.env` |
| **OpenAI** | `openai` / Direct REST | **Conversational Fallback**: High-speed conversational backup (`gpt-4o-mini`) when primary providers experience latency or regional timeouts. | 2nd | Standard OpenAI pay-as-you-go. | `OPENAI_API_KEY`, `OPENAI_MODEL` in `.env` |
| **Groq LPU** | `groq-sdk` (v1.3.0) | **High-Speed LPU Failover**: Ultra-low latency inference using open weights (`qwen/qwen3.8-27b`, Llama 3.3) for instant student query resolution. | 3rd | Generous free developer tier on Groq Console. | `GROQ_API_KEY`, `GROQ_MODEL` in `.env` |
| **Google Imagen / Vision** | Native AGY Tooling | **Educational Asset Generation**: Generates STEM diagrams, CBC learning milestone badges, and visual quest aids. | On-demand | Integrated with DeepMind image generation. | Native agent tool `generate_image` |

---

### 2.2 Transactional Communication & Messaging

| Service / Tool | Exact Package / Driver | Primary Role in Elingu | Failover Order | Cost / Quota Tier | Configuration Location |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Nodemailer** | `nodemailer` (v10.0.13) | **Zero-Cost SMTP Transport**: Delivers parent activation emails, sibling approvals, upgrade requests, and 6-digit PIN reset codes via free Gmail SMTP. Requires **no custom domain**. | 1st (If configured) | **$0.00 Forever** (500 emails/day allowance via Google). | `GMAIL_USER`, `GMAIL_APP_PASSWORD` in `.env` |
| **Resend** | `resend` (v6.26.0) | **Cloud Email API**: High-deliverability transactional email service with responsive, table-based HTML templates for all parent and student security notices. | 2nd (Or primary with custom domain) | **Free 3,000 emails/month** (100/day). Scalable to millions. | `RESEND_API_KEY`, `RESEND_FROM` in `.env` |
| **Safaricom SMS / Africa's Talking** | Direct HTTPS REST | **Mobile Phone Notifications**: Delivers instantaneous SMS OTP codes to Kenyan mobile numbers (Safaricom, Airtel, Telkom) for parents without smartphones or active internet. | Standalone channel | ~KES 0.80 per SMS delivered. | `SMS_API_KEY`, `SMS_SENDER_ID` in `.env` |

---

### 2.3 Payments & Mobile Money Infrastructure

| Service / Tool | Protocol / Library | Primary Role in Elingu | Integration Details | Cost / Regulatory Standard | Configuration Location |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Safaricom M-PESA Daraja API** | Daraja 2.0 REST (Lipa Na M-PESA Online) | **Parent Subscription Billing**: Initiates real-time STK Push prompts directly to parent handsets. Handles instant payment callback webhooks to unlock Standard and Premium tiers. | Asynchronous STK push with callback verification, signature checking, and transaction ID ledger. | Standard Safaricom merchant transaction fees. Compliant with CBK and KDPA 2019. | `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_SHORTCODE` in `.env` |

---

### 2.4 Cloud Hosting, Continuous Deployment & Source Control

| Service / Platform | Role in Project | Capabilities Leveraged | Webhook / Trigger | Configuration Location |
| :--- | :--- | :--- | :--- | :--- |
| **Render.com** | **Production Web App Hosting** | Hosts the unified Node.js runtime, handles incoming HTTPS traffic at `https://elimu-ni-nguvu.onrender.com`, manages background daemons, and injects production environment secrets. | Auto-deploys on every `git push origin main`. | Render Dashboard / `render.yaml` |
| **GitHub** | **Source Code Version Control** | Repository hosting (`Jamesbarn001/Elimu-ni-nguvu`), branch protection, automated Git change tracking, and deploy triggering. | Remote `origin/main` | `.git/config` |
| **Cloudflare** | **DNS & Edge Network** (Optional) | Domain name routing, SSL termination, and protection against automated bot traffic. | Cloudflare Edge | DNS Name Servers |

---

### 2.5 Databases & Data Persistence

| Database Engine | Driver / Tool | Role in Project | Schema & Records Stored | Setup / Mode |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL** | `pg` (v8.23.0) | **Cloud Production Database**: Scalable ACID-compliant relational store for national rollout across thousands of schools. | Students, parents, teachers, schools, analytics, session history, and M-PESA transactions. | Active when `DATABASE_URL` is set in `.env` (Supabase, Render Postgres, Neon, or AWS RDS). |
| **Embedded JSON Store** | Native Node.js `fs` / atomic write | **Zero-Config Embedded Store**: High-speed, local persistence for development, offline testing, and skateboard deployments. | Files: `students.json`, `parents.json`, `sessions.json`, `analytics.json`, `teachers.json`, `admin.json`. | Default active mode when `DATABASE_URL` is omitted. Located in `data/`. |

---

### 2.6 Backend Framework, Cryptography & Security Middleware

| Tool / Package | Version | Security & Operational Function | Key Implementation |
| :--- | :--- | :--- | :--- |
| **Express.js** | `^4.19.2` | Core web application framework, routing APIs, student session streaming, and rendering portals. | [server.js](file:///d:/Local%20Disk/Projects/Elingu/elingu-starter/elingu-starter/server.js) |
| **bcryptjs** | `^3.0.3` | One-way cryptographic salting and hashing for 4-digit student PINs and 6-digit family passwords. Defends against rainbow tables and timing attacks. | [authUtils.js](file:///d:/Local%20Disk/Projects/Elingu/elingu-starter/elingu-starter/authUtils.js) |
| **express-rate-limit** | `^8.5.2` | Prevents brute-force credential stuffing attacks against PIN reset, login, and OTP verification endpoints. | [server.js](file:///d:/Local%20Disk/Projects/Elingu/elingu-starter/elingu-starter/server.js) |
| **dotenv** | `^16.4.5` | Isolates secret API keys and environment configurations from version control. | `.env` |
| **Node.js Crypto** | Native `node:crypto` | Generates cryptographically secure random OTP codes, UUID tokens, and parent activation hashes. | [authUtils.js](file:///d:/Local%20Disk/Projects/Elingu/elingu-starter/elingu-starter/authUtils.js) |

---

### 2.7 Client-Side Browser Engines & Native Web APIs

| API / Feature | Technology | Functionality Delivered | Dependencies |
| :--- | :--- | :--- | :--- |
| **Text-to-Speech (TTS)** | Native `window.speechSynthesis` | Reads Socratic explanations aloud to younger learners (Grade 6) and auditory learners with zero network overhead. | $0.00 (Native browser API) |
| **Voice Recognition (STT)** | Native `webkitSpeechRecognition` | Allows hands-free audio voice questions from students into the prompt bar. | $0.00 (Native browser API) |
| **Dual Theme Engine** | Pure CSS Custom Properties | Instant toggle between warm cream **Light Mode** and deep emerald **Forest Night Dark Mode**. | Zero third-party CSS libraries |
| **Responsive Glassmorphic UI** | CSS3 Backdrop Filter & Grid | Clean, lightweight UI with zero framework overhead (no React/Vue runtime download required on low-bandwidth 3G connections). | Pure HTML5 / CSS3 |

---

## 3. Financial & Operational Cost Summary

| Tool / Service | Skateboard / Beta Cost | Production Scale Cost | How to Scale |
| :--- | :--- | :--- | :--- |
| **Google Gemini API** | **$0.00** (Free Tier) | ~$0.075 per 1M input tokens | Enable billing on Google Cloud console when daily queries exceed 1,500. |
| **Anthropic Claude API** | Pay-as-you-go (~$1–$5/mo) | Scales with usage | Dedicated only to emotional distress detection and complex reasoning. |
| **Nodemailer (Gmail)** | **$0.00** | **$0.00** (Up to 500 emails/day) | Free forever for initial parent onboarding. |
| **Resend** | **$0.00** (Up to 3,000 emails/mo) | $20/month for 50,000 emails | Verify custom domain at `resend.com/domains` when moving to high volume. |
| **Render.com Hosting** | **$0.00** (Free Web Service) | $7/month (Starter instance) | Upgrade to paid instance to prevent container spin-down after inactivity. |
| **PostgreSQL Database** | **$0.00** (Free SQLite/Render PG) | $7–$15/month | Switch from JSON files to managed PostgreSQL by setting `DATABASE_URL`. |
| **Safaricom Daraja** | **$0.00** sandbox setup | Per-transaction standard fee | Shift from Daraja Sandbox to Safaricom Live Paybill/Till number. |

---

## 4. Master Environment Configuration Reference

The following table documents all environment variables used by the external tools in `.env`:

```env
# ── AI ENGINES ───────────────────────────────────────────────
GOOGLE_API_KEY=your_gemini_key_from_aistudio.google.com
GEMINI_MODEL=gemini-flash-lite-latest
OPENAI_API_KEY=your_openai_key_from_platform.openai.com
OPENAI_MODEL=gpt-4o-mini
GROQ_API_KEY=your_groq_key_from_console.groq.com
GROQ_MODEL=qwen/qwen3.8-27b
ANTHROPIC_API_KEY=your_claude_key_from_console.anthropic.com

# ── TRANSACTIONAL EMAIL (OPTION 1: FREE GMAIL SMTP) ──────────
GMAIL_USER=elingu.app@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# ── TRANSACTIONAL EMAIL (OPTION 2: RESEND API) ───────────────
RESEND_API_KEY=re_your_resend_api_key_here
RESEND_FROM=onboarding@resend.dev
RESEND_FROM_NAME=Elingu

# ── PAYMENTS (SAFARICOM DARAJA M-PESA) ────────────────────────
MPESA_CONSUMER_KEY=your_daraja_consumer_key
MPESA_CONSUMER_SECRET=your_daraja_consumer_secret
MPESA_PASSKEY=your_daraja_passkey
MPESA_SHORTCODE=174379

# ── CLOUD DATABASE (POSTGRESQL) ──────────────────────────────
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
DATABASE_SSL=true

# ── APP RUNTIME ──────────────────────────────────────────────
PORT=3000
BASE_URL=http://localhost:3000
```
