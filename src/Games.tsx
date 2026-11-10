// Stoner Bud-E — games for when you are high and bored.
// Three little games, all on-device, no network, no accounts:
// - Would You Rather: funny either/or picks, no wrong answers.
// - Guess the Strain: read the vibe, name the strain (uses the 12-strain guide).
// - Memory Match: flip cards, match the pairs, fewest moves wins.
// They live as tiles in the Tools tab, next to Trivia.

import { useMemo, useState } from 'react';
import { STRAINS } from './data/strains';
import type { Strain } from './data/strains';

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Would You Rather — pick one, get a playful reaction, next.
// ---------------------------------------------------------------------------

interface WouldYouRatherQ {
  a: string;
  b: string;
}

const WOULD_YOU_RATHER: WouldYouRatherQ[] = [
  { a: 'Always have the munchies', b: 'Always have cottonmouth' },
  { a: 'Be able to fly', b: 'Be invisible' },
  { a: 'Only eat pizza forever', b: 'Only eat tacos forever' },
  { a: 'Never have to sleep', b: 'Never have to eat (but food still tastes amazing)' },
  { a: 'Talk to animals', b: 'Speak every language' },
  { a: 'Always be 10 minutes late', b: 'Always be 20 minutes early' },
  { a: 'Have a personal chef', b: 'Have a personal driver' },
  { a: 'Live in a treehouse', b: 'Live on a houseboat' },
  { a: 'Teleport anywhere', b: 'Time travel (but only backwards)' },
  { a: 'Always know the perfect song', b: 'Always know the perfect snack' },
  { a: 'Have unlimited snacks', b: 'Have unlimited naps' },
  { a: 'Be famous for a day', b: 'Be invisible for a day' },
  { a: 'Only watch movies forever', b: 'Only listen to music forever' },
  { a: 'Have a rewind button for life', b: 'Have a pause button for life' },
  { a: 'Always be warm', b: 'Always be cool' },
  { a: 'Eat the same meal every day', b: 'Never eat the same meal twice' },
  { a: 'Know what everyone is thinking', b: 'Know your own future' },
  { a: 'Have a dragon', b: 'Have a unicorn' },
  { a: 'Be the funniest person in the room', b: 'Be the smartest person in the room' },
  { a: 'Always have great hair', b: 'Always have great shoes' },
  { a: 'Never be able to taste food again', b: 'Never be able to smell anything' },
  { a: 'Have a theme song play whenever you walk in', b: 'Have a laugh track follow you' },
  { a: 'Always know when someone is lying', b: 'Always know when someone is high' },
  { a: 'Be able to talk to your pet', b: 'Be able to read minds (but only when high)' },
  { a: 'Live without music', b: 'Live without movies' },
  { a: 'Have a bottomless bag of chips', b: 'Have a bottomless fridge' },
  { a: 'Always have the perfect lighter', b: 'Always have the perfect playlist' },
  { a: 'Be able to pause time', b: 'Be able to rewind time (once a day)' },
  { a: 'Know the exact moment you will fall asleep', b: 'Know the exact moment you will wake up' },
  { a: 'Have a personal sauna', b: 'Have a personal hot tub' },
  { a: 'Only wear tie-dye', b: 'Only wear all black' },
  { a: 'Have a treehouse with WiFi', b: 'Have a cabin with no WiFi' },
  { a: 'Fly, but only 3 feet off the ground', b: 'Teleport, but only to places you have been' },
  { a: 'Always have popcorn', b: 'Always have ice cream' },
  { a: 'Watch the same movie 100 times', b: 'Watch a new movie every day (but never rewatch)' },
  { a: 'Have a pet dragon that snores', b: 'Have a pet unicorn that farts glitter' },
  { a: 'Eat anything without gaining weight', b: 'Sleep anywhere instantly' },
  { a: 'Always be the DJ', b: 'Always be the chef' },
  { a: 'Have a hammock everywhere you go', b: 'Have a beanbag everywhere you go' },
  { a: 'Know all the lyrics', b: 'Know all the dance moves' },
  { a: 'Have a time machine that only goes to yesterday', b: 'Have a time machine that only goes to tomorrow' },
  { a: 'Be able to make any plant grow', b: 'Be able to make any food taste amazing' },
  { a: 'Always have a full phone battery', b: 'Always have perfect WiFi' },
  { a: 'Live in a world with no clocks', b: 'Live in a world with no mirrors' },
  { a: 'Have a rewind button for conversations', b: 'Have a mute button for people' },
  { a: 'Be able to breathe underwater', b: 'Be able to survive in space' },
  { a: 'Always have a snack in your pocket', b: 'Always have a lighter in your pocket' },
  { a: 'Have a personal theme park', b: 'Have a personal movie theater' },
  { a: 'Be able to talk to plants', b: 'Be able to talk to your past self' },
  { a: 'Always be barefoot', b: 'Always wear shoes (even in bed)' },
  { a: 'Have a magic fridge that makes any food', b: 'Have a magic closet that makes any outfit' },
  { a: 'Know the answer to any question', b: 'Know the future (but only 10 seconds ahead)' },
  { a: 'Have a pet that talks', b: 'Have a car that talks' },
  { a: 'Live on a beach', b: 'Live in the mountains' },
  { a: 'Always be laughing', b: 'Always be calm' },
  { a: 'Have a superpower that only works when you are high', b: 'Have no superpower but unlimited snacks' },
  { a: 'Stop time for 10 seconds', b: 'Rewind 10 seconds (unlimited times)' },
  { a: 'Have a personal chef who only makes breakfast', b: 'Have a personal chef who only makes dessert' },
  { a: 'Always have the munchies at 2am', b: 'Always crave a nap at 2pm' },
  { a: 'Be able to remember every high', b: 'Be able to forget every bad high' },
];

