/**
 * Renders a schema.org JSON-LD block. Structured data is how Google upgrades
 * a plain blue link into a rich result (poster thumbnail, star rating, site
 * name) — the single biggest click-through lever a small site controls.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output of our own data — no user HTML involved.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
