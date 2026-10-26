import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {inventory,root} from './inventory.mjs';

const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const relevant=async()=>{
  const files=inventory().files.filter(f=>/^(ui|web)\//.test(f.path)).map(({path,sha256})=>({path,sha256}));
  const assets=path.join(root,'ui/assets');
  for(const name of await fs.readdir(assets,{recursive:true})) {
    const absolute=path.join(assets,name);if(!(await fs.stat(absolute)).isFile())continue;
    files.push({path:'ui/assets/'+name.replaceAll('\\','/'),sha256:digest(await fs.readFile(absolute))});
  }
  return files.sort((a,b)=>a.path.localeCompare(b.path));
};
const before=await relevant();
const executable=process.env.PARITY_TRUNK || path.join(root,'build/tooling/bin',process.platform==='win32'?'trunk.exe':'trunk');
const code=await new Promise((resolve,reject)=>{
  const child=spawn(executable,['build','--features','visual-test','--dist','../build/visual-parity/web'],{cwd:path.join(root,'web'),env:{...process.env,NO_COLOR:'true'},stdio:'inherit'});
  child.once('error',reject);child.once('exit',resolve);
});
if(code!==0)throw new Error(`Trunk failed (${code})`);
const after=await relevant();
if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('UI sources changed while building; rebuild before capturing');
const directory=path.join(root,'build/visual-parity/web');
const assets=[];
for(const name of await fs.readdir(directory)) {
  if(!/\.(html|js|wasm|css)$/.test(name))continue;
  const bytes=await fs.readFile(path.join(directory,name));assets.push({name,bytes:bytes.length,sha256:digest(bytes)});
}
await fs.writeFile(path.join(directory,'visual-build.json'),JSON.stringify({builtAt:new Date().toISOString(),feature:'visual-test',sources:after,assets},null,2));
console.log('Visual build completed and source/bundle hashes recorded.');
