-- Deep Cut — M6 instrumentation views over the events table.
-- These metrics decide everything after MVP.

-- Daily event counts (generic backbone for dashboards)
create or replace view public.metric_daily_events as
select date_trunc('day', created_at)::date as day, name, count(*) as n
from public.events
group by 1, 2;

-- Onboarding completion per day
create or replace view public.metric_onboarding as
select date_trunc('day', created_at)::date as day, count(*) as completed
from public.events where name = 'onboarding_completed'
group by 1;

-- Rec funnel: dealt → watchlisted → seen, plus reason tap-through
create or replace view public.metric_rec_funnel as
select
  (select coalesce(sum((props->>'count')::int), 0) from public.events where name = 'rec_batch_dealt') as recs_dealt,
  (select count(*) from public.events where name = 'rec_watchlisted') as recs_watchlisted,
  (select count(*) from public.events where name = 'rec_seen') as recs_seen,
  (select count(*) from public.events where name = 'rec_dismissed') as recs_dismissed,
  (select count(*) from public.events where name = 'reason_tapped') as reason_taps;

-- Share loops
create or replace view public.metric_shares as
select
  (select count(*) from public.events where name = 'playlist_created') as playlists_created,
  (select count(*) from public.events where name = 'playlist_shared') as playlist_links_copied,
  (select count(*) from public.events where name = 'playlist_item_crossed') as items_crossed,
  (select count(*) from public.events where name = 'taste_card_shared') as taste_cards_rendered;

-- D7 retention: of users created >=7 days ago, how many produced any event
-- on day 7 (or later within the 7-14d window)
create or replace view public.metric_d7_retention as
with cohort as (
  select id, created_at from public.users where created_at <= now() - interval '7 days'
),
returned as (
  select distinct c.id
  from cohort c
  join public.events e
    on e.user_id = c.id
   and e.created_at >= c.created_at + interval '7 days'
   and e.created_at <  c.created_at + interval '14 days'
)
select
  (select count(*) from cohort) as cohort_size,
  (select count(*) from returned) as retained,
  case when (select count(*) from cohort) = 0 then 0
       else round(100.0 * (select count(*) from returned) / (select count(*) from cohort), 1)
  end as d7_pct;
