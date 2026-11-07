create table public.halo_launch_staff (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.halo_launch_dashboard (
  id text primary key check (id = 'overview'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object')
);

alter table public.halo_launch_staff enable row level security;
alter table public.halo_launch_dashboard enable row level security;

revoke all on public.halo_launch_staff, public.halo_launch_dashboard from public, anon, authenticated;
grant select on public.halo_launch_staff, public.halo_launch_dashboard to authenticated;
grant select, insert, update, delete on public.halo_launch_staff, public.halo_launch_dashboard to service_role;

create policy "Staff see their own launch assignment" on public.halo_launch_staff
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Launch staff read dashboard" on public.halo_launch_dashboard
  for select to authenticated using (
    exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid()))
  );
