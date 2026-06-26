---
phase: 02-custom-fields-full-entity-model
reviewed: 2026-06-26T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/db/repository.ts
  - src/features/fields/FieldEditor.tsx
  - src/features/entity-form/CustomFieldInputs.tsx
  - src/features/profile/CustomFieldRows.tsx
  - src/features/fields/FieldManager.tsx
  - tests/db/applyFieldTypeChange.test.ts
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 02: Code Review Report (gap-closure plan 02-06 delta)

**Reviewed:** 2026-06-26
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Scope is the 02-06 gap-closure delta against diff base `07b425d`: the new
`applyFieldTypeChange` coercion path in `repository.ts`, its FieldEditor wiring, the
WR-01/02/04/06 fixes, and the new wired test. The transaction atomicity, the
emit-after-commit ordering, the WR-01 NaN→null fix, the WR-02 `tel:` stripping (display text
stays a React child, no `dangerouslySetInnerHTML`), the WR-04 pre-await capture in
`FieldManager.move`, and the WR-06 per-field-id ChangeEvents all check out as intended.

However, the keep/quarantine/restore logic in `coerceEntityCustom` contains a **data-loss
defect**: a second quarantining type change silently overwrites an already-quarantined
original, destroying it. This directly breaks the D-05 invariant the whole plan exists to
uphold ("non-convertible originals are quarantined... never deleted"), and the caution copy
the user is shown ("set aside, not deleted") becomes false. It is reachable through ordinary
user actions and is classified BLOCKER. The remaining findings are lower-severity robustness
and naming items.

## Critical Issues

### CR-01: Re-quarantining a field silently destroys the previously quarantined original (data loss)

**File:** `src/db/repository.ts:508-520` (`coerceEntityCustom`)

**Issue:** When a live value fails coercion, the original is set aside with an unconditional
assignment:

```ts
} else {
  next[qKey] = result.quarantined;   // overwrites any value already at qKey
  next[fieldId] = null;
  changed = true;
}
```

The quarantine slot (`qKey`) holds at most one value per field. If that slot is already
occupied by an original quarantined during an EARLIER type change, this assignment overwrites
it and the earlier original is lost forever — there is no second slot and no merge.

Reachable sequence (all ordinary actions):
1. Field type is `text`, entity value is `"hello"`. Change `text → number`: `"hello"` does
   not convert, so it is quarantined (`qKey="hello"`, live=`null`). Correct so far.
2. User opens the entity and types `5` into the now-number field (live=`5`, `qKey="hello"`
   still present — `EntityForm` round-trips the quarantine key through `state.custom`).
3. Change `number → date`: `5` does not convert to a date, so the else-branch runs
   `next[qKey] = 5`, **clobbering `"hello"`**. The original is gone.

This violates the core D-05 guarantee the plan was written to deliver and makes the
FieldEditor caution copy ("others are set aside, not deleted" — `FieldEditor.tsx:142`)
untrue. The wired test only exercises a single quarantine cycle, so it does not catch this.

**Fix:** Refuse to overwrite a non-empty quarantine slot. Preserve the existing quarantined
original (it is the value the user most needs to recover) and drop only the live value, or
keep the existing original and decline to clobber it:

```ts
} else {
  // Never overwrite an original already quarantined by an earlier change (D-05: never deleted).
  if (next[qKey] === undefined || next[qKey] === null) {
    next[qKey] = result.quarantined;
  }
  next[fieldId] = null;
  changed = true;
}
```

If preserving BOTH originals is required, widen the quarantine representation to an array (a
list of set-aside originals) rather than a single slot — but at minimum the existing original
must not be silently destroyed. Add a wired test covering quarantine → enter new live value →
quarantine again, asserting the first original survives.

## Warnings

### WR-01: `tags` value cast to `string[]` without a runtime guard in the profile read path

**File:** `src/features/profile/CustomFieldRows.tsx:175-184`

**Issue:** The `tags` case does `(value as string[]).map(...)`. After a type change a stored
value for a tags field is normally coerced to an array (or quarantined), but the read path
trusts that invariant with an unchecked cast. If a non-array value ever reaches this branch
(e.g. legacy/imported data, or a future coercion gap), `.map` throws and crashes the profile
render. The sibling input component (`CustomFieldInputs.tsx:72`) defensively guards with
`Array.isArray(value) ? ... : []`; the read path should match.

**Fix:** Guard the cast the same way the input does:

```ts
case 'tags': {
  const tags = Array.isArray(value) ? (value as string[]) : [];
  return (
    <span className={styles.chips} data-testid="custom-tags">
      {tags.map((tag) => (
        <span key={tag} className={styles.chip}>{tag}</span>
      ))}
    </span>
  );
}
```

### WR-02: `coerceEntityCustom` restore branch keys restorability off the current change's type pair, not the value's quarantine origin

**File:** `src/db/repository.ts:522-530`

**Issue:** The restore block evaluates `coerceOnTypeChange(fromType, toType, quarantined)` —
i.e. it asks "does the quarantined value fit a `fromType → toType` move?" That happens to be
correct for a straight revert (`number → text` restores a `text`-origin original), and the
test covers exactly that. But the quarantined value's true origin type is not recorded, so a
multi-hop history can misjudge restorability. Example: a `text`-origin `"hello"` quarantined
during `text → number`, then the field is changed `number → date` (no fit, stays
quarantined), then `date → text`: the restore check is `coerceOnTypeChange('date','text',"hello")`
→ kept, which happens to restore correctly here only because "any scalar → text" always
succeeds. The logic is coincidentally right for text targets but is not generally sound
because it never consults the original field type the value was authored under. This is a
latent correctness risk rather than a proven present-day bug, hence WARNING.

**Fix:** Either document explicitly that restore is only ever attempted against the immediate
`fromType → toType` pair and accept the limitation, or record the quarantine-origin type
alongside the quarantined value so restorability can be judged against the value's actual
origin type rather than whichever pair happens to be in flight. Note this interacts with
CR-01 — a richer quarantine representation would address both.

## Info

### IN-01: `coerceEntityCustom` reference-equality check on `result.kept` is brittle for object values

**File:** `src/db/repository.ts:511`

**Issue:** `if (result.kept !== next[fieldId])` decides whether the row changed using strict
reference equality. For scalar values this is fine. For a `photo` MediaRef kept verbatim,
`coerceOnTypeChange` returns the same object reference so the comparison is correctly `false`
(no spurious change) — so this is currently safe. It is flagged only as a maintenance hazard:
any future change to `coerceOnTypeChange` that returns a structurally-equal-but-new object
would cause an unnecessary `dirty`/`updatedAt` bump and a redundant sync. A value-aware
"changed" check or a comment pinning the same-reference contract would harden this.

**Fix:** Add a brief comment noting the reliance on `coerceOnTypeChange` returning the SAME
reference for unchanged values, so the reference-equality `changed` check stays valid.

---

_Reviewed: 2026-06-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
