begin;

create table public.halo_agents (
  id text primary key,
  name text not null,
  director_id text references public.halo_agents(id),
  mission text not null,
  autonomy smallint not null default 1 check (autonomy between 0 and 4),
  enabled boolean not null default false,
  paused boolean not null default false
);

create table public.halo_operating_controls (
  id boolean primary key default true check (id),
  paused boolean not null default false,
  preview boolean not null default true,
  external_paused boolean not null default true,
  spend_paused boolean not null default true
);
insert into public.halo_operating_controls default values;

create table public.halo_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  agent_id text not null references public.halo_agents(id),
  target numeric not null check (target > 0),
  current_value numeric check (current_value >= 0),
  forecast numeric check (forecast >= 0),
  unit text not null check (length(btrim(unit)) between 1 and 80),
  deadline date not null,
  observed_at timestamptz,
  evidence text,
  created_at timestamptz not null default now(),
  check (current_value is null or (observed_at is not null and length(btrim(coalesce(evidence,''))) > 0)),
  check (forecast is null or (observed_at is not null and length(btrim(coalesce(evidence,''))) > 0))
);

create table public.halo_decisions (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(btrim(question)) between 1 and 500),
  answer text not null check (length(btrim(answer)) between 1 and 4000),
  scope text not null,
  reason text not null,
  agents text[] not null default '{}',
  expires_at timestamptz,
  supersedes uuid references public.halo_decisions(id),
  supporting_asset text,
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.halo_canonical_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  version text not null,
  content text not null,
  status text not null default 'draft' check (status in ('draft','review','current','retired')),
  evidence text,
  created_at timestamptz not null default now(),
  unique (title, version)
);

create table public.halo_agent_workflows (
  id text primary key,
  agent_id text not null references public.halo_agents(id),
  title text not null,
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  allowed_tools text[] not null,
  executor text not null check (executor in ('internal_brief','external_worker')),
  enabled boolean not null default false,
  risk text not null default 'green' check (risk in ('green','yellow','orange','red'))
);

