# HALO launch and community team

The team runs from the HALO Codex launch review. Its working pattern follows Zenbid's separation of public product, signed-in member workflows, and restricted operations. All outputs stay in the HALO launch review until an operator acts on them.

| Role | Autonomous work | Handoff |
| --- | --- | --- |
| Launch lead | Consolidate evidence, assign priorities, track go/no-go conditions and changes | Owner makes release decisions |
| Product and reliability | Check the public homepage, Blueprint, My HALO and Community routes. Read HALO's GitHub checks and release status | Route failures and regressions to the owner with evidence and reproduction steps |
| Community stewardship | Prepare one Blueprint-specific prompt or facilitation idea. Identify unanswered workflow questions from public or operator-approved aggregate information | A human decides what to publish and reviews group content |
| Trust and safety | Check moderation readiness. Prioritize operator-supplied, de-identified report totals and flag workflow gaps | Assigned moderators review individual reports and make visibility decisions |
| Growth and support | Draft launch copy or a support answer based on observed product behavior. Track which funnel signals are available | Owner approves publication, outreach and commitments |

## Operating boundaries

- Read public pages and the HALO source repository. Use aggregate counts only when an operator has supplied them for review. Label missing signals as unavailable.
- Publish internal findings in the current Codex chat. No member messages, external announcements, moderation actions, account changes, database writes, deploys or purchases.
- Never copy private evidence, raw group posts, emails, member identifiers, or credentials into an agent input or launch brief.
- Escalate cross-account exposure, broken access controls, and visible production failures immediately in the internal report. Avoid inventing participation, conversions or retention.
- End each review with owners, next actions, and the source for each finding. Flag any work awaiting a human decision.

## Activation checklist

1. Apply the additive migration in the existing HALO Supabase project. Use the Supabase migration runner, or execute the committed SQL once in the project SQL Editor.
2. In Supabase Auth, enable the Email provider and self-service signup. Set the Site URL to the HALO domain and allow redirects for /app/, /community/, and /community/moderation/. The default Magic Link template works via its link. To use typed codes, include the Supabase token in the Magic Link template. Use a production SMTP configuration before broad invitations.
3. Render needs PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY at build time. The existing public flow already uses these settings. Keep service-role credentials out of the site bundle.
4. After a trusted operator signs up, assign moderation access from the administrator SQL session with the verified Auth user UUID. Use only the intended UUID.

   ```sql
   insert into public.halo_community_moderators (user_id)
   values ('<verified-auth-user-uuid>');
   ```

5. Verify with two ordinary accounts and the moderator. One account creates a practice and the other cannot read it. Both accounts join a Blueprint group, one posts, and the other reports. The moderator hides the post, and it disappears from the other member's feed.
6. The practice stores the current 1·60·7 run, its evidence, and board captions. A first-time account holder can explicitly import an existing browser run. Blueprint drafts and the standalone reader notebook remain browser-local.
