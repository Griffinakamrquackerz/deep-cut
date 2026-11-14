-- Donation access is separate from subscription and lifetime entitlements, so
-- subscription lifecycle events cannot remove time earned by a donation.
create table if not exists public.donation_premium (
  user_id uuid primary key references public.users(id) on delete cascade,
  premium_until timestamptz not null
);
alter table public.donation_premium enable row level security;
grant all on public.donation_premium to service_role;

create or replace function public.record_fund_donation(
  p_user_id uuid, p_gross_cents integer, p_fund_cents integer,
  p_cycle text, p_stripe_ref text, p_currency text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  inserted integer;
begin
  if p_user_id is null or p_gross_cents is null or p_fund_cents is null
     or p_gross_cents <= 0 or p_fund_cents < 0
     or p_fund_cents > p_gross_cents or p_cycle is null or p_stripe_ref is null
     or p_stripe_ref = '' or p_currency is null or p_currency <> 'usd' then
    raise exception 'invalid donation';
  end if;

  insert into public.fund_contributions (user_id, gross_cents, fund_cents, kind, cycle, stripe_ref, currency)
  values (p_user_id, p_gross_cents, p_fund_cents, 'donation', p_cycle, p_stripe_ref, p_currency)
  on conflict (stripe_ref) do nothing;
  get diagnostics inserted = row_count;

  if inserted = 1 and p_gross_cents > 400 then
    insert into public.donation_premium as access (user_id, premium_until)
    values (p_user_id, now() + interval '30 days')
    on conflict (user_id) do update
      set premium_until = greatest(access.premium_until, now()) + interval '30 days';
  end if;
  return true;
end;
$$;
revoke all on function public.record_fund_donation(uuid, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.record_fund_donation(uuid, integer, integer, text, text, text) to service_role;
