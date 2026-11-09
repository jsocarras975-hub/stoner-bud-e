// Stoner Bud-E — voice on the device (browser only).
// MediaRecorder tap-to-talk, the /api/voice calls, Groq clip playback, and
// the device speechSynthesis fallback. Every function no-ops safely when the
// browser lacks the API it needs. The chat transcript is never sent here —
// only the recorded clip (transcribe) or one reply's text (speak).

import { personaById } from '../voice';
import type { PersonaId } from '../voice';

/** A recording in progress: call stop() to finish and get the audio. */
export interface ActiveRecording {
  stop: () => Promise<Blob | null>;
}

/**
 * Start recording from the mic. Returns null when the mic is denied or the
 * browser cannot record — the caller shows a plain note and moves on.
 */
export async function startRecording(): Promise<ActiveRecording | null> {
  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      return null;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
    const recorder =
      mimeType !== undefined ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start();
    let stopped = false;
    return {
      stop: () =>
        new Promise<Blob | null>((resolve) => {
          if (stopped) {
            resolve(null);
            return;
          }
          stopped = true;
          recorder.onstop = () => {
            stream.getTracks().forEach((track) => track.stop());
            resolve(
              chunks.length > 0
                ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
                : null,
            );
          };
          try {
            recorder.stop();
          } catch {
            stream.getTracks().forEach((track) => track.stop());
            resolve(null);
          }
        }),
    };
  } catch {
    // Mic denied, no mic, or recording failed to start.
    return null;
  }
}

/**
 * Send a recorded clip to /api/voice/transcribe. Returns the transcript, or
 * null when nothing came back / the call failed.
 */
export async function transcribeVoice(apiBase: string, blob: Blob): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('audio', blob, 'audio.webm');
    const res = await fetch(`${apiBase}/voice/transcribe`, { method: 'POST', body: form });
    const data: unknown = await res.json().catch(() => null);
    if (data && typeof data === 'object' && (data as { ok?: unknown }).ok === true) {
      const text = (data as { text?: unknown }).text;
      return typeof text === 'string' ? text : null;
    }
    return null;
  } catch {
    return null;
  }
}

// --- Audio unlock -----------------------------------------------------------
// Android WebView/Chrome blocks audio that starts outside a user gesture
// (autoplay policy). The Groq clips arrive after an async fetch, so
// `new Audio(...).play()` gets blocked and the reply stays silent — and the
// speechSynthesis fallback can stay silent in a locked WebView too.
// Fix: keep one AudioContext that a user gesture creates/resumes. Playing
// the clips through it counts as unlocked audio.

let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

/**
 * Create/resume the shared AudioContext. Call inside a user gesture (tap,
 * send) — the chat's send, speaker, and mic buttons all do. Safe anywhere;
 * no-ops where Web Audio is missing.
 */
export function unlockAudio(): void {
  try {
    if (typeof window === 'undefined') return;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (audioCtx === null) audioCtx = new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    // No Web Audio on this device — the HTMLAudioElement path still tries.
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Play one base64 WAV clip through the unlocked AudioContext. False when
 * there is no unlocked context, or the clip would not play.
 */
async function playClipViaContext(base64: string, isStopped: () => boolean): Promise<boolean> {
  const ctx = audioCtx;
  if (ctx === null) return false;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const bytes = base64ToBytes(base64);
    // decodeAudioData wants a plain ArrayBuffer (it detaches it), so copy
    // the bytes into one instead of handing over the Uint8Array's buffer.
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const buffer = await ctx.decodeAudioData(ab);
    if (isStopped()) return false;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    currentSource = source;
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
      // Safety: never hang forever if onended never fires.
      window.setTimeout(resolve, (buffer.duration + 1) * 1000);
    });
    if (currentSource === source) currentSource = null;
    return !isStopped();
  } catch {
    if (currentSource !== null) {
      try {
        currentSource.stop();
      } catch {
        // Already stopped.
      }
      currentSource = null;
    }
    return false;
  }
}

// --- Playback ---------------------------------------------------------------

let currentAudio: HTMLAudioElement | null = null;
/** Bumped by stopVoice() so a playback in progress knows it was cancelled. */
let playToken = 0;

