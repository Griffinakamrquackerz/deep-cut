-- Deep Cut — the Fund.
--
-- A share of everything the house takes in goes toward financing a feature,
-- which premieres here. Members earn points by supporting, and points are
-- VOTES on which film gets made — not equity, not a share of profit, and not
-- redeemable for anything with a cash value. That line is the whole design:
-- the moment a contribution buys a financial interest it becomes a security,
-- and this stops well short of it. Backers get a say and a credit.
--
-- One row per payment. This table is a ledger, so nothing in it is ever
-- updated or deleted — a correction is a new row with a negative amount, the
-- same way a bookkeeper does it. Points are derived from it rather than stored,
-- so the money is always the single source of truth and the two can't drift.

create table if not exists public.fund_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,

  -- What the person actually paid, in cents. Points come off this, because
  -- what somebody gave is what they gave — how we split it is our business.
  gross_cents integer not null,
  -- The part earmarked for the Fund. Stored rather than computed from a
  -- percentage, so changing the share later never silently rewrites history.
  fund_cents integer not null,

  kind text not null check (kind in ('subscription', 'lifetime', 'donation', 'adjustment')),

  -- Which film this counts toward. "Points toward the NEXT feature" means
  -- points have to be scoped to a round, or year three's backers are voting
  -- against everyone who ever subscribed.
  cycle text not null,

  -- Stripe's id for the payment. Unique so a webhook Stripe delivers twice —
  -- which it will, that's the contract — can't double-count somebody's money.
  stripe_ref text unique,

  created_at timestamptz not null default now()
);

-- The progress bar reads a sum per cycle; a member's points read their own rows.
create index if not exists fund_contributions_cycle_idx
  on public.fund_contributions (cycle, created_at desc);
create index if not exists fund_contributions_user_idx
  on public.fund_contributions (user_id, cycle);

alter table public.fund_contributions enable row level security;

-- No policies: reads and writes go through the service-role client behind an
-- API route that has already checked who is asking, same as every other table
-- here. RLS is on so a future anon-key query fails closed rather than handing
-- somebody the whole ledger.
