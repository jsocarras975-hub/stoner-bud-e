// Stoner Bud-E — local answer engine + shared data.
// Pure TypeScript, no browser APIs, no network. Used by the React app
// directly and by the Vercel serverless function (for the system prompt).

export type Method = 'flower' | 'edible' | 'vape' | 'dab' | 'drink' | 'other';
export type Experience = 'new' | 'some' | 'experienced';

export interface Session {
  method: Method;
  amount: string; // mg for edibles/drinks, grams for flower — kept as a string so "2.5" stays exact
  unit: 'mg' | 'g';
  timeTaken: string; // "HH:MM" 24-hour clock, "" when not set
  experience: Experience;
}

export interface ChatMessage {
  role: 'user' | 'bud';
  text: string;
  /** Web sources for a live-AI reply (title + link), when the answer came from a search. */
  sources?: { title: string; url: string }[];
}

export const DEFAULT_SESSION: Session = {
  method: 'edible',
  amount: '10',
  unit: 'mg',
  timeTaken: '',
  experience: 'some',
};

export const METHOD_LABELS: Record<Method, string> = {
  flower: 'Flower',
  edible: 'Edible',
  vape: 'Vape',
  dab: 'Dab',
  drink: 'Drink',
  other: 'Other',
};

/** System prompt for the live-AI path (Groq). Warm, plain-spoken, any topic — harm-reduction rules stay for cannabis questions. */
export const BUD_E_SYSTEM_PROMPT = [
  'You are Bud-E, a warm, funny, plain-spoken buddy for adults 21+. Talk like a chill friend, not a textbook and never a doctor. Keep it simple, everyday language.',
  'Answer ANY question the user asks — cooking, tech, homework, everyday life, news, whatever. Never refuse or dodge a question just because it is not about cannabis. If you do not know something, say so plainly instead of guessing.',
  'When the user asks about something current — news, scores, weather, prices, what is happening right now — use the web search tool first, then answer with what you found.',
  'Cannabis and session questions stay harm-reduction first: start low and go slow, never drive while high, never share with anyone under 21.',
  'Never diagnose anything or give medical advice. If symptoms sound serious (chest pain, trouble breathing, fainting, non-stop vomiting), say to get real help right away.',
  'Use the session details the user gave you (what they took, how much, when, how experienced they are) and give real numbers and real clock times in your answers.',
  'For edibles: onset is usually 45–90 minutes, peak 2–4 hours after taking it, lasts 4–8 hours (up to 12). Never tell someone to redose before 2 hours have passed.',
  'Keep replies short: 2–5 sentences, then one short follow-up question — unless the user asks for more detail.',
  'If a pet ate edibles, the answer is always: call a vet or emergency vet right away, do not induce vomiting unless a vet says so.',
  'Recreational cannabis is illegal in Texas; hemp-derived THC products sit in a grey area. Keep that short and say it is not legal advice.',
].join(' ');

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** "HH:MM" -> minutes since midnight, or null when blank/invalid. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Minutes since midnight -> "7:45 PM". */
export function formatClock(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Minutes since the session's time-taken, or null when no time is set. */
export function minutesSinceTaken(session: Session, now: Date = new Date()): number | null {
  const taken = parseClock(session.timeTaken);
  if (taken === null) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Wrap around midnight: a 11:30 PM dose at 12:30 AM is 60 minutes ago, not 23 hours.
  return (nowMin - taken + 1440) % 1440;
}

function describeSession(session: Session): string {
  const amount = session.amount.trim();
  const amountBit = amount ? ` ${amount}${session.unit}` : '';
  const methodBit = METHOD_LABELS[session.method].toLowerCase();
  return `${methodBit}${amountBit}`;
}

function edibleTimeline(session: Session, now: Date): string {
  const since = minutesSinceTaken(session, now);
  const taken = parseClock(session.timeTaken);
  const amount = session.amount.trim();
  const doseBit = amount ? `That ${amount}${session.unit} edible` : 'That edible';
  if (since === null || taken === null) {
    return (
      `${doseBit} usually kicks in 30–120 minutes after you take it (most people feel it around 45–90), ` +
      `peaks 2–4 hours in, and lasts 4–8 hours, sometimes up to 12. ` +
      `Set your time taken up top and I can do the exact math for you.`
    );
  }
  const waitUntil = formatClock(taken + 120);
  const peakStart = formatClock(taken + 120);
  const peakEnd = formatClock(taken + 240);
  if (since < 120) {
    const left = 120 - since;
    return (
      `${doseBit} — you're only ${since} minute${since === 1 ? '' : 's'} in, and edibles usually take 45–90 minutes to show up. ` +
      `It's almost certainly just too early. Do NOT take more. Wait until at least ${waitUntil} — that's ${left} more minute${left === 1 ? '' : 's'} — ` +
      `then see how you feel. Peak is usually ${peakStart} to ${peakEnd} for you.`
    );
  }
  if (since < 240) {
    return (
      `${doseBit} — you're about ${Math.floor(since / 60)} hour${since >= 120 ? 's' : ''} in, right in the peak window ` +
      `(${peakStart} to ${peakEnd}). It should be doing its thing by now and will ease off over the next few hours. ` +
      `Sip some water and ride it out.`
    );
  }
  return (
    `${doseBit} — you're ${Math.floor(since / 60)}+ hours in, so you're past the peak and on the way down. ` +
    `Edibles can hang around 4–8 hours total (up to 12), so feeling mellow or sleepy for a while longer is normal.`
  );
}

// ---------------------------------------------------------------------------
// Local answer engine
// ---------------------------------------------------------------------------

const SERIOUS_RE =
  /chest pain|can.?t breathe|trouble breathing|faint|passed out|pass out|seizure|throwing up blood|vomit(ing)? blood|heart attack|stroke|numb|overdose/i;
const PET_RE = /\b(dog|cat|puppy|kitten|pet)\b.{0,40}\b(ate|eaten|eat|got into|chewed)\b|\b(ate|eaten|got into)\b.{0,40}\b(edible|gummy|weed|pot|thc)/i;
const DRIVE_RE = /\b(driv(e|ing)|car|road|behind the wheel)\b/i;
const LAW_RE = /\b(legal|illegal|law|texas|police|cop|arrest|jail)\b/i;
const TOO_HIGH_RE =
  /\b(too high|green(ing)? out|spinning|anxious|anxiety|panic|paranoid|heart racing|racing heart|scared|freaking|dizzy|nausea|nauseous|throw(ing)? up|vomit)\b/i;
const NOTHING_RE =
  /\b(feel nothing|don.?t feel|not feeling|nothing happening|not working|not kicking|hasn.?t kicked|no effect|when will (it|this) (hit|kick)|how long (till|until|before))\b/i;
const REDOSE_RE = /\b(redose|take more|another (one|dose|gummy|hit|puff)|more (mg|weed|edible)|second (dose|gummy|one)|eat another|smoke more)\b/i;
const EDIBLE_RE = /\b(edible|gummy|gummies|brownie|cookie|chocolate|weed brownie)\b/i;
const MUNCHIES_RE = /\b(munchies|snack|hungry|food|eat something|craving)\b/i;
const SLEEP_RE = /\b(sleep|sleepy|tired|insomnia|can.?t sleep|nap|bed)\b/i;
const DOSE_RE = /\b(how much|dose|dosage|start|beginner|first time|new to|too much|mg|milligram)\b/i;
const TOLERANCE_RE = /\b(tolerance|t-break|tolerance break|not working anymore|used to it|need more to feel)\b/i;
const HELLO_RE = /^(hi|hey|hello|yo|sup|what'?s up|good (evening|night|morning|afternoon))\b/i;

/**
 * Answer locally, using the real session numbers. Every branch ends with one
 * short follow-up question so the chat keeps moving.
 */
export function localReply(input: string, session: Session, history: ChatMessage[]): string {
  const text = input.trim();
  const lower = text.toLowerCase();
  const now = new Date();
  const since = minutesSinceTaken(session, now);
  const sessionBit = describeSession(session);
  const isEdible = session.method === 'edible' || session.method === 'drink';
  const historyText = history
    .slice(-6)
    .map((m) => m.text.toLowerCase())
    .join(' ');
  const talkedEdibles = EDIBLE_RE.test(historyText) || isEdible;

  // Serious symptoms always win — get real help, fast.
  if (SERIOUS_RE.test(lower)) {
    return (
      `Okay, stop and take this seriously for a sec: chest pain, trouble breathing, fainting, or a seizure means get real help right now — call 911 or get to urgent care / the ER. ` +
      `I can't tell if it's serious from here, and this is the one time you don't wait it out. ` +
      `Are you alone right now, or is someone with you?`
    );
  }

  // Pet ate edibles — always the vet, immediately.
  if (PET_RE.test(lower) || (/\b(dog|cat|pet|puppy)\b/i.test(lower) && /\b(ate|eat|eaten|got)\b/i.test(lower))) {
    return (
      `If your pet ate edibles, call a vet or an emergency vet right now — don't wait to see how they act. ` +
      `Tell them what it was and roughly how much. Do NOT try to make them throw up unless a vet tells you to. ` +
      `How long ago did they eat it, and how are they acting?`
    );
  }

  // Driving.
  if (DRIVE_RE.test(lower)) {
    return (
      `Simple rule, no exceptions: never drive high. Wait until you're fully sober — and if you took an edible, ` +
      `that means after a full night's sleep, not just when you feel "okay-ish." ` +
      `Need help sorting a ride or a place to crash instead?`
    );
  }

  // Too high / greening out.
  if (TOO_HIGH_RE.test(lower)) {
    return (
      `You're alright — this feeling passes, even when it really doesn't feel like it. Lie down somewhere comfy, ` +
      `sip water, eat a little snack if you can, and get some fresh air or a cool room. CBD won't undo it fast, ` +
      `and neither will a shower trick — time is the real fix, usually a couple hours. ` +
      `Want me to run the breathing bubble with you for a minute?`
    );
  }

  // Redose guard — firm but friendly, with the real wait time.
  if (REDOSE_RE.test(lower)) {
    if (isEdible && since !== null && since < 120) {
      const taken = parseClock(session.timeTaken);
      const waitUntil = taken === null ? 'two hours after you took it' : formatClock(taken + 120);
      return (
        `Nope — not yet, buddy. You're only ${since} minutes into that ${sessionBit}, and edibles stack up sneaky. ` +
        `Taking more now is how a chill night turns into a "never again" story. Wait until at least ${waitUntil} ` +
        `before you even think about it. Want me to set the edible timer for you?`
      );
    }
    if (isEdible && since !== null) {
      return (
        `You're ${Math.floor(since / 60)}+ hours into that ${sessionBit}, so you're past the "too early" zone. ` +
        `If you do take more, go small — half of what you started with — and give it another full 2 hours. ` +
        `How are you feeling right now, honestly?`
      );
    }
    return (
      `Easy does it — if it's an edible, always wait a full 2 hours before even thinking about more, because it stacks. ` +
      `For smoking or vaping, wait 15–20 minutes between hits and see where you land. ` +
      `What did you take, and how long ago?`
    );
  }

  // "Feel nothing" — the classic edible trap. Use the real clock.
  if (NOTHING_RE.test(lower)) {
    if (isEdible) return `${edibleTimeline(session, now)} What are you doing while you wait — show, music, or just chilling?`;
    return (
      `If it's flower or a vape, give it 15–20 minutes — it usually lands faster than you think. ` +
      `If it was an edible, that's a different story: those take 45–90 minutes. What did you take?`
    );
  }

  // General edible question.
  if (EDIBLE_RE.test(lower) || (talkedEdibles && /\b(how long|when|timeline|kick|peak|last)\b/i.test(lower))) {
    return `${edibleTimeline(session, now)} How's your vibe right now — couch, outside, or with friends?`;
  }

  // Texas law — short, not legal advice.
  if (LAW_RE.test(lower)) {
    return (
      `Quick version: recreational weed is still illegal in Texas, and hemp-derived THC stuff (like Delta-8) lives in a grey area ` +
      `that keeps changing — this isn't legal advice, just the lay of the land. Keep amounts small and don't drive with it. ` +
      `Want the plain version of anything else, or back to the fun stuff?`
    );
  }

  // Munchies.
  if (MUNCHIES_RE.test(lower)) {
    return (
      `Oh, the munchies have entered the chat. Go for the good stuff — something salty AND something sweet hits best. ` +
      `Drink a glass of water first, then snack slow so you don't demolish the whole kitchen. ` +
      `Want me to spin the Munchies Maker in the Tools tab and pick for you?`
    );
  }

  // Sleep.
  if (SLEEP_RE.test(lower)) {
    return (
      `Weed can make you sleepy, but it's sneaky sleep — you might doze off fast and still wake up groggy. ` +
      `Dim the lights, put the phone down, and if you took an edible, remember it can linger 4–8 hours, so morning might feel foggy too. ` +
      `Are you trying to wind down for the night, or fighting to stay up?`
    );
  }

  // Dosing / start low go slow — use the real amount.
  if (DOSE_RE.test(lower)) {
    const amount = Number(session.amount);
    if (isEdible && !Number.isNaN(amount) && amount > 0) {
      if (session.experience === 'new' && amount > 5) {
        return (
          `Real talk: ${amount}${session.unit} is a lot for a first-timer — most new folks start at 2.5–5 mg. ` +
          `You already took it, so no stressing now: just don't take more, drink water, and give it the full 2 hours. ` +
          `Next time, want to try starting at 5 mg?`
        );
      }
      return (
        `You're at ${amount}${session.unit} on that ${sessionBit} — that's a solid ${session.experience === 'experienced' ? 'regular' : 'middle-of-the-road'} dose. ` +
        `Golden rule stays the same: start low, go slow, and for edibles, wait the full 2 hours before more. ` +
        `How's it treating you so far?`
      );
    }
    return (
      `Golden rule: start low, go slow. New to edibles? Start at 2.5–5 mg and wait a full 2 hours. ` +
      `Smoking or vaping? One or two small hits, wait 15 minutes. You can always take more — you can't take less. ` +
      `What are you working with tonight?`
    );
  }

  // Tolerance break.
  if (TOLERANCE_RE.test(lower)) {
    return (
      `Yeah, tolerance is real — same amount, less magic. A break of even 2–3 days helps a little, ` +
      `a week or two resets things a lot more. When you come back, start at half your usual dose. ` +
      `Thinking about taking a little break, or just curious?`
    );
  }

  // Greeting / first message.
  if (HELLO_RE.test(lower) || history.filter((m) => m.role === 'user').length <= 1) {
    const sessionLine =
      session.timeTaken && parseClock(session.timeTaken) !== null
        ? ` I see your ${sessionBit} from ${formatClock(parseClock(session.timeTaken)!)} — I'll keep that in mind.`
        : '';
    return (
      `Heyy, welcome in. I'm Bud-E, your session buddy — no judgment, just good vibes and straight answers.${sessionLine} ` +
      `Tell me what's up: how you feeling, what you took, or just hit me with a question. ` +
      `What's the plan for tonight?`
    );
  }

  // Default — stay warm, reference the session, ask a follow-up.
  return (
    `Got you. ${session.timeTaken ? `For tonight's ${sessionBit}, ` : ''}the main things are: start low, go slow, ` +
    `drink some water, and don't drive anywhere. If you tell me what you took and when, I can get way more specific. ` +
    `So — what did you take tonight, and how are you feeling right now?`
  );
}

// ---------------------------------------------------------------------------
// Tools data
// ---------------------------------------------------------------------------

export const SNACK_COMBOS: string[] = [
  'Salty popcorn + gummy bears — the classic sweet-and-salty tag team.',
  'Nachos with cheese + a cold soda. Crunchy, melty, perfect.',
  'Peanut butter toast + banana slices. Sweet, filling, zero effort.',
  'Ice cream straight from the tub + salty pretzels on the side.',
  'Chips and salsa + a big glass of ice water. Hydrate while you crunch.',
  'Grilled cheese + tomato soup. Warm, gooey, couch-approved.',
  'Fruit bowl (mango + strawberries) + whipped cream. Cold and sweet.',
  'Ramen noodles + a soft-boiled egg. Slurpy comfort in 5 minutes.',
  'Cereal, dry, straight from the box. No bowl, no rules.',
  'Quesadilla + sour cream + hot sauce. Cheesy with a little kick.',
  'Frozen grapes + dark chocolate squares. Fancy, but make it lazy.',
  'PB&J sandwich + a glass of cold milk. Childhood, upgraded.',
];

export const HIGH_THOUGHTS: string[] = [
  'Do fish ever get thirsty? Asking for a friend.',
  'If you bite it and you die, it\'s poisonous. If it bites you and you die, it\'s venomous. What if we\'re both just... vibing?',
  'Somewhere out there, someone is eating a sandwich you\'ll never taste. Wild.',
  'Why do we say "tuna fish" but never "chicken bird"?',
  'Your couch has seen things. It keeps your secrets.',
  'What if the moon is just the Earth\'s night-light?',
  'Somebody invented the high-five and just... decided. Legend.',
  'Do you think clouds ever look down and go "that one looks like a couch"?',
  'The snack you want right now already knows you want it.',
  'If time is money, naps are a heist.',
  'What if dogs think our "sit" is just a weird trick we do?',
  'Every pizza is a personal pizza if you believe in yourself.',
  'Is cereal soup? Defend your answer. You have 4 hours.',
  'The fridge light stays on when you close the door. It\'s waiting for you.',
  'Somewhere, a playlist is one song away from being perfect. Go find it.',
];

export interface TriviaQuestion {
  question: string;
  options: string[];
  answer: number; // index into options
  fact: string;
}

export const TRIVIA: TriviaQuestion[] = [
  {
    question: 'What does THC stand for?',
    options: [
      'Tetrahydrocannabinol',
      'Total Hemp Compound',
      'Tri-Hydro Carbon',
      'The High Chemical',
    ],
    answer: 0,
    fact: 'THC is the main compound that gets you high.',
  },
  {
    question: 'What gives cannabis its smell and flavor?',
    options: ['Terpenes', 'Chlorophyll', 'Seeds', 'The stems'],
    answer: 0,
    fact: 'Terpenes are the aromatic oils — like limonene (citrusy) and myrcene (earthy).',
  },
  {
    question: 'How long do edibles usually take to kick in?',
    options: ['Instantly', '5–10 minutes', '30–120 minutes', '6 hours'],
    answer: 2,
    fact: 'Most people feel edibles in 45–90 minutes. That\'s why the 2-hour wait rule matters.',
  },
  {
    question: 'What does CBD do on its own?',
    options: [
      'Gets you just as high as THC',
      'It is non-intoxicating — it will not get you high',
      'It cancels out all THC instantly',
      'It only works on pets',
    ],
    answer: 1,
    fact: 'CBD won\'t get you high. It also won\'t undo a high quickly, no matter what the internet says.',
  },
  {
    question: 'Which of these is a real cannabis strain name?',
    options: ['Blue Dream', 'Purple Tractor', 'Green Keyboard', 'Orange Laptop'],
    answer: 0,
    fact: 'Blue Dream is a classic — a sweet, mellow hybrid that\'s been around for years.',
  },
];

export function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
