begin;

create table public.halo_practice (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null check (
    jsonb_typeof(snapshot) = 'object'
    and coalesce(jsonb_typeof(snapshot->'state') = 'object', false)
    and pg_column_size(snapshot) <= 131072
  ),
  revision integer not null default 1 check (revision > 0)
);

create table public.halo_community_members (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blueprint text not null check (blueprint ~ '^[a-z0-9-]{1,64}$'),
  primary key (user_id, blueprint)
);

create table public.halo_community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  blueprint text not null check (blueprint ~ '^[a-z0-9-]{1,64}$'),
  kind text not null check (kind in ('Experience', 'Question', 'Adaptation')),
  title text not null check (length(btrim(title)) between 1 and 100),
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);

create index halo_community_posts_feed on public.halo_community_posts (blueprint, created_at desc);

create table public.halo_community_reports (
  post_id uuid not null references public.halo_community_posts(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text not null check (reason in ('Private information', 'Harassment', 'Spam', 'Other')),
  created_at timestamptz not null default now(),
  primary key (post_id, reporter_id)
);

alter table public.halo_practice enable row level security;
alter table public.halo_community_members enable row level security;
alter table public.halo_community_posts enable row level security;
alter table public.halo_community_reports enable row level security;

revoke all on public.halo_practice, public.halo_community_members,
  public.halo_community_posts, public.halo_community_reports from public, anon, authenticated;
grant select, insert, update on public.halo_practice to authenticated;
grant select, delete on public.halo_community_members to authenticated;
grant insert (blueprint) on public.halo_community_members to authenticated;
grant select, delete on public.halo_community_posts to authenticated;
grant insert (blueprint, kind, title, body) on public.halo_community_posts to authenticated;
grant insert (post_id, reason) on public.halo_community_reports to authenticated;
grant select, insert, update, delete on public.halo_practice, public.halo_community_members,
  public.halo_community_posts, public.halo_community_reports to service_role;

create policy "Owners manage their practice" on public.halo_practice
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Members manage their own memberships" on public.halo_community_members
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Members read visible posts" on public.halo_community_posts
  for select to authenticated using (
    author_id = (select auth.uid()) or (not hidden and author_id is not null and exists (
      select 1 from public.halo_community_members m
      where m.user_id = (select auth.uid()) and m.blueprint = halo_community_posts.blueprint
    ))
  );
create policy "Members post in joined groups" on public.halo_community_posts
  for insert to authenticated with check (
    author_id = (select auth.uid()) and exists (
      select 1 from public.halo_community_members m
      where m.user_id = (select auth.uid()) and m.blueprint = halo_community_posts.blueprint
    )
  );
create policy "Authors remove their posts" on public.halo_community_posts
  for delete to authenticated using (author_id = (select auth.uid()));

create policy "Members report visible posts" on public.halo_community_reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid()) and exists (
      select 1 from public.halo_community_posts p
      where p.id = post_id and not p.hidden and p.author_id <> (select auth.uid())
        and exists (select 1 from public.halo_community_members m
                    where m.blueprint = p.blueprint and m.user_id = (select auth.uid()))
    )
  );

-- Assign moderator access with an administrator SQL session only.
create table public.halo_community_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.halo_community_moderators enable row level security;
revoke all on public.halo_community_moderators from public, anon, authenticated;
grant select on public.halo_community_moderators to authenticated;
grant select, insert, delete on public.halo_community_moderators to service_role;
create policy "Moderators see their own assignment" on public.halo_community_moderators
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.halo_community_reports to authenticated;
grant update (hidden) on public.halo_community_posts to authenticated;

create policy "Moderators read reports" on public.halo_community_reports
  for select to authenticated using (
    exists (select 1 from public.halo_community_moderators where user_id = (select auth.uid()))
  );
-- The helper breaks the recursive policy dependency between posts and reports.
create schema if not exists halo_internal;
revoke all on schema halo_internal from public;
grant usage on schema halo_internal to authenticated;
create function halo_internal.can_moderate_post(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.halo_community_moderators where user_id = (select auth.uid()))
     and exists (select 1 from public.halo_community_reports where post_id = target);
$$;
revoke all on function halo_internal.can_moderate_post(uuid) from public;
grant execute on function halo_internal.can_moderate_post(uuid) to authenticated;

create policy "Moderators see reported posts" on public.halo_community_posts
  for select to authenticated using (halo_internal.can_moderate_post(id));
create policy "Moderators manage visibility of reported posts" on public.halo_community_posts
  for update to authenticated using (halo_internal.can_moderate_post(id));

commit;
