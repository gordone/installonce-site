# Native HALO Intelligence release integration

Prepared target: **https://thehalomethod.co/my-halo/**. This is an unmerged source change, not a claim that the route is deployed. The existing `/app/` practice and saved cards, Blueprint library, community/moderation, settings and operator dashboards remain intact. No legacy data is converted or deleted. New plan storage is in the backend's private `halo_intelligence` schema, authenticated with the same existing Supabase user IDs.

## Source and accounts

`src/generated/halo-intelligence-manifest.json` pins the reviewed frontend from `gordone/halo-intelligence-mvp` commit `65bfcbdd8be615373f7d8e7168ac58dc00bceeab` (consolidated release PR #35; includes durable AI retry recovery). Text assets normalize to the source repository's LF form for stable Windows/Linux hashes; font bytes remain unmodified. Every bundled asset has a SHA-256; the transformed native body has its own digest. Fonts retain their original licenses. Re-sync only from a matching clean backend checkout with `node scripts/sync-halo-intelligence.mjs SOURCE_CHECKOUT FULL_COMMIT`, then review the diff and run all checks.

The native page reuses `src/scripts/halo-account.ts` and the existing Supabase client. An existing session auto-connects; signed-out visitors explicitly request a sign-in link in the native dialog. Cancellation preserves entry text; same-owner refresh preserves edits; account changes, external sign-out and back-cache restores obey the backend UI's privacy boundary. Session notifications are scheduled outside Supabase's Auth callback to avoid SDK locks. No account metadata grants operator or moderation privileges.

The actual configured Astro page/Supabase browser SDK/API integration is tested in the backend's `tests/test_native_site_browser.py`. It uses signed synthetic identities, an actual HALO API and intercepted Auth/OTP transport, not real email delivery or private accounts. Standalone native auth/config/bundle checks run here, plus the existing Mission Control and agent bridge suites. CI builds default-disabled and explicitly configured variants and checks preserved routes.

## Configuration and activation after batch approval

1. Merge the reviewed backend release and this integration PR only when approved. Provision the restricted backend login/private schema and project database CA using the backend's reviewed release procedure. Never use the local-only migration helper against production or give the runtime an admin/service-role credential.
2. Deploy the approved backend with exact native origin `https://thehalomethod.co`, pinned Supabase project/public key, restricted TLS-verified database settings, durable receipts and scheduled retention cleanup. Configure the server-only model key/explicit model and remote-generation opt-in for real AI. Verify `/ready` and separate generation/replan modes before enabling navigation. Attempt caps are not dollar guarantees; the operator approves the model/account budget.
3. Add exact Supabase Auth redirect `https://thehalomethod.co/my-halo/`. Keep existing `/app/` and community redirects. Confirm the existing mail sender/deliverability with the operator's approved test inbox during live cutover; synthetic OTP tests do not prove delivery.
4. Set public site build values `PUBLIC_HALO_INTELLIGENCE_API_URL` to the exact approved HTTPS API origin, `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` to the same existing public project values, then `PUBLIC_HALO_INTELLIGENCE_ENABLED=1`. Never use service-role/private keys in public values. Invalid enabled configuration fails the build; with the flag off, public My HALO navigation stays at `/app/`.
5. Apply the Render settings declared in `render.yaml` if the service is not Blueprint-managed: Node 22.22.1, locked `npm ci` build, and route-specific no-store/anti-framing headers. Header syntax follows the [Render static-header reference](https://render.com/docs/static-site-headers). A git change alone does not prove dashboard settings applied. Verify actual HTTPS headers on both `/my-halo` and `/my-halo/` after deployment.
6. Live smoke after approval: public routes, existing account sign-in/email return, new create/save/reload/edit, separate-account isolation, logout clearing, one bounded real-AI draft/replan with review labels, export/confirmed delete and maintenance readiness. Do not use raw member posts/databases for tests. Record exact deployed commits and results; retain independent domain-quality/observed-retention gaps honestly.

New private intention/Blueprint text is not wired into PostHog/session recording by this page. Existing opt-in marketing/community analytics and launch integrations are preserved. Personal external AI-account imports are not claimed by this saved-HALO-context workflow; existing Settings remains accessible.

## Rollback

Set `PUBLIC_HALO_INTELLIGENCE_ENABLED=0` and rebuild to restore the previous My HALO navigation. The prior `/app/` practice/data remains accessible throughout. Disable remote generation or roll back the backend image if needed, retaining the current private database, erasure guards and receipt cleanup. Do not restore an old backup into traffic without replaying later erasure guards and removing erased content. Keep prior pinned assets for reviewed rollback; do not erase member data or reset credentials as a routing rollback.

No infrastructure, credentials, account state, messages, purchases, merges or deployments are changed while preparing this PR. Activation remains the user's final batch-approval gate.
