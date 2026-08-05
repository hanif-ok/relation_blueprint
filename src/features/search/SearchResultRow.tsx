// SearchResultRow — a BrowseRow variant for the Search results list (S3). It reuses the exact
// 64px row skeleton: the whole row is a `role="button"` that opens the Person's profile (D-10),
// a round avatar/initials thumbnail, the name line, and an enabled "Show on map" action (People
// are spatial, S6).
//
// Secondary line (D-09): when the hit matched a NON-name field, it shows the matched-field snippet
// — `{fieldLabel}: …{context}[term]{context}…` with the matched term in a real <mark> (the EVIDENCE
// the scoping worked). When the match is on the Name field (B6) — or nothing non-name matched — it
// FALLS BACK to the normal BrowseRow secondary line (tags chips, else "updated Nd ago").
//
// Security: name + snippet + field label + the highlighted term all render as React children —
// never dangerouslySetInnerHTML (T-05-01).

import { ExternalLink } from 'lucide-react';
import { initialsOf } from '@/features/common/initials';
import { useEntityThumb } from '@/features/browse/useEntityThumb';
import { entityTags } from '@/features/browse/browseTypes';
import type { Person } from '@/domain/types';
import { BUILTIN_FIELD_BOOSTS, type MatchInfo } from './searchIndex';
import { buildSnippet, pickMatchedField } from './snippet';
import styles from '@/features/browse/BrowseList.module.css';
import search from './SearchView.module.css';

export interface SearchResultRowProps {
  entity: Person;
  /** MiniSearch match metadata for this hit (term → matched field keys) — drives the snippet. */
  match: MatchInfo;
  /** The document terms that matched (the substrings to highlight). */
  terms: string[];
  /** This person's exact per-field indexed text (`fieldKey -> string`) — the snippet's value source. */
  fieldText: Record<string, string> | undefined;
  /** Display labels for every field key (built-ins + custom), for the snippet's `{label}:` prefix. */
  fieldLabels: Record<string, string>;
  onOpen: (id: string) => void;
  onShowOnMap: (id: string) => void;
}

/** A coarse "updated Nd ago" fallback for the secondary line (mirrors BrowseRow). */
function updatedAgo(updatedAt: number): string {
  const days = Math.max(0, Math.floor((Date.now() - updatedAt) / 86_400_000));
  if (days === 0) return 'updated today';
  return `updated ${days}d ago`;
}

export function SearchResultRow({
  entity,
  match,
  terms,
  fieldText,
  fieldLabels,
  onOpen,
  onShowOnMap,
}: SearchResultRowProps) {
  const thumbUrl = useEntityThumb(entity.photo, entity.gallery ?? []);
  const tags = entityTags(entity, 'people');

  // The highest-boosted NON-name field that matched (undefined for a name-only match, B6).
  const matchedKey = pickMatchedField(match, BUILTIN_FIELD_BOOSTS);
  const snippetValue = matchedKey ? fieldText?.[matchedKey] : undefined;
  const snippet =
    matchedKey && snippetValue
      ? buildSnippet(fieldLabels[matchedKey] ?? matchedKey, snippetValue, terms)
      : null;

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
          {snippet ? (
            // Matched-field snippet (D-09) — the field label + a highlighted context window. Every
            // fragment (including the <mark>) is a React child; nothing is injected as HTML.
            <span className={search.snippet} data-testid="search-snippet">
              {snippet}
            </span>
          ) : tags.length > 0 ? (
            // Name-only match (B6) — fall back to the normal BrowseRow secondary line.
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
