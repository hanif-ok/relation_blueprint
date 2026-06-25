// Phase 2 extension of the EXPT-02 round-trip property: export -> wipe -> import must
// reconstitute the NEW entity types (groups, relationship-links, rich locations), the field
// definitions, and every entity's custom-value map byte-for-byte. The cloud is the only
// durable copy, so a restore that silently drops the new model is catastrophic.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import {
  createFieldDef,
  createGroup,
  createMap,
  createRelationshipLink,
  getMedia,
  putMedia,
  updateMap,
} from '@/db/repository';
import { buildMediaRef } from '@/media/mediaManager';
import { exportDb } from '@/features/backup/exportDb';
import { importDb } from '@/features/backup/importDb';
import type { MediaRef } from '@/domain/types';

async function clearAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.people, db.maps, db.markers, db.groups, db.relationshipLinks, db.fieldDefs, db.media, db.meta],
    async () => {
      await Promise.all([
        db.people.clear(),
        db.maps.clear(),
        db.markers.clear(),
        db.groups.clear(),
        db.relationshipLinks.clear(),
        db.fieldDefs.clear(),
        db.media.clear(),
        db.meta.clear(),
      ]);
    },
  );
}

async function seedPhotoBlob(byte: number): Promise<MediaRef> {
  const bytes = new Uint8Array([byte, byte + 1, byte + 2]);
  const blob = new Blob([bytes], { type: 'image/png' });
  const ref = await buildMediaRef(blob);
  await putMedia(ref, blob);
  return ref;
}

beforeEach(clearAll);

describe('export -> wipe -> import round trip for the full entity model', () => {
  it('reconstitutes groups, relationship-links, rich locations, fieldDefs, and custom values', async () => {
    // A media blob used as a custom Photo-field value, to prove custom MediaRefs survive + are
    // restored with the right mime (collectMimes must scan custom values).
    const photoRef = await seedPhotoBlob(40);

    await createGroup({
      name: 'Alpha Group',
      notes: 'first',
      custom: { 'g-text': 'hello', 'g-tags': ['a', 'b'] },
    });
    await createRelationshipLink({
      name: 'Mentorship',
      label: 'mentor',
      date: '2026-01-01',
      custom: { 'r-photo': photoRef },
    });
    const map = await createMap({
      name: 'HQ',
      background: { hash: 'bg', mime: 'image/png' },
      width: 800,
      height: 600,
    });
    await updateMap(map.id, { notes: 'rich location', custom: { 'loc-num': 3 } });
    const def = await createFieldDef({ entityType: 'people', label: 'Employer', type: 'link-to-entity', targetType: 'groups' });

    const before = {
      groups: await db.groups.orderBy('id').toArray(),
      relationshipLinks: await db.relationshipLinks.orderBy('id').toArray(),
      maps: await db.maps.orderBy('id').toArray(),
      fieldDefs: await db.fieldDefs.orderBy('id').toArray(),
    };
    const photoBytesBefore = new Uint8Array(await (await getMedia(photoRef.hash))!.arrayBuffer());

    const backup = await exportDb();
    await clearAll();
    expect(await db.groups.count()).toBe(0);

    await importDb(backup);

    const after = {
      groups: await db.groups.orderBy('id').toArray(),
      relationshipLinks: await db.relationshipLinks.orderBy('id').toArray(),
      maps: await db.maps.orderBy('id').toArray(),
      fieldDefs: await db.fieldDefs.orderBy('id').toArray(),
    };

    expect(after.groups).toEqual(before.groups);
    expect(after.relationshipLinks).toEqual(before.relationshipLinks);
    expect(after.maps).toEqual(before.maps);
    expect(after.fieldDefs).toEqual(before.fieldDefs);

    // Custom values survived deep-equal.
    expect(after.groups[0].custom).toEqual({ 'g-text': 'hello', 'g-tags': ['a', 'b'] });
    expect(after.relationshipLinks[0].custom).toEqual({ 'r-photo': photoRef });
    expect(after.maps[0].custom).toEqual({ 'loc-num': 3 });
    expect(after.fieldDefs[0].id).toBe(def.id);

    // The custom Photo-field blob restored byte-for-byte with the correct mime.
    const restored = await getMedia(photoRef.hash);
    expect(restored).toBeDefined();
    expect(restored!.type).toBe('image/png');
    const photoBytesAfter = new Uint8Array(await restored!.arrayBuffer());
    expect(Array.from(photoBytesAfter)).toEqual(Array.from(photoBytesBefore));
  });
});
