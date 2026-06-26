// CustomFieldRows (S15) — read rendering of an entity's custom-field VALUES in the ProfileSidebar,
// appended AFTER the built-in rows, in schema order (U8). Reads non-deleted defs live via
// listFieldDefs(entityType) and the entity's `custom` map (keyed by stable field id). Empty values
// omit their row, exactly like the built-in read rows.
//
// Per-type rendering: Text/Number plain; Phone a `tel:` link in ink; Date a human date with the
// raw ISO in a mono title; Tags paper-shade pill chips; link-to-entity the target's NAME as a
// neutral inline link that opens its profile (one-way, D-10) — muted "(removed)" when the target
// id resolves to nothing OR the wrong type; Photo a single thumbnail tile.
//
// Security: every value, label, and link label renders as React children — never
// dangerouslySetInnerHTML (T-03-01: an XSS here could exfiltrate the Drive access token).

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { listFieldDefs } from '@/db/repository';
import { resolveMediaUrl } from '@/media/mediaManager';
import type { CustomValue, CustomValues, EntityType, FieldDef, MediaRef } from '@/domain/types';
import styles from './ProfileSidebar.module.css';

export interface CustomFieldRowsProps {
  entityType: EntityType;
  /** The entity's custom-value map (keyed by field id). */
  custom: CustomValues;
  /** Open another entity's profile (link-to-entity navigation, D-10 one-way). */
  onOpenEntity?: (type: EntityType, id: string) => void;
  /** Open a custom Photo-field value full-size in the shared lightbox (S18, single-photo). */
  onOpenPhoto?: (photo: MediaRef) => void;
}

/** True when a value counts as empty (absent / blank / empty list) — its row is omitted. */
function isEmpty(value: CustomValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Resolve a media hash to an object URL, revoking it on change/unmount (no leaks). */
function useMediaUrl(hash: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let current: string | null = null;
    void Promise.resolve(hash ? resolveMediaUrl(hash) : null).then((u) => {
      if (revoked) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      current = u;
      setUrl(u);
    });
    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [hash]);
  return url;
}

/** A link-to-entity value: resolves the target id through a live Dexie read + type-check (D-10). */
function LinkValue({
  targetType,
  id,
  onOpenEntity,
}: {
  targetType: EntityType | undefined;
  id: string;
  onOpenEntity?: (type: EntityType, id: string) => void;
}) {
  // Resolve the target live; a missing OR wrong-type target renders muted "(removed)" (T-03-06).
  const target = useLiveQuery(async () => {
    if (!targetType) return null;
    const table =
      targetType === 'people'
        ? db.people
        : targetType === 'maps'
          ? db.maps
          : targetType === 'groups'
            ? db.groups
            : targetType === 'relationship-links'
              ? db.relationshipLinks
              : null;
    if (!table) return null;
    return (await table.get(id)) ?? null;
  }, [targetType, id]);

  // `undefined` = still loading; `null` = resolved-to-nothing (removed).
  if (target === undefined) return <span className={styles.rowValue}>…</span>;
  if (target === null || !targetType) {
    return (
      <span className={styles.rowValue} data-testid="custom-link-removed">
        (removed)
      </span>
    );
  }
  return (
    <button
      type="button"
      className={styles.linkValue}
      data-testid="custom-link"
      onClick={() => onOpenEntity?.(targetType, target.id)}
    >
      {target.name}
    </button>
  );
}

/** A single custom Photo value: a thumbnail tile that opens the shared lightbox (S18). When no
 *  opener is wired it degrades to a plain (non-interactive) thumbnail. */
function PhotoValue({ photo, onOpen }: { photo: MediaRef; onOpen?: (photo: MediaRef) => void }) {
  const url = useMediaUrl(photo.hash);
  const inner = url ? <img src={url} alt="" className={styles.customPhotoImg} /> : null;
  if (onOpen) {
    return (
      <button
        type="button"
        className={styles.customPhotoButton}
        data-testid="custom-photo"
        aria-label="View photo"
        onClick={() => onOpen(photo)}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={styles.customPhoto} data-testid="custom-photo">
      {inner}
    </span>
  );
}

/** Render one custom value by its field type. */
function CustomValueView({
  def,
  value,
  onOpenEntity,
  onOpenPhoto,
}: {
  def: FieldDef;
  value: CustomValue;
  onOpenEntity?: (type: EntityType, id: string) => void;
  onOpenPhoto?: (photo: MediaRef) => void;
}) {
  switch (def.type) {
    case 'text':
    case 'number':
      return (
        <span className={styles.rowValue} data-testid="custom-value">
          {String(value)}
        </span>
      );
    case 'phone': {
      // Strip the stored value to dialable characters before it reaches the tel: URI (WR-02);
      // the visible link text stays the raw value rendered as a React child (never innerHTML, T-03-01).
      const dialable = String(value).replace(/[^\d+*#,;]/g, '');
      return (
        <a className={styles.phoneLink} href={`tel:${dialable}`} data-testid="custom-phone">
          {String(value)}
        </a>
      );
    }
    case 'date': {
      const iso = String(value);
      const parsed = new Date(iso);
      const human = Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString();
      return (
        <span className={styles.rowValue} title={iso} data-testid="custom-date">
          {human}
        </span>
      );
    }
    case 'tags':
      return (
        <span className={styles.chips} data-testid="custom-tags">
          {(value as string[]).map((tag) => (
            <span key={tag} className={styles.chip}>
              {tag}
            </span>
          ))}
        </span>
      );
    case 'link-to-entity':
      return (
        <LinkValue targetType={def.targetType} id={String(value)} onOpenEntity={onOpenEntity} />
      );
    case 'photo':
      return <PhotoValue photo={value as MediaRef} onOpen={onOpenPhoto} />;
    default:
      return null;
  }
}

export function CustomFieldRows({
  entityType,
  custom,
  onOpenEntity,
  onOpenPhoto,
}: CustomFieldRowsProps) {
  const defs = useLiveQuery<FieldDef[]>(() => listFieldDefs(entityType), [entityType]);
  const list = defs ?? [];

  return (
    <>
      {list.map((def) => {
        const value = custom[def.id] ?? null;
        if (isEmpty(value)) return null; // empty rows omitted (consistent with built-ins, U8)
        return (
          <div className={styles.row} key={def.id} data-testid="custom-row">
            <span className={styles.rowLabel}>{def.label}</span>
            <CustomValueView
              def={def}
              value={value}
              onOpenEntity={onOpenEntity}
              onOpenPhoto={onOpenPhoto}
            />
          </div>
        );
      })}
    </>
  );
}
