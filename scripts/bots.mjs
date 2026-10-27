// Combat smoke test: two in-page bots grab crates and fight. Verifies pickups, firing, hits and scoring.
// Usage: npm run dev (in another terminal), then: node scripts/bots.mjs [outDir] [mapId] [seconds]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.argv[2] ?? 'screenshots';
const MAP = process.argv[3] ?? 'town';
const SECONDS = Number(process.argv[4] ?? 30);
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: process.env.SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
});
const errors = [];

async function player(name) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] ${m.text()}`));
  return page;
}

/** Simple steering bot running inside the page: crates first, then hunt the nearest rival. */
function startBot() {
  const g = window.kart.game;
  const stats = (window.botStats = { fired: 0, events: {} });
  const origOnEvent = g.onEvent.bind(g);
  g.onEvent = (e) => {
    stats.events[e.type] = (stats.events[e.type] ?? 0) + 1;
    origOnEvent(e);
  };
  setInterval(() => {
    const local = g.local;
    const input = g.input;
    if (!local?.alive || g.phase !== 'playing') {
      input.touchThrottle = 0;
      input.touchFire = false;
      return;
    }
    const pos = local.position;
    let target = null;
    if (!g.myWeapon) {
      let best = Infinity;
      for (const c of g.entities.crates) {
        if (!c.available) continue;
        const d = Math.hypot(c.base.x - pos.x, c.base.z - pos.z);
        if (d < best) {
          best = d;
          target = c.base;
        }
      }
    } else {
      let best = Infinity;
      for (const r of g.remotes.values()) {
        if (!r.model.root.visible) continue;
        const d = r.position.distanceTo(pos);
        if (d < best) {
          best = d;
          target = r.position;
        }
      }
    }
    if (!target) {
      input.touchThrottle = 0.5;
      input.touchSteer = 0.5;
      return;
    }
    const desired = Math.atan2(target.x - pos.x, target.z - pos.z);
    let diff = desired - local.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    input.touchSteer = Math.max(-1, Math.min(1, -diff * 2.5));
    input.touchThrottle = Math.abs(diff) > 1.2 ? 0.5 : 1;
    // Unstick: reverse briefly if we're pushing into a wall.
    if (Math.abs(local.forwardSpeed) < 1 && Math.random() < 0.1) input.touchThrottle = -1;
    const aligned = Math.abs(diff) < 0.25;
    const w = g.myWeapon;
    const fire = w === 'shield' || w === 'mine' || (aligned && (w === 'gun' || w === 'rocket'));
    input.touchFire = fire && !input.touchFire; // toggle so single-shot weapons see a fresh press
    if (input.touchFire) stats.fired++;
  }, 50);
}

try {
  const alice = await player('alice');
  await alice.goto(BASE, { waitUntil: 'domcontentloaded' });
  await alice.waitForSelector('#loading.done', { timeout: 60000 });
  await alice.fill('input.text:not(.code)', 'Alice');
  await alice.click('text=Create room');
  await alice.waitForFunction(() => document.querySelector('.code-box .code')?.textContent?.length === 6);
  const code = await alice.textContent('.code-box .code');

  const bob = await player('bob');
  await bob.goto(`${BASE}/?room=${code}`, { waitUntil: 'domcontentloaded' });
  await bob.waitForSelector('#loading.done', { timeout: 60000 });
  await bob.fill('input.text:not(.code)', 'Bob');
  await bob.click('button:has-text("Join")');
  await alice.waitForFunction(() => document.querySelectorAll('.player-list li:not(.empty)').length === 2);

  await alice.evaluate((id) => {
    const names = { neon: 'Downtown', canyon: 'Desert Canyon', docks: 'Harbor Docks', jungle: 'Jungle Temple', lavapit: 'Lava Pit', space: 'Space Station' };
    [...document.querySelectorAll('.map-card')].find((c) => c.textContent.includes(names[id]))?.click();
  }, MAP);
  await alice.waitForFunction(() => !document.querySelector('.lobby-actions button.go').disabled, null, { timeout: 120000 });
  await alice.click('.lobby-actions button.go');
  await alice.waitForFunction(() => window.kart.game.phase === 'playing', null, { timeout: 20000 });
  await alice.evaluate(startBot);
  await bob.evaluate(startBot);

  for (let t = 0; t < SECONDS; t += 3) {
    await alice.waitForTimeout(3000);
    await alice.screenshot({ path: `${OUT}/bots-${MAP}-${String(t).padStart(2, '0')}.png` });
  }

  const summary = async (p) =>
    p.evaluate(() => ({
      stats: window.botStats,
      scoreboard: [...document.querySelectorAll('.scoreboard .entry')].map((e) => e.textContent),
      feed: [...document.querySelectorAll('.killfeed .kf')].map((e) => e.textContent),
    }));
  console.log('alice', JSON.stringify(await summary(alice), null, 1));
  console.log('bob', JSON.stringify(await summary(bob), null, 1));
  console.log(errors.length ? `Console errors:\n${errors.join('\n')}` : 'No console errors.');
} catch (err) {
  console.error(err);
  console.log(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
