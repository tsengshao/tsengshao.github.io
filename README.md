# Shao-Yu Tseng — academic website

Static academic website built with Astro. Research topics, education, publications, talks, and other CV records are maintained as Markdown content and reused by the website and HTML CV.

## Local development

Requirements:

- Node.js 24 (`nvm use` reads `.nvmrc`)
- npm
- Playwright Chromium for build-time CV PDF generation

```sh
npm ci
npx playwright install chromium
npm run dev
```

Before committing or deploying:

```sh
npm run verify
```

`verify` runs Astro/TypeScript checks, camera-transition and scene-integrity regression tests, validates content and referenced assets, builds the site, and checks the generated internal links.

## Content locations

| Content | Directory |
|---|---|
| Research topics/cards | `src/content/projects/` |
| Visualization gallery entries | `src/content/visualizations/` |
| Education | `src/content/education/` |
| Publications | `src/content/publications/` |
| Awards and support | `src/content/honors/` |
| Talks | `src/content/talks/` |
| Professional development | `src/content/professional-development/` |
| Site identity and contact links | `src/data/site.ts` |
| Published web media | `public/media/` |
| Local original and optimized media | `media/` |
| Other public files and PDFs | `public/` |

The schemas live in `src/content.config.ts`. A build fails when required fields or allowed status values are invalid.

## Site icons and Safari

The standard browser-tab icon is `public/favicon.svg`. `src/layouts/BaseLayout.astro` references it with `rel="icon"`, so replacing that file updates the favicon on every route; Safari may require a cache clear or relaunch before showing a changed icon.

Apple and Safari use separate optional assets for other surfaces:

- `public/apple-touch-icon.png` is the 180×180 square PNG used when a visitor adds the site to an iPhone or iPad Home Screen. It uses the same SY artwork as the favicon and is referenced from `BaseLayout.astro` with `rel="apple-touch-icon"`.
- `apple-touch-icon-precomposed.png` is a legacy variant intended to prevent old iOS versions from adding gloss or other effects. Modern sites normally do not need both files.
- A classic Safari pinned tab can use a separate single-color `safari-pinned-tab.svg` referenced with `rel="mask-icon"` and a theme color. This is independent of the regular full-color favicon.
- Safari's tab-overview page preview is generated from the rendered page rather than from a dedicated Astro image asset. Open Graph images are for shared-link previews, not the Safari tab snapshot.

## Add or update a publication

Create one Markdown file in `src/content/publications/`, using a stable descriptive filename such as `2026-journal-short-title.md`:

```yaml
---
title: "Article title"
year: 2026
month: 8

authors:
  - name: "Shao-Yu Tseng"
    roles: ["me"]
  - name: "Coauthor Name"
    roles: []

type: "journal"
status: "preprint"
venue: "Journal or preprint server"
volume: ""
issue: ""
pages: ""

links:
  doi: "10.xxxx/example"
  journal: ""
  pdf: ""
  code: ""
  data: ""
  other: ""

selected: false
cv:
  short: true
tags: ["topic"]
---
```

Allowed statuses are `preprint`, `submitted`, `in_review`, `accepted`, and `published`. They are shown as separate sections on the Publications page; do not label a preprint as submitted unless it has actually been submitted.

For a site-hosted PDF, place it under `public/papers/` and use a root-relative value such as `/papers/example.pdf`. `npm run validate:content` checks that the file exists. DOI may be stored as either a bare DOI or an `https://doi.org/...` URL.

Set `cv.short: true` when the publication should appear in both the Selected and Full CV. Every publication appears in the Full CV automatically.

## Add a presentation

Create one Markdown file in `src/content/talks/`, using a filename such as `2027-conference-short-topic.md`:

```yaml
---
date: "2027-12-15"
year: 2027
title: "Presentation title"
event: "Conference or seminar name"
kind: "oral"
role: "presenter"
location: "City, Country"

authors:
  - name: "Shao-Yu Tseng"
    roles: ["me"]
  - name: "Coauthor Name"
    roles: []

links:
  abstract: ""
  slides: ""
  poster: ""
  video: ""
  other: ""

selected: false
cv:
  short: true
tags: ["topic"]
---
```

Allowed `kind` values are `oral`, `poster`, `invited`, `seminar`, and `panel`. Allowed `role` values are `presenter`, `coauthor`, `organizer`, and `chair`. Add an optional `session` block with `id` and `name` when relevant.

Place site-hosted slides or posters under `public/talks/` and use a root-relative path such as `/talks/2027-conference-slides.pdf`. Presentations are sorted by date automatically. The Full CV includes every presentation; the Selected CV includes records with `cv.short: true`.

## Add or update a research card

Create a Markdown file in `src/content/projects/`. Set:

- `featured: true` to show it on the home page.
- `order` to control home and Research page ordering.
- `media` for images/videos in `public/`.
- `link` on an individual media item when its caption should link to the corresponding paper or project URL.
- `ratio` to match the dominant media shape; using an overly wide ratio can make plots and portrait-oriented videos appear unnecessarily small.

Featured research topics are presented directly on the home page. The primary navigation links to that section instead of a separate Research overview page.

