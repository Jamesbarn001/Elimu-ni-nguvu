# Elingu — Starter (Month 1 "Skateboard")

This is the simplest possible working version of Elingu: a child types a message,
it reaches Claude through a basic Socratic system prompt, and a guiding question
comes back. No curriculum backend, no memory, no subjects yet — that comes next.
The goal here is just to prove the full pipeline works end to end.

## 1. Install Node.js

Download the LTS version from https://nodejs.org if you don't already have it.
Check it worked by running in a terminal:

    node -v

You should see a version number (v18 or higher is fine).

## 2. Get an Anthropic API key

Go to https://console.anthropic.com/, sign up, and create an API key under
"API Keys". You'll get a small amount of free credit to start testing with —
enough for hundreds of test conversations.

## 3. Open this folder in Antigravity or VS Code

Open the `elingu-starter` folder as a project/workspace.

## 4. Install dependencies

In the built-in terminal (Antigravity and VS Code both have one — usually
under the "Terminal" menu), run:

    npm install

## 5. Add your API key

Copy `.env.example` to a new file called `.env`, then paste your real key in:

    cp .env.example .env

Open `.env` and replace `your_key_here` with the key you copied from Anthropic.

## 6. Run it

    npm start

Then open your browser to:

    http://localhost:3000

Type something as if you were a curious 10-year-old and see how Elingu responds.

## 7. What to do next — prompts to give your AI coding agent

Once this is running, you can hand the project to Antigravity's agent (or
Claude Code, if you set that up later) and ask it to extend things one step
at a time. Good first requests, in order:

1. "Add a subject selector so the child can pick Mathematics, English, or
   Science before chatting, and pass that into the system prompt."
2. "Add a simple grade selector (Grade 6 to 9) that adjusts the tone and
   complexity of the system prompt for that age."
3. "Store each conversation in a local SQLite database so I can look back at
   what was discussed."
4. "After every 6 messages, generate a short 'thinking summary' of how this
   child reasons and store it, so future conversations can reference it."

Build one piece at a time. Test each one with real questions before moving
to the next. This is exactly the Month 1 to Month 2 transition described in
the build plan — one subject, done properly, before expanding.

## A note on the system prompt

Open `server.js` and find `SYSTEM_PROMPT`. This is the actual Socratic engine —
the most important piece of writing in the whole product. Edit it, test it,
rewrite it. It will never be "finished." Treat every strange or flat response
from Elingu as a signal to refine this prompt, not a code bug.
