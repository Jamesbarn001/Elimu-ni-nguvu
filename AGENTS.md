# Antigravity Model & Task Routing Rule

## 1. Backend & Deep Reasoning (Claude)
- Use the primary Claude session for all core backend development, server routing (server.js), authentication flows, data storage (studentStore.js), security safeguards, and CBE Socratic pedagogical logic.
- Complex architectural refactors, debugging tricky asynchronous issues, and deep code reviews should be executed here.
- As you do this please ensure economical use of tokens but at the same time do not compromise on quality. Your best judgement is key here.
## 2. Speed, Search & Research Tasks (Gemini Flash)
- For repository-wide searches, rapid file indexing, dependency lookups, or quick documentation reads, delegate to background subagents with Model: 'flash' or Model: 'flash_lite'.
- This ensures near-instant turnaround without interrupting deep coding or exhausting token limits.

## 3. Asset & Image Generation (Google Imagen / Gemini)
- Whenever visual diagrams, UI icons, badges, or learning illustrations are needed, invoke the native generate_image tool directly.
- The visual prompt will be processed by Google's image generation engine and the resulting image saved directly to the project's assets.
