-- Reserve a lifetime place before creating Stripe Checkout. Reservations are
-- released only by Stripe's checkout.session.expired event, not by a timer.
create table if not exists public.lifetime_slots (
  user_id uuid unique references public.users(id) on delete set null,
  reservation_id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('pending', 'purchased', 'expired')),
  created_at timestamptz not null default now()
);

alter table public.lifetime_slots enable row level security;
grant all on public.lifetime_slots to service_role;

create or replace function public.reserve_lifetime_slot(p_user_id uuid)
returns table(result text, reservation_id uuid, reserved_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  existing public.lifetime_slots%rowtype;
  occupied bigint;
begin
  perform pg_advisory_xact_lock(hashtext('deepcut_lifetime_slots'));

  select * into existing from public.lifetime_slots where user_id = p_user_id;
  if existing.user_id is not null and existing.status = 'purchased' then
    return query select 'purchased'::text, existing.reservation_id, existing.created_at;
    return;
  end if;
  if exists (select 1 from public.users where id = p_user_id and premium_until >= '2099-01-01'::timestamptz)
     or exists (select 1 from public.fund_contributions where user_id = p_user_id and kind = 'lifetime' and gross_cents > 0) then
    return query select 'purchased'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if existing.user_id is not null and existing.status = 'pending' then
    return query select 'pending'::text, existing.reservation_id, existing.created_at;
    return;
  end if;

  select (select count(*) from public.lifetime_slots where status in ('pending', 'purchased'))
    + count(*) into occupied from (
    select id from public.users where premium_until >= '2099-01-01'::timestamptz
    union
    select user_id from public.fund_contributions where kind = 'lifetime' and gross_cents > 0
  ) as legacy_users
  where not exists (
    select 1 from public.lifetime_slots
    where lifetime_slots.user_id = legacy_users.id and status in ('pending', 'purchased')
  );
  if occupied >= 100 then
    return query select 'sold_out'::text, null::uuid, null::timestamptz;
    return;
  end if;

  insert into public.lifetime_slots as slots (user_id, status)
  values (p_user_id, 'pending')
  on conflict (user_id) do update
    set reservation_id = gen_random_uuid(), status = 'pending', created_at = now()
  returning slots.* into existing;
  return query select 'pending'::text, existing.reservation_id, existing.created_at;
end;
$$;

revoke all on function public.reserve_lifetime_slot(uuid) from public, anon, authenticated;
grant execute on function public.reserve_lifetime_slot(uuid) to service_role;

create or replace function public.set_subscription_premium(
  p_user_id uuid, p_until timestamptz, p_customer_id text
) returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.users
  set premium_until = case
        when premium_until >= '2099-01-01'::timestamptz then premium_until
        else p_until
      end,
      stripe_customer_id = p_customer_id
  where id = p_user_id;
  return found;
end;
$$;

revoke all on function public.set_subscription_premium(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.set_subscription_premium(uuid, timestamptz, text) to service_role;

create or replace function public.grant_lifetime_premium(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  update public.users set premium_until = '2099-12-31T00:00:00Z'::timestamptz
  where id = p_user_id;
  return found;
end;
$$;
revoke all on function public.grant_lifetime_premium(uuid) from public, anon, authenticated;
grant execute on function public.grant_lifetime_premium(uuid) to service_role;
