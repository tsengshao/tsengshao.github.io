# Shao-Yu Tseng — academic website

Static academic website built with Astro. Research topics, publications, talks, positions, and honors are maintained as Markdown content and reused by the website and CV export pipeline.

## Local development

Requirements:

- Node.js 24 (`nvm use` reads `.nvmrc`)
- npm
- Quarto + a LaTeX distribution only when rebuilding `public/cv.pdf`

```sh
npm ci
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
| Publications | `src/content/publications/` |
| Talks | `src/content/talks/` |
| Positions | `src/content/positions/` |
| Honors | `src/content/honors/` |
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
tags: ["topic"]
---
```

Allowed statuses are `preprint`, `submitted`, `in_review`, `accepted`, and `published`. They are shown as separate sections on the Publications page; do not label a preprint as submitted unless it has actually been submitted.

For a site-hosted PDF, place it under `public/papers/` and use a root-relative value such as `/papers/example.pdf`. `npm run validate:content` checks that the file exists. DOI may be stored as either a bare DOI or an `https://doi.org/...` URL.

## Add or update a research card

Create a Markdown file in `src/content/projects/`. Set:

- `featured: true` to show it on the home page.
- `order` to control home and Research page ordering.
- `media` for images/videos in `public/`.
- `link` on an individual media item when the figure should open a paper or project URL.

The Markdown body becomes the research detail page. It should normally include a research question, motivation, approach, and goal or key findings.

## CV

Content records are exported to `src/generated/cv.generated.yml` during every site build. To regenerate the downloadable PDF:

```sh
npm run cv:pdf
```

This command exports current content first, renders `cv/cv.qmd`, and moves the result to `public/cv.pdf`. The PDF must be committed/deployed as a public asset; rebuild it whenever publication, talk, position, or honor content changes.

The CV layout is intentionally kept separate for a later design pass. Until then, do not hand-edit `src/generated/cv.generated.yml`.

## GitHub Pages deployment

`.github/workflows/deploy.yml` deploys pushes to `main` with the official Astro Pages action. The Astro config derives these values from GitHub automatically:

- `site`: `https://<owner>.github.io`
- `base`: `/<repository>` for a project site
- no `base` for a repository named `<owner>.github.io`

All internal links use `import.meta.env.BASE_URL`, so project sites and user sites use the same source code.

For a custom domain, set `SITE_URL=https://example.com`, set `BASE_PATH=/`, and add `public/CNAME` containing the domain.

In GitHub repository settings, select **Pages → Source → GitHub Actions**. Ensure every required public asset, including `public/cv.pdf`, has been committed; files that only exist locally cannot be deployed.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run check` | Astro and TypeScript diagnostics |
| `npm run validate:content` | Content, DOI, protocol, and asset validation |
| `npm run build` | Production build |
| `npm run check:links` | Validate internal links in `dist/` |
| `npm run verify` | Run all pre-deployment checks |
| `npm run cv:pdf` | Rebuild the downloadable CV PDF |
