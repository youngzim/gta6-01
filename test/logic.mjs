// Headless logic suite for Solmaris Heat. Pure Node, no browser: it
// imports the same modules the game runs and drives them directly.
// Run: node test/logic.mjs (exit 0 = all pass).

import { buildCity, AVENUES, STREETS, ROAD_HALF, isOnRoad, WORLD_W, WORLD_H } from '../game/src/city.js';
import { spawnTrafficCar, updateTraffic, spawnParkedCar, updateDriven, makeDrivenCar, CAR_MODELS } from '../game/src/cars.js';
import { spawnPedestrian, placePedestrian, updatePedestrian } from '../game/src/people.js';
import { makePlayer, updateOnFoot, nearestEnterableCar, enterCar, exitCar, damagePlayer } from '../game/src/player.js';
import { makeWanted, addCrime, updateWanted, updatePoliceCar } from '../game/src/police.js';
import { makeMissions, updateMissions, onStageStart, currentTarget } from '../game/src/missions.js';
import { makeDice } from '../game/src/rng.js';
import { createGame, step } from '../game/src/main.js';

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('FAIL: ' + name + (extra ? ' — ' + extra : '')); }
}

// --- 1. City: deterministic, no building on a road, no overlaps --------
{
  const a = buildCity(7);
  const b = buildCity(7);
  check('city deterministic across builds', JSON.stringify(a.buildings) === JSON.stringify(b.buildings));
  const c = buildCity(8);
  check('city differs across seeds', JSON.stringify(a.buildings) !== JSON.stringify(c.buildings));
  check('city has buildings', a.buildings.length > 50, 'got ' + a.buildings.length);
  check('city has 7 landmarks', a.buildings.filter((x) => x.landmark).length === 7);
  let onRoad = 0;
  let overlap = 0;
  for (const bl of a.buildings) {
    // Sample the building rect on a 20px grid: no sample may be on a road.
    for (let x = bl.x + 5; x < bl.x + bl.w; x += 20) {
      for (let y = bl.y + 5; y < bl.y + bl.h; y += 20) {
        if (isOnRoad(a, x, y)) onRoad++;
      }
    }
    for (const other of a.buildings) {
      if (other === bl) continue;
      if (bl.x < other.x + other.w && other.x < bl.x + bl.w
        && bl.y < other.y + other.h && other.y < bl.y + bl.h) overlap++;
    }
  }
  check('no building overlaps a road', onRoad === 0, onRoad + ' samples on road');
  check('no building overlaps another building', overlap === 0, overlap + ' overlaps');
}

// --- 2. Traffic: 90 seconds, cars keep moving on roads --------------------
{
  const dice = makeDice(7);
  const cars = [];
  for (let i = 0; i < 15; i++) cars.push(spawnTrafficCar(dice, i));
  const start = cars.map((c) => ({ x: c.x, y: c.y }));
  for (let t = 0; t < 90; t += 1 / 30) {
    for (const c of cars) updateTraffic(c, 1 / 30, cars);
  }
  let moved = 0;
  let offRoad = 0;
  for (let i = 0; i < cars.length; i++) {
    const d = Math.hypot(cars[i].x - start[i].x, cars[i].y - start[i].y);
    if (d > 500) moved++;
    if (!isOnRoad(null, cars[i].x, cars[i].y)) offRoad++;
  }
  check('traffic keeps moving (15/15 above 500px in 90s)', moved === 15, moved + '/15 moved');
  check('traffic stays on roads', offRoad === 0, offRoad + ' off road');
  const speeds = cars.map((c) => Math.abs(c.speed));
  check('traffic speeds sane', speeds.every((s) => s > 50 && s < 120), JSON.stringify(speeds));
}

