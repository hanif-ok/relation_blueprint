// MAP-05 — one person, many maps. The core "who is where" model: placing a person on a second
// map must create a SECOND marker row for the SAME personId, never duplicate the Person. Editing
// the person afterwards leaves exactly one Person record, and both markers still reference it.

import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { createMap, createPerson, updatePerson, upsertMarker } from '@/db/repository';

const bg = { hash: 'bg', mime: 'image/png' };

beforeEach(async () => {
  await Promise.all([db.people.clear(), db.maps.clear(), db.markers.clear()]);
});

describe('multi-placement (MAP-05): one person placed on two maps', () => {
  it('creates two marker rows for one personId; the Person stays single', async () => {
    const person = await createPerson({ name: 'Ada' });
    const mapA = await createMap({ name: 'Map A', background: bg, width: 100, height: 100 });
    const mapB = await createMap({ name: 'Map B', background: bg, width: 100, height: 100 });

    // Place the SAME person on both maps — no `id` supplied, so each call mints a new marker row.
    await upsertMarker({ mapId: mapA.id, personId: person.id, x: 10, y: 10 });
    await upsertMarker({ mapId: mapB.id, personId: person.id, x: 20, y: 20 });

    expect(await db.markers.where('personId').equals(person.id).count()).toBe(2);
    expect(await db.people.count()).toBe(1);
  });

  it('editing the person leaves exactly one Person row and both markers still reference it', async () => {
    const person = await createPerson({ name: 'Ada' });
    const mapA = await createMap({ name: 'Map A', background: bg, width: 100, height: 100 });
    const mapB = await createMap({ name: 'Map B', background: bg, width: 100, height: 100 });
    await upsertMarker({ mapId: mapA.id, personId: person.id, x: 10, y: 10 });
    await upsertMarker({ mapId: mapB.id, personId: person.id, x: 20, y: 20 });

    await updatePerson(person.id, { name: 'Ada Lovelace' });

    expect(await db.people.count()).toBe(1);
    expect((await db.people.get(person.id))?.name).toBe('Ada Lovelace');
    const markers = await db.markers.where('personId').equals(person.id).toArray();
    expect(markers).toHaveLength(2);
    for (const m of markers) expect(m.personId).toBe(person.id);
  });
});
