# Interactive reader tools

The homepage's Reader Tools section and the app's Tools tab render the same
`ReaderTools.astro` component and use `reader-tools.ts` for behavior.

## Included

- All 51 statements from the supplied Appendix A, including attributes, degrees,
  and daily questions. The source introduction says fifty, but contains 51 rows.
- Search, domain filtering, custom identities, and selection into the worksheet.
- Editable audit rows; five implications and an incompatible behavior worksheet.
- Single-face card, 60-second timer, and explicit action completion.
- Seven integrity questions and transfer of the next action into the card.
- Exactly seven daily records, slip/reset capture, evidence, daily recommendations,
  and a seven-day review. Missing timing data stays unknown.
- Archived tests and another seven-day cycle after seven records.
- Eight board image zones, captions, and a central word. Images are resized locally.
- Browser-local persistence, JSON export, printing, and storage-failure messages.

The appendix's 30-day evidence grid is intentionally limited to seven days in
this module, following the established product scope. Reports describe behavior;
they do not claim to diagnose health or score a person's identity.

## State and integration

The new notebook uses `halo.reader-tools.v1`. Existing app data remains in
`halo.now.1607.state.v1`. Named DOM events connect identity, proof, and reset
updates between the shared tools and the current app. Existing app proof records
are available in the new report; exact minutes are not inferred from Low/Heavy
ratings. A changed proving action invalidates previously associated timing data.

Data is local to the origin/browser, not synchronized between devices. There is
no account, server upload, or remote image storage. JSON exports contain personal
worksheet entries and images. This release does not add export re-import.

## Verification

- `npm run build` produces the static homepage and app.
- Browser-tested identity search, selection, worksheet handoff, card question,
  timer start/completion, day save, and persistence after reload.
- Verified app report displays exactly seven evidence cells at 390 x 844.
- Tested board image upload/removal and adding/removing empty audit rows.
- Existing app seven-day evidence imports into the report.

Publishing uses the existing GitHub Pages workflow on pushes to `main`.
Cross-device synchronization is not part of this change.
