import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.tsx';

// Register the PWA service worker on plain web only — never inside the
// Capacitor APK (it has its own app shell and no /api/chat server of its own
// to reach). Guarded to production builds, where the worker file exists.
if (
  import.meta.env.PROD &&
  'serviceWorker' in navigator &&
  !(window as unknown as { Capacitor?: unknown }).Capacitor
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No service worker, no problem — the app still works online.
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
