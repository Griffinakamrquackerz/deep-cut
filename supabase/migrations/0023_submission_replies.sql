-- Deep Cut — closing the loop with filmmakers.
--
-- The receipt email every submitter gets says "you'll hear back either way. A
-- pass is still an answer, and not hearing anything is the thing everyone hates
-- about submitting." That was true of the sentiment and false of the software:
-- marking a submission passed or showcased changed a status column and told
-- nobody. The promise was a person remembering to type.
--
-- One timestamp, which does two jobs. It stops a reply being sent twice — a
-- second rejection email for the same film is worse than none — and it makes
-- the unanswered pile countable, which is the only thing that reliably gets a
-- queue answered. An obligation you can see the size of gets cleared.

alter table public.film_submissions
  add column if not exists replied_at timestamptz;

comment on column public.film_submissions.replied_at is
  'When the director was told the outcome. NULL on a decided submission means a '
  'reply is owed — the admin console counts these.';

-- The console's "awaiting a reply" query: decided, but nobody told them.
create index if not exists film_submissions_unreplied_idx
  on public.film_submissions (cycle, status)
  where replied_at is null;
