/**
 * Zod without its JIT (NFR-SEC-04): the JIT probes `new Function`, which a strict CSP reports as a violation even
 * though the probe's error is caught. Imported first by main.tsx, before any schema parses at module load.
 */
import { z } from 'zod';

z.config({ jitless: true });
