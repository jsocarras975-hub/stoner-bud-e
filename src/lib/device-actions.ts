// Stoner Bud-E — device actions: read the JSON action block out of a chat
// reply and run it on the phone. The server only ever emits one of the
// five v1 actions (see api/chat.ts ACTIONS_GUIDE). On the plain web there
// is no phone to act on, so the block is stripped and the user gets a
// plain note instead. Everything is guarded — a bad action, a missing
// plugin, or a refused phone call never breaks the chat.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { isNativeApp } from './timer-notifications';

export type DeviceAction =
  | { action: 'set_alarm'; hour: number; minute: number; label?: string }
  | { action: 'set_timer'; seconds: number; label?: string }
  | { action: 'set_reminder'; minutes: number; text: string }
  | { action: 'add_event'; title: string; startMillis: number; endMillis: number; description?: string }
  | { action: 'flashlight'; on: boolean };

const ACTION_BLOCK_RE = /```action\s*\n?([\s\S]*?)\n?```/;

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value;
}

/** Validate the parsed JSON into one of the five known actions, or null. */
function cleanAction(value: unknown): DeviceAction | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  switch (rec.action) {
    case 'set_alarm': {
      if (!isInt(rec.hour) || rec.hour < 0 || rec.hour > 23) return null;
      if (!isInt(rec.minute) || rec.minute < 0 || rec.minute > 59) return null;
      return {
        action: 'set_alarm',
        hour: rec.hour,
        minute: rec.minute,
        ...(typeof rec.label === 'string' && rec.label.trim() !== ''
          ? { label: rec.label.trim().slice(0, 80) }
          : {}),
      };
    }
    case 'set_timer': {
      if (!isInt(rec.seconds) || rec.seconds <= 0 || rec.seconds > 86400) return null;
      return {
        action: 'set_timer',
        seconds: rec.seconds,
        ...(typeof rec.label === 'string' && rec.label.trim() !== ''
          ? { label: rec.label.trim().slice(0, 80) }
          : {}),
      };
    }
    case 'set_reminder': {
      if (!isInt(rec.minutes) || rec.minutes <= 0 || rec.minutes > 60 * 24 * 7) return null;
      if (typeof rec.text !== 'string' || rec.text.trim() === '') return null;
      return { action: 'set_reminder', minutes: rec.minutes, text: rec.text.trim().slice(0, 200) };
    }
    case 'add_event': {
      if (typeof rec.title !== 'string' || rec.title.trim() === '') return null;
      if (!isInt(rec.startMillis) || rec.startMillis <= 0) return null;
      if (!isInt(rec.endMillis) || rec.endMillis <= rec.startMillis) return null;
      return {
        action: 'add_event',
        title: rec.title.trim().slice(0, 120),
        startMillis: rec.startMillis,
        endMillis: rec.endMillis,
        ...(typeof rec.description === 'string' && rec.description.trim() !== ''
          ? { description: rec.description.trim().slice(0, 500) }
          : {}),
      };
    }
    case 'flashlight': {
      if (typeof rec.on !== 'boolean') return null;
      return { action: 'flashlight', on: rec.on };
    }
    default:
      return null;
  }
}

/**
 * Split a chat reply into the text the user sees and the action the phone
 * should run (if any). The action block is always stripped from the text,
 * so the JSON is never shown or spoken.
 */
export function extractDeviceAction(reply: string): {
  text: string;
  action: DeviceAction | null;
} {
  const match = ACTION_BLOCK_RE.exec(reply);
  if (!match) return { text: reply.trim(), action: null };
  const text = reply.replace(ACTION_BLOCK_RE, '').replace(/ {2,}/g, ' ').trim();
  let action: DeviceAction | null = null;
  try {
    action = cleanAction(JSON.parse(match[1].trim()));
  } catch {
    action = null;
  }
  return { text, action };
}

/** The device's local wall-clock time as ISO with offset (e.g. 2026-11-09T15:30:00-06:00). */
export function localIsoNow(): string {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n: number): string => String(Math.abs(n)).padStart(2, '0');
  const hh = pad(Math.floor(Math.abs(off) / 60));
  const mm = pad(Math.abs(off) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`
  );
}

interface BudEActionsPlugin {
  execute(options: { action: DeviceAction }): Promise<{ ok: boolean; message: string }>;
}

const BudEActions = registerPlugin<BudEActionsPlugin>('BudEActions');

/**
 * Run one action on the phone through the native BudEActions plugin.
 * Returns ok:false with a plain message when it cannot run (not the
 * installed app, plugin missing, or the phone refused).
 */
export async function executeDeviceAction(
  action: DeviceAction,
): Promise<{ ok: boolean; message: string }> {
  if (!isNativeApp()) return { ok: false, message: 'not a native app' };
  try {
    const res = await BudEActions.execute({ action });
    if (res && typeof res.ok === 'boolean') {
      return { ok: res.ok, message: typeof res.message === 'string' ? res.message : '' };
    }
    return { ok: false, message: 'the phone did not answer' };
  } catch {
    return { ok: false, message: 'the phone could not do that' };
  }
}

/** True only inside the installed phone app (re-exported for callers). */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
