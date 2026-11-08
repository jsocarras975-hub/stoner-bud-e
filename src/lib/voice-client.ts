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

// --- Playback ---------------------------------------------------------------

let currentAudio: HTMLAudioElement | null = null;
/** Bumped by stopVoice() so a playback in progress knows it was cancelled. */
let playToken = 0;

/** Stop whatever is speaking — Groq clips and the device voice. Safe anywhere. */
export function stopVoice(): void {
  playToken++;
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
      const played = await playClip(clip, isStopped);
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

/** Read text with the device's own voice, in this persona's pitch and rate. */
export function deviceSpeak(text: string, personaId: PersonaId): void {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const persona = personaById(personaId);
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    if (en) utter.voice = en;
    utter.pitch = persona.pitch;
    utter.rate = persona.rate;
    window.speechSynthesis.speak(utter);
  } catch {
    // No speech on this device.
  }
}
