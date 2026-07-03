---
created: 2026-07-03T03:47:17.841Z
title: Enable COOP header in production for Drive OAuth
area: tooling
files:
  - vite.config.ts
  - .planning/debug/resolved/oauth-prompt-every-refresh.md
---

## Problem

Google Identity Services' OAuth token popup requires the app to be served with the HTTP header
`Cross-Origin-Opener-Policy: same-origin-allow-popups`. Without it, `accounts.google.com`'s own
COOP severs the opener↔popup link and the token flow dies with GSI "Failed to open popup window"
(the exact failure debugged in `.planning/debug/resolved/oauth-prompt-every-refresh.md`).

This header is currently set for **dev + preview only**, via `vite.config.ts` `server.headers` /
`preview.headers`. But **GitHub Pages — the current deploy target** (`base: '/relation_blueprint/'`)
— **cannot send custom response headers**. So the deployed production site will fail Drive OAuth
exactly as dev did before the fix. This BLOCKS shipping Drive sync to production; it works locally
but would be broken for real users on the Pages URL.

Context also captured in memory `drive-oauth-coop-github-pages-blocker`.

## Solution

Decide before the production deploy of Drive sync — two viable paths:

- **(a) Move hosting to a headers-capable static host** (keeps the no-backend / static-PWA
  constraint): Cloudflare Pages or Netlify, adding a `_headers` file with
  `/*  Cross-Origin-Opener-Policy: same-origin-allow-popups`. If switching, re-verify the host's
  base-path + SPA navigation fallback (the app assumes the `/relation_blueprint/` GitHub Pages
  subpath in `vite.config.ts` `base`, PWA `start_url`/`scope`, and Workbox `navigateFallback`).
- **(b) Adopt FedCM** for the Drive authorization flow — Google's answer to the third-party-cookie
  / COOP problem for GIS. Larger change and browser-support varies; revisit if staying on Pages.

Recommendation: (a) is the smaller, lower-risk change and preserves the free/OSS + static-deploy
constraints. Confirm the new host is free-tier and supports the subpath/base config before moving.
