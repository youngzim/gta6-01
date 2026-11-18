// Cars: traffic that drives the road grid, parked cars at the kerb, and
// the player's driven car. Traffic never leaves the roads, so it can never
// get stuck in a building: each traffic car travels along one road at a
// time, and at each intersection it chooses a new road (never a U-turn).
// Parked cars sit half on the kerb, out of the driving lane.

import { makeDice, hashSeed, clamp, dist2 } from './rng.js';
import { AVENUES, STREETS, ROAD_HALF, WORLD_W, WORLD_H, nearestRoadPoint } from './city.js';

export const CAR_MODELS = [
  { name: 'Vela', color: '#d94f3d', top: 205, accel: 150 },
  { name: 'Comet', color: '#3d7ad9', top: 195, accel: 140 },
  { name: 'Bison', color: '#e8c33d', top: 175, accel: 120 },
  { name: 'Lupo', color: '#7ad93d', top: 190, accel: 135 },
  { name: 'Sultan', color: '#9a5fd9', top: 200, accel: 145 },
  { name: 'Taxi', color: '#f2c200', top: 185, accel: 130 },
];

const LANE = 20; // lane offset from the road centreline (right-hand traffic)

// A traffic car: axis 'v' (avenue) or 'h' (street), line = the road's
// centre coordinate, pos = distance along it, dir = +1 / -1.
export function spawnTrafficCar(dice, id) {
  const model = dice.pick(CAR_MODELS);
  const axis = dice.chance(0.5) ? 'v' : 'h';
  let line;
  let pos;
  if (axis === 'v') {
    line = dice.pick(AVENUES);
    pos = dice.range(80, WORLD_H - 80);
  } else {
    line = dice.pick(STREETS);
    pos = dice.range(80, WORLD_W - 80);
  }
  return {
    id, kind: 'traffic', model, axis, line,
    pos, dir: dice.chance(0.5) ? 1 : -1,
    speed: dice.range(70, 105), r: 15, angle: 0,
    x: 0, y: 0, stuck: 0, color: model.color,
    // Each car carries its own deterministic stream for turn choices,
    // so the same intersection does not always force the same decision.
    rng: makeDice(hashSeed('car' + id)),
  };
}

// World position of a traffic car, applying its lane offset.
export function trafficPos(car) {
  if (car.axis === 'v') {
    // Southbound (+y): right side is west (-x). Northbound: east (+x).
    const x = car.line + (car.dir > 0 ? -LANE : LANE);
    return { x, y: car.pos };
  }
  // Eastbound (+x): right side is south (+y). Westbound: north (-y).
  const y = car.line + (car.dir > 0 ? LANE : -LANE);
  return { x: car.pos, y };
}

function roadEnd(car) {
  return car.axis === 'v' ? WORLD_H : WORLD_W;
}

function nextIntersection(car) {
  // The next crossing on this car's road, in its direction of travel.
  const lines = car.axis === 'v' ? STREETS : AVENUES;
  const at = car.pos;
  let best = null;
  for (const l of lines) {
    if (car.dir > 0 && l > at + 20 && (best === null || l < best)) best = l;
    if (car.dir < 0 && l < at - 20 && (best === null || l > best)) best = l;
  }
  return best;
}

// Drive one traffic car for dt seconds. At an intersection it may turn
// onto the crossing road (30%) or carry straight on; at a road end it
// turns around. Cars ahead on the same lane slow it down, so traffic
// bunches and clears like real congestion instead of overlapping.
export function updateTraffic(car, dt, others) {
  const end = roadEnd(car);
  const target = nextIntersection(car);
  const limit = target === null ? (car.dir > 0 ? end - 60 : 60) : target;
  let want = car.speed;

  // Car ahead on the same road and lane: keep a gap.
  for (const o of others) {
    if (o === car || o.kind !== 'traffic') continue;
    if (o.axis !== car.axis || o.line !== car.line || o.dir !== car.dir) continue;
    const gap = (o.pos - car.pos) * car.dir;
    if (gap > 0 && gap < 55) want = Math.min(want, Math.max(0, (gap - 34) * 2.2));
  }

  const prev = car.pos;
  car.pos += car.dir * want * dt;
  const moved = Math.abs(car.pos - prev);

  if (target !== null && ((car.dir > 0 && car.pos >= target) || (car.dir < 0 && car.pos <= target))) {
    // At an intersection: turn onto the crossing road 30% of the time,
    // else carry straight on. A turn swaps the car's road and its
    // position along it: the old road's line becomes the new position,
    // the intersection coordinate becomes the new road's line.
    const oldLine = car.line;
    if (car.rng() < 0.3) {
      const wasVertical = car.axis === 'v';
      car.axis = wasVertical ? 'h' : 'v';
      car.line = target;
      car.pos = oldLine;
      car.dir = car.rng() < 0.5 ? 1 : -1;
    } else {
      car.pos = target;
    }
  }
  if (car.pos >= end - 60 && car.dir > 0) { car.pos = end - 60; car.dir = -1; }
  if (car.pos <= 60 && car.dir < 0) { car.pos = 60; car.dir = 1; }

  // Stuck detection: if a car barely moves for a while, jump it forward
  // along its road so a jam can never freeze the city.
  if (moved < 0.5) car.stuck += dt; else car.stuck = 0;
  if (car.stuck > 3) {
    car.stuck = 0;
    car.pos = clamp(car.pos + car.dir * 120, 60, roadEnd(car) - 60);
  }

  const p = trafficPos(car);
  car.x = p.x;
  car.y = p.y;
  car.angle = car.axis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
    : (car.dir > 0 ? 0 : Math.PI);
  return car;
}

