// Stoner Bud-E — hands-free driving mode.
// One tap and Bud-E talks and listens without touching the phone: it
// records, transcribes, asks the chat, speaks the reply, then listens again.
// Big simple screen, big Stop button, screen kept awake while it runs.
// The driving talk is NOT saved to the chat list (like the bubble chat) —
// it is just for the drive. Device actions from Bud-E's replies still run
// (stash, log, reminders, calls) through the same path as the chat.

import { useEffect, useRef, useState } from 'react';
import { speakVoice, startRecording, stopVoice, transcribeVoice, unlockAudio } from './lib/voice-client';
import type { ActiveRecording } from './lib/voice-client';
import {
  executeDeviceAction,
  extractDeviceAction,
  isAppAction,
  isImageSearchAction,
  isNative,
} from './lib/device-actions';
import type { AppAction } from './lib/device-actions';
import type { PersonaId } from './voice';
import type { Session } from './bude';
import type { Personalization } from './lib/sync';

type DriveStatus = 'off' | 'listening' | 'thinking' | 'speaking';

/** How long one listen lasts before it sends what it heard (seconds). */
const LISTEN_SECONDS = 20;

/** Short history kept for the drive, so Bud-E remembers the last few turns. */
interface DriveMessage {
  role: 'user' | 'assistant';
  text: string;
}

