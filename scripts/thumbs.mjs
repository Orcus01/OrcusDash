// Renders a thumbnail of every arena for the lobby map picker → client/public/thumbs/<id>.webp
// Usage: npm run dev (in another terminal), then: node scripts/thumbs.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = 'client/public/thumbs';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
});
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
await page.addInitScript(() => localStorage.setItem('kc-quality2', 'ultra'));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loading.done', { timeout: 120000 });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['courtyard', 'boostpark', 'neon', 'canyon', 'docks', 'jungle', 'lavapit', 'space'];
const outputs = [];
for (const id of ids) {
  await page.evaluate((id) => window.kart.game.loadMap(id), id);
  await page.waitForFunction((id) => window.kart.game.loadedMapId === id, id, { timeout: 120000 });
  await page.evaluate(() => {
    document.getElementById('ui').style.display = 'none';
    const g = window.kart.game;
    // aerial three-quarter view
    g.camPos.set(g.map.half * 0.75, g.map.half * 0.42, g.map.half * 0.75);
    g.camTarget.set(0, 0, 0);
    g.orbit = Math.PI / 4;
  });
  await page.waitForTimeout(2500);
  const png = await page.screenshot();
  outputs.push([`${OUT}/${id}.webp`, await sharp(png).resize(400, 225).webp({ quality: 80 }).toBuffer()]);
  console.log('thumb', id);
  await page.evaluate(() => (document.getElementById('ui').style.display = ''));
}
await browser.close();
for (const [path, data] of outputs) writeFileSync(path, data);
