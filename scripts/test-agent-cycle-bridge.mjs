import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function auth.role() returns text language sql as $$ select current_setting('test.role',true) $$;
create table public.halo_launch_staff(user_id uuid primary key);
grant select on public.halo_launch_staff to authenticated;
grant usage on schema auth to authenticated;`);
for (const file of ['20261110180000_halo_virtual_organization.sql','20261111160000_halo_agent_cycle_inbox.sql']) {
  await db.exec(await readFile(new URL('../supabase/migrations/' + file,import.meta.url),'utf8'));
}
const report = { role:'Launch Director',status:'completed',summary:'Establish verified goal baselines.',
  evidence:['Approved aggregate report'],missingInputs:['Current participation totals'],
  proposals:[{type:'internal_task',title:'Verify baseline',draft:'Read approved aggregates.',status:'approved'}] };
async function ingest(id,reports) {
  return (await db.query('select public.halo_ingest_agent_cycle($1,$2) as id',[id,reports])).rows[0].id;
}
let checks = 0;
async function rejects(action,pattern) { await assert.rejects(action,pattern); checks++; }
await rejects(()=>ingest('test-1',[report]),/Worker service access/);
await db.exec("set test.role='service_role';");
const id = await ingest('test-1',[report]);
assert.equal(await ingest('test-1',[report]),id); checks++;
assert.equal((await db.query("select count(*) from public.halo_agent_audit where event='agent_cycle_received'")).rows[0].count,1); checks++;
const stored = (await db.query('select * from public.halo_agent_cycles')).rows[0];
assert.equal(stored.reports[0].proposals[0].status,'pending_review'); checks++;
await rejects(()=>ingest('test-1',[{...report,summary:'Changed'}]),/different content/);
await rejects(()=>ingest('test-2',[{...report,role:'Unknown'}]),/Unknown/);
await rejects(()=>ingest('test-2',[report,report]),/repeated/);
await rejects(()=>ingest('test-2',[{...report,evidence:[{secret:'raw provider response'}]}]),/bounded strings/);
await rejects(()=>ingest('test-2',[{...report,proposals:[{type:'execute_now',title:'Bad',draft:'No'}]}]),/Invalid proposal/);
await rejects(()=>ingest('test-2',[{...report,summary:''}]),/Incomplete/);
await ingest('test-failed',[{role:'Launch Director',status:'failed',error:{secret:'discard me'},proposals:[{type:'execute_now'}]}]);
const failure = (await db.query("select * from public.halo_agent_cycles where source_execution='test-failed'")).rows[0];
assert.equal(failure.status,'failed'); checks++;
assert.equal(failure.reports[0].error,undefined); checks++;
await db.exec('set role authenticated;');
await rejects(()=>ingest('test-forbidden',[report]),/permission denied/);
assert.equal((await db.query('select count(*) from public.halo_agent_cycles')).rows[0].count,0); checks++;
await db.close();

let handler;
const env = {HALO_N8N_INGEST_TOKEN:'test-only-shared-secret-32-characters',SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key'};
let upstreamCalls = 0;
const source = await readFile(new URL('../supabase/functions/halo-agent-cycle/index.ts',import.meta.url),'utf8');
runInNewContext(stripTypeScriptTypes(source),{
  Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn;}},crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Response,AbortSignal,
  fetch:async(_url,options)=>{
    upstreamCalls++;
    const payload = JSON.parse(options.body);
    assert.deepEqual(Object.keys(payload).sort(),['reports','source_execution']);
    return new Response(JSON.stringify('saved-cycle-id'),{status:200});
  },
});
function request(body,token=env.HALO_N8N_INGEST_TOKEN) {
  return new Request('https://gateway.example',{method:'POST',headers:{'content-type':'application/json','x-halo-ingest-token':token},body});
}
assert.equal((await handler(request('{}','wrong'))).status,401); checks++;
assert.equal(upstreamCalls,0); checks++;
assert.equal((await handler(request('{'))).status,400); checks++;
assert.equal((await handler(request('{}'))).status,400); checks++;
assert.equal((await handler(request('x'.repeat(220001)))).status,413); checks++;
assert.equal((await handler(request(JSON.stringify({source_execution:'run-1',reports:[report],extra:'discard'})))).status,200); checks++;
assert.equal(upstreamCalls,1); checks++;
assert.equal((await handler(new Request('https://gateway.example'))).status,405); checks++;
const template = JSON.parse(await readFile(new URL('../workflows/n8n/halo-cycle-delivery.json',import.meta.url),'utf8'));
const envelopeCode = template.nodes.find(node=>node.name === 'Prepare delivery').parameters.jsCode;
const healthCode = template.nodes.find(node=>node.name === 'Enforce cycle health').parameters.jsCode;
function execute(code,context) { return runInNewContext('(function(){' + code + '\n})()',context); }
const payload = {source_execution:'parent-42',reports:[report]};
const envelope = execute(envelopeCode,{$input:{first:()=>({json:payload})}});
assert.equal(envelope[0].json.source_execution,'parent-42'); checks++;
assert.throws(()=>execute(envelopeCode,{$input:{first:()=>({json:{reports:[report]}})}}),/stable parent/); checks++;
const workflowContext = reports=>({
  $:()=>({first:()=>({json:{...payload,reports}})}),
  $input:{first:()=>({json:{status:'received',cycle_id:'cycle-42'}})},
});
assert.equal(execute(healthCode,workflowContext([report]))[0].json.status,'completed'); checks++;
assert.equal(execute(healthCode,workflowContext([report,{role:'PR Agent',status:'failed'}]))[0].json.status,'partial'); checks++;
assert.throws(()=>execute(healthCode,workflowContext([{role:'PR Agent',status:'failed'}])),/Failure reports were saved/); checks++;
console.log(`${checks} cycle ingestion and gateway checks passed. Production services were not accessed.`);
