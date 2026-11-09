// Stoner Bud-E — device actions: read the JSON action block out of a chat
// reply and run it on the phone. The server only ever emits one of the
// seven actions (see api/chat.ts ACTIONS_GUIDE). On the plain web there
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
  | { action: 'flashlight'; on: boolean }
  | { action: 'call_contact'; name?: string; number?: string }
  | { action: 'text_contact'; name?: string; number?: string; message: string };

const ACTION_BLOCK_RE = /```action\s*\n?([\s\S]*?)\n?```/;

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value;
}

/** Validate the parsed JSON into one of the seven known actions, or null. */
function cleanAction(value: unknown): DeviceAction | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  // Call/text target: a contact name, a number, or both (name wins).
  const target = (
    rec: Record<string, unknown>,
  ): { name?: string; number?: string } | null => {
    const out: { name?: string; number?: string } = {};
    if (typeof rec.name === 'string' && rec.name.trim() !== '') {
      out.name = rec.name.trim().slice(0, 100);
    }
    if (typeof rec.number === 'string' && rec.number.trim() !== '') {
      out.number = rec.number.trim().slice(0, 40);
    }
    return out.name !== undefined || out.number !== undefined ? out : null;
  };
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
    case 'call_contact': {
      const who = target(rec);
      if (!who) return null;
      return { action: 'call_contact', ...who };
    }
    case 'text_contact': {
      const who = target(rec);
      if (!who) return null;
      if (typeof rec.message !== 'string' || rec.message.trim() === '') return null;
      return { action: 'text_contact', ...who, message: rec.message.trim().slice(0, 1000) };
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
  getLaunchInfo(): Promise<{ tab?: string; sharedText?: string }>;
  getTalkNotification(): Promise<{ enabled?: boolean }>;
  setTalkNotification(options: { enabled: boolean }): Promise<{ enabled?: boolean }>;
  getAssistantStatus(): Promise<{ isAssistant?: boolean }>;
  openDefaultAppsSettings(): Promise<{ ok?: boolean }>;
  publishWidgetStash(options: { stashLine: string; lowLine: string }): Promise<{ ok?: boolean }>;
  getBubbleStatus(): Promise<{ enabled?: boolean; canDrawOverlays?: boolean }>;
  setBubbleEnabled(options: { enabled: boolean }): Promise<{ enabled?: boolean }>;
  openOverlaySettings(): Promise<{ ok?: boolean }>;
}

const BudEActions = registerPlugin<BudEActionsPlugin>('BudEActions');

/**
 * One-shot launch info (a shortcut's tab, text shared in from another
 * app). The native side clears it on read, so it never fires twice.
 * Empty on the plain web.
 */
export async function getLaunchInfo(): Promise<{ tab: string; sharedText: string }> {
  if (!isNativeApp()) return { tab: '', sharedText: '' };
  try {
    const res = await BudEActions.getLaunchInfo();
    return {
      tab: typeof res?.tab === 'string' ? res.tab : '',
      sharedText: typeof res?.sharedText === 'string' ? res.sharedText : '',
    };
  } catch {
    return { tab: '', sharedText: '' };
  }
}

/** Whether the persistent Talk notification is switched on. */
export async function getTalkNotification(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const res = await BudEActions.getTalkNotification();
    return res?.enabled === true;
  } catch {
    return false;
  }
}

/** Switch the persistent Talk notification on or off. */
export async function setTalkNotification(enabled: boolean): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const res = await BudEActions.setTalkNotification({ enabled });
    return res?.enabled === true;
  } catch {
    return false;
  }
}

/** Whether Bud-E is the phone's default digital assistant right now. */
export async function getAssistantStatus(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const res = await BudEActions.getAssistantStatus();
    return res?.isAssistant === true;
  } catch {
    return false;
  }
}

/** Open the phone's Default apps settings page (the manual fallback). */
export async function openDefaultAppsSettings(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await BudEActions.openDefaultAppsSettings();
  } catch {
    // Best effort — the button just stays put.
  }
}

/**
 * Write the home-screen widget's stash line (totals + the first low
 * jar, if any). Best effort — the widget just keeps its old line.
 */
export async function publishWidgetStash(stashLine: string, lowLine: string): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await BudEActions.publishWidgetStash({ stashLine, lowLine });
  } catch {
    // Best effort — the widget just keeps its old line.
  }
}

/** Floating bubble: is it switched on, and may Bud-E draw over other apps? */
export async function getBubbleStatus(): Promise<{ enabled: boolean; canDrawOverlays: boolean }> {
  if (!isNativeApp()) return { enabled: false, canDrawOverlays: false };
  try {
    const res = await BudEActions.getBubbleStatus();
    return {
      enabled: res?.enabled === true,
      canDrawOverlays: res?.canDrawOverlays === true,
    };
  } catch {
    return { enabled: false, canDrawOverlays: false };
  }
}

/** Switch the floating chat bubble on or off. */
export async function setBubbleEnabled(enabled: boolean): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const res = await BudEActions.setBubbleEnabled({ enabled });
    return res?.enabled === true;
  } catch {
    return false;
  }
}

/** Open the page where the phone allows Bud-E to draw over other apps. */
export async function openOverlaySettings(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await BudEActions.openOverlaySettings();
  } catch {
    // Best effort — the button just stays put.
  }
}

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
