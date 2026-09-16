export const haloFlywheelEvents = [
  {
    event: "halo_visit",
    meaning: "Arrived at TheHaloMethod.co or the current launch site.",
  },
  {
    event: "identity_started",
    meaning: "Entered or selected an identity statement.",
  },
  {
    event: "identity_committed",
    meaning: "Chose the final present-tense identity.",
  },
  {
    event: "proof_1_completed",
    meaning: "Completed the first action within the 60-second proof moment.",
  },
  {
    event: "artifact_generated",
    meaning: "Generated a shareable identity card or proof artifact.",
  },
  {
    event: "artifact_shared",
    meaning: "Chose to share the identity artifact.",
  },
  {
    event: "share_visit",
    meaning: "Someone followed a shared identity artifact link.",
  },
  {
    event: "seven_day_completed",
    meaning: "Finished the full 1-60-7 protocol.",
  },
  {
    event: "book_clicked",
    meaning: "Clicked from the experience into the HALO book path.",
  },
] as const;

export const haloLaunchPhases = [
  {
    title: "Flywheel V1",
    outcome:
      "Prove the core loop: idea, identity, action, evidence, share, new person.",
    items: [
      "TheHaloMethod.co/start identity entry",
      "First proof within 60 seconds",
      "Save prompt after proof, not before it",
      "Shareable identity card route",
      "Book CTA after the user experiences the method",
    ],
  },
  {
    title: "Founding 1607",
    outcome:
      "Recruit and track 1,607 launch participants, with the First 167 completers as the public honor roll.",
    items: [
      "Founding 1607 cohort pipeline",
      "First 167 completion badge",
      "Day 1 through Day 7 evidence capture",
      "Opt-in story collection for high-signal completers",
      "At-risk and completion dashboard views",
    ],
  },
  {
    title: "Book Integration",
    outcome:
      "Make HALO measurable by linking book moments to identity starts and completions.",
    items: [
      "/start/book-opening",
      "/start/book-1607",
      "/start/book-end",
      "Book reader attribution events",
      "App-to-book CTA after early proof",
    ],
  },
  {
    title: "Lifecycle Automation",
    outcome:
      "Use lifecycle emails to increase seven-day completion, not just signups.",
    items: [
      "Day 0 save reminder",
      "Daily proof prompt",
      "Missed-day reset nudge",
      "Day 7 completion email",
      "Referral and book CTA follow-up",
    ],
  },
] as const;

export const founding1607Metrics = [
  {
    label: "Invited",
    target: 1607,
    description: "Total launch cohort capacity.",
  },
  {
    label: "Identity starts",
    target: null,
    description: "People who choose or begin writing an identity.",
  },
  {
    label: "Proof #1",
    target: null,
    description: "People who complete the first 60-second proof.",
  },
  {
    label: "Active today",
    target: null,
    description: "Participants with evidence or reset activity today.",
  },
  {
    label: "Seven-day completions",
    target: null,
    description: "Completed 1-60-7 identities.",
  },
  {
    label: "First 167 claimed",
    target: 167,
    description: "Public honor-roll slots awarded to the first completers.",
  },
] as const;

export const founding1607Views = [
  "Founding 1607 Pipeline",
  "First 167 Completers",
  "At Risk Today",
  "Shared Artifact",
  "Story Candidates",
  "Partner / Coach Leads",
] as const;
