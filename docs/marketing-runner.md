# Marketing runner

The runner prepares internal campaign briefs, draft copy, and worksheets from the existing plan. Each run includes a specific request for verified inputs. The Launch Dashboard keeps these in **Needs your input** and moves them to **Drafts for review** after a response. Drafts and responses are stored together. Staff use the activity planner to record verified outcomes and mark work complete.

**Start automatic queue** prepares the highest-ranked eligible item immediately. The scheduled job then prepares one unprocessed item each minute while enabled. Waiting for an answer does not stop independent work. Completed, paused, and dependency-blocked activities are excluded. **Run autonomously** prepares the selected eligible item even when the automatic queue is paused. Repeating a command opens the existing run.

This release operates on the existing nineteen activities and their task-specific templates. Confirmed findings, sends, publication, fulfillment, and purchases require separate execution. Notifications appear in the signed-in dashboard, which refreshes the runner section every fifteen seconds.

## Activate on Supabase

1. Apply `20261127220000_halo_marketing_runner.sql` after the marketing launch-control migration.
2. Have the database owner enable the Supabase Cron integration, then register the following recurring SQL job in the same database. The job is inert while the queue is paused.

```sql
select cron.schedule(
  'halo-marketing-priority-queue',
  '* * * * *',
  'select public.halo_marketing_run_step(null, null);'
);
```

3. Deploy the site and open `/admin/launch/` as launch staff. Start the queue and check that a later scheduled tick creates the next eligible draft. Pause the queue and verify no subsequent tick adds a draft. Submit a response and confirm it appears with the draft.

Run `node scripts/test-halo-marketing-launch.mjs` and `npm run build` before release.
