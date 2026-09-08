# HALO Appendix Interactive Spec

## Purpose

Turn the appendix diagrams into interactive product surfaces for the Install Once website and the HALO NOW app.

The website should help a visitor understand the method, choose an identity, and preview the seven-day test without friction. The app should capture the actual seven-day data and produce a useful diagnostic report.

## Product Rule

The `1 • 60 • 7` module stays scoped to seven days.

No 30-day or 90-day tracking belongs inside this module. Those can become later modules after the seven-day report.

## Surface Split

### Website

The website is the persuasion and preview layer.

It should include:

- Interactive Identity Menu preview
- Identity Audit sample
- Installation Worksheet preview
- Card flip demo
- Integrity Check preview
- HALO Board preview
- CTA into `/app/`

The website should not require account creation, full data entry, or long forms.

### App

The app is the live seven-day test.

It should include:

- Identity selection
- One-card setup
- Sixty-second proof timer
- Seven-day evidence sheet
- Daily integrity check
- Slip/reset capture
- Day-seven diagnostic report
- HALO Board reference

The app should store locally first and stay usable on mobile web.

## Interactive Addition 1: Identity Menu

### Source Appendix

The Identity Menu contains 50 identity statements grouped by domains:

- Money
- Body
- Relationships
- Career
- Entrepreneurship
- Confidence
- Creativity
- Discipline
- Emotional
- Growth
- Social
- Purpose
- Independence

Each identity has:

- Domain
- Identity statement
- Related attributes or synonyms
- Degrees from entry to advanced
- Daily question

### Website Interaction

Add an `Identity Menu` section with domain filters.

Visitor flow:

1. Visitor selects a domain.
2. The page shows identity cards for that domain.
3. Visitor taps an identity.
4. The card expands to show synonyms, degree path, and daily question.
5. CTA says `Try this identity`.
6. CTA deep-links into `/app/` with the chosen identity prefilled when feasible.

Primary website value:

Help the user answer, "Where do I start?"

### App Interaction

Replace the small suggestion chip list with a fuller identity picker.

App flow:

1. User taps `Choose identity`.
2. User filters by domain.
3. User selects one identity only.
4. App fills:
   - `I am ...`
   - suggested first proof
   - daily question
   - degree starting point
5. User can edit before beginning the test.

### Data Model

```ts
type IdentityOption = {
  id: string;
  domain: string;
  statement: string;
  attributes: string[];
  degrees: string[];
  dailyQuestion: string;
  suggestedProof?: string;
  suggestedMinimum?: string;
  suggestedReset?: string;
};
```

### Acceptance Criteria

- User can choose one identity only.
- Identity is written in present tense.
- Selected identity populates the card.
- Daily question appears on Side Two.
- User can edit the identity before starting.

## Interactive Addition 2: Identity Audit

### Source Appendix

The Identity Audit has four columns:

- Domain
- Inherited
- Learned
- Behavior Under Pressure

Its purpose is to surface the rules that still run when the user is tired, stressed, ashamed, rushed, or unwatched.

### Website Interaction

Add a lightweight audit preview with one editable row.

Visitor flow:

1. User selects a domain.
2. User fills one inherited rule.
3. User fills one learned rule.
4. User names one pressure behavior.
5. Page shows a gentle insight:
   `This is the old operating rule. HALO starts by choosing the replacement identity.`

Website CTA:

`Choose a new identity`

### App Interaction

Add an optional `Audit` step before the card.

Keep it skippable.

App flow:

1. User chooses a domain.
2. User enters the old rule in one sentence.
3. User enters the pressure behavior.
4. App asks: `What identity would make this behavior unnecessary?`
5. App routes into Identity Menu or manual identity entry.

### Data Model

```ts
type IdentityAudit = {
  domain: string;
  inheritedRule: string;
  learnedRule: string;
  pressureBehavior: string;
  replacementIdentity?: string;
};
```

### Acceptance Criteria

- Audit is optional.
- Audit never blocks starting the seven-day test.
- Audit output can feed the chosen identity.
- Copy frames old behavior as data, not failure.

