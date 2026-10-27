import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist','--enable-gpu']});
try {
 const page=await browser.newPage();await page.goto('http://localhost:5173');await page.waitForSelector('#loading.done',{timeout:120000});
 const result=await page.evaluate(async()=>{
  const {game:g,ui}=window.kart,ids=['courtyard','space','neon','canyon','docks','jungle','lavapit','boostpark'];
  for(const id of ids)await g.loadMap(id);
  const before={...g.renderer.info.memory};for(const id of ids)await g.loadMap(id);const after={...g.renderer.info.memory};
  if(after.geometries>before.geometries+5||after.textures>before.textures+5)throw Error(`Arena resource growth: ${JSON.stringify({before,after})}`);
  const Model=ui.garage.kart.constructor;
  const initial={...g.renderer.info.memory};
  for(let i=0;i<4;i++) {
   const model=new Model('#2f7cf6');model.setWeapon('rocket');g.scene.add(model.root);g.renderer.webgl.render(g.scene,g.camera);model.dispose();g.renderer.webgl.render(g.scene,g.camera);
  }
  const final={...g.renderer.info.memory};
  if(final.geometries>initial.geometries+2||final.textures>initial.textures+2)throw Error(`Kart resource growth: ${JSON.stringify({initial,final})}`);
  return {arenas:{before,after},karts:{initial,final}};
 });console.log('Resource lifecycle checks passed:',JSON.stringify(result));
}finally{await browser.close()}
