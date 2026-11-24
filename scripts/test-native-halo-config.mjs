import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiOrigin, authOrigin, isPublicProjectKey, intelligenceConfig } from '../src/lib/halo-intelligence-config.mjs';
const values = { PUBLIC_HALO_INTELLIGENCE_API_URL:'https://api.halo.test',
  PUBLIC_SUPABASE_URL:'https://synthetic.supabase.co',
  PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_synthetic_public_project_key',
  PUBLIC_HALO_INTELLIGENCE_ENABLED:'1' };
test('valid explicit configuration switches the native navigation only when enabled',()=>{
  assert.equal(intelligenceConfig(values).myHaloPath,'/my-halo/dashboard/');
  assert.equal(intelligenceConfig({...values,PUBLIC_HALO_INTELLIGENCE_ENABLED:'0'}).myHaloPath,'/app/');
  assert.equal(intelligenceConfig({}).configured,false);
});
for(const value of ['http://api.halo.test','https://u:p@api.halo.test','https://api.halo.test/',
  'https://api.halo.test/path','https://api.halo.test?key=PRIVATE','javascript:alert(1)', '*']) {
  test('reject noncanonical or unsafe API origin '+value.split('?')[0],()=>{
    assert.equal(apiOrigin(value),null);
    assert.throws(()=>intelligenceConfig({...values,PUBLIC_HALO_INTELLIGENCE_API_URL:value}),
      error=>!error.message.includes('PRIVATE'));
  });
}
test('Auth project must use the pinned Supabase cloud origin',()=>{
  assert.equal(authOrigin('https://synthetic.supabase.co'), 'https://synthetic.supabase.co');
  assert.equal(authOrigin('https://supabase.co.evil.test'), null);
  assert.equal(authOrigin('https://supabase.co'), null);
});
test('only publishable/anon project keys pass; service role/private keys fail',()=>{
  const jwt=(role)=>'header.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.synthetic-signature';
  assert.ok(isPublicProjectKey(values.PUBLIC_SUPABASE_ANON_KEY));
  assert.ok(isPublicProjectKey(jwt('anon')));
  for(const key of ['sk-test-private', jwt('service_role'), '', null, 'short', 'sb_secret_not_public']) {
    assert.equal(isPublicProjectKey(key),false);
  }
});
test('enabled incomplete configuration fails the build without exposing supplied values',()=>{
  for(const key of ['PUBLIC_HALO_INTELLIGENCE_API_URL','PUBLIC_SUPABASE_URL','PUBLIC_SUPABASE_ANON_KEY']) {
    assert.throws(()=>intelligenceConfig({...values,[key]:'PRIVATE'}),error=>!error.message.includes('PRIVATE'));
  }
});

test('tier UI is explicit and uses the domain root as the app entry',()=>{
  const values={PUBLIC_HALO_INTELLIGENCE_ENABLED:'1',PUBLIC_HALO_INTELLIGENCE_API_URL:'https://api.halo.test',PUBLIC_SUPABASE_URL:'https://synthetic.supabase.co',PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_synthetic_public_project_key',PUBLIC_HALO_TIERS_ENABLED:'1'};
  assert.equal(intelligenceConfig(values).tiersEnabled,true);
  assert.equal(intelligenceConfig(values).myHaloPath,'/');
  assert.throws(()=>intelligenceConfig({...values,PUBLIC_HALO_TIERS_ENABLED:'true'}));
});
