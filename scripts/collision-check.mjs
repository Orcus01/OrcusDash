import { chromium } from 'playwright-core';
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist','--enable-gpu']});
try {
 const page=await browser.newPage();
 await page.goto('http://localhost:5173'); await page.waitForSelector('#loading.done',{timeout:120000});
 for(const id of ['courtyard','boostpark','neon','canyon','docks','jungle','lavapit','space']) {
  const result=await page.evaluate(async(id)=>{
   const g=window.kart.game; await g.loadMap(id); g.attach('probe',()=>{}); const kart=g.ensureLocal();
   let checked=0;
   for(const b of g.map.boxes) {
    if((b.y??0)!==0 || b.h<1 || b.hidden)continue;
    const start={x:b.x,y:0.45,z:b.z-b.d/2-3};
    if(Math.abs(start.x)>g.map.half-2 || Math.abs(start.z)>g.map.half-2)continue;
    if(g.map.boxes.some(o=>o!==b && Math.abs(start.x-o.x)<o.w/2+1 && Math.abs(start.z-o.z)<o.d/2+1))continue;
    if(g.map.ramps.some(r=>Math.hypot(start.x-r.x,start.z-r.z)<Math.max(r.w,r.l)/2+2))continue;
    kart.teleport(start,0);
    for(let i=0;i<180;i++){kart.fixedUpdate(1/60,{throttle:1,steer:0,drift:false},true);g.physics.step();kart.afterStep();}
    const p=kart.position;
    if(p.y<b.h-0.1 && Math.abs(p.x-b.x)<b.w/2 && p.z>b.z-b.d/2+0.1 && p.z<b.z+b.d/2)throw Error(`Penetration: ${id} ${b.kind} ${JSON.stringify(p)}`);
    if(Math.abs(p.x-b.x)<b.w/2 && p.z>b.z+b.d/2)throw Error(`Drove through ${id} ${b.kind}`);
    checked++; if(checked>=6)break;
   }
   if(!checked)throw Error(`No test obstacles for ${id}`);
   let rampHeight=null;
   const ramp=g.map.ramps.find(r=>!(r.y??0));
   if(ramp) {
    const f={x:Math.sin(ramp.rot),z:Math.cos(ramp.rot)};
    kart.teleport({x:ramp.x-f.x*(ramp.l/2+1.5),y:.45,z:ramp.z-f.z*(ramp.l/2+1.5)},ramp.rot);
    let maxY=0;
    for(let i=0;i<240;i++){kart.fixedUpdate(1/60,{throttle:1,steer:0,drift:false},true);g.physics.step();kart.afterStep();maxY=Math.max(maxY,kart.position.y);}
    if(maxY<ramp.h*.6+.4)throw Error(`Ramp blocked on ${id}: ${maxY}`);
    rampHeight=Number(maxY.toFixed(2));
   }
   return {map:id,impacts:checked,rampHeight};
  },id);
  console.log(JSON.stringify(result));
 }
}finally{await browser.close()}
