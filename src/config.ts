// App-wide constants (PRD §8.10). The product name lives only here.
export const APP_NAME = 'Marginalia';
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_CLOUD_FILE_BYTES = 50 * 1024 * 1024; // Supabase free-plan max upload (ADR 0005)
export const OFFLINE_CACHE_BYTES = 500 * 1024 * 1024;
export const OFFLINE_CACHE_DOCS = 5;
export const CLOUD_STORAGE_BYTES = 1024 * 1024 * 1024; // Supabase free plan file storage (ADR 0005)
export const NOTE_AUTOSAVE_MS = 500;
export const RESUME_SAVE_DEBOUNCE_MS = 1000;
export const PULL_OVERLAP_MS = 5000;
export const PUSH_BATCH_SIZE = 100;
export const MAX_CANVAS_PIXELS = 16_777_216;
export const PALETTE_MAX = 8;
