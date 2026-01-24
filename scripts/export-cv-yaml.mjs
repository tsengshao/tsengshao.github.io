// scripts/export-cv-yaml.mjs
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import yaml from "js-yaml";

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, "src", "content");
const OUT_PATH = path.join(ROOT, "src", "generated", "cv.generated.yml");

// 需要粗體的人名（請用和 publications frontmatter authors 完全一致的字串）
const HIGHLIGHT_AUTHORS = new Set([
  "Tseng, S.-Y.",
  // "Chen, W.-T.",
  // "Wu, C.-M.",
]);

function readFrontmatter(file) {
  const raw = fs.readFileSync(file, "utf8");
  const { data } = matter(raw);
  return data ?? {};
}

function ensureArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function normalizeAuthors(authors) {
  const arr = ensureArray(authors);
  return arr.map((name) => ({
    name,
    highlight: HIGHLIGHT_AUTHORS.has(name),
  }));
}

function safeStr(v) {
  return typeof v === "string" ? v : (v == null ? "" : String(v));
}

function sortDescByKey(key) {
  return (a, b) => safeStr(b[key]).localeCompare(safeStr(a[key]));
}

function sortNumDescByKey(key) {
  return (a, b) => (b[key] ?? 0) - (a[key] ?? 0);
}

async function loadCollection(subdir) {
  const dir = path.join(CONTENT_DIR, subdir);
  if (!fs.existsSync(dir)) return [];

  const pattern = path.join(dir, "*.md").replaceAll("\\", "/");
  const files = await fg(pattern);

  return files.map((file) => ({
    source: path.relative(ROOT, file),
    data: readFrontmatter(file),
  }));
}

/**
 * Validate publication frontmatter roughly based on your schema:
 * title: string
 * year: int
 * authors: string[]
 * venue?: string
 * volume/issue/pages?: string
 * status: published|in_review|submitted|preprint
 * selected: boolean
 * links: {doi?,pdf?,other?}
 */
function normalizePublication(x) {
  const d = x.data ?? {};
  const links = d.links && typeof d.links === "object" ? d.links : {};

  return {
    year: Number.isFinite(d.year) ? d.year : null,
    title: safeStr(d.title),
    authors: normalizeAuthors(d.authors),

    venue: d.venue ?? "",
    volume: d.volume ?? "",
    issue: d.issue ?? "",
    pages: d.pages ?? "",

    status: d.status ?? "published",
    selected: Boolean(d.selected),

    links: {
      doi: links.doi ?? "",
      pdf: links.pdf ?? "",
      other: links.other ?? "",
    },

    source: x.source,
  };
}

// 下面三個 normalize 會「盡量相容」：即使你 schema 還沒完全定義也能先跑
function normalizePosition(x) {
  const d = x.data ?? {};
  return {
    start: d.start ?? "",
    end: d.end ?? "",
    role: d.role ?? "",
    org: d.org ?? "",
    location: d.location ?? "",
    source: x.source,
  };
}

function normalizeHonor(x) {
  const d = x.data ?? {};
  return {
    year: Number.isFinite(d.year) ? d.year : null,
    title: d.title ?? "",
    org: d.org ?? "",
    source: x.source,
  };
}

function normalizeTalk(x) {
  const d = x.data ?? {};
  return {
    date: d.date ?? "",
    title: d.title ?? "",
    event: d.event ?? "",
    type: d.type ?? "",
    location: d.location ?? "",
    coauthors: ensureArray(d.coauthors),
    source: x.source,
  };
}

async function main() {
  const [pubsRaw, positionsRaw, honorsRaw, talksRaw] = await Promise.all([
    loadCollection("publications"),
    loadCollection("positions"),
    loadCollection("honors"),
    loadCollection("talks"),
  ]);

  const publications = pubsRaw
    .map(normalizePublication)
    .filter((p) => p.title && p.year) // 最基本的過濾
    .sort(sortNumDescByKey("year"));

  const positions = positionsRaw.map(normalizePosition).sort(sortDescByKey("start"));
  const honors_and_awards = honorsRaw
    .map(normalizeHonor)
    .sort(sortNumDescByKey("year"));
  const conferences_and_presentations = talksRaw
    .map(normalizeTalk)
    .sort(sortDescByKey("date"));

  const out = {
    generated_at: new Date().toISOString(),
    highlight_authors: Array.from(HIGHLIGHT_AUTHORS),

    // CV sections
    positions,
    publications,
    honors_and_awards,
    conferences_and_presentations,
  };

  const outYaml = yaml.dump(out, {
    lineWidth: 120,
    noRefs: true,
  });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, outYaml, "utf8");

  console.log(`[export:cv] wrote ${path.relative(ROOT, OUT_PATH)}`);
  console.log(
    `[export:cv] publications=${publications.length}, positions=${positions.length}, honors=${honors_and_awards.length}, talks=${conferences_and_presentations.length}`
  );
}

main().catch((err) => {
  console.error("[export:cv] failed:", err);
  process.exit(1);
});