## Interactive Addition 3: Installation Worksheet

### Source Appendix

The worksheet asks:

- I am ...
- Therefore...
- So...
- And so...
- Which means...

These are requirements, not goals.

### Website Interaction

Create an animated consequence chain.

Visitor flow:

1. User enters or selects an identity.
2. Page reveals the chain one line at a time:
   - Therefore...
   - So...
   - And so...
   - Which means...
3. Each line has one short input.
4. Final output summarizes:
   `If this identity is settled, these consequences must become visible.`

### App Interaction

Use this to improve onboarding, but keep it short.

App flow:

1. User enters identity.
2. App asks for one consequence only by default.
3. User can expand to add the full chain.
4. The first consequence helps generate the first proof action.

### Data Model

```ts
type InstallationWorksheet = {
  identity: string;
  consequences: string[];
  firstVisibleProof: string;
};
```

### Acceptance Criteria

- Default path asks for only one consequence.
- Expanded path supports four consequence prompts.
- Worksheet suggests a first proof action.
- User can accept or edit the proof.

## Interactive Addition 4: The Installation Card

### Source Appendix

The card has two sides:

- Side One: `It already happened. I am ________.`
- Side Two: `What would that person do right now?`

The card must remain simple enough to survive pressure.

### Website Interaction

Keep the current card flip demo, but enhance it with:

- Identity picker integration
- Side Two daily question from the selected identity
- Lock-screen preview mockup
- `Send to app` CTA

### App Interaction

Make the card the persistent anchor of the test.

App flow:

1. Side One shows the identity.
2. Side Two shows the daily question.
3. User enters one proof action.
4. User starts the 60-second timer.
5. User must enter the action before starting the timer.
6. User can stop timer when action is complete.

### Acceptance Criteria

- Back side does not show through when flipped.
- Timer cannot start without an action.
- Timer can be stopped.
- Card remains accessible during all seven days.

## Interactive Addition 5: Integrity Check

### Source Appendix

Integrity Check asks:

1. What identity did I choose?
2. What did I do today that proves it?
3. Where am I still negotiating?
4. What am I calling preparation that is actually avoidance?
5. What slipped, and how fast did I reset?
6. If someone watched my last seven days, what identity would they see?
7. What is the next aligned action?

### Website Interaction

Add an Integrity Check preview as a short diagnostic.

Visitor flow:

1. User answers one proof question.
2. User answers one negotiation question.
3. Page shows:
   `If the identity produces behavior, the installation is running.`

Website CTA:

`Run the seven-day test`

### App Interaction

Make this the daily report layer.

Daily app flow:

1. User records proof.
2. User taps negotiation level: Low, Some, Heavy.
3. If slip occurred, user logs reset action and return speed.
4. App creates a daily adjustment.
5. On Day 7, app generates the Integrity Report.

Day-seven report should answer:

- What identity did the conduct show?
- How many proof days?
- How many reset days?
- Where was negotiation highest?
- What action should repeat?
- What action should shrink?
- What reset rule worked?

### Data Model

```ts
type DailyIntegrityEntry = {
  day: number;
  proofAction: string;
  actionInSixtySeconds: boolean;
  negotiationMinutes?: number;
  negotiationLevel: "Low" | "Some" | "Heavy";
  slipped: boolean;
  resetAction?: string;
  returnSpeedMinutes?: number;
  bufferProtected?: boolean;
  dailyAdjustment: string;
};
```

### Acceptance Criteria

- Day has one required text field: proof action.
- Slip/reset path appears only when needed.
- Daily adjustment appears immediately.
- Day-seven report works after seven entries.
- Empty or imperfect weeks still produce a useful report.

## Interactive Addition 6: Seven-Day Test Tracker

### Source Appendix

Tracker columns:

- Day
- Negotiation minutes
- Proving action
- Action in 60s
- Slip
- Return speed
- Buffer protected

### Website Interaction

Show this as an animated sample table, not a form.

Website should communicate:

`You only log one tiny proof each day. The app turns it into the report.`

### App Interaction

Evidence sheet should have seven rows or seven cells only.

Recommended mobile interaction:

