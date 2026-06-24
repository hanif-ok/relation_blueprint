// Runtime validation for the domain model (zod 4). Data read back from the cloud or
// an import bundle is untrusted-at-rest (threat T-02-01) and MUST be validated through
// these schemas before it enters the database.
//
// The schemas mirror src/domain/types.ts exactly. `z.infer` of each schema is assignable
// to its hand-written interface; the `satisfies` checks at the bottom of this file lock
// that correspondence at compile time.

import { z } from 'zod';
import type { Backup, Manifest, MapDoc, Marker, MediaRef, Person, ShardPointer } from './types';

export const MediaRefSchema = z.object({
  hash: z.string(),
  mime: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  photo: MediaRefSchema.optional(),
  phone: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()),
  notes: z.string().optional(),
  gallery: z.array(MediaRefSchema),
  updatedAt: z.number(),
  dirty: z.boolean(),
});

export const MapDocSchema = z.object({
  id: z.string(),
  name: z.string(),
  background: MediaRefSchema,
  width: z.number(),
  height: z.number(),
  updatedAt: z.number(),
  dirty: z.boolean(),
});

export const MarkerSchema = z.object({
  id: z.string(),
  mapId: z.string(),
  personId: z.string(),
  x: z.number(),
  y: z.number(),
  updatedAt: z.number(),
  dirty: z.boolean(),
});

export const EntityTypeSchema = z.enum(['people', 'maps', 'markers']);

export const ShardPointerSchema = z.object({
  fileId: z.string(),
  hash: z.string(),
  updatedAt: z.number(),
});

export const ManifestSchema = z.object({
  version: z.number(),
  updatedAt: z.number(),
  // Every entity type must carry a shard pointer; a missing pointer is rejected.
  shards: z.object({
    people: ShardPointerSchema,
    maps: ShardPointerSchema,
    markers: ShardPointerSchema,
  }),
  // No `backups` field: rolling backups are discovered by listing the `backups/` folder, the
  // single source of truth. Zod ignores unknown keys, so older on-disk manifests that still
  // carry `backups` continue to validate (WR-03).
});

export const BackupSchema = z.object({
  schemaVersion: z.number(),
  manifest: ManifestSchema,
  entities: z.object({
    people: z.array(PersonSchema),
    maps: z.array(MapDocSchema),
    markers: z.array(MarkerSchema),
  }),
  media: z.record(z.string(), z.string()),
});

// Compile-time locks: each schema's inferred output must match the hand-written type.
// `verbatimModuleSyntax` keeps these as type-only assertions with no runtime cost.
export type MediaRefInput = z.infer<typeof MediaRefSchema>;
export type PersonInput = z.infer<typeof PersonSchema>;
export type MapDocInput = z.infer<typeof MapDocSchema>;
export type MarkerInput = z.infer<typeof MarkerSchema>;
export type ShardPointerInput = z.infer<typeof ShardPointerSchema>;
export type ManifestInput = z.infer<typeof ManifestSchema>;
export type BackupInput = z.infer<typeof BackupSchema>;

const _mediaRefCheck = {} as MediaRefInput satisfies MediaRef;
const _personCheck = {} as PersonInput satisfies Person;
const _mapDocCheck = {} as MapDocInput satisfies MapDoc;
const _markerCheck = {} as MarkerInput satisfies Marker;
const _shardPointerCheck = {} as ShardPointerInput satisfies ShardPointer;
const _manifestCheck = {} as ManifestInput satisfies Manifest;
const _backupCheck = {} as BackupInput satisfies Backup;
void _mediaRefCheck;
void _personCheck;
void _mapDocCheck;
void _markerCheck;
void _shardPointerCheck;
void _manifestCheck;
void _backupCheck;
