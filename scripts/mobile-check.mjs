// Touch regression check. Start the game servers, then run npm run e2e:mobile.
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist','--enable-gpu']});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(process.env.BASE_URL??'http://localhost:5173'); await page.waitForSelector('#loading.done',{timeout:120000});
 await page.click('.quick-play'); await page.waitForFunction(()=>window.kart.game.phase==='playing');
 const cdp=await context.newCDPSession(page);
 const centers=await page.evaluate(()=>{const s=document.querySelector('.stick').getBoundingClientRect(),f=document.querySelector('.tbtn.fire').getBoundingClientRect();return {sx:s.x+s.width/2,sy:s.y+s.height/2,fx:f.x+f.width/2,fy:f.y+f.height/2};});
 const point=(id,x,y)=>({id,x,y,radiusX:8,radiusY:8,force:1});
 const drive=point(1,centers.sx+12,centers.sy-42);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,centers.sx,centers.sy)]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[drive]});
 const input=await page.evaluate(()=>({throttle:window.kart.game.input.touchThrottle,steer:window.kart.game.input.touchSteer}));
 if(input.throttle<.6||input.steer>.5||input.steer<=0)throw Error('Joystick response is not gradual');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[drive,point(2,centers.fx,centers.fy)]});
 if(!await page.evaluate(()=>window.kart.game.input.touchFire&&window.kart.game.input.touchThrottle>0))throw Error('Cannot drive and fire together');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 if(await page.evaluate(()=>window.kart.game.input.touchFire||window.kart.game.input.touchThrottle!==0))throw Error('Cancelled touch left controls active');
 await page.setViewportSize({width:844,height:390}); await page.waitForTimeout(500);
 await page.click('[aria-label="Pause"]'); await page.click('text=Resume game');
 if(!await page.evaluate(()=>window.kart.game.renderer.webgl.getContext().getContextAttributes().antialias))throw Error('Phone anti-aliasing is disabled');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Mobile checks passed: gradual joystick, simultaneous drive/fire, cancellation, rotation, pause/resume, anti-aliasing, and clean browser logs.');
} finally {await browser.close()}
