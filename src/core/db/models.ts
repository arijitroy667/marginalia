/**
 * Zod models for local rows (PRD §9.2, rule 8: Zod at every boundary). Rows mirror the SQL columns in
 * camelCase, minus `user_id` (the server fills it from the JWT), plus local-only `localUpdatedAt`.
 * Refinements mirror the SQL constraints so invalid rows never reach the outbox.
 */
import { z } from 'zod';
import type { Anchor, NRect } from '../anchors/types';

const unit = z.number().min(-0.001).max(1.001); // tolerate float rounding at page edges
const ts = z.iso.datetime({ offset: true });
const uuid = z.uuid();

export const NRectSchema: z.ZodType<NRect> = z.object({ x: unit, y: unit, w: unit, h: unit });

export const AnchorSchema: z.ZodType<Anchor> = z.object({
  v: z.literal(1),
  page: z.number().int().positive(),
  rects: z.array(NRectSchema).max(500),
  quote: z.object({ exact: z.string().max(400), prefix: z.string().max(32), suffix: z.string().max(32) }),
  hint: z.object({ start: z.number().int().min(0), end: z.number().int().min(0), engine: z.number().int() }).optional(),
});

export const DocumentRowSchema = z.object({
  id: uuid,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  title: z.string().min(1).max(500),
  author: z.string().max(500).nullable(),
  pageCount: z.number().int().positive(),
  fileSize: z.number().int().positive(),
  storageMode: z.enum(['cloud', 'device']),
  storagePath: z.string().nullable(),
  coverPath: z.string().nullable(),
  lastOpenedAt: ts.nullable(),
  createdAt: ts,
  updatedAt: ts,
  deletedAt: ts.nullable(),
  localUpdatedAt: z.number(),
});
export type DocumentRow = z.infer<typeof DocumentRowSchema>;

export const ANNOTATION_KINDS = ['highlight', 'note', 'bookmark'] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export const AnnotationRowSchema = z
  .object({
    id: uuid,
    documentId: uuid,
    kind: z.enum(ANNOTATION_KINDS),
    page: z.number().int().positive(),
    anchor: AnchorSchema,
    colorId: z.number().int().min(1).max(8).nullable(),
    body: z.string().max(20_000).nullable(),
    label: z.string().max(200).nullable(),
    createdAt: ts,
    updatedAt: ts,
    deletedAt: ts.nullable(),
    localUpdatedAt: z.number(),
  })
  .refine((a) => a.anchor.page === a.page, 'page must equal anchor.page')
  .refine((a) => a.kind !== 'highlight' || a.colorId !== null, 'highlight needs colorId')
  .refine((a) => a.kind !== 'note' || a.body !== null, 'note needs body');
export type AnnotationRow = z.infer<typeof AnnotationRowSchema>;

export const PositionRowSchema = z.object({
  documentId: uuid,
  page: z.number().int().positive(),
  anchor: AnchorSchema.nullable(),
  progress: z.number().min(0).max(1),
  deviceId: z.string().min(1),
  deviceLabel: z.string().max(100).nullable(),
  updatedAt: ts,
  localUpdatedAt: z.number(),
});
export type PositionRow = z.infer<typeof PositionRowSchema>;

/** profiles.settings JSON. Loose: keys written by newer clients survive a whole-row LWW push. */
export const SettingsSchema = z.looseObject({
  theme: z.enum(['system', 'light', 'warm', 'dark']).default('system'),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