create table public.halo_agent_policies (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.halo_agents(id),
  workflow_id text not null references public.halo_agent_workflows(id),
  rules jsonb not null,
  daily_limit integer not null check (daily_limit > 0),
  budget_ceiling numeric not null default 0 check (budget_ceiling >= 0),
  approved_by uuid references auth.users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.halo_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references public.halo_goals(id),
  agent_id text not null references public.halo_agents(id),
  workflow_id text not null references public.halo_agent_workflows(id),
  objective text not null check (length(btrim(objective)) between 1 and 2000),
  deadline timestamptz not null,
  priority smallint not null default 3 check (priority between 1 and 5),
  inputs jsonb not null default '{}',
  dependencies uuid[] not null default '{}',
  allowed_tools text[] not null,
  autonomy smallint not null default 1 check (autonomy between 0 and 4),
  budget_ceiling numeric not null default 0 check (budget_ceiling >= 0),
  approval_required boolean not null default true,
  expected_output text not null check (length(btrim(expected_output)) > 0),
  success_metric text not null check (length(btrim(success_metric)) > 0),
  fallback text not null check (length(btrim(fallback)) > 0),
  evidence_required text not null check (length(btrim(evidence_required)) > 0),
  state text not null default 'planned' check (state in (
    'planned','queued','running','waiting_on_agent','waiting_on_tool','waiting_on_gordon',
    'completed','verified','measured','blocked','failed','retrying','paused','cancelled')),
  result jsonb,
  evidence text,
  learning text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index halo_one_open_intervention on public.halo_agent_tasks
  (workflow_id,coalesce(goal_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where state not in ('measured','failed','cancelled');

create table public.halo_agent_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.halo_agent_tasks(id),
  decision text not null,
  recommendation text not null,
  reason text not null,
  risk text not null check (risk in ('green','yellow','orange','red')),
  cost numeric not null default 0,
  evidence text,
  status text not null default 'pending' check (status in ('pending','approved','modified','declined','expired')),
  response text,
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  expires_at timestamptz not null,
  requested_at timestamptz not null default now()
);

create table public.halo_agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.halo_agent_tasks(id),
  workflow_id text not null references public.halo_agent_workflows(id),
  instruction_version text not null default 'halo-control-plane-v1',
  inputs jsonb not null,
  decisions uuid[] not null,
  result jsonb not null,
  evidence text not null,
  cost numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (task_id)
);

create table public.halo_agent_audit (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users(id),
  event text not null,
  object_id text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Staff writes go through bounded RPCs. Audit and run evidence are append-only.
do $$
declare relation text;
begin
  foreach relation in array array['halo_agents','halo_operating_controls','halo_goals','halo_decisions',
    'halo_canonical_assets','halo_agent_workflows','halo_agent_policies','halo_agent_tasks',
    'halo_agent_approvals','halo_agent_runs','halo_agent_audit'] loop
    execute format('alter table public.%I enable row level security', relation);
    execute format('revoke all on public.%I from public, anon, authenticated', relation);
    execute format('grant select on public.%I to authenticated', relation);
    execute format('create policy "Launch staff read" on public.%I for select to authenticated using (exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid())))', relation);
  end loop;
end $$;

insert into public.halo_agents (id,name,director_id,mission,enabled) values
('executive','Executive Director',null,'Deliver the HALO launch and close goal gaps.',true),
('liaison','Gordon Liaison','executive','Resolve decisions from the registry and bundle owner exceptions.',true),
('production','Production Director','executive','Deliver verified manuscript, print, EPUB and retail readiness.',true),
('marketing','Marketing & Distribution Director','executive','Build qualified demand and entry into HALO.',false),
('community','Community & Activation Director','executive','Improve 1·60·7 starts and Day-7 completion.',true),
('intelligence','Growth & Intelligence Director','executive','Measure outcomes and recommend the next experiment.',true),
('verification','Verification Agent','executive','Independently check evidence before verification.',true),
('publishing','Publishing / Retail Agent','production','Prepare publishing assets and verify retail readiness.',true),
('book-club','Book Club Agent','marketing','Activate qualified book clubs into HALO.',true),
('host','HALO Host Agent','marketing','Recruit and activate HALO Hosts.',true),
('influencer','Influencer Agent','marketing','Develop qualified creator relationships and measure activation.',true),
('podcast','Podcast Agent','marketing','Convert relevant podcast exposure into HALO participation.',true),
('content-studio','Content Studio Agent','marketing','Create reviewable assets from CURRENT canonical HALO content.',true),
('lifecycle','Email/Lifecycle Agent','marketing','Prepare timely activation and completion support.',true);

insert into public.halo_agents (id,name,director_id,mission)
select id, name, director, mission from (values
('canonical','Canonical Content Agent','production','Maintain the approved HALO source.'),
('editorial','Editorial QA Agent','production','Check editorial consistency.'),
('proof','Proof QA Agent','production','Extract and verify proof corrections.'),
('design','Design QA Agent','production','Check layout and design quality.'),
('version','Version Control Agent','production','Track canonical file versions and hashes.'),
('epub','EPUB Agent','production','Validate accessible EPUB editions.'),
('retail-qa','Retail QA Agent','production','Verify live retailer listings.'),
('website','Website Release Agent','production','Prepare and verify website releases.'),
('newsletter','Newsletter/Substack Agent','marketing','Develop relevant newsletter partnerships.'),
('referral','Referral Agent','marketing','Grow attributable participant referrals.'),
('tiktok','TikTok/BookTok Agent','marketing','Prepare and measure BookTok content.'),
('instagram','Instagram/Bookstagram Agent','marketing','Prepare and measure Bookstagram content.'),
('youtube','YouTube/BookTube Agent','marketing','Prepare and measure BookTube content.'),
('linkedin','LinkedIn Agent','marketing','Prepare and measure educational HALO posts.'),
('pr','PR Agent','marketing','Prepare relevant media coverage.'),
('seo','SEO/AI Discovery Agent','marketing','Improve qualified HALO discovery.'),
('amazon','Amazon Discovery Agent','marketing','Improve qualified retail discovery.'),
('goodreads','Goodreads Agent','marketing','Prepare reader discovery programs.'),
('paid','Paid Growth Agent','marketing','Measure acquisition within approved budget ceilings.'),
('activation','1·60·7 Activation Agent','community','Help participants start the protocol.'),
('blueprint','Blueprint Agent','community','Improve Blueprint selection and practice.'),
('host-activation','Host Activation Agent','community','Help recruited Hosts start groups.'),
('group','Group Agent','community','Prepare supportive group experiences.'),
('day-seven','Day-7 Completion Agent','community','Reduce friction through Day 7.'),
('community-referral','Community Referral Agent','community','Prepare participant referral moments.'),
('response','Community Response Agent','community','Prepare appropriate community responses.'),
('ninety-day','90-Day Conversion Agent','community','Support progression to the 90-Day Build.'),
('attribution','Attribution Agent','intelligence','Attribute qualified HALO participation.'),
('experiment','Experiment Agent','intelligence','Design measurable interventions.'),
('forecast','Forecasting Agent','intelligence','Forecast goals using observed evidence.'),
('listening','Social Listening Agent','intelligence','Identify relevant aggregate public signals.'),
('funnel','Funnel Analyst Agent','intelligence','Diagnose activation and completion gaps.'),
('content-intelligence','Content Intelligence Agent','intelligence','Rank content by downstream participation.'),
('allocation','Channel Allocation Agent','intelligence','Recommend channel allocation from measured outcomes.')
) as roster(id,name,director,mission);

-- A runnable internal workflow per agent. External capabilities remain unregistered
-- until the gateway has a configured adapter and an approved authority policy.
insert into public.halo_agent_workflows (id,agent_id,title,steps,allowed_tools,executor,enabled)
select id || '-brief', id, 'Prepare ' || name || ' operating brief',
  '["Read goals and gaps","Consult current decisions","Read CURRENT canonical assets","Prepare next-action work package","Record evidence"]',
  array['read_goals','search_decisions','search_canonical_halo','create_internal_brief'],
  'internal_brief', true
from public.halo_agents;

-- Repeatable channel contracts are registered separately from executable adapters.
-- The executor rejects these until an adapter and policy enforcement are implemented.
insert into public.halo_agent_workflows(id,agent_id,title,steps,allowed_tools,executor,risk)
select id,agent_id,title,to_jsonb(steps),tools,'external_worker','orange' from (values
('book-club-activation','book-club','Book-club recruitment and activation',
  array['Find','Enrich','Verify','Score','Personalize from CURRENT assets','Policy check','Approval check','Send','Track delivery','Wait for reply','Classify','Respond','Activate','Track 1·60·7','Measure Day 7','Update scoring'],
  array['search_web','query_contacts','enrich_contact','verify_email','send_email','read_email','update_crm','query_analytics']),
('host-recruitment','host','Host recruitment and activation',
  array['Find qualified Hosts','Check existing relationships','Qualify','Prepare invitation','Policy check','Approval check','Send','Track reply','Activate Host','Measure participant starts'],
  array['search_web','query_contacts','send_email','read_email','update_crm','query_analytics']),
('podcast-outreach','podcast','Podcast discovery through attributed participation',
  array['Discover shows','Research host','Score fit','Check prior contact','Personalize pitch','Policy check','Approval check','Send','Follow up','Classify response','Schedule','Prepare briefing','Capture episode','Repurpose','Attribute starts and Day 7','Learn'],
  array['search_web','query_contacts','send_email','read_email','create_calendar_event','create_asset','query_analytics']),
('influencer-partnership','influencer','Creator partnership lifecycle',
  array['Discover','Qualify','Research','Prepare offer','Policy check','Approval check','Contact','Negotiate within policy','Send CURRENT assets','Follow up','Verify published URL','Attribute traffic','Measure Day 7','Recommend next relationship'],
  array['search_web','query_contacts','send_email','read_email','read_asset','update_crm','query_analytics']),
('content-production','content-studio','Canonical content studio',
  array['Research','Draft','Fact-check','Canonical-language check','Visual brief','Create asset','Review','Approval check','Schedule','Publish','Verify URL','Measure','Repurpose'],
  array['search_canonical_halo','read_asset','create_asset','schedule_social','publish_social','query_analytics']),
('lifecycle-activation','lifecycle','Lifecycle activation and support',
  array['Observe approved segment','Check consent and suppression','Select CURRENT template','Personalize','Policy check','Approval check','Send','Track delivery','Measure starts and completion','Learn'],
  array['query_contacts','search_canonical_halo','send_email','query_analytics','update_crm']),
('community-protocol','community','1·60·7 group activation and completion',
  array['Prepare group','Review invitation','Approval check','Invite','Start 1·60·7','Day-1 support','Day-3 friction check','Day-7 review','Keep / Refine / Retire','Request story consent','Request referral','Offer 90-Day Build','Measure'],
  array['create_asset','query_contacts','send_email','update_crm','query_analytics']),
('growth-learning','intelligence','Growth intelligence and next experiment',
  array['Read aggregate metrics','Check attribution','Diagnose funnel','Forecast goals','Rank channels','Design experiment','Review budget policy','Approval check','Measure','Synthesize learning','Recommend next action'],
  array['query_analytics','search_canonical_halo','create_asset']),
('publishing-release','publishing','Publishing and retail release',
  array['Read canonical version','Check proof corrections','Design QA','EPUB validation','Prepare print master','Authenticated master approval','Prepare metadata','Authenticated pricing and metadata approval','Upload','Authenticated final publication approval','Verify retail listing','Capture evidence'],
  array['read_asset','create_asset','upload_retail_asset','browser_task','search_web'])
) as templates(id,agent_id,title,steps,tools);

create function public.halo_require_operator() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.halo_launch_staff where user_id = auth.uid()) then
    raise exception 'Launch staff access is required' using errcode = '42501';
  end if;
end $$;

create function public.halo_operating_command(command text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  object_id uuid;
  task public.halo_agent_tasks;
  workflow public.halo_agent_workflows;
  approval public.halo_agent_approvals;
  agent public.halo_agents;
  next_state text;
  result jsonb;
begin
  perform public.halo_require_operator();
  -- Serialize commands and execution against the global stop/preview switch.
  perform 1 from public.halo_operating_controls where id for update;
  if command = 'controls' then
    update public.halo_operating_controls set
      paused = coalesce((payload->>'paused')::boolean, paused),
      preview = coalesce((payload->>'preview')::boolean, preview),
      external_paused = coalesce((payload->>'external_paused')::boolean, external_paused),
      spend_paused = coalesce((payload->>'spend_paused')::boolean, spend_paused) where id;
  elsif command = 'agent' then
    update public.halo_agents set paused = coalesce((payload->>'paused')::boolean, paused),
      enabled = coalesce((payload->>'enabled')::boolean, enabled) where id = payload->>'id';
    if not found then raise exception 'Agent not found'; end if;
  elsif command = 'goal' then
    insert into public.halo_goals (title,agent_id,target,unit,deadline)
    values (payload->>'title',payload->>'agent_id',(payload->>'target')::numeric,payload->>'unit',(payload->>'deadline')::date)
    returning id into object_id;
  elsif command = 'metric' then
    update public.halo_goals set current_value = (payload->>'current_value')::numeric,
      forecast = (payload->>'forecast')::numeric, observed_at = now(), evidence = payload->>'evidence'
      where id = (payload->>'id')::uuid returning id into object_id;
    if not found then raise exception 'Goal not found'; end if;
  elsif command = 'decision' then
    insert into public.halo_decisions (question,answer,scope,reason,expires_at,supersedes,supporting_asset,decided_by)
    values (payload->>'question',payload->>'answer',payload->>'scope',payload->>'reason',
      (payload->>'expires_at')::timestamptz,(payload->>'supersedes')::uuid,payload->>'supporting_asset',auth.uid())
    returning id into object_id;
  elsif command = 'canonical_asset' then
    if payload->>'status' = 'current' and length(btrim(coalesce(payload->>'evidence',''))) = 0 then
      raise exception 'Approval evidence is required for CURRENT canonical assets';
    end if;
    if payload->>'status' = 'current' then
      update public.halo_canonical_assets set status = 'retired' where title = payload->>'title' and status = 'current';
    end if;
    insert into public.halo_canonical_assets(title,version,content,status,evidence)
    values(payload->>'title',payload->>'version',payload->>'content',coalesce(payload->>'status','draft'),payload->>'evidence') returning id into object_id;
  elsif command = 'task' then
    select * into strict workflow from public.halo_agent_workflows where id = payload->>'workflow_id';
    select * into strict agent from public.halo_agents where id = workflow.agent_id;
    insert into public.halo_agent_tasks (goal_id,agent_id,workflow_id,objective,deadline,priority,inputs,
      dependencies,allowed_tools,autonomy,expected_output,success_metric,fallback,evidence_required)
    values ((payload->>'goal_id')::uuid,agent.id,workflow.id,payload->>'objective',(payload->>'deadline')::timestamptz,
      coalesce((payload->>'priority')::smallint,3),coalesce(payload->'inputs','{}'),
      array(select jsonb_array_elements_text(coalesce(payload->'dependencies','[]'))::uuid),
      workflow.allowed_tools,agent.autonomy,payload->>'expected_output',payload->>'success_metric',
      payload->>'fallback',payload->>'evidence_required') returning id into object_id;
    if exists (select 1 from public.halo_agent_tasks t where t.id = object_id and
      exists (select 1 from unnest(t.dependencies) dependency where not exists (
        select 1 from public.halo_agent_tasks d where d.id = dependency and d.id <> object_id))) then
      raise exception 'Invalid dependency';
    end if;
    insert into public.halo_agent_approvals (task_id,decision,recommendation,reason,risk,expires_at)
    values (object_id,payload->>'objective','Review work contract','Initial workflows require explicit approval.',workflow.risk,now() + interval '7 days');
    update public.halo_agent_tasks set state = 'waiting_on_gordon' where id = object_id;
  elsif command = 'replan' then
    select * into strict task from public.halo_agent_tasks where id = (payload->>'id')::uuid for update;
    if task.state not in ('planned','waiting_on_gordon','blocked','waiting_on_tool') then raise exception 'Task cannot be replanned in this state'; end if;
    update public.halo_agent_approvals set status = 'expired' where task_id = task.id and status in ('pending','approved');
    update public.halo_agent_tasks set objective = payload->>'objective', state = 'waiting_on_gordon', updated_at = now() where id = task.id;
    select * into strict workflow from public.halo_agent_workflows where id = task.workflow_id;
    insert into public.halo_agent_approvals(task_id,decision,recommendation,reason,risk,expires_at)
    values(task.id,payload->>'objective','Review revised work contract','Replanned after correction or expired authority.',workflow.risk,now() + interval '7 days');
    object_id = task.id;
  elsif command = 'approval' then
    select * into strict approval from public.halo_agent_approvals where id = (payload->>'id')::uuid for update;
    if approval.status <> 'pending' or approval.expires_at <= now() then raise exception 'Approval is no longer pending'; end if;
    if not exists (select 1 from public.halo_agent_tasks where id = approval.task_id and state = 'waiting_on_gordon') then
      raise exception 'Task is no longer awaiting approval';
    end if;
    next_state = payload->>'status';
    if next_state not in ('approved','modified','declined') or length(btrim(coalesce(payload->>'response',''))) = 0 then
      raise exception 'A decision and response are required';
    end if;
    update public.halo_agent_approvals set status = next_state,response = payload->>'response',responded_by = auth.uid(),responded_at = now()
      where id = approval.id;
    -- Modified work returns to planning and requires a new approval after correction.
    update public.halo_agent_tasks set state = case next_state when 'approved' then 'queued'
      when 'modified' then 'planned' else 'cancelled' end, updated_at = now() where id = approval.task_id;
    object_id = approval.task_id;
  elsif command = 'task_state' then
    select * into strict task from public.halo_agent_tasks where id = (payload->>'id')::uuid for update;
    next_state = payload->>'state';
    if next_state = 'paused' and task.state in ('planned','queued','waiting_on_tool','waiting_on_gordon','blocked') then
      null;
    elsif next_state = 'queued' and task.state = 'paused' then
      null;
    elsif next_state = 'cancelled' and task.state not in ('verified','measured','completed','running') then
      null;
    elsif next_state = 'verified' and task.state = 'completed' then
      if length(btrim(coalesce(payload->>'evidence',''))) = 0 then raise exception 'Independent verification evidence is required'; end if;
    elsif next_state = 'measured' and task.state = 'verified' then
      if length(btrim(coalesce(payload->>'learning',''))) = 0 then raise exception 'A measured result and learning are required'; end if;
    else raise exception 'Invalid task transition'; end if;
    update public.halo_agent_tasks set state = next_state,updated_at = now(),
      evidence = case when next_state = 'verified' then payload->>'evidence' else evidence end,
      learning = case when next_state = 'measured' then payload->>'learning' else learning end where id = task.id;
    if next_state = 'cancelled' then
      update public.halo_agent_approvals set status = 'declined',response = 'Task cancelled by operator',
        responded_by = auth.uid(),responded_at = now() where task_id = task.id and status = 'pending';
    end if;
    object_id = task.id;
  else raise exception 'Unknown operating command'; end if;
  insert into public.halo_agent_audit(actor,event,object_id,detail)
  values (auth.uid(),command,coalesce(object_id::text,payload->>'id','controls'),payload);
  return jsonb_build_object('id',object_id);
end $$;

create function public.halo_run_approved_work() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  controls public.halo_operating_controls;
  task public.halo_agent_tasks;
  workflow public.halo_agent_workflows;
  agent public.halo_agents;
  evidence_id uuid;
  package jsonb;
  decision_ids uuid[];
  started integer := 0;
  waiting integer := 0;
  eligible integer := 0;
begin
  perform public.halo_require_operator();
  select * into strict controls from public.halo_operating_controls where id for update;
  if controls.paused then raise exception 'All autonomous actions are paused'; end if;
  for task in select * from public.halo_agent_tasks where state = 'queued' order by priority,deadline,id for update loop
    select * into strict agent from public.halo_agents where id = task.agent_id;
    select * into strict workflow from public.halo_agent_workflows where id = task.workflow_id;
    if not agent.enabled or agent.paused or not workflow.enabled then continue; end if;
    if exists (select 1 from unnest(task.dependencies) dependency where not exists (
      select 1 from public.halo_agent_tasks d where d.id = dependency and d.state in ('verified','measured'))) then continue; end if;
    if not exists (select 1 from public.halo_agent_approvals a where a.task_id = task.id and a.status = 'approved' and a.expires_at > now()) then
      if not controls.preview then update public.halo_agent_tasks set state = 'waiting_on_gordon',updated_at = now() where id = task.id; end if;
      waiting = waiting + 1;
      continue;
    end if;
    -- Fail closed. Only the internal, zero-cost tool set has an executable adapter.
    if workflow.executor <> 'internal_brief' or workflow.risk <> 'green' or task.budget_ceiling <> 0 or
      task.inputs is null or jsonb_typeof(task.inputs) <> 'object' or
      not task.allowed_tools <@ array['read_goals','search_decisions','search_canonical_halo','create_internal_brief']::text[] then
      if not controls.preview then update public.halo_agent_tasks set state = 'waiting_on_tool',updated_at = now() where id = task.id; end if;
      waiting = waiting + 1;
      continue;
    end if;
    eligible = eligible + 1;
    if controls.preview then continue; end if;
    select coalesce(array_agg(d.id),'{}') into decision_ids from public.halo_decisions d
      where (d.expires_at is null or d.expires_at > now()) and (cardinality(d.agents) = 0 or agent.id = any(d.agents))
      and not exists (select 1 from public.halo_decisions newer where newer.supersedes = d.id);
    package = jsonb_build_object('objective',task.objective,'agent',agent.name,'inputs',task.inputs,
      'expected_output',task.expected_output,'success_metric',task.success_metric,'fallback',task.fallback,
      'goals',(with recursive team as (
          select a.id from public.halo_agents a where a.id = agent.id
          union all select a.id from public.halo_agents a join team on a.director_id = team.id
        ) select coalesce(jsonb_agg(to_jsonb(g)),'[]') from public.halo_goals g
          where g.agent_id in (select id from team) or g.id = task.goal_id),
      'decisions',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.halo_decisions d where d.id = any(decision_ids)),
      'canonical_assets',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.halo_canonical_assets a where a.status = 'current'),
      'next_action','Review this evidence-backed work package and prepare the specialist intervention.');
    insert into public.halo_agent_runs(task_id,workflow_id,inputs,decisions,result,evidence)
      values (task.id,workflow.id,task.inputs,decision_ids,package,'Internal operating brief stored in halo_agent_runs') returning id into evidence_id;
    update public.halo_agent_tasks set state = 'completed',result = package,evidence = 'halo_agent_runs/' || evidence_id::text,updated_at = now() where id = task.id;
    insert into public.halo_agent_audit(actor,event,object_id,detail)
      values (auth.uid(),'internal_brief_completed',task.id::text,jsonb_build_object('run_id',evidence_id,'agent',agent.id,'tools',task.allowed_tools));
    started = started + 1;
  end loop;
  insert into public.halo_agent_audit(actor,event,object_id,detail)
    values(auth.uid(),case when controls.preview then 'approved_work_preview' else 'approved_work_run' end,'controls',
      jsonb_build_object('eligible',eligible,'completed',started,'waiting',waiting));
  return jsonb_build_object('preview',controls.preview,'eligible',eligible,'completed',started,'waiting',waiting);
end $$;

revoke all on function public.halo_require_operator(),public.halo_operating_command(text,jsonb),public.halo_run_approved_work() from public,anon,authenticated;
grant execute on function public.halo_operating_command(text,jsonb),public.halo_run_approved_work() to authenticated;
commit;
