import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest=JSON.parse(readFileSync('src/generated/halo-intelligence-manifest.json','utf8'));
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
test('bundled source is pinned and every public file matches its recorded hash',()=>{
  assert.match(manifest.commit,/^[a-f0-9]{40}$/);
  assert.equal(manifest.repository,'gordone/halo-intelligence-mvp');
  assert.equal(manifest.publicPath,'/halo-intelligence/'+manifest.commit);
  for(const [name,digest]of Object.entries(manifest.files)) {
    if(['index.html','free.html'].includes(name))continue;
    assert.equal(hash(readFileSync('public'+manifest.publicPath+'/'+name)),digest,name);
  }
  assert.equal(hash(readFileSync('src/generated/halo-intelligence-body.html')),manifest.body_template_sha256);
});
test('native body preserves workflows and links to legacy practice/settings without embedding code',()=>{
  const body=readFileSync('src/generated/halo-intelligence-body.html','utf8');
  for(const id of ['generate-form','intention','horizon','review','conditions','actions','cycle-form',
    'cycle-review-form','delete-form','reports','replan-form'])assert.ok(body.includes('id="'+id+'"'),id);
  assert.ok(body.includes('href="/my-halo/"')&&body.includes('href="/settings/"')&&body.includes('href="/app/"'));
  assert.ok(!/<script|<iframe|onerror=/i.test(body));
  assert.match(readFileSync('public'+manifest.publicPath+'/review.js','utf8'),/from "\.\/auth-adapter\.js"/);
  assert.ok(readFileSync('public'+manifest.publicPath+'/review.css','utf8').includes("url('./Anton-Regular.ttf')"));
});

test('Free template is hashed and preserves native auth without scripts or private content',()=>{
  const body=readFileSync('src/generated/halo-intelligence-free-body.html','utf8');
  assert.equal(hash(body),manifest.free_body_template_sha256);
  for(const id of ['main','connect','sign-out','editor','edit-form'])assert.ok(body.includes('id="'+id+'"'));
  assert.ok(!/<script|<iframe|onerror=/i.test(body));
  assert.ok(body.includes('/settings/') && body.includes('/app/'));
});

test('root migration preserves landing page, aliases and the sign-in return route',()=>{
  const page=readFileSync('src/pages/index.astro','utf8');
  const alias=readFileSync('src/pages/my-halo.astro','utf8');
  const app=readFileSync('src/components/MyHaloApp.astro','utf8');
  assert.ok(page.includes('MyHaloApp')&&alias.includes('MyHaloApp'));
  assert.ok(readFileSync('src/pages/method.astro','utf8').includes('Better decisions.'));
  assert.ok(app.includes('href="https://thehalomethod.co/"'));
  assert.ok(app.includes("redirectTo: new URL('/my-halo/', location.origin).href"));
  assert.ok(app.includes('experience: config.tiersEnabled ? "streamlined"'));
  for(const name of ['practice1607.js','practice1607.css','my-halo-examples.json']) assert.ok(manifest.files[name]);
  const rules=readFileSync('render.yaml','utf8');
  assert.match(rules,/path: \/\s+name: Cache-Control\s+value: private, no-store/);
});
