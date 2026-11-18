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
    if(name==='index.html')continue;
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
