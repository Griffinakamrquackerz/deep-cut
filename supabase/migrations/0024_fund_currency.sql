-- Deep Cut — teach the ledger what money it's counting.
--
-- fund_contributions stores gross_cents and fund_cents as bare integers with no
-- currency anywhere, and votes are derived straight off gross_cents: one vote
-- per hundred. That is fine while every charge is in one currency and silently
-- wrong the moment it isn't.
--
-- What would happen without this column: a €25 contribution lands as 2500,
-- sums into a progress bar denominated in dollars as if it were $25, and earns
-- 25 votes — the same as $25, despite being more money. The bar would drift and
-- the vote budget would quietly depend on where somebody lives. Neither failure
-- announces itself; the bar just shows a number nobody can reconcile.
--
-- So this lands BEFORE multi-currency checkout rather than alongside it. The
-- column is the prerequisite, not the feature.
--
-- Existing rows are USD because every charge to date has been: the checkout
-- hardcodes it in both paths. Backfilling a default here is a statement of
-- fact, not an assumption — which is why this one has a default and
-- users.region deliberately didn't.

alter table public.fund_contributions
  add column if not exists currency text not null default 'usd'
    check (currency ~ '^[a-z]{3}$');

comment on column public.fund_contributions.currency is
  'ISO 4217, lowercase, as Stripe reports it. The progress bar sums only rows '
  'matching the fund''s own currency — mixing them would produce a total that '
  'means nothing.';

-- The bar reads a sum per cycle per currency.
drop index if exists fund_contributions_cycle_idx;
create index if not exists fund_contributions_cycle_idx
  on public.fund_contributions (cycle, currency, created_at desc);
