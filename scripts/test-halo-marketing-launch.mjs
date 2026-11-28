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
  await db.exec(await migration('20261127220000_halo_marketing_runner.sql'));
  assert.deepEqual((await db.query('select * from halo_production_milestones order by step')).rows, milestones);

  await db.exec('set role anon');
  await assert.rejects(db.query('select * from halo_marketing_activities'), /permission denied/);
  await assert.rejects(db.query("select halo_marketing_runner_command('start')"), /permission denied/);
  await db.exec("set role authenticated; set test.uid = '22222222-2222-4222-8222-222222222222'");
  assert.equal((await db.query('select * from halo_marketing_activities')).rows.length, 0);
  assert.equal((await db.query("update halo_marketing_activities set status = 'Paused' where id = 1 returning id")).rows.length, 0);
  await assert.rejects(db.query("select halo_marketing_runner_command('start')"), /Launch staff access/);
  assert.equal((await db.query('select * from halo_marketing_runs')).rows.length, 0);

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
  await db.exec('reset role');
  const sqlRank = (await db.query('select id from halo_marketing_ready($1)', [date])).rows;
  assert.deepEqual(sqlRank.map(row => row.id), ranked.filter(row => row.active && !row.blockers.length).map(row => row.id));
  assert.equal((await db.query('select halo_marketing_run_step(null,null) as id')).rows[0].id, null);
  await db.exec('set role authenticated');
  const runner = async (command, id = null, input = null) =>
    (await db.query('select halo_marketing_runner_command($1,$2,$3) as id', [command, id, input])).rows[0].id;
  await assert.rejects(db.query('select halo_marketing_run_step(null,null)'), /permission denied/);
  await assert.rejects(runner('run', 2), /blocked/);
  assert.equal(await runner('run', 5), 5);
  assert.equal(await runner('run', 5), 5);
  assert.equal(await runner('start'), 1);
  await db.exec('reset role');
  assert.equal((await db.query('select halo_marketing_run_step(null,null) as id')).rows[0].id, 3);
  await db.exec('set role authenticated');
  await runner('pause');
  const runRows = (await db.query('select activity_id, state, prompt, draft from halo_marketing_runs order by activity_id')).rows;
  assert.deepEqual(runRows.map(row => row.activity_id), [1, 3, 5]);
  assert(runRows.every(row => row.state === 'needs_input'));
  assert.match(runRows[0].prompt, /retailer URLs and ISBNs/);
  assert.match(runRows[0].draft, /Listing audit worksheet/);
  await assert.rejects(runner('answer', 1, '   '), /4,000 characters/);
  assert.equal(await runner('answer', 1, 'Review the publisher’s verified listing.'), 1);
  assert.equal(await runner('answer', 1, 'Duplicate response'), null);
  assert.equal((await db.query('select state from halo_marketing_runs where activity_id = 1')).rows[0].state, 'draft_ready');
  assert.equal((await db.query('select status from halo_marketing_activities where id = 1')).rows[0].status, 'Planned');
  await assert.rejects(db.query("update halo_marketing_runs set state = 'draft_ready' where activity_id = 3"), /permission denied/);
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
