import { chromium } from 'playwright'; import fs from 'node:fs';
const [stems, jobsFile] = process.argv.slice(2); const jobs=JSON.parse(fs.readFileSync(jobsFile,'utf8'));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}); const p=await b.newPage({viewport:{width:900,height:900}});
p.on('console',m=>{ if(m.type()==='error') console.log('ERR',m.text())}); p.on('pageerror',e=>console.log('PAGEERR',e.message));
await p.goto('http://localhost:8765/'+(process.env.PAGE||'index.html')+'?stems='+stems); await p.waitForFunction('window.ready===true',null,{timeout:90000});
for(const j of jobs){ await p.evaluate(j=>pose(j.stem,j.clip,j.t,j.hold,j.rep,j.team,j.head,j.extra),j); for(const v of j.views){ const url=await p.evaluate(v=>shot(v.target,v.dist,v.yaw,v.pitch,v.fov,v.hide),v); fs.writeFileSync(`out/${j.name}_${v.n}.jpg`,Buffer.from(url.split(',')[1],'base64')); } }
await b.close(); console.log('ok');