// --- 3. Player: walk, steal the Vela, mission 0 completes ------------------
{
  const game = createGame(7);
  game.state = 'playing';
  onStageStart(game.missions, { wanted: game.wanted });
  const vela = game.parked.find((c) => c.mission);
  check('mission Vela exists at Palm Row', !!vela && Math.abs(vela.x - 470) < 5 && Math.abs(vela.y - 300) < 5);
  game.player.x = vela.x - 30;
  game.player.y = vela.y + 20;
  game.input.interactEdge = true;
  step(game, 1 / 60);
  check('player enters the Vela', !!game.player.inCar, 'inCar=' + !!game.player.inCar);
  check('stealing adds 1 wanted star', game.wanted.stars === 1, 'stars=' + game.wanted.stars);
  step(game, 1 / 60);
  check('mission 0 completes when driving the Vela', game.missions.stage === 1, 'stage=' + game.missions.stage);
  check('mission 0 pays 150 cash', game.player.cash === 120 + 150, 'cash=' + game.player.cash);
}

// --- 4. Driving: throttle moves the car, buildings block it ----------------
{
  const game = createGame(7);
  game.state = 'playing';
  const vela = game.parked.find((c) => c.mission);
  game.player.x = vela.x - 30;
  game.player.y = vela.y + 20;
  game.input.interactEdge = true;
  step(game, 1 / 60);
  const x0 = game.player.x;
  game.input.up = true;
  for (let t = 0; t < 5; t += 1 / 60) step(game, 1 / 60);
  game.input.up = false;
  const moved = Math.hypot(game.player.x - x0, game.player.y - 300);
  check('driving moves the car forward', moved > 300, 'moved ' + Math.round(moved) + 'px in 5s');
  check('car stays inside the world', game.player.x > 0 && game.player.x < WORLD_W && game.player.y > 0 && game.player.y < WORLD_H);
}

// --- 5. Police: stars spawn cops, cops close in ----------------------------
{
  // Part A: spawn cadence (3s: first cop at once, second at 2.5s).
  const game = createGame(7);
  game.state = 'playing';
  addCrime(game.wanted, 3);
  for (let t = 0; t < 3; t += 1 / 30) {
    for (const cop of game.wanted.police) updatePoliceCar(cop, game.player, 1 / 30, game.city);
    updateWanted(game.wanted, game.player, 1 / 30, game.dice, () => {});
  }
  check('police spawn with 3 stars', game.wanted.police.length >= 2, 'cops=' + game.wanted.police.length);
  check('police spawn inside the world', game.wanted.police.every((c) => c.x > 0 && c.x < WORLD_W && c.y > 0 && c.y < WORLD_H));
  // Part B: a cop next to a slow player fills the busted meter.
  const g2 = createGame(7);
  g2.state = 'playing';
  addCrime(g2.wanted, 1);
  updateWanted(g2.wanted, g2.player, 1 / 30, g2.dice, () => {});
  const cop = g2.wanted.police[0];
  cop.x = g2.player.x + 50;
  cop.y = g2.player.y;
  g2.player.speed = 0;
  const m0 = g2.wanted.bustedMeter;
  for (let t = 0; t < 1; t += 1 / 30) updateWanted(g2.wanted, g2.player, 1 / 30, g2.dice, () => {});
  check('busted meter rises near a slow player', g2.wanted.bustedMeter > m0, 'meter ' + m0 + ' -> ' + g2.wanted.bustedMeter);
  // Part C: a full meter fires the busted callback and clears the heat.
  let busted = false;
  g2.wanted.bustedMeter = 99;
  updateWanted(g2.wanted, g2.player, 1 / 30, g2.dice, () => { busted = true; });
  check('full busted meter fires the callback', busted === true);
  check('busted clears stars and cops', g2.wanted.stars === 0 && g2.wanted.police.length === 0);
}

