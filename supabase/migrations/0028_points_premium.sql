-- Keep the legacy donation function unchanged for outstanding checkout sessions.
begin;

alter table public.fund_contributions
  drop constraint if exists fund_contributions_kind_check;
alter table public.fund_contributions
  add constraint fund_contributions_kind_check
  check (kind in ('subscription', 'lifetime', 'donation', 'adjustment', 'points'));

create or replace function public.record_fund_points(
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
    raise exception 'invalid points purchase';
  end if;

  insert into public.fund_contributions (user_id, gross_cents, fund_cents, kind, cycle, stripe_ref, currency)
  values (p_user_id, p_gross_cents, p_fund_cents, 'points', p_cycle, p_stripe_ref, p_currency)
  on conflict (stripe_ref) do nothing;
  get diagnostics inserted = row_count;

  if inserted = 1 and p_gross_cents > 500 then
    insert into public.donation_premium as access (user_id, premium_until)
    values (p_user_id, now() + interval '30 days')
    on conflict (user_id) do update
      set premium_until = greatest(access.premium_until, now()) + interval '30 days';
  end if;
  return true;
end;
$$;
revoke all on function public.record_fund_points(uuid, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.record_fund_points(uuid, integer, integer, text, text, text) to service_role;
commit;
