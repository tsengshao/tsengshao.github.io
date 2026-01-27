import { defineCollection, z } from "astro:content";

const urlOrEmpty = z.union([z.string().url(), z.literal("")]);

/** ---------- Projects (supports multi-media carousel) ---------- */
const projectMediaItem = z.object({
  kind: z.enum(["image", "video"]),
  src: z.string(),                // allow relative paths like "/videos/xxx.webm"
  alt: z.string().optional(),
  poster: z.string().optional(),  // recommended for video
  label: z.string().optional(), // optional (future use)
});

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    short: z.string(), // 1 sentence summary
    order: z.number().optional(),
    featured: z.boolean().default(false),
    tags: z.array(z.string()).default([]),

    // legacy single-media (still supported)
    cover: z.string().optional(), // e.g., "/figures/idealized_cover.webp"
    video: z.string().optional(), // e.g., "/videos/idealized_loop.webm"

    // NEW: multiple media (0+). If provided, prefer this over cover/video.
    media: z.array(projectMediaItem).optional(),

    // layout controls used by ResearchRow/ProjectCard
    ratio: z.string().default("16/9"),
    fit: z.enum(["contain", "cover"]).default("contain"),
  }),
});

const publications = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    year: z.number().int(),
    month: z.number().int().min(1).max(12).nullable().optional(),

    authors: z.array(
      z.object({
        name: z.string(),

        // semantic roles
        roles: z
          .array(z.enum(["me", "mentor", "student", "corresponding"]))
          .default([]),

        // optional display override
        emphasis: z
          .array(z.enum(["bold", "underline", "italic"]))
          .optional(),
      })
    ),

    type: z
      .enum(["journal", "conference", "preprint", "thesis", "dataset", "other"])
      .default("journal"),

    status: z
      .enum(["published", "in_review", "submitted", "preprint"])
      .default("published"),

    venue: z.string().optional(),
    volume: z.string().optional(),
    issue: z.string().optional(),
    pages: z.string().optional(),

    links: z
      .object({
        doi: z.string().optional(),
        journal: urlOrEmpty.optional(),
        pdf: z.string().optional(),
        other: z.string().optional(),
      })
      .default({}),

    selected: z.boolean().default(false),
    tags: z.array(z.string()).default([]),

    // optional canonical url for website
    url: z.string().url().optional(),
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
    // When (string to allow YYYY-MM or YYYY-MM-DD)
    date: z.string(),
    year: z.number().int(),

    // What
    title: z.string(),
    event: z.string(),

    // How / your role
    kind: z.enum(["oral", "poster", "invited", "seminar", "panel"]),
    role: z.enum(["presenter", "coauthor", "organizer", "chair"]),

    // Where
    location: z.string().optional(),

    // Session info (optional)
    session: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
      })
      .optional(),

    // Authors (same structure as publications)
    authors: z
      .array(
        z.object({
          name: z.string(),
          roles: z
            .array(z.enum(["me", "mentor", "student", "corresponding"]))
            .default([]),
          emphasis: z.array(z.enum(["bold", "underline", "italic"])).optional(),
        })
      )
      .default([]),

    // Links for website + CV
    links: z
      .object({
        abstract: urlOrEmpty.optional(),
        slides: z.string().optional(), // can be relative path like /talks/...
        poster: z.string().optional(),
        video: urlOrEmpty.optional(),
        other: urlOrEmpty.optional(),
      })
      .default({}),

    selected: z.boolean().default(false),
    tags: z.array(z.string()).default([]),

    // Optional canonical url for a dedicated page
    url: z.string().url().optional(),
  }),
});



export const collections = {
  projects,
  publications,
  positions,
  honors,
  talks
};


