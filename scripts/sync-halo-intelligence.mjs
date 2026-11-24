import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [sourceArgument, commit] = process.argv.slice(2);
if (!sourceArgument || !/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Usage: node scripts/sync-halo-intelligence.mjs SOURCE_CHECKOUT FULL_COMMIT');
const source = realpathSync(resolve(sourceArgument));
const git = (...args) => execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
if (git('rev-parse','HEAD') !== commit) throw new Error('Source checkout does not match the pinned commit');
if (!/^https:\/\/github\.com\/gordone\/halo-intelligence-mvp(?:\.git)?$/.test(git('remote','get-url','origin'))) throw new Error('Expected HALO Intelligence source repository');
if (git('status','--porcelain','--','src/halo_intelligence/ui')) throw new Error('Source UI has uncommitted changes');
const directory = realpathSync(join(source,'src/halo_intelligence/ui'));
const names=['index.html','review.js','screens.js','review.css','auth-adapter.js','example.json','free.html','free.js','free.css','free-example.json','official-blueprints.json','practice1607.js','practice1607.css','my-halo-examples.json',
  'Anton-Regular.ttf','SourceSans3-Variable.ttf','Anton-OFL.txt','SourceSans3-OFL.txt','Caveat-Variable.ttf','Caveat-OFL.txt'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = {};
const destination = join('public','halo-intelligence',commit);
mkdirSync(destination,{recursive:true}); mkdirSync('src/generated',{recursive:true});
for (const name of names) {
  const path=realpathSync(join(directory,name)); const within=relative(directory,path);
  if (within.startsWith('..') || isAbsolute(within)) throw new Error('Source assets must stay inside the UI directory');
  const raw=readFileSync(path);
  const bytes=name.endsWith('.ttf') ? raw : Buffer.from(raw.toString('utf8').replace(/\r\n/g,'\n'));
  files[name]=digest(bytes);
  if (!['index.html','free.html'].includes(name)) writeFileSync(join(destination,name),bytes);
}
let body=readFileSync(join(directory,'index.html'),'utf8').replace(/\r\n/g,'\n').match(/<body>([\s\S]*)<\/body>/i)?.[1];
if (!body || !body.includes('href="/review"')) throw new Error('Unrecognized upstream body template');
body=body.replace('href="/review"','href="/my-halo/"')
  .replace('<button id="disconnect" class="text-button" hidden>Sign out</button>',
    '<button id="disconnect" class="text-button" hidden>Sign out</button><a class="text-button" href="/settings/">Settings</a>')
  .replace('</footer>','<p><a href="/app/">Open earlier practice and saved cards</a></p></footer>');
writeFileSync('src/generated/halo-intelligence-body.html',body);
const freeBody=readFileSync(join(directory,'free.html'),'utf8').replace(/\r\n/g,'\n').match(/<body>([\s\S]*)<\/body>/i)?.[1];
if (!freeBody || !freeBody.includes('id="main"') || /<script|<iframe|onerror=/i.test(freeBody)) throw new Error('Unrecognized Free source template');
writeFileSync('src/generated/halo-intelligence-free-body.html',freeBody.replace('</footer>','<a href="/settings/">Settings &amp; analytics consent</a> <a href="/app/">Earlier practice</a></footer>'));
writeFileSync('src/generated/halo-intelligence-manifest.json',JSON.stringify({
  repository:'gordone/halo-intelligence-mvp',commit,publicPath:'/halo-intelligence/'+commit,
  files,body_template_sha256:digest(body),free_body_template_sha256:digest(readFileSync('src/generated/halo-intelligence-free-body.html')),
},null,2)+'\n');
console.log('Pinned HALO Intelligence bundle:',commit);