/** Stop whatever is speaking — Groq clips and the device voice. Safe anywhere. */
export function stopVoice(): void {
  playToken++;
  if (currentSource !== null) {
    try {
      currentSource.stop();
    } catch {
      // Already stopped — nothing to do.
    }
    currentSource = null;
  }
  if (currentAudio !== null) {
    try {
      currentAudio.pause();
    } catch {
      // Already stopped — nothing to do.
    }
    currentAudio = null;
  }
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // No speech on this device.
  }
}

/** Play one base64 WAV clip. False when it could not play, or was stopped. */
async function playClip(base64: string, isStopped: () => boolean): Promise<boolean> {
  let audio: HTMLAudioElement | null = null;
  try {
    audio = new Audio(`data:audio/wav;base64,${base64}`);
    currentAudio = audio;
    await audio.play();
  } catch {
    if (currentAudio === audio) currentAudio = null;
    return false;
  }
  const el = audio;
  await new Promise<void>((resolve) => {
    const done = () => {
      window.clearInterval(id);
      resolve();
    };
    const id = window.setInterval(() => {
      if (isStopped() || el.ended) done();
    }, 100);
    el.addEventListener('ended', done, { once: true });
    el.addEventListener('error', done, { once: true });
  });
  if (currentAudio === el) currentAudio = null;
  return !isStopped();
}

/**
 * Speak one reply out loud: Groq voice clips first, the device voice when
 * Groq is unavailable. Stops any reply already playing. Resolves when the
 * reply finishes (or is stopped) — safe to fire and forget.
 */
export async function speakVoice(
  apiBase: string,
  text: string,
  personaId: PersonaId,
): Promise<void> {
  const trimmed = text.trim();
  if (trimmed === '') return;
  stopVoice();
  // Best effort: if this call happens inside a gesture (speaker tap), the
  // context unlocks here. Auto-play after a send relies on the chat's own
  // unlock call in the send handler.
  unlockAudio();
  const myToken = playToken;
  const isStopped = () => myToken !== playToken;

  let clips: string[] = [];
  try {
    const res = await fetch(`${apiBase}/voice/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed, persona: personaId }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (data && typeof data === 'object' && (data as { ok?: unknown }).ok === true) {
      const raw = (data as { clips?: unknown }).clips;
      if (Array.isArray(raw)) {
        clips = raw.filter((c): c is string => typeof c === 'string' && c !== '');
      }
    }
  } catch {
    clips = [];
  }
  if (isStopped()) return;

  if (clips.length > 0) {
    for (const clip of clips) {
      if (isStopped()) return;
      // Unlocked AudioContext first (the path Android WebView allows), the
      // plain audio element next, the device voice last.
      let played = false;
      if (audioCtx !== null) played = await playClipViaContext(clip, isStopped);
      if (!played && !isStopped()) played = await playClip(clip, isStopped);
      if (!played) {
        // A clip would not play (autoplay blocked, bad audio, ...) — fall
        // back to the device voice for the whole reply.
        if (!isStopped()) deviceSpeak(trimmed, personaId);
        return;
      }
    }
    return;
  }
  deviceSpeak(trimmed, personaId);
}

/** Read text with the device's own voice, in this persona's pitch and rate.
 *  Picks the best device voice it can: US English first, Google's voices
 *  (the most natural ones on Android) next, and a voice whose name matches
 *  the persona's gender — instead of just taking whatever voice the device
 *  lists first. */
export function deviceSpeak(text: string, personaId: PersonaId): void {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const persona = personaById(personaId);
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const en = window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith('en'));
    if (en.length > 0) {
      const score = (v: SpeechSynthesisVoice): number => {
        let s = 0;
        const name = v.name.toLowerCase();
        const lang = v.lang.toLowerCase();
        if (lang === 'en-us' || lang.startsWith('en-us')) s += 2;
        if (name.includes('google')) s += 2;
        // 'female' contains 'male', so check female first and exclude it
        // from the male match.
        const readsFemale = name.includes('female');
        if (persona.gender === 'female' && readsFemale) s += 2;
        if (persona.gender === 'male' && name.includes('male') && !readsFemale) s += 2;
        return s;
      };
      let best = en[0];
      for (const v of en) {
        if (score(v) > score(best)) best = v;
      }
      utter.voice = best;
    }
    utter.pitch = persona.pitch;
    utter.rate = persona.rate;
    window.speechSynthesis.speak(utter);
  } catch {
    // No speech on this device.
  }
}
