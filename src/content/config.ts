import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    short: z.string(), // 1 sentence summary
    order: z.number().optional(),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),   // e.g., "/figures/idealized_cover.webp"
    video: z.string().optional(),   // e.g., "/videos/idealized_loop.webm"
    ratio: z.string().default('16/9'),
    fit:   z.string().default('contain'),
  }),
});

const publications = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    year: z.number(),
    authors: z.string(),
    venue: z.string().optional(), // journal / conference
    status: z.enum(["published", "in_review", "submitted", "preprint"]).default("published"),
    links: z.object({
      doi: z.string().optional(),
      pdf: z.string().optional(),
      arxiv: z.string().optional(),
    }).default({}),
    selected: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { projects, publications };
