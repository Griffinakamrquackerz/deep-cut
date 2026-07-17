-- Profile customization: theme + signature film (the MySpace profile song,
-- but cinema). avatar_url already exists from 0001.
alter table public.users add column if not exists profile_theme text not null default 'marquee';
alter table public.users add column if not exists signature_movie_id integer references public.movies(id);
