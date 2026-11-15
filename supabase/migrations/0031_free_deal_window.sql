create table public.free_deal_windows (
  user_id uuid primary key references public.users(id) on delete cascade,
  window_start timestamptz not null,
  used integer not null check (used >= 0)
);

alter table public.free_deal_windows enable row level security;

create function public.reserve_free_deal(p_user_id uuid, p_limit integer)
returns table (allowed boolean, window_start timestamptz, resets_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  started timestamptz;
  t timestamptz := now();
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid free deal limit';
  end if;

  insert into public.free_deal_windows as w (user_id, window_start, used)
  values (p_user_id, t, 1)
  on conflict (user_id) do update
    set window_start = case when w.used = 0 or w.window_start + interval '48 hours' <= t
                            then t else w.window_start end,
        used = case when w.used = 0 or w.window_start + interval '48 hours' <= t
                    then 1 else w.used + 1 end
    where w.used < p_limit or w.window_start + interval '48 hours' <= t
  returning w.window_start into started;

  if found then
    return query select true, started, started + interval '48 hours';
  else
    select w.window_start into started from public.free_deal_windows w where w.user_id = p_user_id;
    return query select false, started, started + interval '48 hours';
  end if;
end;
$$;

create function public.refund_free_deal(p_user_id uuid, p_window_start timestamptz)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.free_deal_windows
  set used = used - 1
  where user_id = p_user_id and window_start = p_window_start and used > 0;
$$;

revoke all on function public.reserve_free_deal(uuid, integer) from public, anon, authenticated;
revoke all on function public.refund_free_deal(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_free_deal(uuid, integer) to service_role;
grant execute on function public.refund_free_deal(uuid, timestamptz) to service_role;
