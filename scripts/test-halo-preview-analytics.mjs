import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPreviewCapture,previewProperties} from '../src/scripts/halo-preview-analytics.mjs';
const visitor='11111111-1111-4111-8111-111111111111';
test('preview schemas drop all private fields and reject unknown values',()=>{
  const result=previewProperties({event:'halo_preview_feature_used',tier:'plus_preview',feature:'evidence',email:'private',plan:'private',owner:'private'});
  assert.equal(result.feature,'evidence'); assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal(previewProperties({event:'halo_preview_active',tier:'admin',feature:'today'}),null);
  assert.equal(previewProperties({event:'halo_preview_price_feedback',tier:'free',choice:'free text'}),null);
});
test('consent DNT and GPC guard all tracking; opted-in events retain random visitor for retention',async()=>{
  const data=new Map(),sent=[];
  const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const navigator={};
  const capture=createPreviewCapture({storage,navigator,token:'phc_synthetic',randomId:()=>visitor,fetcher:async(url,options)=>{sent.push({url,...options});}});
  const event={event:'halo_preview_active',tier:'free',feature:'today'};
  assert.equal(capture(event),false); assert.equal(sent.length,0);
  data.set('halo.analytics.opt-in','yes'); navigator.doNotTrack='1'; assert.equal(capture(event),false);
  navigator.doNotTrack='0'; navigator.globalPrivacyControl=true; assert.equal(capture(event),false);
  navigator.globalPrivacyControl=false; assert.equal(capture(event),true); assert.equal(capture(event),true);
  assert.equal(JSON.parse(sent[0].body).properties.distinct_id,visitor);
  assert.equal(JSON.parse(sent[1].body).properties.distinct_id,visitor);
  assert.equal(sent[0].credentials,'omit'); assert.equal(sent[0].referrerPolicy,'no-referrer');
});
