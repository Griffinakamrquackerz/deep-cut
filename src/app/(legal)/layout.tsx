import SiteShell, { Slate } from "@/components/site/SiteShell";

// Public legal pages — no auth, no app chrome, readable typography. Same
// frame as the rest of the public site; each page supplies its own <h1>.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell strip={false}>
      <section className="lp-section lp-legal-page">
        <div className="lp-wrap">
          <article className="lp-col lp-legal">
            <Slate reel="The small print">Read before you take a seat</Slate>
            {children}
          </article>
        </div>
      </section>
    </SiteShell>
  );
}
