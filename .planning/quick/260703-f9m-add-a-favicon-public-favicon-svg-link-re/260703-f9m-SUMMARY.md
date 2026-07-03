---
quick_id: 260703-f9m
title: Add a favicon (stop /favicon.ico 404 + browser-tab icon)
status: complete
date: 2026-07-03
commit: c0bf714
---

# Quick Task 260703-f9m Summary

## Outcome

Added an SVG favicon and declared it in `index.html`. **Verified live:** the dev server serves
`/relation_blueprint/favicon.svg` → HTTP 200 (`image/svg+xml`). Declaring `<link rel="icon">`
stops the browser's automatic root `/favicon.ico` request, so the console 404 is gone and the
browser tab now shows an icon.

## Changes

- **public/favicon.svg** (new) — on-brand relationship-graph glyph: slate `#1B2230` rounded square,
  two paper `#F4F1EA` nodes + one amber `#C8742B` accent node, hairline `#D8D2C4` edges (palette
  mirrors `src/app/tokens.ts` / UI-SPEC; amber stays the single reserved accent).
- **index.html** — added `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.
  Root-absolute `/favicon.svg` is auto-rebased by Vite against `base: '/relation_blueprint/'`
  in dev and build (confirmed via Vite docs).

## Verification

- `curl http://localhost:5173/relation_blueprint/favicon.svg` → `HTTP 200, image/svg+xml`. ✓
- `<link rel="icon">` present in `index.html` → browser stops auto-requesting root `/favicon.ico`.

## Out of scope

- PWA manifest icon PNGs (`manifest-icons/pwa-192x192.png`, `pwa-512x512.png`, referenced in
  `vite.config.ts`) are still placeholders — a separate asset task.

## Commit

- `c0bf714` — feat(260703-f9m): add SVG favicon + link in index.html