const PICK_REACTIONS = [
  'Bold choice.',
  'Classic.',
  'Respect.',
  'A person of taste.',
  'Interesting. Very interesting.',
  'No notes.',
  'That tracks.',
  'Living dangerously.',
];

export function WouldYouRather() {
  const [order, setOrder] = useState<number[]>(() => shuffle(WOULD_YOU_RATHER.map((_, i) => i)));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState<'a' | 'b' | null>(null);
  const [answered, setAnswered] = useState(0);
  const reaction = useMemo(() => PICK_REACTIONS[Math.floor(Math.random() * PICK_REACTIONS.length)], [picked]);
  const q = WOULD_YOU_RATHER[order[pos] as number] as WouldYouRatherQ;

  function next() {
    if (pos + 1 >= order.length) {
      setOrder(shuffle(WOULD_YOU_RATHER.map((_, i) => i)));
      setPos(0);
    } else {
      setPos((p) => p + 1);
    }
    setPicked(null);
  }

  function pick(side: 'a' | 'b') {
    if (picked !== null) return;
    setPicked(side);
    setAnswered((n) => n + 1);
  }

  return (
    <section className="card" aria-label="Would you rather">
      <h2 className="tool-title">Would you rather…</h2>
      <p className="muted small">
        Question {pos + 1} of {WOULD_YOU_RATHER.length}
        {answered > 0 ? ` · ${answered} answered` : ''} · No wrong answers.
      </p>
      <p style={{ fontWeight: 700, fontSize: '1.15rem', textAlign: 'center' }}>
        Would you rather…
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button"
          className={'trivia-option' + (picked === 'a' ? ' correct' : '')}
          onClick={() => pick('a')}
          disabled={picked !== null}
        >
          {q.a}
        </button>
        <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>
          — or —
        </p>
        <button
          type="button"
          className={'trivia-option' + (picked === 'b' ? ' correct' : '')}
          onClick={() => pick('b')}
          disabled={picked !== null}
        >
          {q.b}
        </button>
      </div>
      {picked !== null && (
        <>
          <p className="result-box" style={{ textAlign: 'center' }}>
            {reaction} You picked: “{picked === 'a' ? q.a : q.b}”
          </p>
          <button className="btn btn-block" onClick={next}>
            Next one →
          </button>
        </>
      )}
      <div className="button-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            setOrder(shuffle(WOULD_YOU_RATHER.map((_, i) => i)));
            setPos(0);
            setPicked(null);
          }}
        >
          🔀 Shuffle the deck
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Guess the Strain — read the vibe, name the strain. 10 rounds, easy to
// expert: the clues shrink as the rounds go on. Easy gets the blurb +
// flavors + effects; Medium drops the blurb; Hard is one effect only;
// Expert is just the lineage (the parent strains) — strain-nerd territory.
// ---------------------------------------------------------------------------

