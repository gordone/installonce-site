begin;

create table public.halo_marketing_campaigns (
  id text primary key,
  title text not null,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  owner text not null check (length(btrim(owner)) > 0),
  goal text not null check (length(btrim(goal)) > 0),
  book_target integer check (book_target >= 0),
  activation_target integer check (activation_target >= 0),
  budget_usd numeric(12,2) check (budget_usd >= 0)
);

create table public.halo_marketing_activities (
  id integer primary key,
  campaign_id text not null references public.halo_marketing_campaigns,
  title text not null,
  channel text not null,
  owner text not null check (length(btrim(owner)) > 0),
  objective text not null,
  next_action text not null check (length(btrim(next_action)) > 0),
  exit_criteria text not null,
  due_on date not null,
  expected_roi text not null check (expected_roi in ('High', 'Medium', 'Low', 'Indirect')),
  confidence integer not null check (confidence between 1 and 5),
  urgency integer not null check (urgency between 1 and 5),
  impact integer not null check (impact between 1 and 5),
  effort integer not null check (effort between 1 and 5),
  dependency_importance integer not null check (dependency_importance between 1 and 5),
  cost_band text not null check (cost_band in ('Low','Medium','High')),
  milestone_step integer references public.halo_production_milestones,
  prerequisite_id integer references public.halo_marketing_activities check (prerequisite_id < id),
  status text not null default 'Planned' check (status in ('Planned','Drafted','Completed','Paused')),
  outcome text,
  check (status <> 'Completed' or coalesce(length(btrim(outcome)), 0) > 0)
);

create table public.halo_marketing_planning_history (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  record_id text not null,
  actor uuid not null,
  changed_at timestamptz not null default now(),
  previous jsonb not null,
  current jsonb not null
);

