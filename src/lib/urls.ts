const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const absoluteUrlPattern = /^[a-z][a-z\d+.-]*:/i;

export function isExternalUrl(value = "") {
  return absoluteUrlPattern.test(value) || value.startsWith("//");
}

export function withBase(value = "") {
  const path = String(value).trim();
  if (!path || path.startsWith("#") || isExternalUrl(path)) return path;

  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!basePath) return normalized;
  if (normalized === basePath || normalized.startsWith(`${basePath}/`)) return normalized;
  return normalized === "/" ? `${basePath}/` : `${basePath}${normalized}`;
}
