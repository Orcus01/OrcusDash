// Phone check: landscape iPhone-sized touch device, drives with the floating joystick.
// Usage: npm run dev, then node scripts/mobile.mjs [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'screenshots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
});
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.BASE_URL ?? 'http://localhost:5173', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#loading.done', { timeout: 120000 });
await page.fill('input.text:not(.code)', 'Phone');
await page.click('text=Create room');
await page.waitForFunction(() => !document.querySelector('.lobby-actions button.go')?.disabled, null, { timeout: 60000 });
await page.screenshot({ path: `${OUT}/phone-lobby.png` });
await page.click('.lobby-actions button.go');
await page.waitForFunction(() => window.kart.game.phase === 'playing', null, { timeout: 20000 });
const state = () => page.evaluate(() => ({ p: window.kart.game.local.position.toArray(), yaw: window.kart.game.local.yaw, q: window.kart.game.quality }));
const s0 = await state();
// push the stick straight up for 1.5 s
await page.mouse.move(150, 280);
await page.mouse.down();
await page.mouse.move(150, 210, { steps: 5 });
await page.waitForTimeout(1500);
const s1 = await state();
// then up-right for 1 s
await page.mouse.move(200, 230, { steps: 5 });
await page.waitForTimeout(1000);
const s2 = await state();
await page.screenshot({ path: `${OUT}/phone-driving.png` });
await page.mouse.up();
const fps = await page.evaluate(() => Math.round(window.kart.game.fps));
const moved = Math.hypot(s1.p[0] - s0.p[0], s1.p[2] - s0.p[2]);
const turned = s2.yaw - s1.yaw;
console.log(JSON.stringify({ quality: s0.q, moved: moved.toFixed(1), turnedRight: turned < -0.3, yawChange: turned.toFixed(2), fps }));
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
