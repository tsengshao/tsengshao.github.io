import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";

const root = process.cwd();
const dist = path.join(root, "dist");
const [owner, repository] = (process.env.GITHUB_REPOSITORY || "").split("/");
const inferredBase = repository && repository.toLowerCase() !== `${owner?.toLowerCase()}.github.io` ? `/${repository}` : "";
const requestedBase = process.env.BASE_PATH;
const base = requestedBase === "/" ? "" : (requestedBase || inferredBase || "").replace(/\/$/, "");
const errors = [];

function existsAsOutput(relativeUrl) {
  const clean = decodeURIComponent(relativeUrl).replace(/^\//, "");
  const candidates = [
    path.join(dist, clean),
    path.join(dist, clean, "index.html"),
    path.join(dist, `${clean}.html`),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

for (const htmlPath of fg.sync("dist/**/*.html", { cwd: root })) {
  const html = fs.readFileSync(path.join(root, htmlPath), "utf8");
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    if (!value || value.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//")) continue;

    const pathname = value.split(/[?#]/, 1)[0];
    if (!pathname.startsWith("/")) continue;
    if (base && pathname !== base && !pathname.startsWith(`${base}/`)) {
      errors.push(`${htmlPath}: internal URL is missing base ${base}: ${value}`);
      continue;
    }

    const withoutBase = base && pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname;
    if (!existsAsOutput(withoutBase)) errors.push(`${htmlPath}: unresolved internal URL: ${value}`);
  }
}

if (errors.length > 0) {
  console.error(`[check-dist-links] ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`[check-dist-links] OK${base ? ` for base ${base}` : ""}.`);
