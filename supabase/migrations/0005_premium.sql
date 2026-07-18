-- Balcony Seats (premium) + web push. Optional as always: the app falls back
-- to events-table storage for premium status until this is applied.
alter table public.users add column if not exists premium_until timestamptz;
alter table public.users add column if not exists stripe_customer_id text;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
