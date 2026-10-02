import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_NAME } from './src/config.ts';

/** PDF.js runtime assets served from /pdfjs/ (PRD §8.4); copied, not committed (public/pdfjs is git-ignored). */
function pdfjsAssets() {
  return {
    name: 'pdfjs-assets',
    buildStart() {
      for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
        const from = `node_modules/pdfjs-dist/${dir}`;
        if (existsSync(from)) cpSync(from, `public/pdfjs/${dir}`, { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    pdfjsAssets(),
    react(),
    tailwindcss(),
    { name: 'app-name', transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_NAME) },
    VitePWA({
      registerType: 'prompt', // an update never reloads mid-read (§8.9)
      injectRegister: false, // registered by <UpdatePrompt> (virtual:pwa-register/react)
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        id: '/',
        name: APP_NAME,
        short_name: APP_NAME,
        description: 'A line-level PDF reader: highlight, bookmark and annotate lines, and resume where you stopped.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#FAFAF9',
        background_color: '#FAFAF9',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app shell + all PDF.js runtime assets (cmaps, fonts, wasm, ICC) so PDFs open offline (§8.4)
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}', 'pdfjs/**/*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // pdf.worker is ~1.3 MB
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/pdfjs/'),
            handler: 'CacheFirst',
            options: { cacheName: 'pdfjs-assets', expiration: { maxEntries: 500 } },
          },
        ],
        // Supabase is cross-origin and never cached: Dexie is the offline store (§8.9)
      },
    }),
  ],
});
