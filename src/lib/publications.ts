import type { CollectionEntry } from "astro:content";

export type PublicationEntry = CollectionEntry<"publications">;

export type PublishedRow =
  | { kind: "year"; year: number }
  | { kind: "pub"; pub: PublicationEntry; num: number };

export function toInitials(given = "") {
  return String(given)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split("-")
        .map((piece) => (piece[0] ? `${piece[0].toUpperCase()}.` : ""))
        .join("-"),
    )
    .join(" ");
}

export function formatNameAPA(fullName = "") {
  const name = String(fullName).trim();
  if (!name) return "";

  if (name.includes(",")) {
    const [family, ...givenParts] = name.split(",").map((part) => part.trim());
    const initials = toInitials(givenParts.join(" "));
    return initials ? `${family}, ${initials}` : family;
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const family = parts.at(-1) || "";
  return `${family}, ${toInitials(parts.slice(0, -1).join(" "))}`;
}

export function doiToUrl(doi = "") {
  const value = String(doi).trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://doi.org/${value.replace(/^doi:\s*/i, "")}`;
}

export function sortByTimeDescThenTitle(a: PublicationEntry, b: PublicationEntry) {
  const yearDifference = (b.data.year ?? 0) - (a.data.year ?? 0);
  if (yearDifference) return yearDifference;

  const monthA = a.data.month ?? 0;
  const monthB = b.data.month ?? 0;
  if (monthB !== monthA) return monthB - monthA;

  return a.data.title.localeCompare(b.data.title);
}

export function buildPublishedRows(list: PublicationEntry[]): PublishedRow[] {
  const rows: PublishedRow[] = [];
  let previousYear: number | null = null;

  list.forEach((pub, index) => {
    if (pub.data.year !== previousYear) {
      rows.push({ kind: "year", year: pub.data.year });
      previousYear = pub.data.year;
    }

    rows.push({ kind: "pub", pub, num: list.length - index });
  });

  return rows;
}

export function splitPublications(publications: PublicationEntry[]) {
  const all = [...publications].sort(sortByTimeDescThenTitle);
  const byStatus = (status: PublicationEntry["data"]["status"]) =>
    all.filter((pub) => pub.data.status === status);

  const published = byStatus("published");

  return {
    all,
    selected: all.filter((pub) => pub.data.selected),
    preprints: byStatus("preprint"),
    submitted: byStatus("submitted"),
    inReview: byStatus("in_review"),
    accepted: byStatus("accepted"),
    published,
    publishedRows: buildPublishedRows(published),
  };
}
