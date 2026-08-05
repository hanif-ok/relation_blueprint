// SearchResultRow — a BrowseRow variant for the Search results list (S3). It reuses the exact
// 64px row skeleton: the whole row is a `role="button"` that opens the Person's profile (D-10),
// a round avatar/initials thumbnail, the name line, and an enabled "Show on map" action (People
// are spatial, S6). The secondary line is the normal BrowseRow fallback for this slice — tags
// chips, else "updated Nd ago"; plan 03 adds the matched-field snippet.
//
// Security: name + secondary text render as React children — never dangerouslySetInnerHTML (T-05-01).

import { ExternalLink } from 'lucide-react';
import { initialsOf } from '@/features/common/initials';
import { useEntityThumb } from '@/features/browse/useEntityThumb';
import { entityTags } from '@/features/browse/browseTypes';
import type { Person } from '@/domain/types';
import styles from '@/features/browse/BrowseList.module.css';

export interface SearchResultRowProps {
  entity: Person;
  onOpen: (id: string) => void;
  onShowOnMap: (id: string) => void;
}

/** A coarse "updated Nd ago" fallback for the secondary line (mirrors BrowseRow). */
function updatedAgo(updatedAt: number): string {
  const days = Math.max(0, Math.floor((Date.now() - updatedAt) / 86_400_000));
  if (days === 0) return 'updated today';
  return `updated ${days}d ago`;
}

export function SearchResultRow({ entity, onOpen, onShowOnMap }: SearchResultRowProps) {
  const thumbUrl = useEntityThumb(entity.photo, entity.gallery ?? []);
  const tags = entityTags(entity, 'people');

  return (
    <div
      className={styles.row}
      role="button"
      tabIndex={0}
      data-testid="browse-row"
      onClick={() => onOpen(entity.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(entity.id);
        }
      }}
    >
      <span className={styles.thumbRound} aria-hidden="true">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className={styles.thumbImg} />
        ) : (
          <span className={styles.thumbInitials}>{initialsOf(entity.name)}</span>
        )}
      </span>

      <span className={styles.rowMain}>
        <span className={styles.rowName} data-testid="browse-row-name">
          {entity.name}
        </span>
        <span className={styles.rowSecondary}>
          {tags.length > 0 ? (
            <span className={styles.rowTags}>
              {tags.slice(0, 4).map((tag) => (
                <span key={tag} className={styles.rowTag}>
                  {tag}
                </span>
              ))}
            </span>
          ) : (
            <span className={styles.rowMeta}>{updatedAgo(entity.updatedAt)}</span>
          )}
        </span>
      </span>

      <button
        type="button"
        className={styles.showOnMap}
        aria-label="Show on map"
        title="Show on map"
        data-testid="browse-show-on-map"
        onClick={(e) => {
          e.stopPropagation();
          onShowOnMap(entity.id);
        }}
      >
        <ExternalLink size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
