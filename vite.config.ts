import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync } from 'node:fs';
import { defineConfig } from 'vite';
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
  ],
});
