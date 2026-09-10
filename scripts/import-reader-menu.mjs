import { readFileSync, writeFileSync } from 'node:fs';
const lines = readFileSync(process.argv[2], 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const end = lines.indexOf('Identity Audit');
const identities = [];
for (let i = 0; i < end; i++) {
  if (/^\d+$/.test(lines[i]) && /^I (am|sleep|nourish|communicate|forgive|operate|build|sell|belong|speak|ship|follow|regulate|invest|live|leave|make)/.test(lines[i + 2] || '')) {
    identities.push({ id: Number(lines[i]), domain: lines[i + 1], statement: lines[i + 2], attributes: lines[i + 3], degrees: lines[i + 4].split('→').map(s => s.trim()), question: lines[i + 5] });
  }
}
if (identities.length !== 51) throw new Error(`Expected 51 identities; found ${identities.length}`);
writeFileSync(new URL('../src/data/reader-identities.json', import.meta.url), JSON.stringify(identities, null, 2) + '\n');