The centered homepage introduction and research-pathway illustration are implemented in `src/pages/index.astro` and `src/components/HeroSchematic.astro`. The illustration stays below the introduction and uses the wide `public/media/figures/research-pathway.svg`, with its process arrows, question marks, and stage labels preserved. When replacing it, update the intrinsic `width` and `height` in `HeroSchematic.astro` and run `npm run verify`. The homepage contact row contains Email, GitHub, and the Selected CV download; Google Scholar and ORCID are centered directly below the Publications heading.

## Visualization

The homepage has a centered Gallery below the research topics, distinguished by the site's pale alternate section background. Its desktop scene is 600px wide, comparable to Research images, within an 800px layout that reserves space for controls. Mobile scenes fit the content width. The heading is `Visualization`, followed by `I enjoy creating scientific visualizations.`. The first entry has `TaiwanVVMex Simulation` above the scene, with no bottom title or visible time label. Desktop view buttons form a right-aligned vertical column outside the lower-left, toward the image; the lower-right zoom column places + above the magnification and − below it. There is no Reset button. On mobile both control groups run horizontally below the image, views on the left and −/magnification/+ on the right; view buttons wrap on narrow screens without overlapping zoom controls. The rainfall color scale uses the original scene lookup table: outside the upper-right on desktop, overlaid inside the upper-right on mobile with a transparent background and light, shadowed labels. It does not intercept scene gestures.

Entries live in `src/content/visualizations/` and use `src/components/VisualizationGallery.astro`. They are sorted by `order`; multiple entries show carousel arrows with disabled controls at the ends. The first entry is the interactive TaiwanVVMex scene and the second is the YouTube video Strong Rotating Clusters.

Scene entries use `kind: "scene"` (the default for existing entries); `preview` and `scene` reference the published WebP and single-frame `.vvmweb` package under `public/media/visualizations/`. To add a YouTube entry, create a Markdown file such as:

```yaml
---
kind: "youtube"
title: "Strong Rotating Clusters"
order: 2
videoId: "Z440GYvxCAs"
---
```

YouTube entries show a responsive 16:9 player and a direct Watch on YouTube link. The `youtube-nocookie.com` embed loads only when its entry is selected near the viewport; it does not autoplay. Switching away or scrolling offscreen unloads the player to stop playback. Returning reloads it from the beginning. Video entries omit the scene controls and rainfall legend; switching back preserves the ready 3D scene. Keyboard focus moves to an enabled carousel arrow at either end.

TaiwanVVMex displays a fixed 15:00 scene, initially showing the complete scene from Top at fitted 1× zoom against the original gray ParaView background. `defaultView` and `zoom` in its content entry control the initial view; Home restores them. The view buttons are Top, North, Southwest, and South: Southwest resets to 1.7×, South to 1.2×, and Top/North to 1× on selection. North looks horizontally from due north, replacing Northwest. South and Southwest retain their tilted-down perspectives and pan the scene upward on screen without changing orientation. Their framing centers are raised by 1/3 and 1/4 of the vertical extent respectively, followed by a screen-up pan using the same respective distances. Southwest is turned 15° farther west at its previous elevation angle. Drag to rotate around the Taiwan terrain-center pivot with Z upright; Shift-drag pans by translating camera and focus together. On touch devices, one-finger drag rotates, two-finger drag pans, and pinch zooms, with matching mobile instructions. Wheel, pinch, +/− buttons, and keyboard +/− zoom from 0.5× to 8×. Arrow keys rotate the focused scene. Zoom and panning never alter scientific geometry or vertical scale.

Preset animations use continuous upright yaw/pitch interpolation, including north-up at the exact Top view. This avoids the old near-pole screen-up switch that caused a visible jump. `npm run check:camera` samples transitions, including panned and interrupted poses; it is included in `npm run verify`.

The vtk.js engine and 9.8 MB scene load only when the gallery approaches the viewport. A matching WebP is shown first and remains available if WebGL or loading fails; Try again retries loading. Motion is finite and respects reduced-motion settings. GPU resources are released when leaving the page. Renderer/camera modules were copied from `Paraview-VVMex` into `src/lib/vvm/`; the website runs independently of that project and needs no rendering server or React.

Every decompressed asset must match its declared length, SHA-256 and content-addressed key. HTTPS/localhost use native Web Crypto; when `crypto.subtle` is unavailable (for example a phone visiting a LAN HTTP address), the loader lazily imports the pinned `@noble/hashes` SHA-256 implementation. Neither path skips verification. This checks integrity against package metadata, not HTTPS transport authenticity. `npm run check:scene`, included in `verify`, tests both hash paths, missing crypto, offset views, corruption rejection and all published assets.

For phone previews on the same LAN, start `npm run dev -- --host` and use the Network URL it reports. If adding a dependency leaves the running development server reporting `504 Outdated Optimize Dep`, restart that server and reload the page.

To prepare the published single-frame package from an existing complete animation package:

```sh
npm run media:visualization -- /path/to/taiwanvvm_4km_MUSCL.vvmweb
```

