# Reader library

The public library lives at `/book/`. Approved chapters are maintained in
`src/data/book-chapters.ts`. No chapter titles or materials are assumed.

Add each chapter's number, unique slug, title, description, and materials.
Each material has a title, description, href, and format (PDF, audio, worksheet,
or article). Put public downloads in `public/book/` and link to `/book/filename`.
Publish only approved reader content; files in public are accessible to anyone.
Empty chapters show a coming-soon message. Chapters sort by number and have
stable anchors such as `/book/#chapter-slug`. Run `npm run build` before release.

## Mobile release sequence

1. Finish and test the mobile web app, including seven-day progression, reset,
   report, accessibility, offline behavior, data export, and recovery.
2. Decide whether entries remain device-local or sync between devices. Do not
   imply that existing browser localStorage automatically transfers to native apps.
3. Evaluate a shared iOS/Android wrapper versus native implementation, including
   store requirements, secure storage, deep links, and keyboard/safe-area behavior.
4. Prepare Apple and Google developer accounts under the owner's control;
   privacy disclosures, support pages, signing, and store assets are release gates.
5. Test on physical iPhone and Android devices and distribute beta builds before
   store submission. The current website is not a submitted native application.
