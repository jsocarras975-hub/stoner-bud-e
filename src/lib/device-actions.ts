// Stoner Bud-E — device actions: read the JSON action block out of a chat
// reply and run it on the phone. The server only ever emits one of the
// twelve actions (see api/chat.ts ACTIONS_GUIDE): seven phone actions and
// five app actions (stash add/subtract, log a session, open a tab, image
// search). On the plain web there is no phone to act on, so the block is
// stripped and the user gets a plain note instead. Everything is guarded —
// a bad action, a missing plugin, or a refused phone call never breaks the
// chat. Image search is async (it calls Openverse directly from the app),
// so App.tsx handles it directly instead of through the sync onAppAction
// path — it is deliberately NOT in AppAction, so the bubble/voice relay
// never picks it up (those screens cannot show pictures).

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

/** Actions that change the app itself (stash, journal, navigation). */
export type AppAction =
  | { action: 'stash_add'; name: string; amount: number; unit: 'g' | 'mg' | 'pieces' }
  | { action: 'stash_subtract'; name: string; amount: number; unit: 'g' | 'mg' | 'pieces' }
  | { action: 'log_session'; strain: string; amount: number; unit: 'mg' | 'g'; method?: string }
  | { action: 'open_tab'; tab: string };

export type ChatAction = DeviceAction | AppAction | ImageSearchAction;

/** Web image search — runs in the app itself (fetches /api/images/search).
 *  Kept out of AppAction on purpose: it is async, and the bubble/voice
 *  relay must never pick it up. */
export type ImageSearchAction = { action: 'image_search'; query: string };

/** True when the action is a web image search. */
export function isImageSearchAction(action: ChatAction): action is ImageSearchAction {
  return action.action === 'image_search';
}

/** True when the action changes the app (stash, journal, navigation). */
export function isAppAction(action: ChatAction): action is AppAction {
  return (
    action.action === 'stash_add' ||
    action.action === 'stash_subtract' ||
    action.action === 'log_session' ||
    action.action === 'open_tab'
  );
}

const ACTION_BLOCK_RE = /```action\s*\n?([\s\S]*?)\n?```/;

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value;
}

/** Validate the parsed JSON into one of the twelve known actions, or null. */
function cleanAction(value: unknown): ChatAction | null {
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
  // Stash amount: a positive number, in g, mg, or pieces.
  const stashAmount = (
    rec: Record<string, unknown>,
  ): { amount: number; unit: 'g' | 'mg' | 'pieces' } | null => {
    if (typeof rec.amount !== 'number' || !Number.isFinite(rec.amount)) return null;
    if (rec.amount <= 0 || rec.amount > 100000) return null;
    if (rec.unit !== 'g' && rec.unit !== 'mg' && rec.unit !== 'pieces') return null;
    return { amount: rec.amount, unit: rec.unit };
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
    case 'stash_add':
    case 'stash_subtract': {
      if (typeof rec.name !== 'string' || rec.name.trim() === '') return null;
      const amount = stashAmount(rec);
      if (!amount) return null;
      return { action: rec.action, name: rec.name.trim().slice(0, 100), ...amount };
    }
    case 'log_session': {
      if (typeof rec.strain !== 'string' || rec.strain.trim() === '') return null;
      if (typeof rec.amount !== 'number' || !Number.isFinite(rec.amount)) return null;
      if (rec.amount <= 0 || rec.amount > 100000) return null;
      if (rec.unit !== 'mg' && rec.unit !== 'g') return null;
      const method =
        typeof rec.method === 'string' &&
        ['flower', 'edible', 'vape', 'dab', 'drink', 'other'].includes(rec.method)
          ? rec.method
          : undefined;
      return {
        action: 'log_session',
        strain: rec.strain.trim().slice(0, 100),
        amount: rec.amount,
        unit: rec.unit,
        ...(method ? { method } : {}),
      };
    }
    case 'open_tab': {
      if (typeof rec.tab !== 'string' || rec.tab.trim() === '') return null;
      return { action: 'open_tab', tab: rec.tab.trim().slice(0, 30) };
    }
    case 'image_search': {
      if (typeof rec.query !== 'string' || rec.query.trim() === '') return null;
      return { action: 'image_search', query: rec.query.trim().slice(0, 200) };
    }
    default:
      return null;
  }
}

