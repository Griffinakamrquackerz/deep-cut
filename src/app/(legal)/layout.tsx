import Link from "next/link";

// Public legal pages — no auth, no app chrome, readable typography.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-5 pb-16 pt-10">
      <Link href="/" className="eyebrow">
        ← Deep Cut
      </Link>
      <article className="prose-invert mt-4 flex flex-col gap-4 text-sm leading-relaxed text-cream/90 [&_h1]:font-display [&_h1]:text-4xl [&_h1]:text-amber [&_h2]:mt-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-cream [&_p]:text-cream/85 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        {children}
      </article>
    </main>
  );
}
