import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
for(const path of ['index','method/index','app/index','my-halo/index','my-halo/dashboard/index','my-halo/overview/index','my-halo/plus/index','community/index','settings/index','business-dashboard/index','1607/index']) {
  assert.ok(existsSync('dist/'+path+'.html'),'Missing route '+path);
}
const body=readFileSync('dist/my-halo/index.html','utf8');
assert.ok(body.includes('halo-signin-dialog')&&body.includes('Content-Security-Policy'));
assert.ok(body.includes('https://thehalomethod.co/'));
assert.ok(readFileSync('dist/index.html','utf8').includes('halo-signin-dialog'));
assert.ok(readFileSync('dist/method/index.html','utf8').includes('Better decisions.'));
assert.ok(!body.includes('fonts.googleapis.com'));
console.log('Native My HALO and existing production routes verified');

const home=readFileSync('dist/method/index.html','utf8');
const enabled=process.env.PUBLIC_HALO_INTELLIGENCE_ENABLED==='1';
assert.ok(home.includes('href="'+(enabled?(process.env.PUBLIC_HALO_TIERS_ENABLED==='1'?'/':'/my-halo/dashboard/'):'/app/')+'"'),'Rollout navigation mismatch');
assert.equal(body.includes('Account connection is being configured'),!enabled,'Configured native page mismatch');

if(process.env.PUBLIC_HALO_TIERS_ENABLED==='1') { assert.ok(body.includes('id="tier-label"')); assert.ok(!body.includes('id="dashboard-screen"')); }
