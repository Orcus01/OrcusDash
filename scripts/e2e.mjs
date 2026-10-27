// End-to-end smoke test: two browsers create/join a room by code, start a match and drive.
// Usage: npm run dev (in another terminal), then: node scripts/e2e.mjs [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.argv[2] ?? 'screenshots';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: process.env.SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
});

const errors = [];
async function newPlayer(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${label}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
  return page;
}

const check = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  console.log(`✓ ${msg}`);
};

try {
  const alice = await newPlayer('alice');
  await alice.goto(BASE, { waitUntil: 'domcontentloaded' });
  await alice.waitForSelector('#loading.done', { timeout: 120000 });
  await alice.waitForTimeout(1500);
  await alice.screenshot({ path: `${OUT}/1-menu.png` });

  await alice.fill('input.text:not(.code)', 'Alice');
  await alice.click('text=Create room');
  await alice.waitForFunction(() => document.querySelector('.code-box .code')?.textContent?.length === 6);
  const code = await alice.textContent('.code-box .code');
  check(/^[A-HJKMNP-Z2-9]{6}$/.test(code), `room created with code ${code}`);
  check(new URL(alice.url()).searchParams.get('room') === code, 'URL contains the invite code');

  // Wrong code
  const carol = await newPlayer('carol');
  await carol.goto(BASE, { waitUntil: 'domcontentloaded' });
  await carol.waitForSelector('#loading.done', { timeout: 120000 });
  await carol.fill('input.code', 'ZZZZZZ');
  await carol.click('button:has-text("Join")');
  await carol.waitForFunction(() => document.querySelector('.error')?.textContent?.includes('not found'));
  check(true, 'wrong code shows "not found"');
  await carol.close();

  // Join via invite link, lowercase code typed by hand
  const bob = await newPlayer('bob');
  await bob.goto(`${BASE}/?room=${code}`, { waitUntil: 'domcontentloaded' });
  await bob.waitForSelector('#loading.done', { timeout: 120000 });
  check((await bob.inputValue('input.code')) === code, 'invite link pre-fills the code');
  await bob.fill('input.code', code.toLowerCase());
  await bob.fill('input.text:not(.code)', 'Bob');
  await bob.click('button:has-text("Join")');
  await bob.waitForFunction(() => document.querySelectorAll('.player-list li:not(.empty)').length === 2);
  check(true, 'Bob joined with a lowercase code; both players listed');
  await alice.waitForFunction(() => document.querySelectorAll('.player-list li:not(.empty)').length === 2);
  check(await bob.isVisible('text=Waiting for the host'), 'non-host sees "waiting for host"');

  // Host changes map
  await alice.click('.map-card:has-text("Desert Canyon")');
  await bob.waitForFunction(() => document.querySelector('.map-card.selected')?.textContent?.includes("Desert Canyon"));
  check(true, 'map change syncs to other players');
  await alice.waitForTimeout(1000);
  await alice.screenshot({ path: `${OUT}/2-lobby.png` });

  // Start (enabled once both players have loaded the new map)
  await alice.waitForFunction(() => !document.querySelector('.lobby-actions button.go').disabled, null, { timeout: 120000 });
  check(true, 'start unlocks once everyone has loaded the map');
  await alice.click('.lobby-actions button.go');
  await alice.waitForTimeout(1200);
  await alice.screenshot({ path: `${OUT}/3-countdown.png` });
  await alice.waitForFunction(() => window.kart.game.phase === 'playing', null, { timeout: 8000 });
  check(true, 'match started (countdown → playing)');

  // Drive both karts forward
  await alice.keyboard.down('KeyW');
  await bob.keyboard.down('KeyW');
  await alice.waitForTimeout(1500);
  await alice.keyboard.down('KeyD');
  await alice.waitForTimeout(600);
  await alice.keyboard.up('KeyD');
  await alice.screenshot({ path: `${OUT}/4-driving-alice.png` });
  await bob.screenshot({ path: `${OUT}/5-driving-bob.png` });
  await alice.keyboard.up('KeyW');
  await bob.keyboard.up('KeyW');

  const aliceState = await alice.evaluate(() => {
    const g = window.kart.game;
    return { speedish: g.local?.position.toArray(), remotes: g.remotes.size, remoteVisible: [...g.remotes.values()].some((r) => r.model.root.visible) };
  });
  check(aliceState.remotes >= 1 && aliceState.remoteVisible, 'Alice sees Bob\'s kart');
  const bobSeesAlice = await bob.evaluate(() => [...window.kart.game.remotes.values()].some((r) => r.model.root.visible));
  check(bobSeesAlice, 'Bob sees Alice\'s kart');

  // Leave → host passes to Bob
  await alice.evaluate(()=>window.kart.ui.onLeave());
  await alice.close();
  await bob.waitForTimeout(500);
  const bobHost = await bob.evaluate(() => document.querySelector('.player-list li .tag')?.textContent);
  check(bobHost === 'Host', 'host role passes to Bob when Alice leaves');

  console.log(errors.length ? `\nConsole errors:\n${errors.join('\n')}` : '\nNo console errors.');
} catch (err) {
  console.error(err.message);
  console.log(errors.length ? `\nConsole errors:\n${errors.join('\n')}` : '');
  process.exitCode = 1;
} finally {
  await browser.close();
}
