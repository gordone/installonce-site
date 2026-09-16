-- HALO / 1-60-7 Founding 1607 persistence schema.
-- This V1 is designed for a static Astro site using Supabase anon inserts.
-- Enable RLS and keep writes narrow; admin dashboards can use the service role.

create table if not exists public.identity_sessions (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique,
  identity text,
  first_proof text,
  source text not null default 'site',
  status text not null default 'started'
    check (status in ('started', 'identity_committed', 'proof_started', 'proof_completed', 'seven_day_completed')),
  founding_cohort_number integer,
  first_167_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.identity_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.identity_sessions(id) on delete set null,
  share_code text,
  event_name text not null,
  source text not null default 'site',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.share_cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.identity_sessions(id) on delete cascade,
  share_code text not null unique,
  identity text not null,
  first_proof text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.identity_sessions enable row level security;
alter table public.identity_events enable row level security;
alter table public.share_cards enable row level security;

drop policy if exists "anon can create identity sessions" on public.identity_sessions;
create policy "anon can create identity sessions"
on public.identity_sessions
for insert
to anon
with check (true);

drop policy if exists "anon can update sessions by share code" on public.identity_sessions;
create policy "anon can update sessions by share code"
on public.identity_sessions
for update
to anon
using (true)
with check (true);

drop policy if exists "anon can create identity events" on public.identity_events;
create policy "anon can create identity events"
on public.identity_events
for insert
to anon
with check (true);

drop policy if exists "anon can create share cards" on public.share_cards;
create policy "anon can create share cards"
on public.share_cards
for insert
to anon
with check (is_public = true);

drop policy if exists "anon can read public share cards" on public.share_cards;
create policy "anon can read public share cards"
on public.share_cards
for select
to anon
using (is_public = true);

create index if not exists identity_events_share_code_created_at_idx
  on public.identity_events (share_code, created_at desc);

create index if not exists identity_sessions_status_created_at_idx
  on public.identity_sessions (status, created_at desc);