export default function DrivingMode(props: {
  apiBase: string;
  persona: PersonaId;
  session: Session;
  journalNote: string;
  stashNote: string;
  personalization: Personalization;
  /** Run an app action (stash, log, open a tab) — returns a note or null. */
  onAppAction: (action: AppAction) => string | null;
  onClose: () => void;
}) {
  const { apiBase, persona, session, journalNote, stashNote, personalization, onAppAction, onClose } = props;
  const [status, setStatus] = useState<DriveStatus>('off');
  const [lastHeard, setLastHeard] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [note, setNote] = useState('');

  // Refs so the async loop always sees the current values.
  const runningRef = useRef(false);
  const recordingRef = useRef<ActiveRecording | null>(null);
  const historyRef = useRef<DriveMessage[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  function clearStopTimer(): void {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }

  /** Stop the current recording (if any) and return its audio, or null. */
  async function stopRecording(): Promise<Blob | null> {
    clearStopTimer();
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return null;
    try {
      return await rec.stop();
    } catch {
      return null;
    }
  }

  /** Ask the chat for a reply to one heard line. Returns the clean reply text. */
  async function askBudE(text: string): Promise<string> {
    const history: DriveMessage[] = [...historyRef.current, { role: 'user', text }];
    const res = await fetch(`${apiBase}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: history.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        session,
        persona,
        personalization: {
          buddyName: personalization.buddyName,
          userName: personalization.userName,
          replyLength: personalization.replyLength,
          chatStyle: personalization.chatStyle,
        },
        ...(journalNote !== '' ? { journal: journalNote } : {}),
        ...(stashNote !== '' ? { stash: stashNote } : {}),
      }),
    });
    const data: unknown = await res.json().catch(() => null);
    const reply =
      data && typeof data === 'object' && 'reply' in data
        ? (data as { reply?: unknown }).reply
        : undefined;
    if (typeof reply !== 'string' || reply.trim() === '') {
      throw new Error('no reply');
    }
    const { text: cleanText, action } = extractDeviceAction(reply);
    let finalText = cleanText;
    if (action) {
      if (isImageSearchAction(action)) {
        // Pictures cannot be shown while driving — just say so.
        finalText = `${cleanText}\n\nI found pictures, but I can't show them while you're driving — ask again when you're parked.`;
      } else if (isAppAction(action)) {
        const actionNote = onAppAction(action);
        if (actionNote) finalText = `${cleanText}\n\n${actionNote}`;
      } else if (isNative()) {
        const done = await executeDeviceAction(action);
        if (!done.ok) finalText = `${cleanText}\n\nI couldn't do that one — ${done.message}`;
      }
    }
    historyRef.current = [...history.slice(-6), { role: 'assistant', text: finalText }];
    return finalText;
  }

  /** One full turn: listen, ask, speak. Loops itself while driving is on. */
  async function runTurn(): Promise<void> {
    if (!runningRef.current) return;
    setStatus('listening');
    setNote('');
    const rec = await startRecording();
    if (!runningRef.current) return;
    if (!rec) {
      setNote("Couldn't use the mic — check the mic permission, then tap Start again.");
      setStatus('off');
      return;
    }
    recordingRef.current = rec;
    // Auto-send after the listen window, so a turn never hangs.
    stopTimerRef.current = window.setTimeout(() => {
      void finishListening();
    }, LISTEN_SECONDS * 1000);
  }

  /** Stop listening now, transcribe, and answer. Called by the timer or the big button. */
  async function finishListening(): Promise<void> {
    if (!runningRef.current) return;
    const blob = await stopRecording();
    if (!runningRef.current) return;
    if (!blob) {
      setNote("Didn't hear anything — listening again.");
      void runTurn();
      return;
    }
    setStatus('thinking');
    const text = await transcribeVoice(apiBase, blob);
    if (!runningRef.current) return;
    if (!text || text.trim() === '') {
      setNote("Didn't catch that — listening again.");
      void runTurn();
      return;
    }
    setLastHeard(text.trim());
    try {
      const reply = await askBudE(text.trim());
      if (!runningRef.current) return;
      setLastReply(reply);
      setStatus('speaking');
      await speakVoice(apiBase, reply, persona);
    } catch {
      if (!runningRef.current) return;
      setNote('Lost the connection for a second — listening again.');
    }
    if (!runningRef.current) return;
    void runTurn();
  }

  /** Start driving: unlock audio, keep the screen awake, start the loop. */
  async function startDriving(): Promise<void> {
    unlockAudio();
    runningRef.current = true;
    setNote('');
    setLastHeard('');
    setLastReply('');
    try {
      const nav = navigator as unknown as {
        wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request('screen');
      }
    } catch {
      // No wake lock on this device — the screen may dim, driving still works.
    }
    void runTurn();
  }

  /** Stop everything and close. */
  async function stopDriving(): Promise<void> {
    runningRef.current = false;
    clearStopTimer();
    await stopRecording();
    stopVoice();
    try {
      await wakeLockRef.current?.release();
    } catch {
      // Already released — nothing to do.
    }
    wakeLockRef.current = null;
    onClose();
  }

  // Clean up if the overlay unmounts mid-drive.
  useEffect(() => {
    return () => {
      runningRef.current = false;
      clearStopTimer();
      void stopRecording();
      stopVoice();
      void wakeLockRef.current?.release().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusLine =
    status === 'listening'
      ? '🎙️ Listening… tap the big button when you are done talking'
      : status === 'thinking'
        ? '💭 Thinking…'
        : status === 'speaking'
          ? '🔊 Bud-E is talking…'
          : 'Ready when you are.';

  return (
    <div
      className="driving-overlay"
      role="dialog"
      aria-label="Hands Free"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: 20,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          🎙️ Hands Free
        </h1>
        <button type="button" className="btn secondary" onClick={() => void stopDriving()}>
          ✕ Close
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        Hands-free: Bud-E listens, answers out loud, then listens again. This talk is not saved to
        your chats — it is just for this session. Never look at the screen while the car is moving.
      </p>

      <p className="muted" style={{ marginTop: 12 }}>
        {statusLine}
      </p>

      {lastHeard !== '' && (
        <div className="card" aria-label="What you said">
          <p className="eyebrow">You said</p>
          <p style={{ fontSize: '1.25rem', margin: '4px 0 0' }}>{lastHeard}</p>
        </div>
      )}

      {lastReply !== '' && (
        <div className="card" aria-label="What Bud-E said">
          <p className="eyebrow">Bud-E said</p>
          <p style={{ fontSize: '1.25rem', margin: '4px 0 0' }}>{lastReply}</p>
        </div>
      )}

      {note !== '' && (
        <p className="muted" role="status">
          {note}
        </p>
      )}

      <div style={{ flex: 1 }} />

      {status === 'off' ? (
        <button
          type="button"
          className="btn btn-block"
          style={{ padding: '20px 16px', fontSize: '1.25rem', marginTop: 16 }}
          onClick={() => void startDriving()}
        >
          ▶️ Start hands-free
        </button>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-block"
            style={{ padding: '20px 16px', fontSize: '1.25rem', marginTop: 16 }}
            onClick={() => void finishListening()}
            disabled={status !== 'listening'}
          >
            🎙️ Done talking — answer me
          </button>
          <button
            type="button"
            className="btn danger btn-block"
            style={{ padding: '16px', marginTop: 12 }}
            onClick={() => void stopDriving()}
          >
            ■ Stop
          </button>
        </>
      )}
    </div>
  );
}
