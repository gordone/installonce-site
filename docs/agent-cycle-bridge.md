# n8n to Mission Control report bridge

This increment persists the seven-agent n8n cycle in the authenticated Mission Control inbox. Incoming reports create recommendations only. They cannot approve tasks, publish, send, moderate, change account access, or spend.

## Deployment and credentials

Production installation requires approval for the additive migration and dedicated authenticated worker endpoint.

1. Apply `supabase/migrations/20261111160000_halo_agent_cycle_inbox.sql` after the virtual organization migration.
2. Configure a random secret of at least 32 characters as `HALO_N8N_INGEST_TOKEN` in Supabase Edge Function secrets. Enter it through the secure settings interface. Keep it out of chat, repository files, agent inputs, report JSON, and query strings.
3. Deploy `halo-agent-cycle` using the repository's `supabase/config.toml`. This endpoint uses its own shared-secret check instead of Supabase user JWT verification. The handler checks the secret before reading the report body. The platform-provided service-role credential stays inside the Edge Function environment.
4. Create one n8n Header Auth credential named `HALO Mission Control cycle ingestion`. Header name is `x-halo-ingest-token`. Its value is the same dedicated ingestion secret. The credential grants report submission through this one handler. Do not put the Supabase service-role key in n8n.
5. Import `workflows/n8n/halo-cycle-delivery.json`. Select the new Header Auth credential on `Store cycle in Mission Control`.
6. Add an Execute Sub-workflow node after the existing report compiler. Select the imported delivery workflow and wait for completion.
7. Update the parent compiler to include `source_execution: 'halo-marketing-os:' + $execution.id` in its output. Keep this identity fixed across delivery retries. Remove its early all-agent-failure throw only when the delivery sub-workflow is connected. The sub-workflow persists failed reports first, then raises the cycle error. Partial and successful cycles return their receipt and counts.

Do not activate recurring execution until a live delivery succeeds, quota is available, and the operator approves the desired schedule. This import contains no schedule trigger.

## Data contract

POST JSON to the deployed function. Send `source_execution` and a nonempty `reports` array. Supported roles match the existing compiler exactly. Successful reports contain `role`, `status: completed`, `summary`, string arrays `evidence` and `missingInputs`, and at most two proposals. Each proposal contains an allowed `type`, `title`, and `draft`. Failed reports use `failed` or `invalid_response` and their role.

The database derives overall status from validated reports. Every stored proposal is `pending_review` regardless of incoming status. Unknown roles and duplicate agents are rejected. Extra provider fields and raw failure errors are discarded. Evidence and summaries must contain approved operational context, with aggregate metrics instead of raw member or contact data.

One source execution produces one immutable cycle. Equivalent retries return the original receipt and produce no additional audit event. Changed content under an existing execution identity is rejected. The edge handler bounds request size and database timeout. Failed delivery can be retried with the same identity after an uncertain response.

## Verification

Run `node scripts/test-agent-cycle-bridge.mjs`, `npm run test:mission-control`, and `npm run build`.

Live verification should confirm an authenticated receipt, one visible inbox entry, retry deduplication, partial report handling, and a failed cycle saved before n8n raises its failure. Unauthenticated calls must return 401. The staff inbox must remain invisible to signed-out visitors and non-staff accounts.

The bridge does not resolve OpenAI quota or make the full virtual organization autonomous. It connects the existing seven-agent planning cycle to a durable staff review surface. Tool execution, standing authority, and owner notification/replies remain separate increments.

## Parent workflow source and evidence limits

`workflows/n8n/halo-launch-agent-team.json` preserves the deployed parent workflow with credential references removed. Reattach the existing PostHog and OpenAI credentials after importing it. The delivery sub-workflow ID is specific to the HALO deployment.

Workbook milestone statuses in this runtime are historical planning context. Current completion is explicitly unverified. Scheduled campaign dates do not establish execution. Captured PostHog events cover opted-in instrumented browsers, and zero recorded events cannot establish zero people or overall activity. The 10,000 target measures protocol starts.

Until approved canonical assets are supplied to this runtime, both the provider output schema and the report parser allow only `internal_task` proposals. Model instructions alone do not enforce that boundary. All proposals remain pending review. The presence of a completed cycle indicates successful report generation and storage, not completion of proposed work.

Run `node scripts/test-agent-context.mjs` for the historical-status and internal-proposal gate regressions.
