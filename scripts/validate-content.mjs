import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { parseFrontmatter } from "./frontmatter.mjs";

const repositoryRoot = process.cwd();
const publicRoot = path.join(repositoryRoot, "public");
const errors = [];

function readCollection(name) {
  return fg.sync(`src/content/${name}/**/*.{md,mdx}`, { cwd: repositoryRoot }).map((relativePath) => {
    const source = fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
    return { relativePath, data: parseFrontmatter(source, relativePath) };
  });
}

function checkPublicPath(value, source, field) {
  if (!value || !String(value).startsWith("/")) return;
  const pathname = String(value).split(/[?#]/, 1)[0];
  const target = path.resolve(publicRoot, `.${pathname}`);

  if (!target.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(target)) {
    errors.push(`${source}: ${field} points to a missing public file: ${value}`);
  }
}

function checkWebOrPublicPath(value, source, field) {
  if (!value) return;
  const text = String(value).trim();
  if (text.startsWith("/")) return checkPublicPath(text, source, field);
  if (!/^https:\/\//i.test(text)) {
    errors.push(`${source}: ${field} must use https:// or a root-relative public path: ${text}`);
  }
}

const publications = readCollection("publications");
const doiOwners = new Map();

for (const { relativePath, data } of publications) {
  const meCount = (data.authors || []).filter((author) => (author.roles || []).includes("me")).length;
  if (meCount !== 1) errors.push(`${relativePath}: expected exactly one author with the role "me"; found ${meCount}`);

  const doi = String(data.links?.doi || "")
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .toLowerCase();
  if (doi) {
    const previous = doiOwners.get(doi);
    if (previous) errors.push(`${relativePath}: DOI duplicates ${previous}: ${doi}`);
    doiOwners.set(doi, relativePath);
  }

  for (const field of ["journal", "pdf", "other", "code", "data"]) {
    checkWebOrPublicPath(data.links?.[field], relativePath, `links.${field}`);
  }
}

for (const { relativePath, data } of readCollection("projects")) {
  checkPublicPath(data.cover, relativePath, "cover");
  checkPublicPath(data.video, relativePath, "video");
  for (const [index, media] of (data.media || []).entries()) {
    checkWebOrPublicPath(media.src, relativePath, `media[${index}].src`);
    checkWebOrPublicPath(media.poster, relativePath, `media[${index}].poster`);
    checkWebOrPublicPath(media.link, relativePath, `media[${index}].link`);
  }
}

for (const { relativePath, data } of readCollection("visualizations")) {
  checkWebOrPublicPath(data.preview, relativePath, "preview");
  checkWebOrPublicPath(data.scene, relativePath, "scene");
}

for (const { relativePath, data } of readCollection("talks")) {
  for (const field of ["abstract", "slides", "poster", "video", "other"]) {
    checkWebOrPublicPath(data.links?.[field], relativePath, `links.${field}`);
  }
}

if (errors.length > 0) {
  console.error(`[validate-content] ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`[validate-content] OK: ${publications.length} publications and all referenced public files passed.`);
