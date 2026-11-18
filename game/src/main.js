// Solmaris Heat — the game itself: state, loop, and wiring.
// The world is built once from a seed; the loop reads input, advances
// every system by a fixed-ish step, resolves collisions, and draws.
// Nothing here talks to the network. The only persistence is a
// localStorage save of cash and mission stage.

import { makeDice, clamp, dist2 } from './rng.js';
import { buildCity, landmarkCenter, resolveBuildings, WORLD_W, WORLD_H } from './city.js';
import {
  spawnTrafficCar, spawnParkedCar, updateTraffic, updateDriven,
  separateCars, CAR_MODELS,
} from './cars.js';
import { spawnPedestrian, placePedestrian, updatePedestrian } from './people.js';
import {
  makePlayer, updateOnFoot, nearestEnterableCar, enterCar, exitCar,
  damagePlayer, applyBusted, applyWasted,
} from './player.js';
import { makeWanted, addCrime, updateWanted, updatePoliceCar } from './police.js';
import {
  makeMissions, updateMissions, onStageStart, currentTarget,
} from './missions.js';
import {
  makeAudio, initAudio, updateAudio, setMuted,
  sfxPickup, sfxJob, sfxCrash, sfxBusted,
} from './audio.js';
import { makeInput, attachInput, clearEdges } from './input.js';
import {
  makeCamera, updateCamera, drawWorld, drawHUD, drawScreen, VIEW_W, VIEW_H,
} from './render.js';
import { stageShot, SHOT_NAMES } from './shots.js';

const SAVE_KEY = 'solmaris-heat-save-v1';
const DEFAULT_SEED = 7;

export function createGame(seed) {
  const dice = makeDice(seed);
  const city = buildCity(seed);

  // The mission Vela: parked on Palm Row by the kerb, east of the spawn.
  const velaSpot = { x: 470, y: 300 };
  const vela = spawnParkedCar(dice, 'vela', {
    model: CAR_MODELS[0], axis: 'h', x: velaSpot.x, y: velaSpot.y, mission: true,
  });

  const parked = [vela];
  for (let i = 0; i < 16; i++) {
    parked.push(spawnParkedCar(dice, 'park' + i));
  }
  const traffic = [];
  for (let i = 0; i < 15; i++) {
    const car = spawnTrafficCar(dice, i);
    const pos = (car.axis === 'v')
      ? { x: car.line, y: car.pos } : { x: car.pos, y: car.line };
    car.x = pos.x; car.y = pos.y;
    traffic.push(car);
  }
  const peds = [];
  for (let i = 0; i < 26; i++) {
    const ped = spawnPedestrian(dice, i);
    placePedestrian(city, dice, ped);
    peds.push(ped);
  }

  const player = makePlayer(380, 340);
  const policeHQ = landmarkCenter(city, 'Police HQ');
  const hospital = landmarkCenter(city, 'City Hospital');
  player.policeStation = { x: policeHQ.x, y: policeHQ.y + 120 };
  player.hospital = { x: hospital.x, y: hospital.y + 120 };

  const game = {
    seed, city, dice,
    parked, traffic, peds,
    player,
    wanted: makeWanted(),
    missions: makeMissions(city),
    audio: makeAudio(),
    input: makeInput(),
    camera: makeCamera(),
    state: 'title', // title | playing | pause | busted | wasted
    time: 0,
    prompt: '',
    hasSave: false,
    lastStage: 0,
    saveTimer: 0,
    shot: null,
  };
  game.police = game.wanted; // render.js reads game.police.police
  game.missionTarget = currentTarget(game.missions);
  try {
    game.hasSave = !!window.localStorage.getItem(SAVE_KEY);
  } catch (e) { game.hasSave = false; }
  return game;
}

function saveGame(game) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.player.cash, stage: game.missions.stage,
    }));
    game.hasSave = true;
  } catch (e) { /* private mode: play without saving */ }
}

