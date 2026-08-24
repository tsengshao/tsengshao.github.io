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

`verify` runs Astro/TypeScript checks, validates content and referenced assets, builds the site, and checks the generated internal links.

## Content locations

| Content | Directory |
|---|---|
| Research topics/cards | `src/content/projects/` |
| Education | `src/content/education/` |
| Publications | `src/content/publications/` |
| Honors and awards | `src/content/honors/` |
| Talks | `src/content/talks/` |
| Professional development | `src/content/professional-development/` |
| Site identity and contact links | `src/data/site.ts` |
| Public images, videos, and PDFs | `public/` |

The schemas live in `src/content.config.ts`. A build fails when required fields or allowed status values are invalid.

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

Featured research topics are presented directly on the home page. The primary navigation links to that section instead of a separate Research overview page.

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

`.github/workflows/deploy.yml` deploys pushes to `main` with the official Astro Pages action. The Astro config derives these values from GitHub automatically:

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
| `npm run build` | Production build |
| `npm run check:links` | Validate internal links in `dist/` |
| `npm run verify` | Run all pre-deployment checks |
| `npm run cv:pdf` | Generate local Selected and Full CV PDFs and refresh the public Selected copy |
