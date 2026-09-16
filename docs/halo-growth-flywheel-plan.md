# HALO x 1-60-7 Growth Flywheel

## Goal

Launch a lightweight acquisition and behavior loop for HALO:

Visitor -> identity chosen -> first 60-second proof -> seven-day evidence stack -> shareable identity card -> new visitor.

The North Star is not downloads. The North Star is completed 1-60-7 identities.

## Brand Architecture

- HALO is the method.
- 1-60-7 is how someone starts.
- TheHaloMethod.co is the front door.
- The book explains why the method works.
- The product creates proof.

## Phase 1: Flywheel V1

Build the minimum loop:

- `/start` identity entry
- present-tense identity commitment
- first proof action within 60 seconds
- save prompt after action
- shareable Identity Card
- `/i/[code]` share landing route
- book CTA after proof

No native app dependency is required to prove the loop.

## Phase 2: Founding 1607

Recruit a launch cohort of 1,607 people, then make the first 167 seven-day completers the public honor roll.

- Founding 1607 participant pipeline
- First 167 completion badge
- completion number for First 167 completers
- Day 1 through Day 7 evidence capture
- opt-in story collection
- completion dashboard

Founding 1607 is the launch movement. First 167 is the visible proof layer.

The public site should show the First 167, aggregate cohort stats, and a small number of opt-in stories. It should not publicly list all 1,607 participants.

## Phase 3: Book Integration

Use three QR paths in the book:

- `/start/book-opening`
- `/start/book-1607`
- `/start/book-end`

Each path should track whether book readers become identity starters, proof completers, and seven-day completers.

## Phase 4: Lifecycle Automation

Resend is the right tool for product lifecycle messages:

- save reminder
- daily proof prompt
- missed-day reset nudge
- Day 7 completion
- referral invitation
- book CTA

Twenty is useful for launch operations:

- Founding 167 candidates
- Founding 1607 candidates
- partners
- coaches and creators
- press and podcast contacts
- case-study follow-up

Twenty should not be the primary consumer product database.

## Initial Event Taxonomy

- `halo_visit`
- `identity_started`
- `identity_committed`
- `proof_1_completed`
- `account_created`
- `artifact_generated`
- `artifact_shared`
- `share_visit`
- `referred_identity_started`
- `seven_day_completed`
- `book_clicked`

## First Slice

Create the public route shape and product language before adding persistence:

- `/start`
- `/i/[code]`
- launch phases and event definitions in code
- build verification

## Persistence Slice

The current static deployment can persist the V1 loop through Supabase REST calls from the browser using public anon credentials and Row Level Security.

Required environment variables:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

Required tables:

- `identity_sessions`
- `identity_events`
- `share_cards`

The SQL lives in `docs/supabase-founding-1607-schema.sql`.
