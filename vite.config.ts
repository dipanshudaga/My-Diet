import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/My-Diet/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Exclude the AI runtime from the precached app shell — Workbox's default
        // globPatterns sweep up every same-origin build file, including chunks only
        // ever reached via the dynamic import() in src/ai/model.ts. Precaching them
        // would force that download on every visit, for every visitor, even ones
        // who never touch AI logging — exactly what the dynamic import was for.
        globIgnores: ['**/*.wasm', '**/transformers.web-*.js'],
      },
      // Workbox only precaches same-origin build output by default — it never
      // reaches the multi-GB Gemma weights or Tesseract assets fetched at runtime
      // from other origins; those manage their own Cache Storage entries.
      manifest: {
        name: 'My Diet',
        short_name: 'My Diet',
        description: 'Personal chat-based diet diary with on-device AI logging',
        start_url: '/My-Diet/',
        scope: '/My-Diet/',
        display: 'standalone',
        background_color: '#f5f5f5',
        theme_color: '#059669',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
