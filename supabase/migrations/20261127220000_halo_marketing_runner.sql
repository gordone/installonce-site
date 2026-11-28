begin;

create table public.halo_marketing_runner_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into public.halo_marketing_runner_settings default values;

create table public.halo_marketing_runs (
  activity_id integer primary key references public.halo_marketing_activities,
  state text not null check (state in ('needs_input', 'draft_ready')),
  prompt text not null,
  draft text not null,
  operator_input text,
  requested_by uuid,
  answered_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.halo_marketing_runner_settings enable row level security;
alter table public.halo_marketing_runs enable row level security;
revoke all on public.halo_marketing_runner_settings, public.halo_marketing_runs from public, anon, authenticated;
grant select on public.halo_marketing_runner_settings, public.halo_marketing_runs to authenticated;
create policy marketing_settings_staff_read on public.halo_marketing_runner_settings for select to authenticated
  using (exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid())));
create policy marketing_runs_staff_read on public.halo_marketing_runs for select to authenticated
  using (exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid())));

-- One selection order for scheduled and manual runs. Keep scoring aligned with the dashboard.
create function public.halo_marketing_ready(p_today date)
returns table (id integer, score integer, due_on date)
language sql stable set search_path = '' as $$
  select a.id,
    3 * a.urgency + 2 * a.impact + 2 * a.dependency_importance + a.confidence
      + case a.expected_roi when 'High' then 6 when 'Medium' then 3 when 'Indirect' then 2 else 0 end
      - a.effort - case a.cost_band when 'High' then 4 when 'Medium' then 2 else 0 end
      + case when a.due_on - p_today <= 1 then 8 when a.due_on - p_today <= 7 then 4 else 0 end,
    a.due_on
  from public.halo_marketing_activities a
  where a.status in ('Planned', 'Drafted')
    and (a.milestone_step is null or exists (
      select 1 from public.halo_production_milestones m where m.step = a.milestone_step and m.verified
    ))
    and (a.prerequisite_id is null or exists (
      select 1 from public.halo_marketing_activities p where p.id = a.prerequisite_id and p.status = 'Completed'
    ))
  order by 2 desc, a.due_on, a.id;
$$;
revoke all on function public.halo_marketing_ready(date) from public, anon, authenticated;

create function public.halo_marketing_run_step(p_activity integer, p_operator uuid)
returns integer language plpgsql set search_path = '' as $$
declare
  a public.halo_marketing_activities%rowtype;
  c public.halo_marketing_campaigns%rowtype;
  chosen integer;
  question text;
  preparation text;
