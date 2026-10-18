import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const urlOrEmpty = z.union([z.url(), z.literal("")]);
const pathOrUrlOrEmpty = z.string().refine(
  (value) => value === "" || value.startsWith("/") || /^https?:\/\//i.test(value),
  "Expected an https:// URL or a root-relative path beginning with /",
);

const projectMediaItem = z.object({
  kind: z.enum(["image", "video"]),
  src: pathOrUrlOrEmpty,
  alt: z.string().optional(),
  poster: pathOrUrlOrEmpty.optional(),
  label: z.string().optional(),
  link: pathOrUrlOrEmpty.optional(),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    short: z.string().optional(),
    summary: z.string().optional(),
    order: z.number().optional(),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    cover: pathOrUrlOrEmpty.optional(),
    video: pathOrUrlOrEmpty.optional(),
    media: z.array(projectMediaItem).optional(),
    ratio: z.string().default("16/9"),
    fit: z.enum(["contain", "cover"]).default("contain"),
  }),
});

const visualizations = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/visualizations" }),
  schema: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("scene").default("scene"),
      title: z.string(),
      simulation: z.string(),
      order: z.number().int().default(0),
      preview: pathOrUrlOrEmpty,
      previewAlt: z.string(),
      scene: pathOrUrlOrEmpty,
      time: z.string(),
      zoom: z.number().positive().default(1),
      defaultView: z.enum(["top", "north", "southwest", "south"]).default("top"),
    }),
    z.object({
      kind: z.literal("youtube"),
      title: z.string(),
      order: z.number().int().default(0),
      videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, "Expected an 11-character YouTube video ID"),
    }),
  ]),
});

const author = z.object({
  name: z.string(),
  roles: z
    .array(z.enum(["me", "mentor", "student", "corresponding"]))
    .default([]),
  emphasis: z.array(z.enum(["bold", "underline", "italic"])).optional(),
});

const cvOptions = z
  .object({
    short: z.boolean().default(false),
  })
  .default({ short: false });

const publications = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/publications" }),
  schema: z.object({
    title: z.string(),
    year: z.number().int(),
    month: z.number().int().min(1).max(12).nullable().optional(),
    authors: z.array(author),
    type: z
      .enum(["journal", "conference", "preprint", "thesis", "dataset", "other"])
      .default("journal"),
    status: z
      .enum(["published", "accepted", "in_review", "submitted", "preprint"])
      .default("published"),
    venue: z.string().optional(),
    volume: z.string().optional(),
    issue: z.string().optional(),
    pages: z.string().optional(),
    links: z
      .object({
        doi: z.string().optional(),
        journal: urlOrEmpty.optional(),
        pdf: pathOrUrlOrEmpty.optional(),
        other: pathOrUrlOrEmpty.optional(),
        code: pathOrUrlOrEmpty.optional(),
        data: pathOrUrlOrEmpty.optional(),
      })
      .default({}),
    selected: z.boolean().default(false),
    cv: cvOptions,
    tags: z.array(z.string()).default([]),
    url: z.url().optional(),
  }),
});

const education = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/education" }),
  schema: z.object({
    institution: z.string(),
    department: z.string().optional(),
    location: z.string().optional(),
    order: z.number().int().default(0),
    degrees: z.array(
      z.object({
        start: z.string(),
        end: z.string(),
        degree: z.string(),
        thesis: z.string().optional(),
        advisor: z.string().optional(),
      }),
    ),
  }),
});

const professionalDevelopment = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/professional-development" }),
  schema: z.object({
    year: z.number().int(),
    title: z.string(),
    org: z.string().optional(),
    location: z.string().optional(),
    cv: cvOptions,
  }),
});

const honors = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/honors" }),
  schema: z.object({
    year: z.number().int(),
    title: z.string(),
    org: z.string().optional(),
    detail: z.string().optional(),
  }),
});

const talks = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/talks" }),
  schema: z.object({
    date: z.string(),
    year: z.number().int(),
    title: z.string(),
    event: z.string(),
    kind: z.enum(["oral", "poster", "invited", "seminar", "panel"]),
    role: z.enum(["presenter", "coauthor", "organizer", "chair"]),
    location: z.string().optional(),
    session: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
      })
      .optional(),
    authors: z.array(author).default([]),
    links: z
      .object({
        abstract: urlOrEmpty.optional(),
        slides: pathOrUrlOrEmpty.optional(),
        poster: pathOrUrlOrEmpty.optional(),
        video: urlOrEmpty.optional(),
        other: urlOrEmpty.optional(),
      })
      .default({}),
    selected: z.boolean().default(false),
    cv: cvOptions,
    tags: z.array(z.string()).default([]),
    url: z.url().optional(),
  }),
});

export const collections = {
  projects,
  visualizations,
  publications,
  education,
  honors,
  professionalDevelopment,
  talks,
};
