// D-09 — the matched-field snippet helper. This pins the two pure functions behind the "evidence
// the scoping works" row line:
//   (1) pickMatchedField: the name field is EXCLUDED (name matches fall back to the BrowseRow line);
//       the highest-boosted NON-name matched field wins; ties break deterministically.
//   (2) buildSnippet: returns REACT CHILDREN — a `{label}: ` prefix, a context window, and the
//       matched substring wrapped in a real <mark> element (never an HTML string, T-05-01); the
//       context window ellipsizes only when truncated (no ellipsis at the value's start/end).

import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { BUILTIN_FIELD_BOOSTS } from '@/features/search/searchIndex';
import { buildSnippet, pickMatchedField } from '@/features/search/snippet';

const JOB = 'fld_job'; // a custom field id (neutral boost — absent from the built-in boost map)

/** Flatten the string fragments of a snippet node list (drops elements) into one string. */
function textOf(nodes: ReactNode[]): string {
  return nodes.filter((n): n is string => typeof n === 'string').join('');
}

/** The single <mark> element in a snippet node list, if any. */
function markOf(nodes: ReactNode[]): ReactElement<{ children: string }> | undefined {
  return nodes.find(
    (n): n is ReactElement<{ children: string }> => isValidElement(n) && n.type === 'mark',
  );
}

describe('pickMatchedField — which field the snippet reveals (D-07/B6)', () => {
  it('returns undefined for a NAME-only match (name uses the BrowseRow fallback line, B6)', () => {
    expect(pickMatchedField({ smith: ['builtin:name'] }, BUILTIN_FIELD_BOOSTS)).toBeUndefined();
  });

  it('excludes the name field and surfaces the non-name field that carries the evidence', () => {
    expect(pickMatchedField({ smith: ['builtin:name', JOB] }, BUILTIN_FIELD_BOOSTS)).toBe(JOB);
  });

  it('returns the sole non-name matched field (the blacksmith case)', () => {
    expect(pickMatchedField({ smith: [JOB] }, BUILTIN_FIELD_BOOSTS)).toBe(JOB);
  });

  it('picks the higher-boosted field when boosts differ (tags 2 > notes 1)', () => {
    expect(
      pickMatchedField({ smith: ['builtin:notes', 'builtin:tags'] }, BUILTIN_FIELD_BOOSTS),
    ).toBe('builtin:tags');
  });

  it('breaks an equal-boost tie deterministically: a built-in outranks a neutral custom field', () => {
    // notes (built-in, boost 1) and a custom field (neutral 1) tie on boost; the built-in wins —
    // matching D-07 "description/notes > custom neutral". Fully deterministic regardless of order.
    expect(pickMatchedField({ smith: ['builtin:notes', JOB] }, BUILTIN_FIELD_BOOSTS)).toBe(
      'builtin:notes',
    );
    expect(pickMatchedField({ smith: [JOB, 'builtin:notes'] }, BUILTIN_FIELD_BOOSTS)).toBe(
      'builtin:notes',
    );
  });
});

describe('buildSnippet — the highlighted, XSS-safe evidence line (D-09/T-05-01)', () => {
  it('wraps the matched substring in a real <mark> and keeps the prefix + value as children', () => {
    const nodes = buildSnippet('Job', 'blacksmith', ['smith']);
    // Prefix + leading context render as plain string children; the matched substring is a <mark>.
    expect(textOf(nodes)).toBe('Job: black');
    const mark = markOf(nodes);
    expect(mark).toBeDefined();
    // It is a REACT ELEMENT of type 'mark' — NOT an HTML string (the XSS boundary).
    expect(isValidElement(mark)).toBe(true);
    expect(mark?.type).toBe('mark');
    expect(mark?.props.children).toBe('smith');
    // No fragment is a raw HTML string.
    for (const n of nodes) {
      if (typeof n === 'string') expect(n).not.toContain('<mark>');
    }
  });

  it('adds no leading/trailing ellipsis when the term sits at the value start / end', () => {
    // Term at the END ("blacksmith") → no trailing ellipsis; the value starts at the window → no
    // leading ellipsis either (the whole short value fits).
    const end = buildSnippet('Job', 'blacksmith', ['smith']);
    expect(textOf(end)).toBe('Job: black');
    expect(textOf(end)).not.toContain('…');

    // Term at the START ("smithy…") → no leading ellipsis.
    const start = buildSnippet('Job', 'smithy shop', ['smith'], 30);
    const startText = textOf(start);
    expect(startText.startsWith('Job: ')).toBe(true);
    // Nothing precedes the mark, so there is no leading "…" before it.
    expect(startText).toBe('Job: y shop');
    expect(markOf(start)).toBeDefined();
  });

  it('ellipsizes both sides when the matched term is in the middle of a long value', () => {
    const value = 'aaaaaaaaaa smith bbbbbbbbbb cccccccccc';
    const nodes = buildSnippet('Notes', value, ['smith'], 5);
    const leading = (nodes[1] as string) ?? '';
    const trailing = (nodes[3] as string) ?? '';
    expect(leading.startsWith('…')).toBe(true);
    expect(trailing.endsWith('…')).toBe(true);
    expect(markOf(nodes)?.props.children).toBe('smith');
  });
});
