// Browser end-to-end for Solmaris Heat. Drives the real game in a
// headless Chromium (Playwright, installed under /tmp as a test tool):
// title screen -> start -> walk to the marked Vela -> steal it -> drive
// -> pause/resume, with zero console/page/request errors, then renders
// the four dossier screenshots through the game's own ?shot= scenes.
// Run: node test/e2e.mjs (exit 0 = all pass; also writes screenshots/).

import { chromium } from '/tmp/gta6-test/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8901;
const BASE = 'http://127.0.0.1:' + PORT;

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ok: ' + name); }
  else { failed++; failures.push(name); console.log('  FAIL: ' + name + (extra ? ' — ' + extra : '')); }
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1200));

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  // --- Title screen ------------------------------------------------------
  await page.goto(BASE + '/?seed=7', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game, null, { timeout: 10000 });
  const titleState = await page.evaluate(() => window.__game.state);
  check('title screen shows first', titleState === 'title', 'state=' + titleState);

  // --- Start the game -----------------------------------------------------
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const playing = await page.evaluate(() => window.__game.state);
  check('Enter starts the game', playing === 'playing', 'state=' + playing);

  // --- Walk to the marked Vela, steering by live positions ----------------
  const steer = async (tx, ty, timeoutMs) => {
    const start = Date.now();
    const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
    const setKey = async (code, down) => {
      if (keys[code] === down) return;
      keys[code] = down;
      if (down) await page.keyboard.down(code); else await page.keyboard.up(code);
    };
    while (Date.now() - start < timeoutMs) {
      const pos = await page.evaluate(() => ({ x: window.__game.player.x, y: window.__game.player.y }));
      const dx = tx - pos.x;
      const dy = ty - pos.y;
      if (Math.hypot(dx, dy) < 42) break;
      await setKey('KeyD', dx > 12);
      await setKey('KeyA', dx < -12);
      await setKey('KeyS', dy > 12);
      await setKey('KeyW', dy < -12);
      await page.waitForTimeout(90);
    }
    for (const code of Object.keys(keys)) await setKey(code, false);
    return page.evaluate(() => {
      const g = window.__game;
      const v = g.parked.find((c) => c.mission);
      return Math.hypot(g.player.x - v.x, g.player.y - v.y);
    });
  };
  const velaPos = await page.evaluate(() => {
    const v = window.__game.parked.find((c) => c.mission);
    return { x: v.x, y: v.y };
  });
  // Steer straight at the Vela: the enter radius is 48px, so the stop
  // threshold must be tighter than that.
  const dist = await steer(velaPos.x, velaPos.y, 30000);
  check('walked to the marked Vela', dist < 48, 'dist=' + Math.round(dist));

  // --- Steal it ------------------------------------------------------------
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(500);
  const afterSteal = await page.evaluate(() => {
    const g = window.__game;
    return { inCar: !!g.player.inCar, cash: g.player.cash, stage: g.missions.stage, stars: g.wanted.stars };
  });
  check('E steals the Vela (in car)', afterSteal.inCar === true, JSON.stringify(afterSteal));
  check('stealing adds 1 wanted star', afterSteal.stars === 1, 'stars=' + afterSteal.stars);
  check('mission 0 completes, cash 270', afterSteal.stage === 1 && afterSteal.cash === 270, JSON.stringify(afterSteal));

  // --- Drive (must be in the car: on foot the same keys also move) ----------
  const before = await page.evaluate(() => ({ x: window.__game.player.x, y: window.__game.player.y, inCar: !!window.__game.player.inCar }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(4000);
  await page.keyboard.up('KeyW');
  const afterDrive = await page.evaluate(() => ({ x: window.__game.player.x, y: window.__game.player.y, inCar: !!window.__game.player.inCar }));
  const drove = Math.hypot(afterDrive.x - before.x, afterDrive.y - before.y);
  check('driving moves the car (still in car)', before.inCar && afterDrive.inCar && drove > 250, 'drove ' + Math.round(drove) + 'px in 4s, inCar=' + afterDrive.inCar);

  // --- Pause / resume ---------------------------------------------------------
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(300);
  const paused = await page.evaluate(() => window.__game.state);
  check('P pauses', paused === 'pause', 'state=' + paused);
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(300);
  const resumed = await page.evaluate(() => window.__game.state);
  check('P resumes', resumed === 'playing', 'state=' + resumed);

  // --- Frame rate --------------------------------------------------------------
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - start < 3000) requestAnimationFrame(tick);
      else resolve(Math.round(frames / 3));
    };
    requestAnimationFrame(tick);
  }));
  check('frame rate above 30 fps', fps > 30, 'fps=' + fps);

  check('zero console/page/request errors during play', errors.length === 0, errors.slice(0, 3).join(' | '));

  // --- Screenshots through the game's own ?shot= scenes -------------------------
  mkdirSync(join(ROOT, 'screenshots'), { recursive: true });
  const shots = JSON.parse((await import('node:fs')).readFileSync(join(ROOT, 'shots.json'), 'utf8'));
  for (const shot of shots) {
    await page.goto(BASE + '/' + shot.query, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady, null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const shotErrors = [];
    const out = join(ROOT, 'screenshots', shot.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
    const size = statSync(out).size;
    check('screenshot ' + shot.name + ' under 256 KiB', size < 262144, size + ' bytes');
    check('screenshot ' + shot.name + ' non-trivial', size > 15000, size + ' bytes');
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(`\ne2e: ${passed} passed, ${failed} failed`);
if (failures.length) { console.log('failures:'); failures.forEach((f) => console.log(' - ' + f)); }
process.exit(failed ? 1 : 0);
