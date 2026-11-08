// Stoner Bud-E — voice personas + voice settings.
// Pure TypeScript, no browser APIs, no network. Used by the React app
// (persona picker, device-voice fallback) and by the Vercel serverless
// functions (Groq voice id + direction for /api/voice/speak, tone line for
// /api/chat) — same pattern as src/bude.ts.

export type PersonaId = 'chill' | 'cosmic' | 'giggly' | 'wise';

export interface Persona {
  id: PersonaId;
  name: string;
  /** One plain line shown under the picker in Settings. */
  tagline: string;
  /** Orpheus voice id for Groq TTS. */
  voice: string;
  /** Direction spoken to the TTS model, e.g. "[relaxed]". */
  direction: string;
  /** Extra line appended to the live-AI system prompt for this persona. */
  tone: string;
  /** Device speechSynthesis fallback. */
  pitch: number;
  rate: number;
}

export const PERSONAS: Persona[] = [
  {
    id: 'chill',
    name: 'Chill',
    tagline: 'Your easygoing default buddy.',
    voice: 'troy',
    direction: '[relaxed]',
    tone: 'Keep your tone extra relaxed and easygoing, like a friend on the porch.',
    pitch: 0.9,
    rate: 0.95,
  },
  {
    id: 'cosmic',
    name: 'Cosmic',
    tagline: 'Dreamy, a little spacey, full of wonder.',
    voice: 'autumn',
    direction: '[dreamy]',
    tone: 'Lean dreamy and wonder-filled — a little cosmic, a lot of warmth, still plain words.',
    pitch: 1.2,
    rate: 0.9,
  },
  {
    id: 'giggly',
    name: 'Giggly',
    tagline: 'Light, playful, always smiling.',
    voice: 'hannah',
    direction: '[cheerful]',
    tone: 'Be light and playful, quick with a smile, never mean.',
    pitch: 1.3,
    rate: 1.05,
  },
  {
    id: 'wise',
    name: 'Wise',
    tagline: 'Calm, grounded, the old soul.',
    voice: 'austin',
    direction: '[calm]',
    tone: 'Be calm and grounded, like a wise old friend — steady, patient, plain words.',
    pitch: 0.8,
    rate: 0.9,
  },
];

export function isPersonaId(value: unknown): value is PersonaId {
  return PERSONAS.some((p) => p.id === value);
}

export function personaById(id: PersonaId): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

export interface VoiceSettings {
  persona: PersonaId;
  /** Speak Bud-E's replies out loud (Groq voice, or the device voice). */
  voiceReplies: boolean;
  /** Play a reply as soon as it arrives, instead of waiting for a tap. */
  autoPlay: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  persona: 'chill',
  voiceReplies: true,
  autoPlay: true,
};

/** Validate stored / server voice settings — anything unknown falls back to the defaults. */
export function cleanVoiceSettings(value: unknown): VoiceSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_VOICE_SETTINGS };
  const v = value as Partial<VoiceSettings>;
  return {
    persona: isPersonaId(v.persona) ? v.persona : 'chill',
    voiceReplies: typeof v.voiceReplies === 'boolean' ? v.voiceReplies : true,
    autoPlay: typeof v.autoPlay === 'boolean' ? v.autoPlay : true,
  };
}