1. Tap today.
2. Enter proof action.
3. Toggle action in 60 seconds.
4. Select negotiation level.
5. Optional: mark slip.
6. If slip, capture reset action and return speed.
7. Save day.

### Scoring Model

The seven-day report score should be based on:

- Proof consistency: 45%
- Action immediacy: 20%
- Reset quality: 20%
- Negotiation reduction: 15%

### Acceptance Criteria

- Evidence sheet contains exactly seven days.
- No thirty-day language appears in the `1 • 60 • 7` module.
- Day-seven score changes based on logged behavior.
- User can reset the seven-day test.
- User can edit a previous day.

## Interactive Addition 7: Evidence Sheet

### Source Appendix

The paper Evidence Sheet uses marks:

- Check mark when the user lived from the card.
- Reset mark when the user slipped and reset the same day.

### Website Interaction

Use this as a teaching visual:

`Single events are noise. Repeated behavior is signal.`

Show seven marks only for the `1 • 60 • 7` product.

### App Interaction

Current app Evidence sheet should evolve into:

- Seven-day grid
- Daily proof log
- Reset marks
- Animated diagnostic bars
- Congratulations state after Day 7

Completion state:

`You completed the 1 • 60 • 7 test. Your conduct created a signal.`

### Acceptance Criteria

- Seven cells only.
- Check and reset states are visually distinct.
- Report appears after seven logged days.
- Report remains visible after completion.

## Interactive Addition 8: HALO Board

### Source Appendix

The HALO Board maps the Decided Life across zones:

- Body
- Vision
- Relationships
- Wealth
- Career
- Home
- Growth
- Adventure
- My word

### Website Interaction

Show a static-to-interactive board preview.

Visitor flow:

1. User hovers or taps a zone.
2. Zone explains what type of image or phrase belongs there.
3. CTA says `Build this in the app`.

### App Interaction

Board should be a reference point, not part of the seven-day scoring.

App flow:

1. User enters one word for the decided life.
2. User can add text captions to each domain.
3. Later version can support image upload or image search.

Keep first version text-only to avoid upload friction.

### Data Model

```ts
type HaloBoard = {
  identity: string;
  word: string;
  zones: Record<"Body" | "Vision" | "Relationships" | "Wealth" | "Career" | "Home" | "Growth" | "Adventure", {
    caption: string;
    imageUrl?: string;
  }>;
};
```

### Acceptance Criteria

- Board does not block the seven-day test.
- Board is accessible from the Base tab.
- Text captions work before image uploads are introduced.
- Board reinforces the chosen identity.

## Recommended Build Order

### PR 1: Identity Menu Data And Picker

Files likely touched:

- `src/data/identities.ts`
- `src/components/IdentityMenu.astro`
- `src/pages/index.astro`
- `src/pages/app.astro`

Outcome:

Website and app can use the same identity menu.

### PR 2: Seven-Day Evidence Model

Files likely touched:

- `src/pages/app.astro`
- `src/lib/haloScore.ts`
- `src/lib/haloStorage.ts`

Outcome:

Seven-day tracker captures proof, action immediacy, negotiation, slip, reset, and return speed.

### PR 3: Day-Seven Integrity Report

Files likely touched:

- `src/pages/app.astro`
- `src/components/HaloReport.astro`
- `src/lib/haloScore.ts`

Outcome:

Animated report explains the user's seven-day pattern and next recommended adjustment.

### PR 4: Website Appendix Previews

Files likely touched:

- `src/pages/index.astro`
- `src/components/IdentityAuditPreview.astro`
- `src/components/InstallationWorksheetPreview.astro`
- `src/components/HaloBoardPreview.astro`

Outcome:

Website teaches the appendices interactively and routes users into the app.

## First Implementation Slice

Start with the Identity Menu because it reduces onboarding friction.

Minimum useful version:

1. Add shared identity data for the 50 appendix identities.
2. Replace app chips with domain-filtered identity picker.
3. Add website preview section.
4. Populate card identity and daily question from selection.
5. Keep manual entry available.

This gives the user a better starting point without making the app heavier.
