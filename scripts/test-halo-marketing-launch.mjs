import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { rankActivities } from '../src/scripts/halo-marketing-priority.mjs';

const db = new PGlite();
const staffId = '11111111-1111-4111-8111-111111111111';
const migration = name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.halo_launch_staff(user_id uuid primary key);
    grant select on public.halo_launch_staff to authenticated;
    grant usage on schema auth to authenticated;
    insert into public.halo_launch_staff values ('${staffId}');`);
  await db.exec(await migration('20261107190000_halo_production_control.sql'));
  await db.exec('update halo_production_milestones set verified = true where step = 9');
  const milestones = (await db.query('select * from halo_production_milestones order by step')).rows;
  await db.exec(await migration('20261127150000_halo_marketing_launch_control.sql'));
  assert.deepEqual((await db.query('select * from halo_production_milestones order by step')).rows, milestones);

  await db.exec('set role anon');
  await assert.rejects(db.query('select * from halo_marketing_activities'), /permission denied/);
  await db.exec("set role authenticated; set test.uid = '22222222-2222-4222-8222-222222222222'");
  assert.equal((await db.query('select * from halo_marketing_activities')).rows.length, 0);
  assert.equal((await db.query("update halo_marketing_activities set status = 'Paused' where id = 1 returning id")).rows.length, 0);

  await db.exec(`set test.uid = '${staffId}'`);
  const campaigns = (await db.query('select * from halo_marketing_campaigns order by starts_on')).rows;
  assert.deepEqual(campaigns.map(row => row.id), ['holiday', 'seven-days', 'january']);
  assert(campaigns.every(row => row.budget_usd === null && row.book_target === null));
  const readActivities = async () => (await db.query(
    'select to_jsonb(activity) as row from halo_marketing_activities activity',
  )).rows.map(result => result.row);
  let activities = await readActivities();
  assert.equal(activities.length, 19);
  const date = '2026-11-27';
  let ranked = rankActivities(activities, milestones, date);
  assert.equal(ranked[0].id, 1);
  assert.equal(ranked[0].priority, 'P0');
  assert.deepEqual(ranked.find(row => row.id === 2).blockers, ['Metadata optimization']);
  assert.deepEqual(rankActivities(activities, [], date).find(row => row.id === 2).blockers,
    ['Production milestone #9', 'Metadata optimization']);
  assert.equal(rankActivities(activities, milestones, '2026-11-28').find(row => row.id === 1).overdue, true);
  await assert.rejects(db.query("update halo_marketing_activities set status = 'Completed' where id = 1"), /check constraint/);
  await assert.rejects(db.query('update halo_marketing_activities set confidence = 6 where id = 1'), /check constraint/);
  await assert.rejects(db.query('update halo_marketing_activities set prerequisite_id = 1 where id = 3'), /permission denied/);
  await db.exec("update halo_marketing_activities set status = 'Completed', outcome = 'Listing audit recorded' where id = 1");
  activities = await readActivities();
  ranked = rankActivities(activities, milestones, date);
  assert.equal(ranked[0].id, 2);
  assert.deepEqual(ranked[0].blockers, []);

  const [{ actor, previous, current }] = (await db.query('select * from halo_marketing_planning_history')).rows;
  assert.equal(actor, staffId);
  assert.equal(previous.status, 'Planned');
  assert.equal(current.status, 'Completed');
  await assert.rejects(db.query('delete from halo_marketing_planning_history'), /permission denied/);
  console.log('HALO marketing launch checks passed');
} finally {
  await db.close();
}
