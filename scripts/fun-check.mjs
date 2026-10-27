import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist','--enable-gpu']});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173');await page.waitForSelector('#loading.done',{timeout:120000});
 await page.click('.quick-play');await page.waitForFunction(()=>window.kart.game.phase==='playing');
 const cdp=await context.newCDPSession(page);
 const points=await page.evaluate(()=>['.stick','.tbtn.nitro','.tbtn.fire'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}));
 const pt=(i,p)=>({id:i,x:p.x,y:p.y,radiusX:6,radiusY:6,force:1});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(1,points[0])]});
 const drive=pt(1,{x:points[0].x,y:points[0].y-45});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[drive]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[drive,pt(2,points[1]),pt(3,points[2])]});
 if(!await page.evaluate(()=>{const i=window.kart.game.input;return i.touchThrottle>.7&&i.touchNitro&&i.touchFire;}))throw Error('Drive + nitro + fire failed');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 if(await page.evaluate(()=>{const i=window.kart.game.input;return i.touchThrottle||i.touchNitro||i.touchFire;}))throw Error('Touch cancellation left active inputs');
 const result=await page.evaluate(()=>{
  const g=window.kart.game;g.setPaused(true);g.send=()=>{};const k=g.local;
  const step=(input,enabled=true)=>{k.fixedUpdate(1/60,input,enabled);g.physics.step();k.afterStep();};
  k.teleport({x:45,y:.45,z:-25},0);let maxSpeed=0;
  for(let i=0;i<115;i++){step({throttle:1,steer:0,drift:false,nitro:true});maxSpeed=Math.max(maxSpeed,k.forwardSpeed);}
  if(maxSpeed<14.5||maxSpeed>15.5||k.nitro.fuel>.1)throw Error(`Nitro speed ${maxSpeed}, fuel ${k.nitro.fuel}, map ${g.map.id}, pos ${JSON.stringify(k.position)}`);
  const fuel=k.nitro.fuel;for(let i=0;i<60;i++)step({throttle:1,steer:0,drift:false,nitro:true},false);
  if(k.nitro.active||Math.abs(k.nitro.fuel-fuel)>.0001)throw Error('Pause affected tank');
  k.teleport({x:40,y:12,z:0},0);k.nitro.fuel=.2;k.body.setLinvel({x:0,y:0,z:10},true);
  let rewarded=0;k.onBigAir=()=>rewarded++;
  for(let i=0;i<90;i++)step({throttle:1,steer:0,drift:false});
  if(rewarded!==1||k.nitro.fuel<.45)throw Error('Big air landing reward missing or duplicated');
  k.nitro.fuel=.1;
  g.onEvent({type:'kill',killer:g.myId,victim:'training-target',weapon:'rocket'});
  if(Math.abs(k.nitro.fuel-.5)>.001)throw Error('KO nitro reward missing');
  k.teleport({x:45,y:.45,z:-25},0);k.boosting=10;
  for(let i=0;i<120;i++){step({throttle:1,steer:0,drift:false});if(k.forwardSpeed>15.01)throw Error('Sustained turbo exceeded speed cap');}
  return {maxSpeed:Number(maxSpeed.toFixed(2)),landingRewards:rewarded,koRefill:'passed',sustainedBoostCap:'passed'};
 });
 await page.evaluate(()=>{window.kart.game.setPaused(false);});
 await page.screenshot({path:'screenshots/nitro-phone.png'});
 await page.setViewportSize({width:844,height:390});
 const rects=await page.evaluate(()=>['nitro','fire','drift'].map(c=>{const r=document.querySelector(`.tbtn.${c}`).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
 for(const r of rects)if(r.x<0||r.y<0||r.right>844||r.bottom>390)throw Error('Offscreen landscape action');
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y)throw Error('Landscape actions overlap');}
 if(errors.length)throw Error(errors.join('\n'));
 await page.evaluate(()=>window.kart.ui.onLeave());
 console.log('Fun checks passed:',result,'simultaneous drive/nitro/fire, cancel reset, pause tank freeze, and landscape button spacing.');
}finally{await browser.close();}
