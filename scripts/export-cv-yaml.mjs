import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import yaml from "js-yaml";
import { parseFrontmatter } from "./frontmatter.mjs";

const REPO_ROOT = process.cwd();

const CONTENT_ROOT = path.join(REPO_ROOT, "src", "content");
const OUT_DIR = path.join(REPO_ROOT, "src", "generated");
const OUT_FILE = path.join(OUT_DIR, "cv.generated.yml");

function readMdFrontmatter(dirName) {
  const baseDir = path.join(CONTENT_ROOT, dirName);
  const files = fg.sync(["**/*.md", "**/*.mdx"], { cwd: baseDir, dot: false });

  return files.map((rel) => {
    const full = path.join(baseDir, rel);
    const raw = fs.readFileSync(full, "utf-8");
    const data = parseFrontmatter(raw, full);

    return {
      __id: path.basename(rel, path.extname(rel)),
      __src: full,
      data,
    };
  });
}

function asString(x) {
  if (x === null || x === undefined) return undefined;
  const s = String(x).trim();
  return s === "" ? undefined : s;
}

function asInt(x) {
  if (x === null || x === undefined || x === "") return undefined;
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function asBool(x, dflt = false) {
  if (x === null || x === undefined) return dflt;
  return Boolean(x);
}

function asArray(x) {
  if (!Array.isArray(x)) return [];
  return x;
}

function normalizeAuthors(authors, src) {
  if (!Array.isArray(authors)) {
    throw new Error(`authors must be an array: ${src}`);
  }
  return authors.map((a) => ({
    name: asString(a?.name) || "",
    roles: Array.isArray(a?.roles) ? a.roles.map(String) : [],
    emphasis: Array.isArray(a?.emphasis) ? a.emphasis.map(String) : undefined,
  }));
}

function normalizePublications(items) {
  const pubs = items.map(({ __id, __src, data }) => {
    if (!data?.title || data?.year === undefined || data?.year === null) {
      throw new Error(`Missing title/year in publication: ${__src}`);
    }
    return {
      id: __id,
      title: String(data.title).trim(),
      year: asInt(data.year),
      month: asInt(data.month),

      authors: normalizeAuthors(data.authors, __src),

      type: asString(data.type) || "journal",
      status: asString(data.status) || "published",

      venue: asString(data.venue),
      volume: asString(data.volume),
      issue: asString(data.issue),
      pages: asString(data.pages),

      links: {
        doi: asString(data?.links?.doi),
        journal: asString(data?.links?.journal),
        pdf: asString(data?.links?.pdf),
        other: asString(data?.links?.other),
        code: asString(data?.links?.code),
        data: asString(data?.links?.data),
      },

      selected: asBool(data.selected, false),
      tags: asArray(data.tags).map(String),
      url: asString(data.url),
    };
  });

  // Sort: year desc, then title asc
  pubs.sort((a, b) => (b.year - a.year) || a.title.localeCompare(b.title));
  return pubs;
}

function normalizePositions(items) {
  const pos = items.map(({ __id, __src, data }) => {
    if (!data?.start || !data?.end || !data?.role || !data?.org) {
      throw new Error(`Missing required fields in position: ${__src}`);
    }
    return {
      id: __id,
      start: String(data.start).trim(),
      end: String(data.end).trim(),
      role: String(data.role).trim(),
      org: String(data.org).trim(),
      location: asString(data.location),
    };
  });

  // Sort by start desc (string compare works for YYYY-MM)
  pos.sort((a, b) => b.start.localeCompare(a.start));
  return pos;
}

function normalizeHonors(items) {
  const honors = items.map(({ __id, __src, data }) => {
    if (data?.year === undefined || data?.year === null || !data?.title) {
      throw new Error(`Missing year/title in honor: ${__src}`);
    }
    return {
      id: __id,
      year: asInt(data.year),
      title: String(data.title).trim(),
      org: asString(data.org),
    };
  });

  honors.sort((a, b) => (b.year - a.year) || a.title.localeCompare(b.title));
  return honors;
}

function normalizeTalks(items) {
  const talks = items.map(({ __id, __src, data }) => {
    // required per your schema: date, year, title, event, kind, role
    if (!data?.date || data?.year === undefined || data?.year === null || !data?.title || !data?.event || !data?.kind || !data?.role) {
      throw new Error(`Missing required fields in talk: ${__src}`);
    }

    return {
      id: __id,
      date: String(data.date).trim(),
      year: asInt(data.year),

      title: String(data.title).trim(),
      event: String(data.event).trim(),

      kind: String(data.kind).trim(), // oral/poster/invited/seminar/panel
      role: String(data.role).trim(), // presenter/coauthor/organizer/chair

      location: asString(data.location),

      session: data.session
        ? {
            id: asString(data.session.id),
            name: asString(data.session.name),
          }
        : undefined,

      authors: normalizeAuthors(data.authors || [], __src),

      links: {
        abstract: asString(data?.links?.abstract),
        slides: asString(data?.links?.slides),
        poster: asString(data?.links?.poster),
        video: asString(data?.links?.video),
        other: asString(data?.links?.other),
      },

      selected: asBool(data.selected, false),
      tags: asArray(data.tags).map(String),
      url: asString(data.url),
    };
  });

  // Sort: date desc (YYYY-MM[-DD] works), then title asc
  talks.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  return talks;
}

function main() {
  const publicationsRaw = readMdFrontmatter("publications");
  const positionsRaw = readMdFrontmatter("positions");
  const honorsRaw = readMdFrontmatter("honors");
  const talksRaw = readMdFrontmatter("talks");

  const cv = {
    generated_at: new Date().toISOString(),
    positions: normalizePositions(positionsRaw),
    honors_and_awards: normalizeHonors(honorsRaw),
    talks: normalizeTalks(talksRaw),
    publications: normalizePublications(publicationsRaw),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, yaml.dump(cv, { lineWidth: 120, noRefs: true }), "utf-8");

  console.log("[export-cv-yaml] wrote:", OUT_FILE);
  console.log("[export-cv-yaml] positions:", cv.positions.length);
  console.log("[export-cv-yaml] honors:", cv.honors_and_awards.length);
  console.log("[export-cv-yaml] talks:", cv.talks.length);
  console.log("[export-cv-yaml] publications:", cv.publications.length);
}

main();
