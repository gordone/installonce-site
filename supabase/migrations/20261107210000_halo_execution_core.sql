begin;

create table public.halo_execution_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  result jsonb not null
);

alter table public.halo_execution_runs enable row level security;
revoke all on public.halo_execution_runs from public, anon, authenticated;
grant select on public.halo_execution_runs to authenticated;

create policy "Launch staff read execution runs" on public.halo_execution_runs
  for select to authenticated using (
    exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid()))
  );

create function public.halo_run_production_brief()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
begin
  if not exists (select 1 from public.halo_launch_staff where user_id = auth.uid()) then
    raise exception 'Launch staff access is required' using errcode = '42501';
  end if;

  insert into public.halo_execution_runs (requested_by, result)
  values (auth.uid(), jsonb_build_object(
    'verified', (select count(*) from public.halo_production_milestones where verified),
    'total', (select count(*) from public.halo_production_milestones),
    'next', (select jsonb_build_object('title', title, 'owner', owner, 'handoffs', handoffs)
             from public.halo_production_milestones where not verified order by step limit 1),
    'critical', (select count(*) from public.halo_production_issues
                 where severity = 'critical' and state in ('open', 'fixed')),
    'issues', (select coalesce(jsonb_agg(to_jsonb(issue)), '[]'::jsonb) from (
      select title, location, state from public.halo_production_issues
      where severity = 'critical' and state in ('open', 'fixed')
      order by created_at, id limit 10
    ) issue)
  )) returning id into run_id;
  return run_id;
end;
$$;

revoke all on function public.halo_run_production_brief() from public, anon, authenticated;
grant execute on function public.halo_run_production_brief() to authenticated;
commit;
