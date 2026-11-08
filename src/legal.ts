// Stoner Bud-E — legal content (About, Privacy Policy, Terms of Service).
//
// Plain words, written to match what the code actually does — read
// api/sync.ts, api/chat.ts, and src/lib/auth-server.ts before changing a
// claim here. No ads, no trackers, no analytics anywhere in the app.
// Keep APP_VERSION in step with package.json.

export const APP_VERSION = '0.1.0';
export const COPYRIGHT = '© 2026 N3xUs Konc3pt\u2019z';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDoc {
  id: 'about' | 'privacy' | 'terms';
  title: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: 'about',
    title: 'About Bud-E',
    intro:
      'Bud-E is a 21+ session buddy for the night you already started. Chat, timers, a journal, your stash, and a plan for tonight — in plain words, with no lecture.',
    sections: [
      {
        heading: 'What it does',
        paragraphs: [
          'Talk it through with Buddy (live AI when you are online, an offline buddy when you are not). Set an edible timer and get told when the wait is over. Keep a journal of what worked. Track your stash. Take a tolerance break when you want one.',
          'Signing in is optional. Without an account everything stays on this device. With an account your journal, stash, and settings follow you to your other devices — your chat never does. It always stays on this device only.',
        ],
      },
      {
        heading: 'Who makes it',
        paragraphs: [
          `${COPYRIGHT}. Bud-E is made by N3xUs Konc3pt\u2019z. Version ${APP_VERSION}.`,
          'Bud-E is a buddy, not a doctor, not a shop, and not legal advice. Start low, go slow. Never drive high.',
        ],
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    intro:
      'Plain version: Bud-E collects as little as possible. Your chat stays on your phone. Your journal and stash only leave your phone if you sign in — and then they go to your own account, nowhere else. No ads, no trackers, nothing sold.',
    sections: [
      {
        heading: 'What you give us',
        paragraphs: [
          'If you create an account, we store your name and email address, and a scrambled (hashed) version of your password — never the password itself. Your password is never stored on this device and never shared.',
          'If you sign in, your journal entries, stash items, and settings (theme, tonight\u2019s session, vibe, and tolerance break) are stored in our database (Neon Postgres) under your account, so they can follow you to your other devices. If you never sign in, none of that ever leaves this device.',
        ],
      },
      {
        heading: 'What the chat sends',
        paragraphs: [
          'When you chat with Buddy, your last few messages are sent to Groq (Groq Cloud) so it can write a reply. For questions about today — the weather, the news, a score — Groq may also search the web. That is the only reason anything from your chat ever leaves this device.',
          'Your chat transcript is never saved on our server and never synced. It stays on this device only, and it is cleared when you delete your account.',
        ],
      },
      {
        heading: 'What we never do',
        paragraphs: [
          'No ads. No trackers. No analytics. We do not sell your data, share it with advertisers, or send you email — Bud-E sends no email at all. The only other company that ever sees any of your data is Groq (to answer your chat) and Neon (to store your synced journal, stash, and settings).',
        ],
      },
      {
        heading: 'Deleting your account',
        paragraphs: [
          'You can delete your account any time from Settings → Legal → Delete my account. Deleting removes your account and everything stored under it — your journal, stash, settings, and sessions — from our database, and clears your journal, stash, and chat from this device too. There is no undo.',
          'Signing out is different from deleting: signing out leaves everything saved on this device, and your account stays as it is.',
        ],
      },
      {
        heading: '21+ only',
        paragraphs: [
          'Bud-E is for adults 21 and over. We do not knowingly collect anything from anyone under 21.',
        ],
      },
      {
        heading: 'Changes',
        paragraphs: [
          'If this policy changes, the copy inside the app is the current one. The app never emails you, so there is no email notice.',
        ],
      },
    ],
  },
  {
    id: 'terms',
    title: 'Terms of Service',
    intro:
      'Short version: Bud-E is for adults 21 and over. It teaches and keeps you safer — it is not a doctor, not a shop, and not the law. Be safe, be honest with yourself, and follow your local laws.',
    sections: [
      {
        heading: '21+ only',
        paragraphs: [
          'You must be 21 or older to use Bud-E. If you are under 21, do not use the app.',
        ],
      },
      {
        heading: 'Not medical advice',
        paragraphs: [
          'Everything Bud-E tells you about cannabis is education and harm reduction, not medical advice. Bud-E is not a doctor and cannot diagnose or treat anything. If you have a health question, ask a real clinician.',
        ],
      },
      {
        heading: 'The AI can be wrong',
        paragraphs: [
          'Buddy answers all kinds of questions, not just cannabis ones, and it can be wrong — about facts, about doses, about anything. Check important things with a real source before you act on them.',
        ],
      },
      {
        heading: 'No buying or selling',
        paragraphs: [
          'Nothing in Bud-E lets you buy or sell cannabis or anything else. There is no shop, no ordering, and no payment.',
        ],
      },
      {
        heading: 'Be safe, follow your local laws',
        paragraphs: [
          'Never drive high. Start low, go slow, and wait at least two hours before taking more of an edible. Laws are different everywhere — in Texas, recreational cannabis is illegal — so know your local law and do not use the app to break it.',
        ],
      },
      {
        heading: 'Your account',
        paragraphs: [
          'Keep your password to yourself. You are responsible for what happens on your account.',
        ],
      },
      {
        heading: 'Deleting your account',
        paragraphs: [
          'You can delete your account any time from Settings → Legal → Delete my account. That wipes your account and everything stored under it, on the server and on this device. There is no undo.',
        ],
      },
      {
        heading: 'As-is',
        paragraphs: [
          'Bud-E is provided as-is. We can change it, or stop it, at any time. If these terms change, the copy inside the app is the current one.',
        ],
      },
    ],
  },
];

export function getLegalDoc(id: LegalDoc['id']): LegalDoc {
  const doc = LEGAL_DOCS.find((d) => d.id === id);
  if (!doc) throw new Error(`Unknown legal doc: ${id}`);
  return doc;
}
