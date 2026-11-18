// Pedestrians: ordinary people walking the sidewalks of Solmaris Bay.
// They stroll from block corner to block corner, pause, and pick a new
// destination. A fast car nearby makes them run for the nearest kerb.
// Knocked down by a car they fall, lie still a moment, then get up and
// walk away — and the city notices (the wanted system reads the event).

import { makeDice, clamp, dist2 } from './rng.js';
import { randomSidewalkPoint, WORLD_W, WORLD_H } from './city.js';

const SHIRTS = ['#e84f4f', '#4f7ae8', '#e8c33d', '#7ad94f', '#e8e8e8', '#c46fd9', '#4fd9c4'];

export function spawnPedestrian(dice, id) {
  return {
    id, kind: 'ped',
    x: 0, y: 0, tx: 0, ty: 0,
    speed: dice.range(26, 42), r: 9,
    state: 'walk', // walk | pause | down | flee
    timer: 0, angle: 0,
    shirt: dice.pick(SHIRTS),
    // Own deterministic stream for destination choices.
    rng: makeDice(dice.next() * 1e9),
  };
}

export function placePedestrian(city, dice, ped) {
  const p = randomSidewalkPoint(city, dice);
  ped.x = p.x; ped.y = p.y;
  const t = randomSidewalkPoint(city, dice);
  ped.tx = t.x; ped.ty = t.y;
  ped.state = 'walk';
  ped.timer = dice.range(0, 4);
  return ped;
}

// One pedestrian, dt seconds. `cars` is the list of nearby cars (driven
// and traffic) used for the flee reaction and knockdowns. Returns an
// event string ('knocked') when this pedestrian was just hit, else null.
export function updatePedestrian(ped, dt, city, cars) {
  // Knockdown first: a driven car already touching the pedestrian hits
  // them, whatever the pedestrian was about to do (including fleeing).
  if (ped.state !== 'down') {
    for (const c of cars) {
      if (c.kind !== 'driven') continue;
      const speed = Math.abs(c.speed || 0);
      if (speed > 25 && dist2(ped.x, ped.y, c.x, c.y) < (ped.r + c.r - 4) * (ped.r + c.r - 4)) {
        ped.state = 'down';
        ped.timer = 2.5;
        return 'knocked';
      }
    }
  }
  if (ped.state === 'down') {
    ped.timer -= dt;
    if (ped.timer <= 0) {
      ped.state = 'walk';
      ped.timer = 0;
    }
    return null;
  }

  // Flee: a fast car within 70px sends the pedestrian running away.
  let fleeX = 0;
  let fleeY = 0;
  let danger = false;
  for (const c of cars) {
    const d2 = dist2(ped.x, ped.y, c.x, c.y);
    const speed = Math.abs(c.speed || 0);
    if (d2 < 70 * 70 && speed > 60) {
      danger = true;
      const d = Math.sqrt(d2) || 1;
      fleeX += (ped.x - c.x) / d;
      fleeY += (ped.y - c.y) / d;
    }
  }
  if (danger) {
    ped.state = 'flee';
    ped.timer = 0.9;
  }
  if (ped.state === 'flee') {
    ped.timer -= dt;
    const len = Math.hypot(fleeX, fleeY) || 1;
    ped.x += (fleeX / len) * 95 * dt;
    ped.y += (fleeY / len) * 95 * dt;
    ped.angle = Math.atan2(fleeY, fleeX);
    ped.x = clamp(ped.x, 10, WORLD_W - 10);
    ped.y = clamp(ped.y, 10, WORLD_H - 10);
    if (ped.timer <= 0) ped.state = 'walk';
    return null;
  }

  if (ped.state === 'pause') {
    ped.timer -= dt;
    if (ped.timer <= 0) {
      ped.state = 'walk';
      const t = randomSidewalkPoint(city, ped.rng);
      ped.tx = t.x; ped.ty = t.y;
    }
    return null;
  }

  // Walk toward the current target; on arrival, pause or pick a new one.
  const dx = ped.tx - ped.x;
  const dy = ped.ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 12) {
    if (ped.rng() < 0.35) {
      ped.state = 'pause';
      ped.timer = ped.rng() * 3 + 1;
    } else {
      const t = randomSidewalkPoint(city, ped.rng);
      ped.tx = t.x; ped.ty = t.y;
    }
    return null;
  }
  ped.angle = Math.atan2(dy, dx);
  ped.x += (dx / d) * ped.speed * dt;
  ped.y += (dy / d) * ped.speed * dt;
  ped.x = clamp(ped.x, 10, WORLD_W - 10);
  ped.y = clamp(ped.y, 10, WORLD_H - 10);
  return null;
}
