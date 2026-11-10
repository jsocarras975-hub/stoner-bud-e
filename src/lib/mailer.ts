// Stoner Bud-E — password-reset mailer (SERVER ONLY).
//
// Sends the reset email through the owner's Gmail over SMTP. Free, no new
// account: GMAIL_USER is the Gmail address the mail comes from, and
// GMAIL_APP_PASSWORD is a Google app password (Google Account → Security →
// 2-Step Verification → App passwords), NOT the Gmail password itself.
// Both live in Vercel env vars (Production + Preview) — never in code, never
// in chat. Until they are set, sendResetPasswordEmail throws a plain error
// and the forgot-password form says the emails are not set up yet.
//
// NEVER import this file from client code (App.tsx, tabs, auth-client):
// it pulls in `nodemailer` and reads server env vars.

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** Read an env var, treating empty/whitespace as unset. */
function env(key: string): string | undefined {
  const proc = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  const value = proc?.env?.[key]?.trim();
  return value ? value : undefined;
}

let cached: Transporter | null = null;

/** One Gmail SMTP transporter per warm serverless instance. */
function transporter(): Transporter {
  if (cached) return cached;
  const user = env('GMAIL_USER');
  const pass = env('GMAIL_APP_PASSWORD');
  if (!user || !pass) {
    throw new Error(
      'Password-reset email is not set up: GMAIL_USER and GMAIL_APP_PASSWORD are not set.',
    );
  }
  cached = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  return cached;
}

/**
 * Send the forgot-password email. `url` is the reset link Better Auth
 * built (it carries the token and lands on the app's reset form). Throws
 * a plain Error when the mailer is not configured or Gmail refuses it —
 * the caller turns that into a plain-words message, never a stack trace.
 */
export async function sendResetPasswordEmail(to: string, url: string): Promise<void> {
  const from = env('GMAIL_USER');
  if (!from) {
    throw new Error(
      'Password-reset email is not set up: GMAIL_USER and GMAIL_APP_PASSWORD are not set.',
    );
  }
  await transporter().sendMail({
    from: `Bud-E <${from}>`,
    to,
    subject: 'Reset your Bud-E password',
    text:
      `Someone asked to reset the password for your Bud-E account.\n\n` +
      `Reset it here (the link works for one hour):\n${url}\n\n` +
      `If that was not you, ignore this email — your password stays as it is.`,
    html:
      `<p>Someone asked to reset the password for your Bud-E account.</p>` +
      `<p><a href="${url}">Reset your password</a> (the link works for one hour).</p>` +
      `<p>If that was not you, ignore this email — your password stays as it is.</p>`,
  });
}