This verifies the 15:00 annotation and all selected asset hashes, then copies only that frame's required compressed assets without resampling or simplifying geometry, arrays, or textures. The original overlay is omitted; the rainfall scale uses accessible HTML and time remains in the data metadata. Package preparation is manual, not part of the production build. Keep the full animation local; commit only the curated published scene/preview and source code when ready.

After building and starting `npm run preview -- --host 127.0.0.1 --port 4325`, run:

```sh
npm run check:visualization -- http://127.0.0.1:4325/
```

This checks lazy YouTube loading, 16:9 layout, carousel keyboard focus, player unloading/reloading, preservation of the 3D scene, desktop/mobile layout and hints, the responsive color scale, lazy loading, Top default/Home, keyboard/pointer rotation, Shift-panning, wheel/pinch zoom, and failed-load retry. Emulated touch sequences verify that two-finger pan preserves orientation and zoom, pinch still zooms, and one-finger rotation/Home work afterward. An isolated insecure HTTP test origin verifies that mobile loading works without Web Crypto and still rejects mismatched SHA-256 values. It also samples actual camera frames with reduced motion off to catch discontinuities approaching Top and checks the preset focus offsets and level North view. The YouTube response is stubbed for deterministic carousel tests; verify the real external player separately when changing video IDs. Screenshots and camera traces go to ignored `artifacts/visualization/`. To refresh the preview after a deliberate camera change, convert the generated `default-view.png` to the published WebP and update its intrinsic dimensions in the gallery component if necessary.

## Optimize research media

Original media and generated previews stay local, while approved web assets under `public/media/` are committed and deployed:

```text
media/source → npm run media:optimize → media/ready → manual review/copy → public/media
```

On macOS, install the required tools once with `brew install ffmpeg webp`. The project-local `sharp` dependency is installed by `npm ci`. Place original figures, videos, or animations under the matching `media/source/` directory, then run:

```sh
npm run media:optimize
```

For figures, the optimizer checks whether the outer edge has a sufficiently uniform background color. When it does, only matching pixels connected to the image boundary are made transparent, so enclosed white plot areas are retained; already-transparent and non-uniform figures are left intact. The command reports its decision for every figure.

Review `media/ready/` and manually copy approved files into `public/media/`. Update the associated content path when an extension changes. The local source and ready directories are ignored by Git; the optimized files in `public/media/`, the optimizer, and `media/README.md` are committed. See `media/README.md` for formats, background-detection controls, and optional quality settings.

## CV

The CV is maintained in the same Markdown content collections as the website. The HTML render routes remain available for direct preview but are intentionally absent from site navigation and marked `noindex, nofollow`:

- `/cv` renders the concise Selected CV.
- `/cv/full` renders the complete CV.

The Full CV includes all records; `cv.short: true` selects records for the concise version. Both routes use the same `CVDocument.astro` component and A4 print CSS.

Generate both PDFs locally with:

```sh
npm run cv:pdf
```

The command starts a temporary local Astro server and uses Playwright Chromium to produce:

- `artifacts/cv/Shao-Yu-Tseng-CV-selected.pdf`
- `artifacts/cv/Shao-Yu-Tseng-CV-full.pdf`
- `public/downloads/Shao-Yu-Tseng-CV.pdf`, a generated copy of the Selected CV used by the website

`artifacts/` and the generated file under `public/downloads/` are ignored by Git. The homepage links only to the Selected PDF. The Full PDF is never copied into `public/` or `dist/`, so it is not deployed by GitHub Pages. Run `npm run cv:pdf` once before expecting the homepage download to work under `npm run dev`; production builds generate it automatically.

`npm run build` and `npm run verify` regenerate both PDFs. On a fresh machine, install the browser once with `npx playwright install chromium`. GitHub Actions uses `npx playwright install --with-deps chromium` before building.

## GitHub Pages deployment

`.github/workflows/deploy.yml` verifies, builds, and deploys pushes to `main` with GitHub Actions. The Astro config derives these values from GitHub automatically:

- `site`: `https://<owner>.github.io`
- `base`: `/<repository>` for a project site
- no `base` for a repository named `<owner>.github.io`

All internal links use `import.meta.env.BASE_URL`, so project sites and user sites use the same source code.

For a custom domain, set `SITE_URL=https://example.com`, set `BASE_PATH=/`, and add `public/CNAME` containing the domain.

In GitHub repository settings, select **Pages → Source → GitHub Actions**. Ensure every required public image and video has been committed; files that only exist locally cannot be deployed.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run check` | Astro and TypeScript diagnostics |
| `npm run validate:content` | Content, DOI, protocol, and asset validation |
| `npm run media:optimize` | Convert local source media into web-ready previews |
| `npm run build` | Production build |
| `npm run check:links` | Validate internal links in `dist/` |
| `npm run check:camera` | Check camera-transition continuity, endpoints, and orientation |
| `npm run check:scene` | Check native/fallback SHA-256, asset integrity and corruption rejection |
| `npm run verify` | Run all pre-deployment checks |
| `npm run cv:pdf` | Generate local Selected and Full CV PDFs and refresh the public Selected copy |
