// The player: Rico Vale, on foot or behind the wheel. On foot he walks
// with WASD and can step into any parked car nearby (E). In a car he
// drives it; stepping out (E) leaves the car parked where it stops and
// puts him on his feet beside it. Health, cash and the busted/wasted
// consequences live here; the wanted level lives in police.js.

import { clamp, dist2 } from './rng.js';
import { resolveBuildings, WORLD_W, WORLD_H } from './city.js';
import { makeDrivenCar } from './cars.js';

export const WALK_SPEED = 150;

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, r: 11,
    health: 100, cash: 120,
    inCar: null, // the driven car object, or null when on foot
    speed: 0,
    busted: false, wasted: false,
    // Respawn points, set by the game when it builds the world.
    policeStation: { x: 2300, y: 1200 },
    hospital: { x: 800, y: 1200 },
  };
}

// On-foot movement. Returns the distance moved this tick (for the
// "witnessed, heat rises" feel: sprinting is just walking, the city is
// small enough on foot).
export function updateOnFoot(player, input, dt, city) {
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len; my /= len;
    player.angle = Math.atan2(my, mx);
    player.x += mx * WALK_SPEED * dt;
    player.y += my * WALK_SPEED * dt;
    player.speed = WALK_SPEED;
  } else {
    player.speed = 0;
  }
  resolveBuildings(city, player);
  player.x = clamp(player.x, player.r, WORLD_W - player.r);
  player.y = clamp(player.y, player.r, WORLD_H - player.r);
  return len > 0 ? WALK_SPEED * dt : 0;
}

// The nearest parked car the player could enter, or null.
export function nearestEnterableCar(player, cars) {
  let best = null;
  let bestD = Infinity;
  for (const c of cars) {
    if (c.kind !== 'parked' || c.taken) continue;
    const d = dist2(player.x, player.y, c.x, c.y);
    if (d < 48 * 48 && d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// Step into a parked car: it becomes the driven car.
export function enterCar(player, parked) {
  parked.taken = true;
  const driven = makeDrivenCar(parked.x, parked.y, parked.angle, parked.model);
  driven.mission = parked.mission;
  driven.id = parked.id;
  driven.damage = parked.damage;
  driven.owned = true; // from here on it is the player's car
  player.inCar = driven;
  player.x = driven.x;
  player.y = driven.y;
  player.angle = driven.angle;
  return driven;
}

// Step out: the driven car parks where it is and becomes enterable again.
export function exitCar(player, cars) {
  const driven = player.inCar;
  if (!driven) return null;
  const parked = {
    id: driven.id, kind: 'parked', model: driven.model,
    x: driven.x, y: driven.y, angle: driven.angle, r: 15,
    speed: 0, damage: driven.damage, color: driven.color,
    mission: driven.mission, taken: false, owned: true,
  };
  cars.push(parked);
  player.inCar = null;
  // Step out to the car's left side so the player is not inside it.
  player.x = driven.x - Math.sin(driven.angle) * 26;
  player.y = driven.y + Math.cos(driven.angle) * 26;
  player.angle = driven.angle;
  player.speed = 0;
  return parked;
}

export function damagePlayer(player, amount) {
  if (player.inCar) {
    // In a car the bodywork takes half the hit.
    player.inCar.damage = clamp((player.inCar.damage || 0) + amount * 0.5, 0, 100);
  }
  player.health = clamp(player.health - amount, 0, 100);
  if (player.health <= 0) player.wasted = true;
  return player.health;
}

// Busted: fine, car impounded (if any), respawn at the police station.
export function applyBusted(player, fine) {
  player.cash = Math.max(0, player.cash - fine);
  if (player.inCar) {
    player.inCar = null;
  }
  player.x = player.policeStation.x;
  player.y = player.policeStation.y;
  player.health = Math.max(player.health, 50);
  player.busted = false;
}

// Wasted: hospital bill, respawn at the hospital, heat cleared.
export function applyWasted(player, bill) {
  player.cash = Math.max(0, player.cash - bill);
  if (player.inCar) {
    player.inCar = null;
  }
  player.x = player.hospital.x;
  player.y = player.hospital.y;
  player.health = 100;
  player.wasted = false;
}
