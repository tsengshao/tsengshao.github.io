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
    year: z.number().int(),

    // 必要：APA + 粗體作者
    authors: z.array(z.string()),

    // 基本出版資訊（網站顯示 + APA 需要）
    venue: z.string().optional(),  // journal / conference name
    volume: z.string().optional(),
    issue: z.string().optional(),
    pages: z.string().optional(),

    // 你原本就有、而且很實用（網站排序/標記用）
    status: z.enum(["published", "in_review", "submitted", "preprint"]).default("published"),
    selected: z.boolean().default(false),

    // 你原本的 links：之後 APA DOI / PDF / other 都會用到
    links: z.object({
      doi: z.string().optional(),
      pdf: z.string().optional(),
      other: z.string().optional(),
    }).default({}),
  }),
});

const positions = defineCollection({
  type: "content",
  schema: z.object({
    start: z.string(), // e.g. "2023-08"
    end: z.string(),   // e.g. "present" | "2025-12"
    role: z.string(),
    org: z.string(),
    location: z.string().optional()
  })
});

const honors = defineCollection({
  type: "content",
  schema: z.object({
    year: z.number().int(),
    title: z.string(),
    org: z.string().optional()
  })
});

const talks = defineCollection({
  type: "content",
  schema: z.object({
    date: z.string(), // e.g. "2026-05"
    title: z.string(),
    event: z.string(),
    type: z.enum(["oral", "poster", "invited"]).default("oral"),
    location: z.string().optional(),
    coauthors: z.array(z.string()).optional()
  })
});

export const collections = {
  projects,
  publications,
  positions,
  honors,
  talks
};


