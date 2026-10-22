// A note from the person who built it.
//
// This replaced three blocks of house copy that described Deep Cut correctly
// and sounded like nobody. A film audience can smell written-by-committee at a
// hundred paces, and the honest advantage here is that there IS a person: ten
// years in the industry, a specific problem he had, and a thing he built
// because of it. That's the pitch. It doesn't need help.
//
// Kept in Griffin's own words and his own order. The edits are grammar,
// rhythm, and one added clause naming the Theatre — everything else is his.

export default function FounderNote() {
  return (
    <div className="mt-6 text-left">
      <div className="flex flex-col gap-3.5 border-l-2 border-ticket/50 pl-5">
        <p className="text-[1.02rem] leading-relaxed text-cream">
          I&apos;m Griffin Howes. I&apos;ve spent more than ten years working in
          film, and I&apos;ve been in love with movies since I was a kid.
        </p>

        {/* The feeling leads, the frustration follows, the want lands — in that
            order. It used to open with the trips and end on an abstraction
            ("something that felt like the way I found movies as a kid"), which
            described the feeling instead of putting the reader inside it. */}
        <p className="text-[1.02rem] leading-relaxed text-cream/90">
          Nothing ever beat picking a movie off the shelf at Blockbuster with no
          idea what you were getting, taking it home, and finding out you loved
          it. Enough trips there, enough afternoons in my local library, and
          enough nights scrolling streaming apps with nothing to show for it —{" "}
          <span className="text-amber">I wanted that feeling back.</span>
        </p>

        {/* Present tense on purpose. "It showed me how wrong I was" closes the
            story; "it's been proving me wrong ever since" says the discovery is
            still happening, which is the thing being sold. */}
        <p className="text-[1.02rem] leading-relaxed text-cream/90">
          That&apos;s Deep Cut.{" "}
          <span className="text-amber">It&apos;s been proving me wrong ever since.</span>
        </p>

        <p className="text-[1.02rem] leading-relaxed text-cream/90">
          Deep Cut is two things at once. It&apos;s an independent streaming
          platform — fourteen channels of award-winning short films, free,
          running all night. And it&apos;s a tool for cinephiles to find their
          next watch: you sign up, start marking the films you love, and it deals
          you deep cuts you&apos;ve never seen, on the services you already pay
          for.
        </p>

        <p className="text-[1.02rem] leading-relaxed text-cream/90">
          It&apos;s free, and anyone can use it. But a platform like this costs
          money to run, so if you feel like chipping in, you can.
        </p>

        {/* Curation plus consent, not "you pick". The distinction matters to
            exactly the people this note is trying to reach: a filmmaker reading
            "you're the one who picks which" sees a popularity contest, and
            crowd-greenlighting has a long and bad record. What we actually do —
            read everything, put a vetted slate up, let the house choose the
            order — is both the truth and the stronger promise. Same sentence as
            the header of /vote, so the front page and the ballot agree. */}
        <p className="text-[1.02rem] leading-relaxed text-cream/90">
          And supporting the house here does more than unlock the full app.{" "}
          <span className="text-amber">It buys you a stake in what gets made.</span> 60% of every
          dollar goes directly to financing an independent filmmaker&apos;s next project.
          We read every pitch that comes in and watch every director&apos;s
          previous work &mdash; what&apos;s left is the part we don&apos;t
          decide: <span className="text-amber">which one gets made first</span>.
        </p>

        <p className="text-[1.02rem] leading-relaxed text-cream/90">
          Every subscriber and every donation earns you points toward the next
          feature film. We cap the points so no studio head can buy the room
          &mdash; every member gets real weight on the ballot, private
          test-screening invites, and your name in the credits as the producers
          who brought it to life.
        </p>
      </div>

      {/* Signed. A letter without a name at the bottom is a press release. */}
      <div className="mt-5 border-t border-line pt-3.5 pl-5">
        <p className="font-display text-3xl leading-none text-cream">Griffin Howes</p>
        <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-dim">
          Founder · Deep Cut
        </p>
      </div>
    </div>
  );
}