const GUESS_ROUNDS = 10;

type GuessDifficulty = 'Easy' | 'Medium' | 'Hard' | 'Expert';

/** Difficulty ramps with the round: 3 easy, 3 medium, 2 hard, 2 expert. */
function guessDifficulty(roundIndex: number): GuessDifficulty {
  if (roundIndex < 3) return 'Easy';
  if (roundIndex < 6) return 'Medium';
  if (roundIndex < 8) return 'Hard';
  return 'Expert';
}

interface GuessRound {
  answer: Strain;
  options: Strain[];
  difficulty: GuessDifficulty;
}

function buildGuessRounds(): GuessRound[] {
  const answers = shuffle(STRAINS).slice(0, GUESS_ROUNDS);
  return answers.map((answer, i) => {
    const others = shuffle(STRAINS.filter((s) => s.id !== answer.id)).slice(0, 3);
    return { answer, options: shuffle([answer, ...others]), difficulty: guessDifficulty(i) };
  });
}

/**
 * The clues for one round, by difficulty — never the name.
 * Easy: blurb + flavors + top effects. Medium: flavors + top effect.
 * Hard: top effect only. Expert: lineage only.
 */
function strainClues(
  strain: Strain,
  difficulty: GuessDifficulty,
): { blurb?: string; flavors?: string; effects?: string; lineage?: string } {
  const top = strain.effects
    .slice()
    .sort((a, b) => b.level - a.level)
    .slice(0, 2)
    .map((e) => e.name)
    .join(' · ');
  if (difficulty === 'Expert') return { lineage: strain.lineage };
  if (difficulty === 'Hard') return { effects: top.split(' · ')[0] as string };
  if (difficulty === 'Medium') {
    return { flavors: strain.flavors.join(' · '), effects: top };
  }
  return { blurb: strain.blurb, flavors: strain.flavors.join(' · '), effects: top };
}

