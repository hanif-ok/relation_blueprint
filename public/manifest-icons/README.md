# PWA manifest icons

The web manifest (configured in `vite.config.ts` via `VitePWA(...)`) references PNG icons
that live in this folder and are copied verbatim into the build under
`/relation_blueprint/manifest-icons/`.

## Required files

| File | Size | Purpose |
|------|------|---------|
| `pwa-192x192.png` | 192×192 | Standard install icon (home screen / launcher) |
| `pwa-512x512.png` | 512×512 | Standard + **maskable** install icon (splash, adaptive) |

The manifest also declares the 512×512 image with `purpose: "maskable"` so Android can
crop it to the platform's adaptive-icon shape — keep the important content inside the inner
~80% safe zone of the source artwork.

## Generating the icons (recommended)

`@vite-pwa/assets-generator` (installed as a dev dependency) produces all required sizes
from a single high-resolution source image (≥ 512×512, ideally 1024×1024). Place a source
`logo.svg` or `logo.png` at the repo root (or `public/`) and run:

```bash
# One-off generation from a source image into this folder:
npx @vite-pwa/pwa-assets-generator --preset minimal-2023 public/logo.svg
```

The `minimal-2023` preset emits `pwa-192x192.png`, `pwa-512x512.png`, an
`apple-touch-icon`, and a favicon. Move/rename the two PWA PNGs into this folder so the
filenames match the manifest entries above.

### Brand colors for the source artwork

Match the UI-SPEC tokens so the installed app reads as the same product:

- Background (manifest `background_color`): warm paper `#F4F1EA`
- Accent / theme (manifest `theme_color`): amber `#C8742B`
- Ink: `#26211A`

The signature mark is the diamond `◆` wordmark glyph; a simple amber-on-paper diamond is a
fine placeholder until a final logo exists.

> Note: the production PNGs are a manual/asset step. The build does not fail if they are
> absent — the manifest still emits — but installs will show a default icon until the PNGs
> are added.
