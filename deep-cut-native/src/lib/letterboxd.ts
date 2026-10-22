// Letterboxd export parsing — ported 1:1 from the web (../src/lib/
// letterboxd.ts). Their ZIP contains ratings.csv / watched.csv / watchlist.csv
// with headers like: Date,Name,Year,Letterboxd URI,Rating. RFC-4180-ish.

export interface LetterboxdRow {
  title: string;
  year: number | null;
  rating: number | null; // 0.5–5 stars, null in watched/watchlist
  date: string | null; // ISO yyyy-mm-dd from the export
}

/** Minimal CSV parser — handles quoted fields, embedded commas, "" escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/** Parse a Letterboxd CSV export into import rows (headers matched by name). */
export function parseLetterboxdCsv(text: string): LetterboxdRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  const yearIdx = header.indexOf("year");
  const ratingIdx = header.indexOf("rating");
  const dateIdx = header.indexOf("date");
  if (nameIdx === -1) return []; // not a Letterboxd export

  const out: LetterboxdRow[] = [];
  for (const r of rows.slice(1)) {
    const title = (r[nameIdx] ?? "").trim();
    if (!title) continue;
    const year = yearIdx >= 0 ? Number(r[yearIdx]) : NaN;
    const rating = ratingIdx >= 0 ? Number(r[ratingIdx]) : NaN;
    const date = dateIdx >= 0 ? (r[dateIdx] ?? "").trim() : "";
    out.push({
      title,
      year: Number.isInteger(year) && year > 1880 ? year : null,
      rating: Number.isFinite(rating) && rating > 0 ? rating : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    });
  }
  return out;
}
