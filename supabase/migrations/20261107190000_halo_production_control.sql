begin;

create table public.halo_production_milestones (
  step integer primary key check (step > 0),
  title text not null,
  owner text not null,
  handoffs text not null default '',
  verified boolean not null default false
);

create table public.halo_production_issues (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 180),
  location text not null check (length(btrim(location)) between 1 and 300),
  severity text not null check (severity in ('critical', 'high', 'normal')),
  state text not null default 'open' check (state in ('open', 'fixed', 'verified', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.halo_production_milestones enable row level security;
alter table public.halo_production_issues enable row level security;
revoke all on public.halo_production_milestones, public.halo_production_issues from public, anon, authenticated;
grant select on public.halo_production_milestones, public.halo_production_issues to authenticated;
grant update (verified) on public.halo_production_milestones to authenticated;
grant insert (title, location, severity), update (state) on public.halo_production_issues to authenticated;

create policy "Launch staff manage milestones" on public.halo_production_milestones
  for all to authenticated
  using (exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid())))
  with check (exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid())));
create policy "Launch staff manage production issues" on public.halo_production_issues
  for all to authenticated
  using (exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid())))
  with check (exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid())));

insert into public.halo_production_milestones (step, title, owner, handoffs) values
  (1, 'Canonical language lock', 'Publisher and Editor', 'W014 Host Kit · M16 Social Content'),
  (2, 'Manuscript editorial lock', 'Publisher and Editor', ''),
  (3, 'Interior and figure synchronization', 'Designer', 'W006 Identity Card insert · W007 Dec 26 envelope'),
  (4, 'Independent proof', 'Proofreader', ''),
  (5, 'Corrections and verification', 'Designer and Proofreader', ''),
  (6, 'Print master approval', 'Publisher', 'M10 Press Kit · X2 Print On Sale'),
  (7, 'EPUB build', 'EPUB Producer', ''),
  (8, 'EPUB QA and approval', 'EPUB Producer and Publisher', 'X1 Ebook Launch'),
  (9, 'Distribution readiness', 'Publisher', 'X1 Ebook Launch · X2 Print On Sale'),
  (10, 'Marketing and community asset handoff', 'Publisher', 'Approved assets for launch');
commit;
