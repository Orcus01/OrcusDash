// Frame-time benchmark while driving. Usage: npm run dev, then node scripts/bench.mjs [maps…]
import { chromium } from 'playwright-core';
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['neon', 'canyon', 'docks', 'jungle', 'lavapit', 'space'];
const names = { courtyard: 'Classic Courtyard', boostpark: 'Boost Park', neon: 'Downtown', canyon: 'Desert Canyon', docks: 'Harbor Docks', jungle: 'Jungle Temple', lavapit: 'Lava Pit', space: 'Space Station' };
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
});
for (const map of maps) {
  const row = [map];
  for (const q of ['ultra', 'high', 'low']) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await page.addInitScript((q) => localStorage.setItem('kc-quality2', q), q);
    await page.goto(process.env.BASE_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loading.done', { timeout: 120000 });
    await page.fill('input.text:not(.code)', 'Bench');
    await page.click('text=Create room');
    await page.waitForSelector('.map-card');
    await page.evaluate((n) => [...document.querySelectorAll('.map-card')].find((c) => c.textContent.includes(n))?.click(), names[map]);
    await page.waitForFunction((id) => window.kart.game.loadedMapId === id, map, { timeout: 120000 });
    await page.waitForFunction(() => !document.querySelector('.lobby-actions button.go').disabled, null, { timeout: 60000 });
    await page.click('.lobby-actions button.go');
    await page.waitForFunction(() => window.kart.game.phase === 'playing', null, { timeout: 20000 });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500); // warm-up
    const ft = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const times = [];
          let last = performance.now();
          const end = last + 4000;
          const tick = (t) => {
            times.push(t - last);
            last = t;
            if (t < end) requestAnimationFrame(tick);
            else resolve(times);
          };
          requestAnimationFrame(tick);
        }),
    );
    await page.keyboard.up('KeyW');
    ft.sort((a, b) => a - b);
    const med = ft[Math.floor(ft.length / 2)];
    const p95 = ft[Math.floor(ft.length * 0.95)];
    row.push(`${q}: ${Math.round(1000 / med)}fps (p95 ${Math.round(1000 / p95)})`);
    await page.context().close();
  }
  console.log(row.join('  |  '));
}
await browser.close();