create function public.halo_log_marketing_plan_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old is distinct from new then
    insert into public.halo_marketing_planning_history
      (record_type, record_id, actor, previous, current)
    values (tg_table_name, new.id::text, auth.uid(), to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end;
$$;
revoke all on function public.halo_log_marketing_plan_change() from public, anon, authenticated;

insert into public.halo_marketing_campaigns (id, title, starts_on, ends_on, owner, goal) values
  ('holiday', 'Holiday Gifting', '2026-11-27', '2026-12-25', 'Publisher', 'Book sales attributable to holiday gifting'),
  ('seven-days', 'Seven Days Ahead / 1-60-7', '2026-12-26', '2027-01-01', 'Growth Director', 'First-action activations during the campaign'),
  ('january', 'January Continuation', '2027-01-02', '2027-01-18', 'Growth Director', 'Day-7 completion, continuation, and January book sales');

insert into public.halo_marketing_activities
  (id,campaign_id,title,channel,owner,objective,next_action,exit_criteria,due_on,expected_roi,confidence,urgency,impact,effort,dependency_importance,cost_band,milestone_step,prerequisite_id)
values
 (1,'holiday','Metadata optimization','Retail','Publisher','Keep title, ISBN and buying links consistent','Audit each format and its retailer link','Record listing and link evidence by format','2026-11-27','Indirect',5,5,5,2,5,'Low',null,null),
 (2,'holiday','Email campaign','Email','Growth Director','Convert permissioned readers into book buyers','Draft the gifting email and verify the destination link','Record approved copy, segment, attribution and send evidence','2026-11-29','High',4,5,5,2,5,'Low',9,1),
 (3,'holiday','Keyword research','Retail','Publisher','Identify reader-intent phrases','Collect and shortlist phrases by audience intent','Record evidence and rationale for the shortlist','2026-11-28','Indirect',4,5,4,1,5,'Low',null,null),
 (4,'holiday','Amazon and Ingram keywords','Retail','Publisher','Improve relevant retailer discovery','Map shortlisted terms to each retailer and format','Record approved keyword sets and listing evidence','2026-12-01','Medium',3,5,4,2,4,'Low',null,3),
 (5,'holiday','Build highly targeted pitch lists','Earned outreach','Publicity Lead','Find relevant creators and media contacts','Identify outlets with recent coverage of comparable books','Record fit evidence and a permitted contact path for each','2026-11-30','Indirect',4,5,4,2,4,'Low',null,null),
 (6,'holiday','Creator vetting and outreach management','Creator outreach','Publicity Lead','Qualify creators and track one relationship per creator','Score audience fit, engagement quality and contact permission','Log vetting evidence and a next action for each qualified creator','2026-12-02','Indirect',4,5,4,2,4,'Low',null,5),
 (7,'holiday','Campaign strategy by platform','Organic social','Content Lead','Match messages to BookTok, Bookstagram, Substack and YouTube','Define audience, creative, CTA and attribution for each platform','Record channel briefs and success measures','2026-11-30','Indirect',4,5,4,2,4,'Low',null,null),
 (8,'holiday','Press releases and pitch letters','Publicity','Publicity Lead','Prepare relevant pitches for media and creators','Draft a press release and a tailored pitch for each target segment','Record reviewed copy, press assets and destination links','2026-12-03','Indirect',3,4,4,2,3,'Low',10,5),
 (9,'holiday','BookTok and Bookstagram creator outreach','Creator outreach','Publicity Lead','Test relevant earned creator coverage','Prepare a small batch of individualized pitches for vetted creators','Log approval, outreach evidence and attributable results','2026-12-05','High',3,4,5,3,3,'Low',null,6),
 (10,'holiday','Distribute digital or physical review copies','Review copies','Publicity Lead','Fulfill appropriate review-copy requests','Confirm preference, permission and delivery details for each copy','Log fulfillment and any material connection without a review requirement','2026-12-06','Indirect',3,4,4,3,3,'Medium',9,6),
 (11,'holiday','Book review campaign and follow-ups','Customer reviews','Publicity Lead','Invite voluntary, honest reader reviews','Draft a neutral follow-up for eligible readers','Record outreach and aggregate review evidence separately from endorsements','2026-12-15','Medium',3,4,4,2,2,'Low',null,10),
 (12,'seven-days','Social media campaigns','Organic social','Content Lead','Drive first-action activations','Prepare scheduled platform-specific posts with tracked activation links','Record published links and first-action activations','2026-12-22','High',3,4,5,3,3,'Low',10,7),
 (13,'holiday','Publicity','Publicity','Publicity Lead','Earn relevant press, podcast or newsletter coverage','Select the most relevant outlets for a pitching wave','Log pitch evidence, replies and coverage by outlet','2026-12-08','Medium',2,3,4,3,2,'Low',null,8),
 (14,'seven-days','Influencer post decks and pub-day follow-up','Creator outreach','Content Lead','Give participating creators ready-to-use launch materials','Prepare optional copy, approved assets, links and disclosure reminders','Track delivery and published content for each participant','2026-12-23','Indirect',3,3,3,2,2,'Low',null,9),
 (15,'january','Facebook and Instagram ads','Meta Ads','Growth Director','Test paid acquisition against measured activation costs','Prepare a capped test using proven organic creative and conversion tracking','Record spend, sales, activations and mature Day-7 results','2027-01-08','Medium',2,2,3,3,1,'Medium',null,12),
 (16,'january','Advertising beyond Meta','Paid media','Growth Director','Compare another paid channel with the Meta pilot','Choose a channel and define a spend cap and stop rule','Record approval, spend, contribution and cohort conversion costs','2027-01-12','Low',2,2,3,3,1,'High',null,15),
 (17,'january','Paid influencers and campaign briefs','Creator sponsorship','Publicity Lead','Test contracted creator reach with attribution','Draft a brief with deliverables, disclosure, rights and tracked links','Record approval, fees, disclosed posts and measured outcomes','2027-01-12','Medium',2,2,3,4,1,'High',null,9),
 (18,'january','Physical swag boxes','Creator sponsorship','Publicity Lead','Support confirmed high-fit creator or press opportunities','Estimate landed cost and confirm recipient interest','Log approval, fulfillment cost and resulting placements','2027-01-14','Low',2,1,2,5,1,'High',null,17),
 (19,'january','Television','Broadcast','Publicity Lead','Assess qualified broadcast opportunities','Prepare a segment angle and check fit with target producers','Log qualified replies or a decision to pause','2027-01-18','Low',1,1,2,5,1,'High',null,8);

alter table public.halo_marketing_campaigns enable row level security;
alter table public.halo_marketing_activities enable row level security;
alter table public.halo_marketing_planning_history enable row level security;
revoke all on public.halo_marketing_campaigns, public.halo_marketing_activities, public.halo_marketing_planning_history from public, anon, authenticated;
grant select on public.halo_marketing_campaigns, public.halo_marketing_activities, public.halo_marketing_planning_history to authenticated;
grant update (owner, goal, book_target, activation_target, budget_usd) on public.halo_marketing_campaigns to authenticated;
grant update (owner, next_action, due_on, expected_roi, confidence, urgency, impact, effort, dependency_importance, cost_band, status, outcome)
  on public.halo_marketing_activities to authenticated;

do $$
declare tbl text;
begin
  foreach tbl in array array['halo_marketing_campaigns', 'halo_marketing_activities', 'halo_marketing_planning_history'] loop
    execute format('create policy marketing_staff_read on public.%I for select to authenticated using
      (exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid())))', tbl);
  end loop;
  foreach tbl in array array['halo_marketing_campaigns', 'halo_marketing_activities'] loop
    execute format('create policy marketing_staff_update on public.%I for update to authenticated using
      (exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid())))', tbl);
    execute format('create trigger marketing_plan_history after update on public.%I
      for each row execute function public.halo_log_marketing_plan_change()', tbl);
  end loop;
end;
$$;
commit;