export function GuessTheStrain() {
  const [rounds, setRounds] = useState<GuessRound[]>(() => buildGuessRounds());
  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const current = rounds[round] as GuessRound;
  const clues = strainClues(current.answer, current.difficulty);

  function pick(id: string) {
    if (selected !== null) return;
    setSelected(id);
    if (id === current.answer.id) setScore((s) => s + 1);
  }

  function next() {
    if (round + 1 >= rounds.length) {
      setDone(true);
    } else {
      setRound((r) => r + 1);
      setSelected(null);
    }
  }

  function playAgain() {
    setRounds(buildGuessRounds());
    setRound(0);
    setSelected(null);
    setScore(0);
    setDone(false);
  }

  return (
    <section className="card" aria-label="Guess the strain">
      <h2 className="tool-title">Guess the strain</h2>
      {done ? (
        <>
          <p className="score-display">
            {score} / {GUESS_ROUNDS}
          </p>
          <p style={{ textAlign: 'center' }}>
            {score === GUESS_ROUNDS
              ? 'Perfect — you know the garden by heart. 🌿'
              : score >= 7
                ? 'Solid nose. You know your strains.'
                : 'The guide is right there — go study up and run it back.'}
          </p>
          <button className="btn btn-block" onClick={playAgain}>
            🔁 Play again
          </button>
        </>
      ) : (
        <>
          <p className="muted small">
            Round {round + 1} of {GUESS_ROUNDS} · {current.difficulty} · Score: {score}
          </p>
          <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Which strain is this?</p>
          <div className="result-box">
            {clues.blurb && <p style={{ margin: '0 0 8px' }}>{clues.blurb}</p>}
            {clues.flavors && (
              <p className="small" style={{ margin: '0 0 4px' }}>
                <strong>Flavors:</strong> {clues.flavors}
              </p>
            )}
            {clues.effects && (
              <p className="small" style={{ margin: 0 }}>
                <strong>Known for:</strong> {clues.effects}
              </p>
            )}
            {clues.lineage && (
              <p className="small" style={{ margin: 0 }}>
                <strong>From:</strong> {clues.lineage}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {current.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={
                  'trivia-option' +
                  (selected !== null && opt.id === current.answer.id ? ' correct' : '') +
                  (selected === opt.id && opt.id !== current.answer.id ? ' wrong' : '')
                }
                onClick={() => pick(opt.id)}
                disabled={selected !== null}
              >
                {opt.name}
              </button>
            ))}
          </div>
          {selected !== null && (
            <>
              <p className="result-box">
                {selected === current.answer.id
                  ? `Yes — ${current.answer.name}. ${current.answer.type === 'indica' ? 'Indica' : current.answer.type === 'sativa' ? 'Sativa' : 'Hybrid'}, THC about ${current.answer.thcMin}–${current.answer.thcMax}%.`
                  : `Nope — that one is ${current.answer.name}.`}
              </p>
              <button className="btn btn-block" onClick={next}>
                {round + 1 >= rounds.length ? 'See my score' : 'Next strain →'}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Memory Match — flip cards, match the pairs. Fewest moves wins.
// All 12 pairs are marijuana-themed: leaf, herb, seedling, smoke, fire,
// edibles, the flavors (grape, blueberry, lemon), the night, and the fog.
// ---------------------------------------------------------------------------

const MATCH_FACES = ['🍃', '🌿', '🌱', '💨', '🔥', '🍪', '🧁', '🍇', '🫐', '🍋', '🌙', '😶‍🌫️'];

interface MatchCard {
  key: number;
  face: string;
  matched: boolean;
}

function buildDeck(): MatchCard[] {
  const pairs = [...MATCH_FACES, ...MATCH_FACES];
  return shuffle(pairs).map((face, i) => ({ key: i, face, matched: false }));
}

export function MemoryMatch() {
  const [cards, setCards] = useState<MatchCard[]>(() => buildDeck());
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [lock, setLock] = useState(false);
  const matchedCount = cards.filter((c) => c.matched).length;
  const done = matchedCount === cards.length && cards.length > 0;

  function flip(key: number) {
    if (lock || done) return;
    if (flipped.includes(key)) return;
    const card = cards.find((c) => c.key === key);
    if (!card || card.matched) return;
    const next = [...flipped, key];
    setFlipped(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next as [number, number];
      const cardA = cards.find((c) => c.key === a);
      const cardB = cards.find((c) => c.key === b);
      if (cardA && cardB && cardA.face === cardB.face) {
        // A match — keep them face up.
        setCards((prev) =>
          prev.map((c) => (c.key === a || c.key === b ? { ...c, matched: true } : c)),
        );
        setFlipped([]);
      } else {
        // No match — flip them back after a beat.
        setLock(true);
        window.setTimeout(() => {
          setFlipped([]);
          setLock(false);
        }, 800);
      }
    }
  }

  function playAgain() {
    setCards(buildDeck());
    setFlipped([]);
    setMoves(0);
    setLock(false);
  }

  return (
    <section className="card" aria-label="Memory match">
      <h2 className="tool-title">Memory match</h2>
      <p className="muted small">
        Flip two cards — match all {MATCH_FACES.length} pairs. Moves: {moves}
        {done ? ` · Done in ${moves} moves!` : ''}
      </p>
      {done ? (
        <>
          <p className="score-display">🎉 {moves} moves</p>
          <p style={{ textAlign: 'center' }}>
            {moves <= 16
              ? 'Sharp. That is a great run.'
              : moves <= 24
                ? 'Nice — matched them all.'
                : 'All matched! Run it back for a better score.'}
          </p>
          <button className="btn btn-block" onClick={playAgain}>
            🔁 Play again
          </button>
        </>
      ) : (
        <div className="memory-grid" role="grid" aria-label="Memory cards">
          {cards.map((card) => {
            const faceUp = card.matched || flipped.includes(card.key);
            return (
              <button
                key={card.key}
                type="button"
                className={'memory-card' + (faceUp ? ' up' : '') + (card.matched ? ' matched' : '')}
                onClick={() => flip(card.key)}
                aria-label={faceUp ? card.face : 'Face-down card'}
              >
                {faceUp ? card.face : '🍃'}
              </button>
            );
          })}
        </div>
      )}
      <div className="button-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn ghost sm" onClick={playAgain}>
          🔀 New game
        </button>
      </div>
    </section>
  );
}