// --- 6. Full mission chain, fast-forwarded ---------------------------------
{
  const game = createGame(7);
  game.state = 'playing';
  const missions = game.missions;
  onStageStart(missions, { wanted: game.wanted });
  const ctx = { player: game.player, wanted: game.wanted, drivingVela: false };

  // Stage 0: drive the Vela.
  ctx.drivingVela = true;
  updateMissions(missions, 0.1, ctx);
  check('chain: stage 0 -> 1', missions.stage === 1, 'stage=' + missions.stage);

  // Stage 1: wait 3s in the warehouse zone. The player stands OUTSIDE
  // the warehouse walls (offset from the centre): the zone must be
  // reachable in real play, not just by teleporting into the building.
  ctx.drivingVela = false;
  const t1 = currentTarget(missions);
  game.player.x = t1.x + 140; game.player.y = t1.y;
  check('stage 1 zone reachable from outside the walls', !game.city.buildings.some((b) => game.player.x >= b.x && game.player.x <= b.x + b.w && game.player.y >= b.y && game.player.y <= b.y + b.h));
  for (let i = 0; i < 40; i++) updateMissions(missions, 0.1, ctx);
  check('chain: stage 1 -> 2', missions.stage === 2, 'stage=' + missions.stage);

  // Stage 2: timed delivery to the Palma (outside its walls).
  const t2 = currentTarget(missions);
  game.player.x = t2.x - 140; game.player.y = t2.y;
  updateMissions(missions, 0.1, ctx);
  check('chain: stage 2 -> 3', missions.stage === 3, 'stage=' + missions.stage);

  // Stage 3: Cool Down — set heat, then arrive at the garage with no stars.
  onStageStart(missions, { wanted: game.wanted });
  check('chain: stage 3 sets 2 stars', game.wanted.stars === 2, 'stars=' + game.wanted.stars);
  game.wanted.stars = 0;
  const t3 = currentTarget(missions);
  game.player.x = t3.x + 140; game.player.y = t3.y;
  updateMissions(missions, 0.1, ctx);
  check('chain: stage 3 -> 4', missions.stage === 4, 'stage=' + missions.stage);

  // Stage 4: four checkpoints in order (each from just inside its own
  // arrival radius, outside the walls).
  for (let i = 0; i < 4; i++) {
    const t = currentTarget(missions);
    const off = (t.radius || 90) - 20;
    game.player.x = t.x + off; game.player.y = t.y;
    updateMissions(missions, 0.1, ctx);
  }
  check('chain: story completes', missions.done === true, 'done=' + missions.done);
  check('chain: cash earned', game.player.cash > 120 + 150 + 150 + 300 + 100 + 400 + 500 - 1, 'cash=' + game.player.cash);

  // Timer expiry restarts a timed stage.
  const g2 = createGame(7);
  g2.state = 'playing';
  g2.missions.stage = 2;
  onStageStart(g2.missions, { wanted: g2.wanted });
  const c2 = { player: g2.player, wanted: g2.wanted, drivingVela: false };
  for (let i = 0; i < 850; i++) updateMissions(g2.missions, 0.1, c2);
  check('timed stage restarts on expiry (still stage 2)', g2.missions.stage === 2, 'stage=' + g2.missions.stage);
}

// --- 7. Pedestrians: walk, flee, knocked down ------------------------------
{
  const game = createGame(7);
  const ped = game.peds[0];
  const x0 = ped.x; const y0 = ped.y;
  for (let t = 0; t < 10; t += 1 / 30) updatePedestrian(ped, 1 / 30, game.city, []);
  const moved = Math.hypot(ped.x - x0, ped.y - y0);
  check('pedestrians walk', moved > 50, 'moved ' + Math.round(moved) + 'px in 10s');
  // Knockdown by a fast driven car.
  const car = makeDrivenCar(ped.x, ped.y, 0, CAR_MODELS[0]);
  car.speed = 100;
  const ev = updatePedestrian(ped, 1 / 30, game.city, [car]);
  check('fast car knocks a pedestrian down', ev === 'knocked', 'event=' + ev);
}

// --- 8. Player damage / wasted ----------------------------------------------
{
  const p = makePlayer(100, 100);
  damagePlayer(p, 30);
  check('damage reduces health', p.health === 70, 'health=' + p.health);
  damagePlayer(p, 80);
  check('lethal damage sets wasted', p.wasted === true && p.health === 0);
}

console.log(`\nlogic: ${passed} passed, ${failed} failed`);
if (failures.length) { console.log('failures:'); failures.forEach((f) => console.log(' - ' + f)); }
process.exit(failed ? 1 : 0);