function loadSave(game) {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    game.player.cash = s.cash || 120;
    game.missions.stage = Math.min(s.stage || 0, 4);
    onStageStart(game.missions, { wanted: game.wanted });
    return true;
  } catch (e) { return false; }
}

function startNewGame(game) {
  const fresh = createGame(game.seed);
  // Keep the objects the browser already holds (input listeners are
  // attached to the original input object, the audio context to the
  // original audio object, the camera to the renderer).
  const keep = { input: game.input, audio: game.audio, camera: game.camera };
  Object.assign(game, fresh, keep);
  game.police = game.wanted;
  game.state = 'playing';
  onStageStart(game.missions, { wanted: game.wanted });
}

function step(game, dt) {
  const { player, wanted, missions, input, city } = game;
  game.time += dt;

  // Stage changes run their one-off setup exactly once.
  if (missions.stage !== game.lastStage) {
    onStageStart(missions, { wanted });
    game.lastStage = missions.stage;
  }

  // --- Player -----------------------------------------------------------
  if (player.inCar) {
    const car = player.inCar;
    updateDriven(car, input, dt);
    const hit = resolveBuildings(city, car);
    if (hit) {
      const impact = Math.abs(car.speed);
      car.speed *= 0.45;
      if (impact > 130) {
        damagePlayer(player, 12);
        sfxCrash(game.audio);
        if (player.wasted) return;
      }
    }
    // Traffic contact: slow down, take a little damage on a hard hit.
    for (const t of game.traffic) {
      const d2 = dist2(car.x, car.y, t.x, t.y);
      if (d2 < (car.r + t.r) * (car.r + t.r)) {
        const closing = Math.abs(car.speed) + Math.abs(t.speed);
        separateCars(car, t);
        car.speed *= 0.7;
        if (closing > 200) {
          damagePlayer(player, 8);
          sfxCrash(game.audio);
        }
      }
    }
    // Police ramming.
    for (const cop of wanted.police) {
      if (dist2(car.x, car.y, cop.x, cop.y) < (car.r + cop.r) * (car.r + cop.r)) {
        separateCars(car, cop);
        car.speed *= 0.85;
        damagePlayer(player, 4);
      }
    }
    // Wrecked car: forced out, car becomes an unusable wreck.
    if (car.damage >= 100) {
      const wreck = exitCar(player, game.parked);
      if (wreck) wreck.taken = true;
      game.missions.message = 'Your car is wrecked.';
      game.missions.messageTimer = 3;
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.speed = car.speed;
  } else {
    updateOnFoot(player, input, dt, city);
    // Traffic can hit a pedestrian player.
    for (const t of game.traffic) {
      if (Math.abs(t.speed) > 30 && dist2(player.x, player.y, t.x, t.y) < (player.r + t.r - 2) * (player.r + t.r - 2)) {
        damagePlayer(player, 15);
        player.x += (player.x - t.x) * 0.4;
        player.y += (player.y - t.y) * 0.4;
        sfxCrash(game.audio);
        if (player.wasted) return;
      }
    }
  }

  // Enter / exit a car. Taking a car that was never the player's is a
  // crime (one star, once per car); getting back into your own car is free.
  // The edge is consumed here so one key press is exactly one action.
  if (input.interactEdge) {
    input.interactEdge = false;
    if (player.inCar) {
      exitCar(player, game.parked);
    } else {
      const near = nearestEnterableCar(player, game.parked);
      if (near) {
        const firstTime = !near.owned;
        enterCar(player, near);
        near.owned = true;
        if (firstTime) {
          addCrime(wanted, 1);
          sfxPickup(game.audio);
        }
      }
    }
  }

  // Wasted: the hospital takes its bill and the player wakes up there.
  if (player.wasted) {
    applyWasted(player, 150);
    sfxBusted(game.audio);
    game.state = 'wasted';
    return;
  }

  // --- Traffic, pedestrians, police --------------------------------------
  for (const t of game.traffic) updateTraffic(t, dt, game.traffic);
  const allCars = [...game.traffic, ...(player.inCar ? [player.inCar] : [])];
  for (const ped of game.peds) {
    const ev = updatePedestrian(ped, dt, city, allCars);
    if (ev === 'knocked') {
      addCrime(wanted, 1);
      player.cash = Math.max(0, player.cash - 25);
      game.missions.message = 'You hit a pedestrian (-25 cash, +1 star)';
      game.missions.messageTimer = 3;
    }
  }
  for (const cop of wanted.police) updatePoliceCar(cop, player, dt, city);
  updateWanted(wanted, player, dt, game.dice, () => {
    applyBusted(player, 100);
    sfxBusted(game.audio);
    game.state = 'busted';
  });
  if (game.state !== 'playing') return;

  // --- Missions -----------------------------------------------------------
  const drivingVela = !!(player.inCar && player.inCar.mission);
  const stageBefore = missions.stage;
  updateMissions(missions, dt, { player, wanted, drivingVela });
  if (missions.stage !== stageBefore) {
    saveGame(game);
    sfxJob(game.audio);
  }
  game.missionTarget = currentTarget(missions);

  // --- Prompt ---------------------------------------------------------------
  game.prompt = '';
  if (!player.inCar) {
    const near = nearestEnterableCar(player, game.parked);
    if (near) game.prompt = 'E — ' + (near.mission ? 'Steal the marked Vela' : 'Enter the ' + near.model.name);
  } else {
    game.prompt = 'E — Get out · Space — Handbrake';
  }

  // --- Audio / camera / save --------------------------------------------------
  const speed = player.inCar ? player.inCar.speed : 0;
  updateAudio(game.audio, speed, wanted.stars, game.state === 'playing');
  updateCamera(game.camera, player, dt);
  game.saveTimer += dt;
  if (game.saveTimer > 10) {
    game.saveTimer = 0;
    saveGame(game);
  }
}

function render(game, ctx) {
  drawWorld(ctx, game);
  if (game.state === 'playing' || game.state === 'pause') drawHUD(ctx, game);
  if (game.state === 'title') drawScreen(ctx, 'title', game);
  if (game.state === 'pause') drawScreen(ctx, 'pause', game);
  if (game.state === 'busted') drawScreen(ctx, 'busted', game);
  if (game.state === 'wasted') drawScreen(ctx, 'wasted', game);
}

// --- Boot -------------------------------------------------------------------

function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(window.location.search);
  const seed = Number(params.get('seed') || DEFAULT_SEED) || DEFAULT_SEED;
  const game = createGame(seed);
  window.__game = game;

  attachInput(game.input);
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;

  const shotName = params.get('shot');
  if (shotName && SHOT_NAMES.includes(shotName)) {
    game.state = 'playing';
    onStageStart(game.missions, { wanted: game.wanted });
    stageShot(game, shotName);
    // A few fixed ticks so traffic, peds and the camera settle.
    for (let i = 0; i < 30; i++) step(game, 1 / 60);
    render(game, ctx);
    document.title = 'shot-ready';
    window.__shotReady = true;
    return;
  }

  let last = performance.now();
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 1 / 30);
    last = now;
    const input = game.input;

    if (input.muteEdge) {
      initAudio(game.audio);
      setMuted(game.audio, !game.audio.muted);
    }
    if (input.pauseEdge && (game.state === 'playing' || game.state === 'pause')) {
      game.state = game.state === 'playing' ? 'pause' : 'playing';
    }
    if (input.startEdge) {
      initAudio(game.audio);
      if (game.state === 'title') {
        startNewGame(game);
      } else if (game.state === 'busted' || game.state === 'wasted') {
        game.state = 'playing';
      }
    }
    if (input.continueEdge && game.state === 'title' && game.hasSave) {
      initAudio(game.audio);
      startNewGame(game);
      loadSave(game);
      game.state = 'playing';
    }
    if (game.state === 'playing') step(game, dt);
    render(game, ctx);
    clearEdges(input);
    requestAnimationFrame(frame);
  }
  render(game, ctx);
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}

export { step, startNewGame, loadSave, saveGame };
