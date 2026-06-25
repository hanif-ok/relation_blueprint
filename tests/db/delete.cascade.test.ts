// D-12 delete-vs-remove correctness: the two distinct delete paths.
//   - deleteMarker(id): marker-only. NO cascade, NO media GC — the entity survives.
//   - deleteEntity(type, id): generalized cascade — entity + its markers + media GC across
//     ALL five entity types' photo/gallery/background AND custom Photo-field values, so a blob
//     shared across types is never wrongly collected (the 02-PATTERNS media-GC generalization).
//   - deletePerson(id): retained, delegates to deleteEntity('people', id) — Phase-1 behavior.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import {
  createGroup,
  createMap,
  createPerson,
  createRelationshipLink,
  deleteEntity,
  deleteMarker,
  deletePerson,
  getPerson,
  putMedia,
  upsertMarker,
} from '@/db/repository';
import type { MediaRef } from '@/domain/types';

beforeEach(async () => {
  await Promise.all([
    db.people.clear(),
    db.maps.clear(),
    db.markers.clear(),
    db.groups.clear(),
    db.relationshipLinks.clear(),
    db.fieldDefs.clear(),
    db.media.clear(),
    db.meta.clear(),
    db.syncQueue.clear(),
  ]);
});

/** A tiny content-addressed blob put under a given hash so GC has a real row to delete. */
async function seedMedia(hash: string): Promise<MediaRef> {
  const ref: MediaRef = { hash, mime: 'image/png' };
  await putMedia(ref, new Blob([hash], { type: 'image/png' }));
  return ref;
}

describe('deleteMarker (D-12 map-level "Remove from map" — marker-only)', () => {
  it('removes only that marker; the person, other markers, and media all survive', async () => {
    const map = await createMap({
      name: 'Floor 1',
      background: { hash: 'bg', mime: 'image/png' },
      width: 800,
      height: 600,
    });
    const photo = await seedMedia('person-photo');
    const person = await createPerson({ name: 'Ada Lovelace', photo });
    const m1 = await upsertMarker({ mapId: map.id, personId: person.id, x: 10, y: 20 });
    const m2 = await upsertMarker({ mapId: map.id, personId: person.id, x: 30, y: 40 });

    await deleteMarker(m1.id);

    // Only the targeted marker is gone.
    expect(await db.markers.get(m1.id)).toBeUndefined();
    expect(await db.markers.get(m2.id)).toBeDefined();
    // The entity stays in the database (the user-flagged correctness fix).
    expect(await getPerson(person.id)).toBeDefined();
    // No media was GC'd.
    expect(await db.media.get('person-photo')).toBeDefined();
  });
});

describe('deleteEntity (D-12 list-level cascade + generalized media GC)', () => {
  it("cascades the person's markers and GCs its solo media but KEEPS a blob shared by another person's gallery", async () => {
    const map = await createMap({
      name: 'Floor 1',
      background: { hash: 'bg', mime: 'image/png' },
      width: 800,
      height: 600,
    });
    const solo = await seedMedia('solo-blob');
    const shared = await seedMedia('shared-blob');

    // Victim references both a solo blob (photo) and a shared blob (gallery).
    const victim = await createPerson({ name: 'Grace Hopper', photo: solo, gallery: [shared] });
    // Another surviving person also references the shared blob in their gallery.
    await createPerson({ name: 'Radia Perlman', gallery: [shared] });

    const vMarker = await upsertMarker({ mapId: map.id, personId: victim.id, x: 1, y: 2 });

    await deleteEntity('people', victim.id);

    // Entity + its marker gone.
    expect(await getPerson(victim.id)).toBeUndefined();
    expect(await db.markers.get(vMarker.id)).toBeUndefined();
    // Solo blob GC'd; shared blob KEPT (still referenced by the surviving person).
    expect(await db.media.get('solo-blob')).toBeUndefined();
    expect(await db.media.get('shared-blob')).toBeDefined();
  });

  it("does NOT GC a blob referenced only by a surviving Group's custom Photo-field value", async () => {
    const customPhoto = await seedMedia('group-custom-photo');
    // The blob lives ONLY in a Group's custom Photo-field value (a MediaRef in `custom`).
    await createGroup({ name: 'IEEE', custom: { fieldA: customPhoto } });
    // Delete an unrelated person who references nothing.
    const unrelated = await createPerson({ name: 'Hedy Lamarr' });

    await deleteEntity('people', unrelated.id);

    // The Group's custom Photo value must keep the blob alive (generalized still-referenced sweep).
    expect(await db.media.get('group-custom-photo')).toBeDefined();
  });

  it("removes a Group and GCs its solo media", async () => {
    const groupPhoto = await seedMedia('group-solo');
    const group = await createGroup({ name: 'Bell Labs', photo: groupPhoto });

    await deleteEntity('groups', group.id);

    expect(await db.groups.get(group.id)).toBeUndefined();
    expect(await db.media.get('group-solo')).toBeUndefined();
  });

  it("removes a Relationship-link and GCs its solo media", async () => {
    const linkPhoto = await seedMedia('link-solo');
    const link = await createRelationshipLink({ name: 'mentorship', photo: linkPhoto });

    await deleteEntity('relationship-links', link.id);

    expect(await db.relationshipLinks.get(link.id)).toBeUndefined();
    expect(await db.media.get('link-solo')).toBeUndefined();
  });

  it("deleteEntity('maps') removes the location, its markers, and GCs its background", async () => {
    const bg = await seedMedia('map-bg');
    const map = await createMap({
      name: 'Floor 2',
      background: bg,
      width: 400,
      height: 300,
    });
    const person = await createPerson({ name: 'Lise Meitner' });
    const onMap = await upsertMarker({ mapId: map.id, personId: person.id, x: 5, y: 6 });

    await deleteEntity('maps', map.id);

    expect(await db.maps.get(map.id)).toBeUndefined();
    // Markers on that map are cascade-deleted, but the person survives.
    expect(await db.markers.get(onMap.id)).toBeUndefined();
    expect(await getPerson(person.id)).toBeDefined();
    // The background blob is GC'd (no surviving entity references it).
    expect(await db.media.get('map-bg')).toBeUndefined();
  });
});

describe('deletePerson (Phase-1 back-compat — delegates to deleteEntity)', () => {
  it('still removes the person and cascade-deletes their markers', async () => {
    const map = await createMap({
      name: 'Floor 1',
      background: { hash: 'bg', mime: 'image/png' },
      width: 800,
      height: 600,
    });
    const person = await createPerson({ name: 'Rosalind Franklin' });
    const other = await createPerson({ name: 'Dorothy Hodgkin' });
    const markerForPerson = await upsertMarker({ mapId: map.id, personId: person.id, x: 10, y: 20 });
    const markerForOther = await upsertMarker({ mapId: map.id, personId: other.id, x: 30, y: 40 });

    await deletePerson(person.id);

    expect(await getPerson(person.id)).toBeUndefined();
    expect(await db.markers.get(markerForPerson.id)).toBeUndefined();
    // The other person's marker must survive.
    expect(await db.markers.get(markerForOther.id)).toBeDefined();
  });
});