/**
 * Parse + validate an app-action JSON string (relayed in from the bubble
 * or voice chat through launch info). Null when it is not a known app
 * action.
 */
export function parseAppAction(raw: string): AppAction | null {
  try {
    const action = cleanAction(JSON.parse(raw));
    return action && isAppAction(action) ? action : null;
  } catch {
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
  action: ChatAction | null;
} {
  const match = ACTION_BLOCK_RE.exec(reply);
  if (!match) return { text: reply.trim(), action: null };
  const text = reply.replace(ACTION_BLOCK_RE, '').replace(/ {2,}/g, ' ').trim();
  let action: ChatAction | null = null;
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
  getLaunchInfo(): Promise<{ tab?: string; sharedText?: string; appAction?: string; musicAction?: string }>;
  getTalkNotification(): Promise<{ enabled?: boolean }>;
  setTalkNotification(options: { enabled: boolean }): Promise<{ enabled?: boolean }>;
  getAssistantStatus(): Promise<{ isAssistant?: boolean }>;
  openDefaultAppsSettings(): Promise<{ ok?: boolean }>;
  publishWidgetStash(options: { stashLine: string; lowLine: string }): Promise<{ ok?: boolean }>;
  publishStashSummary(options: { summary: string }): Promise<{ ok?: boolean }>;
  publishMusicState(options: { title: string; artist: string; playing: boolean; hasTrack: boolean }): Promise<{ ok?: boolean }>;
  publishWeather(options: { temp: string }): Promise<{ ok?: boolean }>;
  getBubbleStatus(): Promise<{ enabled?: boolean; canDrawOverlays?: boolean }>;
  setBubbleEnabled(options: { enabled: boolean }): Promise<{ enabled?: boolean }>;
  openOverlaySettings(): Promise<{ ok?: boolean }>;
}

const BudEActions = registerPlugin<BudEActionsPlugin>('BudEActions');

/**
 * One-shot launch info (a shortcut's tab, text shared in from another
 * app, or an app action the bubble/voice chat asked for). The native side
 * clears it on read, so it never fires twice. Empty on the plain web.
 */
export async function getLaunchInfo(): Promise<{ tab: string; sharedText: string; appAction: string; musicAction: string }> {
  if (!isNativeApp()) return { tab: '', sharedText: '', appAction: '', musicAction: '' };
  try {
    const res = await BudEActions.getLaunchInfo();
    return {
      tab: typeof res?.tab === 'string' ? res.tab : '',
      sharedText: typeof res?.sharedText === 'string' ? res.sharedText : '',
      appAction: typeof res?.appAction === 'string' ? res.appAction : '',
      musicAction: typeof res?.musicAction === 'string' ? res.musicAction : '',
    };
  } catch {
    return { tab: '', sharedText: '', appAction: '', musicAction: '' };
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

/**
 * Write the stash summary the bubble and voice chats send to the server,
 * so Bud-E knows what jars exist when the user asks it to change the
 * stash. Best effort — without it, Bud-E just asks which jar.
 */
export async function publishStashSummary(summary: string): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await BudEActions.publishStashSummary({ summary });
  } catch {
    // Best effort — Bud-E just asks which jar.
  }
}

/**
 * Write the now-playing state for the music widget (title, artist,
 * whether it is playing, whether a track is loaded at all). Best effort
 * — the widget just keeps its old line.
 */
export async function publishMusicState(title: string, artist: string, playing: boolean, hasTrack: boolean): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await BudEActions.publishMusicState({ title, artist, playing, hasTrack });
  } catch {
    // Best effort — the widget just keeps its old line.
  }
}

/**
 * Write the local temperature for the main widget's time + weather line
 * (e.g. "72°F"). Best effort — the widget just keeps its old line.
 */
export async function publishWeather(temp: string): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await BudEActions.publishWeather({ temp });
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
