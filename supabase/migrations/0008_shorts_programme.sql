-- Deep Cut Theatre — the curated programme, moved off a source file and onto a
-- table. It used to be a literal array in src/lib/shorts.ts, and "rotating it
-- monthly is a deploy" was true but was also the whole problem: every add, drop
-- or edit needed a git commit and a Vercel build. The Projection Booth's new
-- Theatre tab writes here directly instead.
--
-- status distinguishes "on the bill" from "off the bill" — archiving a title
-- takes it out of /api/shorts without deleting its record, since a short that
-- rotated out in March may well rotate back in for a themed month later.
-- Deleting is still possible (the admin route supports it) but is for fixing a
-- mistaken entry, not for the normal end of a run.

create table if not exists public.shorts (
  id text primary key,
  title text not null,
  director text not null,
  year integer not null,
  runtime_sec integer not null,
  source text not null check (source in ('vimeo', 'youtube')),
  video_id text not null,
  channels text[] not null default '{}',
  pedigree text not null default '',
  synopsis text not null default '',
  thumb text,
  status text not null default 'showing' check (status in ('showing', 'archived')),
  -- Manual ordering within the guide. Lower sorts first; ties break on
  -- added_at so a fresh add without a chosen position lands at the end.
  position integer not null default 0,
  added_by text,
  added_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists shorts_status_idx on public.shorts (status, position, added_at);

alter table public.shorts enable row level security;
-- No policies: every access goes through the service-role client in
-- src/lib/shorts-admin.ts and src/app/api/shorts/route.ts, same as the rest of
-- this app's admin-authored tables. RLS is on so a future anon-key query fails
-- closed instead of quietly leaking the whole catalogue.

-- The twelve films already live, transcribed verbatim so this migration is a
-- no-op for anyone watching the room today.
insert into public.shorts
  (id, title, director, year, runtime_sec, source, video_id, channels, pedigree, synopsis, thumb)
values
  ('when-you-left-me-on-that-boulevard', 'When You Left Me on That Boulevard', 'Kayla Abuda Galang', 2023, 788, 'vimeo', '887931553', ARRAY['heart']::text[], 'Sundance 2023 — Short Film Grand Jury Prize · SXSW Special Jury Award', 'Teenager Ly and her cousins get high before a boisterous family Thanksgiving at their auntie''s house in southeast San Diego, 2006.', 'https://i.vimeocdn.com/video/1793043714-78c2d4e35b2e3ab501ec0e776e4dd35bcba7f7151c7fd26b4b3cb1c9cb6e34ad-d_640x360'),
  ('moshari', 'Moshari', 'Nuhash Humayun', 2022, 1321, 'vimeo', '759653578', ARRAY['late']::text[], 'SXSW — Grand Jury Award, Best Midnight Short · Executive produced by Jordan Peele and Riz Ahmed', 'Two sisters are forced inside a mosquito net to survive the night — but can they survive each other?', 'https://i.vimeocdn.com/video/1526107194-7104326dfe55d13759c38918d566fcdb8ba6396cffea19a990d9f1b042b4cc50-d_640x360'),
  ('holy-cowboys', 'Holy Cowboys', 'Varun Chopra', 2021, 1459, 'vimeo', '598881804', ARRAY['true']::text[], 'DOC NYC — Grand Jury Prize, Best Short Documentary · Rotterdam · Clermont-Ferrand', 'In small-town India, where cows are sacred, a teenage boy and his friends set out to become saviours of the holy cow.', 'https://i.vimeocdn.com/video/1722568856-14ed71ab61224b8c840c9fab6fea4ce103d9a44cb7770ba89d387b132521afd2-d_640x360'),
  ('festival-of-slaps', 'Festival of Slaps', 'Abdou Cissé', 2023, 711, 'vimeo', '882020077', ARRAY['heart']::text[], 'BIFA 2023 — Best Short (won) · Aesthetica — Best Short (won) · BFI London Audience Award · BAFTA 2024 nomination', 'One fateful night, a Nigerian mother serves her son a set of slaps so powerful they change his life forever. A film for the most neglected heroes of today: Black mums.', 'https://i.vimeocdn.com/video/1788185959-d1c9cfd6e8d9ecaad1c8b22c1bea0e287f3cd23215c620a5f5d278c02ad33155-d_640x360'),
  ('the-panola-project', 'The Panola Project', 'Jeremy S. Levine', 2021, 999, 'vimeo', '581552445', ARRAY['true']::text[], '35+ festivals including Sundance and Hot Docs', 'Dorothy Oliver sets out to keep her small town of Panola, Alabama safe during the pandemic — a chronicle of how an overlooked rural Black community survived on its own terms.', 'https://i.vimeocdn.com/video/1323033865-399cb72c40117ed6f3b43183bf43f407f96d6f90347b74eeb599e8ec8f8a8b32-d_640x360'),
  ('huella', 'Huella', 'Gabriela Ortega', 2023, 862, 'vimeo', '839924028', ARRAY['late','heart']::text[], 'Sundance · Tribeca · Fantastic Fest · Aspen Shortsfest', 'When her grandmother''s death unleashes a generational curse, a disenchanted flamenco dancer is forced through the five stages of grief by a visit from her female ancestors.', 'https://i.vimeocdn.com/video/1689849607-3bf35ef7614c3cf118f33ae6ed2ecfff0a731ba20a9eacd2964c3512223f70ff-d_640x360'),
  ('we-were-the-scenery', 'We Were the Scenery', 'Christopher Radcliff', 2025, 897, 'vimeo', '1139491180', ARRAY['true']::text[], 'Sundance premiere · Shortlisted, 98th Academy Awards, Best Documentary Short', 'Two Vietnam War refugees, stuck in a camp in the Philippines, are hired as background extras in Apocalypse Now. Their daughter goes looking for them in the frame.', 'https://i.vimeocdn.com/video/2086771094-b817696264b33edc5e2bbb9c6c89607dfefdc3461fbdb4d44bc4def6b3fd608a-d_640x360'),
  ('history-of-civilization', 'History of Civilization', 'Zhannat Alshanova', 2022, 885, 'vimeo', '681108672', ARRAY['heart']::text[], 'Locarno — Pardino d''argento (won) · TIFF · Clermont-Ferrand', 'Indira has decided to leave Kazakhstan for London. On her last day, she dares to look at everything she is leaving behind.', 'https://i.vimeocdn.com/video/1382156710-a06051e859eaff0a5c623a6f12a7a5e8ad2a8655913488c4f73ee5483614881f-d_640x360'),
  ('nice-talking-to-you', 'Nice Talking to You', 'Saim Sadiq', 2019, 1173, 'vimeo', '732092762', ARRAY['heart']::text[], 'BAFTA Student Award shortlist · SXSW · Palm Springs ShortFest · Encounters', 'From the director of Joyland — a comedy of manners conducted almost entirely down a phone line.', 'https://i.vimeocdn.com/video/1473604825-77a1986712758332e7e0c2d0a3d4eb33f8d6be6178e7a963c21cd5c6f03d483a-d_640x360'),
  ('les-larmes-de-la-seine', 'Les larmes de la Seine', 'Piktura collective', 2021, 524, 'vimeo', '779156339', ARRAY['drawn','true']::text[], '249 official selections, 104 awards · Student Academy Awards — Bronze Medal · SXSW Special Jury Recognition', '17 October 1961. Algerian workers march peacefully through Paris. The police are waiting at the bridge.', 'https://i.vimeocdn.com/video/2085293960-ff19a6b9b6505bf2ff6a888320fde21feacd75a19056857a1ef1b2c1b699e9a9-d_640x360'),
  ('fur', 'fur', 'Zhen Li', 2023, 396, 'vimeo', '1152674099', ARRAY['drawn','late']::text[], 'Academy Award longlist, Best Animated Short · Seattle International — Grand Jury Prize, Animation', 'A crush gone mouldy. Charcoal pencil on paper, stop motion and live action, made in a first year at CalArts.', 'https://i.vimeocdn.com/video/2104360462-e059b9038a6c24f23635e9fc0cb8ec3afe37fc8f39bd1d3fc3b206ac3ff96e2a-d_640x360'),
  ('glove', 'Glove', 'Alexa Lim Haas & Bernardo Britto', 2022, 330, 'vimeo', '749678162', ARRAY['drawn','true']::text[], 'Sundance — Short Film Jury Award, Animation', 'The true story of a glove that has been floating in space since 1965.', 'https://i.vimeocdn.com/video/1508156289-5fa88b10f6c62cb9d4588da9ee0f3ac0e801fc327d06b484384e9ac414a00a82-d_640x360')
on conflict (id) do nothing;
