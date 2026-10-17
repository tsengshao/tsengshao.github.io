import { load } from "js-yaml";

export function parseFrontmatter(source, sourcePath = "content file") {
  const match = String(source).match(/^---[\t ]*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`Missing YAML frontmatter: ${sourcePath}`);

  const data = load(match[1]);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Frontmatter must be a YAML object: ${sourcePath}`);
  }
  return data;
}
