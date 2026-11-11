# Mission Control virtual organization

The staff Mission Control page at `/admin/execution/` includes the persistent HALO organization, goals, work contracts, approvals, canonical source, decisions, and audit trail. This is the foundation increment of the supplied Fully Agent-Driven Launch Operating System specification.

## Available after migration

- Executive Director, Gordon Liaison, four operating directors, independent Verification Agent, and all named specialist roles are registered with immutable IDs and reporting relationships. Initial agents are enabled for internal brief preparation. Remaining specialists can be enabled individually.
- Goals have accountable agents, target, deadline, optional current and forecast observations, evidence, gap, and required pace. Unknown observations remain unavailable. Cards are ordered by deadline.
- Each agent has an operating page in the directory. Workflow steps and permitted tools are visible. Directors' briefs include subordinate goals.
- Work contracts persist objective, inputs, dependencies, tools, autonomy, budget, approval requirement, expected output, success metric, fallback, and evidence requirements.
- An authenticated staff decision queues approved work. Modifications return the task to planning. Replanning expires earlier authority and requests a fresh decision. Cancellation retires pending approval requests.
- `Run all approved work` checks staff access, the global pause, agent state, workflow availability, dependencies, approval expiry, allowed tools, and zero budget. Preview is enabled initially. Preview reports eligible work without creating execution results.
- The runnable workflow creates a deterministic, evidence-backed internal operating package containing live goals, current decisions, and CURRENT canonical asset versions. It records a durable run and audit event. Completion does not imply verification. Staff record independent verification evidence, then measurement and learning.
- One open intervention per goal and workflow prevents duplicate work. Global locking serializes execution and operating changes. The run table also enforces one execution per work contract. RPC transactions roll back partial failures.
- Canonical versions are recorded through an authenticated command. Making a new version CURRENT requires approval evidence and retires the previous CURRENT version of that title.
- Agents and tasks can be paused. Global preview, autonomous-work pause, external-send pause, and spend pause are persisted. All database writes pass through bounded RPCs. Direct authenticated writes are revoked and staff-only read policies protect operating records.

## Workflow registry

Book Club, Host, Podcast, Influencer, Content Studio, Lifecycle, Community, Growth Intelligence, and Publishing/Retail have step-level workflow contracts. External workflows remain disabled until their gateway adapters are connected. Internal brief preparation is executable. The interface distinguishes those states.

The policy table stores standing-authority contracts, but this increment intentionally requires per-task approval. It does not promote agents to autonomous external execution based on a prompt or an autonomy label.

## Deployment

1. Apply `supabase/migrations/20261110180000_halo_virtual_organization.sql` after the existing launch and execution migrations.
2. Build and deploy the site using its existing production process.
3. Sign in as existing launch staff and open `/admin/execution/`.
4. Record approved goals, observations, canonical source versions, and settled decisions. No example launch figures or sample outreach prospects are seeded.
5. Prepare an internal brief, approve its work contract, and preview approved work. Disable preview to create the durable internal package. Independently verify its sources before recording verification and learning.

Run `npm run test:mission-control` for isolated PostgreSQL control-plane regressions and `npm run build` for the Astro build. Tests use an in-memory PostgreSQL runtime and synthetic identities. They do not access production data or credentials.

## Remaining specification work

The supplied specification's full MVP acceptance criteria are not yet met. Outstanding work includes the OpenAI planning/judgment runtime, durable scheduled n8n workers, integration adapters for Twenty/Buffer/Resend/PostHog, enforced standing-policy quotas and budget reservations, channel-level pause controls, independently automated verification, automatic forecasts and learning-driven replanning, task-step retries and timeouts, notification broker, authenticated owner identity distinct from general staff, Twilio SMS and email reply correlation, and controlled publishing/browser execution.

Consequential external approvals must be restricted to the authenticated owner before external execution is enabled. The current existing launch-staff role can approve only internal work packages. Tool credentials belong in server-side credential stores, outside agent inputs and browser state. Outbound messages and spending require a configured gateway and appropriate approved policy.

Database, signed-in browser, n8n, and communications deployment need separate live verification after configuration. A successful static build does not establish those integrations as connected.
