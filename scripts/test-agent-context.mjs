import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
const workflow = JSON.parse(await readFile(new URL('../workflows/n8n/halo-launch-agent-team.json',import.meta.url),'utf8'));
function execute(name,context) {
  const node = workflow.nodes.find(node=>node.name === name);
  return runInNewContext('(function(){' + node.parameters.jsCode + '\n})()',context);
}
const brief = execute('Launch Director brief',{
  $input:{first:()=>({json:{results:[['halo_visit',1,1]]}})},
  $now:{toFormat:()=> '2026-11-11',plus:()=>({toFormat:()=> '2026-11-18'})},
})[0].json;
assert.equal(brief.launchStartTarget,10000);
assert.equal(brief.launchTargetMetric,'1·60·7 starts');
assert.equal(brief.approvedCanonicalAssetsProvided,false);
assert.equal(brief.activeCampaigns,undefined);
assert(brief.plannedMilestonesRequiringVerification.every(task=>task.status === 'Current completion status unverified'));
const requests = execute('Prepare six specialist roles',{$input:{first:()=>({json:brief})}});
assert.equal(requests.length,6);
assert(requests.every(item=>JSON.stringify(item.json.request.text.format.schema.properties.proposals.items.properties.type.enum) === '["internal_task"]'));
const publicResponse = {status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Draft ready',evidence:[],missing_inputs:[],proposals:[{type:'public_content',title:'Unsupported announcement',draft:'Invented public claim'}]})}]}]};
const director = execute('Prepare Launch Director',{
  $input:{all:()=>requests.map(()=>({json:publicResponse}))},
  $:name=>name === 'Launch Director brief' ? {first:()=>({json:brief})} : {itemMatching:index=>requests[index]},
})[0].json;
assert(director.specialistReports.every(report=>report.proposals.length === 0));
const compiled = execute('Compile report and review items',{
  $input:{first:()=>({json:publicResponse})},$execution:{id:'context-test'},
  $:name=>({first:()=>({json:name === 'Prepare Launch Director' ? director : brief})}),
})[0].json;
assert.equal(compiled.pendingReview.length,0);
assert.equal(compiled.source_execution,'halo-marketing-os:context-test');
assert(workflow.nodes.every(node=>node.credentials === undefined));
console.log('Agent context regressions passed: historical statuses, analytics scope, internal-only schema and parser gate.');
