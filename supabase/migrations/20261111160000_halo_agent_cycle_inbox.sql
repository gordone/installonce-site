begin;

create table public.halo_agent_cycles (
  id uuid primary key default gen_random_uuid(),
  source_execution text not null unique check (length(source_execution) between 1 and 120),
  status text not null check (status in ('completed','partial','failed')),
  reports jsonb not null check (jsonb_typeof(reports) = 'array'),
  received_at timestamptz not null default now()
);
alter table public.halo_agent_cycles enable row level security;
revoke all on public.halo_agent_cycles from public,anon,authenticated;
grant select on public.halo_agent_cycles to authenticated;
create policy "Staff read agent cycle inbox" on public.halo_agent_cycles
  for select to authenticated using (
    exists(select 1 from public.halo_launch_staff where user_id = (select auth.uid()))
  );

create function public.halo_ingest_agent_cycle(source_execution text, reports jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  role_map jsonb := '{"Content Agent":"content-studio","PR Agent":"pr","Creator + Host Agent":"host","Lifecycle Agent":"lifecycle","Community Agent":"community","Growth Analyst":"intelligence","Launch Director":"executive"}';
  allowed_types text[] := array['internal_task','public_content','first_pr_pitch','creator_outreach','lifecycle_send',
    'paid_budget_change','commercial_agreement','member_removal','canonical_blueprint_change'];
  report jsonb;
  proposal jsonb;
  item jsonb;
  normalized jsonb := '[]';
  seen text[] := '{}';
  agent_id text;
  good integer := 0;
  cycle_id uuid;
  prior public.halo_agent_cycles;
begin
  if auth.role() <> 'service_role' or auth.role() is null then
    raise exception 'Worker service access is required' using errcode = '42501';
  end if;
  if source_execution is null or length(btrim(source_execution)) not between 1 and 120 then
    raise exception 'A stable source execution is required';
  end if;
  if reports is null or jsonb_typeof(reports) <> 'array' then raise exception 'Reports must be an array'; end if;
  if jsonb_array_length(reports) not between 1 and 50 or octet_length(reports::text) > 200000 then
    raise exception 'Report batch exceeds limits';
  end if;
  for report in select value from jsonb_array_elements(reports) loop
    agent_id := role_map->>(report->>'role');
    if agent_id is null or agent_id = any(seen) then raise exception 'Unknown or repeated agent role'; end if;
    seen := array_append(seen,agent_id);
    if coalesce(report->>'status','') not in ('completed','failed','invalid_response') then raise exception 'Invalid report status'; end if;
    if report->>'status' = 'completed' then
      if jsonb_typeof(report->'summary') is distinct from 'string' or length(report->>'summary') not between 1 and 8000 or
        jsonb_typeof(report->'evidence') is distinct from 'array' or
        jsonb_typeof(report->'missingInputs') is distinct from 'array' or
        jsonb_typeof(report->'proposals') is distinct from 'array' then raise exception 'Incomplete successful report'; end if;
      if jsonb_array_length(report->'evidence') > 30 or jsonb_array_length(report->'missingInputs') > 30 or
        jsonb_array_length(report->'proposals') > 2 then raise exception 'Report item limits exceeded'; end if;
      for item in select value from jsonb_array_elements((report->'evidence') || (report->'missingInputs')) loop
        if jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 2000 then raise exception 'Evidence and missing inputs must be bounded strings'; end if;
      end loop;
      for proposal in select value from jsonb_array_elements(report->'proposals') loop
        if not coalesce(proposal->>'type','') = any(allowed_types) or
          jsonb_typeof(proposal->'title') is distinct from 'string' or length(btrim(proposal->>'title')) not between 1 and 160 or
          jsonb_typeof(proposal->'draft') is distinct from 'string' or length(btrim(proposal->>'draft')) not between 1 and 4000 then
          raise exception 'Invalid proposal';
        end if;
      end loop;
      normalized := normalized || jsonb_build_array(jsonb_build_object('agent_id',agent_id,'role',report->>'role',
        'status','completed','summary',report->>'summary','evidence',report->'evidence','missingInputs',report->'missingInputs',
        'proposals',(select coalesce(jsonb_agg(jsonb_build_object('type',p->>'type','title',p->>'title','draft',p->>'draft','status','pending_review')),'[]')
          from jsonb_array_elements(report->'proposals') p)));
      good := good + 1;
    else
      -- Preserve failure status, excluding raw provider errors and request payloads.
      normalized := normalized || jsonb_build_array(jsonb_build_object('agent_id',agent_id,'role',report->>'role',
        'status',report->>'status','proposals','[]'::jsonb));
    end if;
  end loop;
  -- Canonical ordering makes equivalent delivery retries idempotent.
  select jsonb_agg(value order by value->>'agent_id') into normalized from jsonb_array_elements(normalized);
  insert into public.halo_agent_cycles(source_execution,status,reports)
    values(btrim(source_execution),case when good = 0 then 'failed' when good = jsonb_array_length(reports) then 'completed' else 'partial' end,normalized)
    on conflict on constraint halo_agent_cycles_source_execution_key do nothing returning id into cycle_id;
  if cycle_id is null then
    select * into strict prior from public.halo_agent_cycles c where c.source_execution = btrim(halo_ingest_agent_cycle.source_execution);
    if prior.reports <> normalized then raise exception 'Execution already received with different content'; end if;
    return prior.id;
  end if;
  insert into public.halo_agent_audit(event,object_id,detail)
    values('agent_cycle_received',cycle_id::text,jsonb_build_object('source_execution',source_execution,'reports',jsonb_array_length(reports),'completed',good));
  return cycle_id;
end $$;
revoke all on function public.halo_ingest_agent_cycle(text,jsonb) from public,anon,authenticated;
grant execute on function public.halo_ingest_agent_cycle(text,jsonb) to service_role;
commit;
