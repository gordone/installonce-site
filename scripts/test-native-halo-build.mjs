import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
for(const path of ['index','app/index','my-halo/index','community/index','settings/index','business-dashboard/index','1607/index']) {
  assert.ok(existsSync('dist/'+path+'.html'),'Missing route '+path);
}
const body=readFileSync('dist/my-halo/index.html','utf8');
assert.ok(body.includes('halo-signin-dialog')&&body.includes('Content-Security-Policy'));
assert.ok(body.includes('https://thehalomethod.co/my-halo/'));
assert.ok(!body.includes('fonts.googleapis.com'));
console.log('Native My HALO and existing production routes verified');

const home=readFileSync('dist/index.html','utf8');
const enabled=process.env.PUBLIC_HALO_INTELLIGENCE_ENABLED==='1';
assert.ok(home.includes('href="'+(enabled?'/my-halo/':'/app/')+'"'),'Rollout navigation mismatch');
assert.equal(body.includes('Account connection is being configured'),!enabled,'Configured native page mismatch');
