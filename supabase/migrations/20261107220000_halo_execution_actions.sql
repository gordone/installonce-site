begin;
create table public.halo_execution_actions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  detail text not null check (length(btrim(detail)) between 1 and 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  state text not null default 'pending' check (state in ('pending','approved','rejected','completed')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  result text
);
alter table public.halo_execution_actions enable row level security;
revoke all on public.halo_execution_actions from public, anon, authenticated;
grant select on public.halo_execution_actions to authenticated;
grant insert (title, detail) on public.halo_execution_actions to authenticated;
create policy "Launch staff read actions" on public.halo_execution_actions for select to authenticated
  using (exists (select 1 from public.halo_launch_staff where user_id = (select auth.uid())));
create policy "Launch staff propose actions" on public.halo_execution_actions for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.halo_launch_staff where user_id = (select auth.uid())
  ));

create function public.halo_transition_execution_action(action_id uuid, next_state text, note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.halo_launch_staff where user_id = auth.uid()) then
    raise exception 'Launch staff access is required' using errcode = '42501';
  end if;
  if note is null or length(btrim(note)) not between 1 and 2000 then
    raise exception 'A note of 1–2000 characters is required';
  end if;
  if next_state in ('approved','rejected') then
    update public.halo_execution_actions
      set state = next_state, decided_by = auth.uid(), decided_at = now(), decision_note = btrim(note)
      where id = action_id and state = 'pending';
  elsif next_state = 'completed' then
    update public.halo_execution_actions
      set state = next_state, completed_by = auth.uid(), completed_at = now(), result = btrim(note)
      where id = action_id and state = 'approved';
  else
    raise exception 'Invalid action state';
  end if;
  if not found then raise exception 'Action changed or is unavailable'; end if;
end;
$$;
revoke all on function public.halo_transition_execution_action(uuid,text,text) from public, anon, authenticated;
grant execute on function public.halo_transition_execution_action(uuid,text,text) to authenticated;
commit;
