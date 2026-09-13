# SPICE UI kit (lab)

Minimal/modern primitive set for the UI refresh experiment. Goal: quiet
surfaces, one flat accent, hierarchy from spacing — not glow, gradients,
or glass.

Showcase: open `/ui-lab` (unlinked from the nav on purpose).

## Use

```tsx
import { Button, Card, Picker, Shelf, TextField } from '@/components/ui';
```

Load the tokens once per surface, e.g. in a route layout:

```tsx
import '../../../components/ui/tokens.css';
```

Every component also carries `var()` fallbacks, so it renders sensibly
even where tokens aren't loaded.

## Theming contract

Tokens reference the shared theme variables first
(`--bg-surface`, `--text-primary`, …) and only fall back to baked-in
neutrals. A theme change in Settings repaints kit surfaces live — no
per-component theme props, no fixed dark/light styling.

## Rules (pinned by `test/ui-kit.test.mjs`)

- No native `<select>` — OS popups ignore the dark theme. Use `Picker`.
- No pictographic emoji in kit sources — text/SVG only.
- New primitives self-contain their CSS in a `<style>` block with the
  `spk-` prefix (same convention as `app/media-chrome.tsx`), so a single
  file can be copied into movies/shows/anime with no extra setup.

## Porting to movies / shows / anime

Each component is one dependency-free file (`react` only). Copy the file,
keep the `spk-` classes, load `tokens.css` in the route layout. `Shelf`
matches the continue-watching rail shape; `Picker` matches the provider
tab pattern.

## Deliberately out of scope

Data fetching, auth reads, provider logic, icons. Those stay in the
existing `app/media-*.tsx` islands until the kit proves itself here.