// A parked car: fixed on a kerb, facing along its road. `mission` marks
// the one the first mission asks the player to steal.
export function spawnParkedCar(dice, id, opts = {}) {
  const model = opts.model || dice.pick(CAR_MODELS);
  const axis = opts.axis || (dice.chance(0.5) ? 'v' : 'h');
  let x;
  let y;
  let angle;
  if (opts.x !== undefined && opts.y !== undefined) {
    x = opts.x; y = opts.y;
    angle = axis === 'v' ? Math.PI / 2 : 0;
  } else if (axis === 'v') {
    const line = dice.pick(AVENUES);
    const street = dice.pick(STREETS);
    x = line + ROAD_HALF - 12;
    y = clamp(street + dice.range(-180, 180), 80, WORLD_H - 80);
    angle = Math.PI / 2;
  } else {
    const street = dice.pick(STREETS);
    const avenue = dice.pick(AVENUES);
    y = street + ROAD_HALF - 12;
    x = clamp(avenue + dice.range(-180, 180), 80, WORLD_W - 80);
    angle = 0;
  }
  return {
    id, kind: 'parked', model, x, y, angle, r: 15,
    speed: 0, damage: 0, color: model.color,
    mission: !!opts.mission, taken: false,
  };
}

// The driven car: arcade physics. Throttle, brake/reverse, steering that
// bites harder at low speed, handbrake for slides. Position integrates
// from heading and speed; buildings push the circle out afterwards.
export function makeDrivenCar(x, y, angle, model) {
  return {
    id: 'player-car', kind: 'driven', model, x, y, angle,
    speed: 0, r: 15, damage: 0, color: model.color,
    mission: false, skid: 0,
  };
}

export function updateDriven(car, input, dt) {
  const top = car.model.top;
  const accel = car.model.accel;
  const handbrake = input.handbrake ? 0.35 : 1;
  if (input.up) car.speed += accel * dt * handbrake;
  if (input.down) car.speed -= (car.speed > 0 ? 190 : 110) * dt;
  if (!input.up && !input.down) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 60 * dt);
  if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 260 * dt);
  car.speed = clamp(car.speed, -70, top);

  const steerAuthority = clamp(1 - Math.abs(car.speed) / (top * 1.6), 0.35, 1);
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  car.angle += steer * 2.1 * steerAuthority * dt * (car.speed >= 0 ? 1 : -1) * (input.handbrake ? 1.5 : 1);

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.skid = Math.abs(steer) > 0 && Math.abs(car.speed) > 120 ? car.skid + dt : 0;
  return car;
}

// Simple circle separation between two cars (traffic vs driven/parked).
export function separateCars(a, b) {
  const d2 = dist2(a.x, a.y, b.x, b.y);
  const min = a.r + b.r - 2;
  if (d2 >= min * min || d2 < 0.01) return false;
  const d = Math.sqrt(d2);
  const push = (min - d) / 2;
  const nx = (b.x - a.x) / d;
  const ny = (b.y - a.y) / d;
  a.x -= nx * push; a.y -= ny * push;
  b.x += nx * push; b.y += ny * push;
  return true;
}

// Snap a point to the nearest road, used when spawning the player car.
export function snapToRoad(x, y) {
  return nearestRoadPoint(x, y);
}
