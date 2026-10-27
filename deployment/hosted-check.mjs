import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
if(process.stdin.isTTY)execFileSync('stty',['-echo'],{stdio:['inherit','ignore','ignore']});
const rl=createInterface({input:process.stdin});
console.log('Ready for private Site test credentials on stdin.');
const input=await new Promise(resolve=>rl.once('line',resolve));rl.close();
if(process.stdin.isTTY)execFileSync('stty',['echo'],{stdio:['inherit','ignore','ignore']});
const {token}=JSON.parse(input);
const origin='https://orcusdash.orcus-pro01.chatgpt.site';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist','--enable-gpu']});
const errors=[];let lastPage;
try {
 async function player(mobile=false){
  const c=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:720}});
  c.setDefaultTimeout(20000);
  await c.route(`${origin}/**`,route=>route.continue({headers:{...route.request().headers(),'OAI-Sites-Authorization':`Bearer ${token}`}}));
  const p=await c.newPage();lastPage=p;p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin,{waitUntil:'domcontentloaded'});console.log('Loaded hosted page:',await p.title(),new URL(p.url()).origin);await p.screenshot({path:'screenshots/hosted-loading.png'});await p.waitForSelector('#loading.done',{timeout:120000});return p;
 }
 const a=await player();console.log('Desktop booted');await a.fill('input.text:not(.code)','Cloud Host');await a.click('text=Create room');
 await a.waitForFunction(()=>document.querySelector('.code-box .code')?.textContent?.length===6);
 const code=await a.locator('.code-box .code').textContent();
 const b=await player(true);console.log('Phone booted');await b.fill('input.text:not(.code)','Phone Player');await b.fill('input.code',code);await b.getByRole('button',{name:'Join',exact:true}).click();
 await a.waitForFunction(()=>window.kart.game.players.size>=2);await a.waitForFunction(()=>!document.querySelector('.start-btn')?.disabled);
 await a.evaluate(()=>window.kart.conn.send({t:'start'}));
 await Promise.all([a.waitForFunction(()=>window.kart.game.phase==='playing'),b.waitForFunction(()=>window.kart.game.phase==='playing')]);
 const id=await b.evaluate(()=>window.kart.game.myId);
 await b.evaluate(()=>window.kart.conn.ws.close());
 await b.waitForFunction(id=>window.kart.conn.connected&&window.kart.game.myId===id&&!document.querySelector('.reconnect-overlay:not(.hidden)'),id,{timeout:15000});
 const connected=await a.evaluate(()=>({players:window.kart.game.players.size,phase:window.kart.game.phase}));
 if(connected.players<2)throw Error('Hosted players not visible');
 if(!await b.locator('.tbtn.nitro').isVisible())throw Error('Hosted mobile nitro unavailable');
 await a.screenshot({path:'screenshots/hosted-desktop.png'});await b.screenshot({path:'screenshots/hosted-phone.png'});
 await b.evaluate(()=>window.kart.ui.onLeave());await a.evaluate(()=>window.kart.ui.onLeave());
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Hosted checks passed: desktop create, mobile join, shared multiplayer match, mobile nitro controls, reconnect identity, quit, and clean browser logs.');
}catch(e){if(lastPage)await lastPage.screenshot({path:'screenshots/hosted-test-failure.png'});throw e;}finally{await browser.close();}
