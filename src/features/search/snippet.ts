// snippet — the pure matched-field highlight helper (D-09): the visible EVIDENCE that field
// scoping works. Given a MiniSearch `match` and the matched person's per-field text, it
//   (a) picks the highest-boosted NON-name field that matched (`pickMatchedField`), and
//   (b) builds the secondary-line evidence as REACT CHILDREN — a `{label}: ` prefix, a context
//       window around the matched term, and the matched substring wrapped in a real <mark>
//       element (`buildSnippet`).
//
// It NEVER assembles an HTML string and NEVER uses dangerouslySetInnerHTML: every fragment is a
// genuine React node, so user-authored field text can never be injected as markup (T-05-01).

import { createElement, type ReactNode } from 'react';
import { BUILTIN_FIELD_BOOSTS, BUILTIN_FIELD_KEYS, type MatchInfo } from './searchIndex';

/** The Name field key — EXCLUDED from snippet picks: a name match uses the BrowseRow fallback (B6). */
const NAME_KEY = 'builtin:name';
/** Custom fields carry the neutral default boost (they are absent from the built-in boost map). */
const NEUTRAL_BOOST = 1;
/** Canonical built-in order — the final, fully-deterministic tie-break within an equal boost tier. */
const BUILTIN_ORDER: readonly string[] = BUILTIN_FIELD_KEYS;

/**
 * Pick the field whose snippet to show for a hit. Collects every matched field key across all
 * matched terms, DROPS the name field (a "name: [term]" snippet is redundant with the row title,
 * B6), and returns the highest-boosted remaining key (D-07: name > tags/phone > description/notes >
 * custom neutral). Returns `undefined` when the only match is the name field (or nothing non-name
 * matched) — the caller then falls back to the normal BrowseRow secondary line.
 *
 * Ties break deterministically so the same match always yields the same snippet: equal boost →
 * a built-in field outranks a neutral custom field → canonical built-in order → alphabetical.
 */
export function pickMatchedField(
  match: MatchInfo,
  boostMap: Record<string, number> = BUILTIN_FIELD_BOOSTS,
): string | undefined {
  const keys = new Set<string>();
  for (const fields of Object.values(match)) {
    for (const field of fields) {
      if (field !== NAME_KEY) keys.add(field);
    }
  }
  if (keys.size === 0) return undefined;

  const ranked = [...keys].sort((a, b) => {
    const ba = boostMap[a] ?? NEUTRAL_BOOST;
    const bb = boostMap[b] ?? NEUTRAL_BOOST;
    if (ba !== bb) return bb - ba; // higher boost first
    const builtinA = a in boostMap ? 1 : 0;
    const builtinB = b in boostMap ? 1 : 0;
    if (builtinA !== builtinB) return builtinB - builtinA; // built-in outranks custom on a tie
    const ia = BUILTIN_ORDER.indexOf(a);
    const ib = BUILTIN_ORDER.indexOf(b);
    const ra = ia === -1 ? Number.POSITIVE_INFINITY : ia;
    const rb = ib === -1 ? Number.POSITIVE_INFINITY : ib;
    if (ra !== rb) return ra - rb; // canonical built-in order
    return a < b ? -1 : a > b ? 1 : 0; // final alphabetical tie-break
  });
  return ranked[0];
}

/**
 * Build the matched-field snippet as React children: a `{fieldLabel}: ` prefix, a ~`contextChars`
 * window either side of the first matched term (ellipsized only when the window is actually
 * truncated), and the matched substring wrapped in a real <mark>. The matched term is located
 * case-insensitively; with the index's suffix expansion the document term (e.g. "smith") is a
 * substring of the value (e.g. "blacksmith"), so the highlight lands on that substring.
 *
 * Never returns an HTML string; the <mark> is a genuine React element (T-05-01).
 */
export function buildSnippet(
  fieldLabel: string,
  valueText: string | undefined,
  terms: string[],
  contextChars = 30,
): ReactNode[] {
  const value = valueText ?? '';
  const prefix = `${fieldLabel}: `;
  const lower = value.toLowerCase();

  // Earliest-matching term within the value. MiniSearch's `terms` are the matched DOCUMENT terms
  // (with suffix indexing, e.g. "smith" for a "blacksmith" value), so an indexOf lands the highlight.
  let start = -1;
  let length = 0;
  for (const term of terms) {
    if (!term) continue;
    const at = lower.indexOf(term.toLowerCase());
    if (at !== -1 && (start === -1 || at < start)) {
      start = at;
      length = term.length;
    }
  }

  // No term located in the value (e.g. a fuzzy hit whose document term differs) — show a leading
  // window with no <mark> rather than nothing, so the row still reveals which field matched.
  if (start === -1) {
    const head = value.slice(0, contextChars * 2);
    return [prefix, head.length < value.length ? `${head}…` : head];
  }

  const from = Math.max(0, start - contextChars);
  const to = Math.min(value.length, start + length + contextChars);
  const leading = (from > 0 ? '…' : '') + value.slice(from, start);
  const matched = value.slice(start, start + length);
  const trailing = value.slice(start + length, to) + (to < value.length ? '…' : '');

  return [prefix, leading, createElement('mark', { key: 'match' }, matched), trailing];
}
