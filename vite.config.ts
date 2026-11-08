import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // No auto-registration: main.tsx registers the worker itself, and only
      // on plain web (never inside the Capacitor APK build).
      injectRegister: null,
      registerType: 'autoUpdate',
      // Don't let the plugin generate its own manifest — ours lives in
      // public/manifest.webmanifest and is precached via globPatterns.
      manifest: false,
      workbox: {
        // Cache the app shell so it opens offline. The manifest is precached
        // too; /api/chat is never cached — live AI stays network-only.
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,webmanifest}'],
        navigateFallback: '/',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
