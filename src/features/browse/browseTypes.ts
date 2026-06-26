// Shared types + small helpers for the browse surface (S11/S12). Kept in a non-component
// module so BrowseList, BrowseRow, and App can share them without fast-refresh churn.

import type { Group, MapDoc, MediaRef, Person, RelationshipLink } from '@/domain/types';

/** The four entity families that browse as lists. */
export type BrowseEntityType = 'people' | 'maps' | 'groups' | 'relationship-links';

/** Any entity a browse row renders — they share the spine fields the row reads. */
export type BrowseEntity = Person | MapDoc | Group | RelationshipLink;

/** Human singular per type (titles, delete copy, tooltips). */
export const SINGULAR: Record<BrowseEntityType, string> = {
  people: 'person',
  maps: 'location',
  groups: 'group',
  'relationship-links': 'relationship-link',
};

/** Plural label per type (view title). */
export const PLURAL: Record<BrowseEntityType, string> = {
  people: 'People',
  maps: 'Locations',
  groups: 'Groups',
  'relationship-links': 'Relationship-links',
};

/** Whether a type can be placed on a map (only People are spatial this phase). */
export function isSpatial(type: BrowseEntityType): boolean {
  return type === 'people';
}

/** The disabled "Show on map" tooltip for a non-spatial type (Copywriting Contract). */
export function showOnMapDisabledReason(type: BrowseEntityType): string {
  return `${PLURAL[type]} aren't placed on a map.`;
}

/**
 * A row's tags, when the entity carries them (only People have tags this phase). Defensive
 * against a transient type/row mismatch during a view switch (useLiveQuery can briefly return
 * the previous type's rows before the new query resolves) — falls back to an empty list.
 */
export function entityTags(entity: BrowseEntity, type: BrowseEntityType): string[] {
  return type === 'people' ? ((entity as Person).tags ?? []) : [];
}

/** A row's avatar/gallery refs (every entity has a gallery; only some have a photo). */
export function entityMedia(entity: BrowseEntity): {
  photo: MediaRef | undefined;
  gallery: MediaRef[];
} {
  return { photo: entity.photo, gallery: entity.gallery ?? [] };
}
