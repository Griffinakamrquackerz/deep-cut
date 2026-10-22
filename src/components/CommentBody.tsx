import Link from "next/link";
import { splitMentions } from "@/lib/mentions";

// A comment's text, with the @handles in it linked.
//
// Only handles that resolved to a real person are linked — `known` comes from
// the server, which looked them up. Anything else stays plain text, so typing
// "@nobody" reads as what it is rather than as a link to nothing.

export default function CommentBody({
  body,
  mentions,
}: {
  body: string;
  mentions: string[];
}) {
  const known = new Set(mentions.map((h) => h.toLowerCase()));
  if (!known.size) return <>{body}</>;

  return (
    <>
      {splitMentions(body, known).map((span, i) =>
        span.kind === "mention" ? (
          <Link
            key={i}
            href={`/u/${span.value}`}
            className="font-medium text-amber hover:underline"
          >
            @{span.value}
          </Link>
        ) : (
          <span key={i}>{span.value}</span>
        ),
      )}
    </>
  );
}
