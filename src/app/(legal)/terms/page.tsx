import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Use — Deep Cut" };

export default function TermsPage() {
  return (
    <>
      <h1>TERMS OF USE</h1>
      <p className="font-mono text-xs text-dim">Last updated: July 2026</p>

      <p>
        Welcome to Deep Cut (&quot;the house&quot;). By creating an account or using the app you
        agree to these terms. If you don&apos;t agree, don&apos;t take a seat.
      </p>

      <h2>1. What Deep Cut is</h2>
      <p>
        Deep Cut recommends films, builds a written profile of your taste, and lets you share
        lists and activity with other members. It&apos;s a discovery tool — we don&apos;t host,
        stream, or sell films.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must provide accurate information and keep your credentials to yourself.</li>
        <li>One person per account. You&apos;re responsible for what happens under yours.</li>
        <li>
          You can delete your account at any time in Settings → Leave the theater. Deletion is
          immediate and permanent.
        </li>
      </ul>

      <h2>3. House rules (user content)</h2>
      <p>
        Notes, handles, display names, photos, and mixtape titles are yours — but by posting
        them you grant us a license to display them inside the service. You agree not to post
        content that is illegal, hateful, harassing, sexually explicit, infringing, or spam.
        You must be at least 13 years old.
      </p>
      <p>
        There is zero tolerance for abusive content or users. Every member card has a Block
        and Report control; reported content is reviewed and offending accounts may be removed
        without notice.
      </p>

      <h2>4. Third-party data</h2>
      <p>
        Film metadata, artwork, and streaming availability come from TMDB and JustWatch;
        ratings from IMDb and Rotten Tomatoes via OMDb; trailers from YouTube. This product
        uses the TMDB API but is not endorsed or certified by TMDB. Availability data is
        best-effort and may be wrong — check before you rent.
      </p>

            <h2>5. The Indie Film Fund, Points &amp; Credits</h2>
      <p>
        Contributions, donations, or subscription fees directed to the Deep Cut Indie Film Fund
        support independent filmmaking grants, productions, and community curation.
        Patron points, voting ballots, test screening access, and film credits are community
        patronage perks granted at the discretion of the house.
      </p>
      <p>
        Points, votes, and credits do not represent equity, stock, partnership shares, profit
        participation, or securities of any kind. They carry no expectation of financial return,
        dividends, or ownership in any intellectual property or film production.
      </p>

      <h2>6. No warranties</h2>
      <p>
        Deep Cut is provided as-is, without warranties of any kind. We are not liable for a
        bad movie night, a spoiled plot, or indirect damages of any sort, to the maximum
        extent permitted by law.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update these terms; material changes will be announced in the app. Continuing
        to use Deep Cut after changes means you accept them.
      </p>

      <h2>8. Contact</h2>
      <p>Questions: griffin@hostfluencer.com</p>
    </>
  );
}