begin
  perform pg_catalog.pg_advisory_xact_lock(1607, 202);
  if p_activity is null and not (
    select enabled from public.halo_marketing_runner_settings where singleton
  ) then return null; end if;

  if p_activity is not null and exists (select 1 from public.halo_marketing_runs where activity_id = p_activity) then
    return p_activity;
  end if;
  select r.id into chosen
  from public.halo_marketing_ready((now() at time zone 'America/New_York')::date) r
  where (p_activity is null or r.id = p_activity)
    and not exists (select 1 from public.halo_marketing_runs x where x.activity_id = r.id)
  order by r.score desc, r.due_on, r.id limit 1;
  if chosen is null then
    if p_activity is not null then
      raise exception using errcode = '22023', message = 'This activity is blocked, paused, completed, or unavailable.';
    end if;
    return null;
  end if;
  select * into strict a from public.halo_marketing_activities where id = chosen for update;
  if not exists (
    select 1 from public.halo_marketing_ready((now() at time zone 'America/New_York')::date) r where r.id = chosen
  ) then
    if p_activity is not null then
      raise exception using errcode = '22023', message = 'This activity is no longer eligible.';
    end if;
    return null;
  end if;
  select * into strict c from public.halo_marketing_campaigns where id = a.campaign_id;

  select q, d into question, preparation from (values
    (1, 'What are the official retailer URLs and ISBNs for each format?', 'Listing audit worksheet: one row per format with ISBN, displayed title, author, retailer URL, availability, and discrepancy.'),
    (2, 'Which permissioned segment, approved offer, and retailer URL should the gifting email use?', 'Email draft: Subject: A book for someone making a change. Opening: Choose someone taking a fresh step. Introduce the HALO book and connect the gift to that moment. CTA: View the verified book listing.'),
    (3, 'Who is the primary reader, and which comparable titles or search notes should guide the shortlist?', 'Seed phrases to validate: identity-based habits, intentional behavior change, and seven-day practice. Record search intent, relevance, and supporting evidence.'),
    (4, 'Which reviewed terms and active formats should be assigned to each retailer?', 'Keyword assignment worksheet: retailer, format, phrase, search intent, duplication check, and listing evidence.'),
    (5, 'Which audiences or comparable books should anchor the pitch list?', 'Pitch list worksheet: outlet, recent comparable coverage, audience fit, public submission route, and decision.'),
    (6, 'Which candidate creators and public outreach routes should be screened?', 'Vetting worksheet: niche relevance, representative content, audience fit, contact route, disclosure needs, and next step.'),
    (7, 'Which platform and audience should get the first launch push?', 'Platform brief: BookTok and Reels show the card in action, YouTube explains the practice, and Substack tells a reader story. Use one tracked call to action per platform.'),
    (8, 'What release date, approved claims, media assets, and press contact should the copy use?', 'Press draft outline: book announcement, why it matters to this audience, confirmed publication details, approved quote, media contact, and buying link.'),
    (9, 'Which vetted creators and pitch angle should go into the first batch?', 'Pitch draft: Reference their specific work, explain the fit with the HALO book, and offer a review copy with no obligation.'),
    (10, 'Which recipients requested a copy, and which formats and delivery options are approved?', 'Fulfillment worksheet: approved recipient, requested format, consent, shipment or download status, and disclosure note.'),
    (11, 'Which eligible readers and platform rules should the review follow-up use?', 'Follow-up draft: If you would like to share your honest experience, a voluntary review is welcome. Ask for no particular rating or wording.'),
    (12, 'Which approved creative and tracked activation link should the posts use?', 'Post draft: Name one identity. Take one action in 60 seconds. Try the practice for seven days. Add the approved tracked link.'),
    (13, 'Which outlets and approved angle should the publicity wave use?', 'Outreach worksheet: outlet, personalized angle, asset link, reply, and coverage evidence.'),
    (14, 'Which creator commitments, approved assets, and disclosure wording are available?', 'Creator pack outline: optional copy, approved artwork, tracked URL, material-connection disclosure, and publication timing.'),
    (15, 'What approved Meta budget cap, conversion event, and stop rule should the test use?', 'Pilot brief: one audience, one offer, comparable creative variants, and a review of spend, conversions, and mature Day-7 results.'),
    (16, 'Which additional channel, approved spend cap, and stop rule are available?', 'Comparison brief: matched measurement window, attributed book contribution, activation cost, and stopping criteria.'),
    (17, 'Which creators, approved fees, rights, and deliverables should the brief cover?', 'Sponsorship brief: format, dates, disclosure, usage rights, tracked link, approval steps, and reporting requirements.'),
    (18, 'Who confirmed interest, and what fulfillment budget and destination details are approved?', 'Fulfillment plan: confirm requested contents, estimate landed cost, and log dispatch and resulting placements.'),
    (19, 'Which programs and recent segments should the broadcast pitch be tailored to?', 'Segment pitch outline: one timely hook, a visual 60-second card demonstration, an audience takeaway, and a verified contact route.')
  ) as templates(id,q,d) where id = chosen;

  insert into public.halo_marketing_runs(activity_id, state, prompt, draft, requested_by)
  values (a.id, 'needs_input', coalesce(question, 'What verified inputs should this activity use?'),
    concat_ws(E'\n\n', c.title || ' / ' || a.title, a.objective, coalesce(preparation, a.next_action),
      'Next action: ' || a.next_action, 'Evidence to collect: ' || a.exit_criteria), p_operator);
  return a.id;
end;
$$;
revoke all on function public.halo_marketing_run_step(integer,uuid) from public, anon, authenticated;

create function public.halo_marketing_runner_command(
  p_command text, p_activity integer default null, p_input text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  operator_id uuid := auth.uid();
  changed integer;
begin
  if operator_id is null or not exists (select 1 from public.halo_launch_staff where user_id = operator_id) then
    raise exception using errcode = '42501', message = 'Launch staff access is required.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1607, 202);
  case p_command
    when 'start' then
      update public.halo_marketing_runner_settings set enabled = true where singleton;
      return public.halo_marketing_run_step(null, operator_id);
    when 'pause' then
      update public.halo_marketing_runner_settings set enabled = false where singleton;
      return null;
    when 'run' then
      if p_activity is null then raise exception using errcode = '22023', message = 'Choose an activity.'; end if;
      return public.halo_marketing_run_step(p_activity, operator_id);
    when 'answer' then
      if coalesce(length(btrim(p_input)),0) not between 1 and 4000 then
        raise exception using errcode = '22023', message = 'Enter a response of 1 to 4,000 characters.';
      end if;
      update public.halo_marketing_runs
      set state = 'draft_ready', operator_input = btrim(p_input), answered_by = operator_id, updated_at = now()
      where activity_id = p_activity and state = 'needs_input'
      returning activity_id into changed;
      return changed;
    else
      raise exception using errcode = '22023', message = 'Unknown marketing runner command.';
  end case;
end;
$$;
revoke all on function public.halo_marketing_runner_command(text,integer,text) from public, anon, authenticated;
grant execute on function public.halo_marketing_runner_command(text,integer,text) to authenticated;

commit;
