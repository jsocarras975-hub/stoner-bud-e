# 🌿 Stoner Bud-E

Your 21+ cannabis session buddy. A warm, funny, plain-spoken web app (and future Android app)
that helps you keep a session chill and safe: chat with Bud-E, run an edible timer, breathe,
find munchies, and build a plan for tonight.

**Bud-E is a buddy, not a doctor.** Start low, go slow. Never drive high. If a pet eats
edibles, call a vet right away.

## What it does

- **Chat** — talk to Bud-E. Session panel up top (what you took, how much, when, how
  experienced you are) so answers use your real numbers — e.g. an edible taken 45 minutes
  ago + "I feel nothing" gets the exact clock time to wait until, and a firm no on redosing.
  Chat is saved on your device (localStorage) and can be cleared.
- **Tools** — vibe check-in, edible timer (counts down to the 2-hour mark, from your session
  time or a manual wait), breathing bubble (4 in / 4 hold / 4 out), munchies maker, high-thought
  prompts, and a 5-question trivia game.
- **My Plan** — tonight's plan auto-built from your session + vibe + timer, with a Copy button.
- **Live AI or offline buddy** — a small badge shows "Live AI" when Gemini answered and
  "Offline buddy" when the built-in local engine answered. The local engine always works,
  key or no key.

## Run it locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

```bash
npm run build    # typecheck + production build (output in dist/)
npm run preview  # serve the production build locally
```

## Live AI (optional)

Live answers come from Google Gemini, model **`gemini-3.5-flash-lite`**.

> ⚠️ Do NOT use `gemini-2.5-flash` — it is retired for new keys and returns 404.

1. Get a free key at [Google AI Studio](https://aistudio.google.com/apikey).
2. **On Vercel:** Project Settings → Environment Variables → add `GEMINI_API_KEY`
   (Production + Preview), then redeploy.
3. **Locally:** copy `.env.example` to `.env` and put the key in it. `.env` is gitignored —
   never commit a real key. (Note: `vite preview` does not run the serverless function, so
   local live-AI testing needs `vercel dev` or a deployed preview.)

With no key set, `/api/chat` returns `{ source: "fallback" }` and the app answers locally.
The API never returns a 500 to the client — any Gemini error degrades to fallback.

## Build the Android app (parent's step — documented here)

```bash
npx cap add android   # first time only
npx cap sync          # copy the web build (dist/) into the Android project
npx cap open android  # open in Android Studio, then build a debug APK
```

The web app must be built first (`npm run build`) — Capacitor packages `dist/`.

## Stack

Vite + React 19 + TypeScript (strict) + Capacitor. No UI libraries, no secrets in code.
`src/bude.ts` holds the local answer engine, system prompt, and tools data; `api/chat.ts`
is the Vercel serverless function that calls Gemini.
