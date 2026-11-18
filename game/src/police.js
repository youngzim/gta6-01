// The wanted system and the police. Crimes add stars; stars bring
// police cars, spawned at the map edges, that chase the player. A cop
// that gets close while the player is slow fills the BUSTED meter —
// fill it and the player is arrested. Outrun the law and lie low and
// the heat cools off, one star at a time.

import { clamp, angleDelta } from './rng.js';
import { AVENUES, STREETS, WORLD_W, WORLD_H, resolveBuildings } from './city.js';

export const MAX_STARS = 5;
const POLICE_MODEL = { name: 'Interceptor', color: '#20242e', top: 178, accel: 155 };

export function makeWanted() {
  return {
    stars: 0,
    heat: 0, // seconds since the last crime (drives cooldown)
    quiet: 0, // seconds the player has been crime-free and unseen
    bustedMeter: 0, // 0..100
    police: [], // police cars
    spawnTimer: 0,
  };
}

export function addCrime(wanted, stars) {
  wanted.stars = clamp(wanted.stars + stars, 0, MAX_STARS);
  wanted.heat = 0;
  wanted.quiet = 0;
}

export function makePoliceCar(id, x, y, angle) {
  return {
    id, kind: 'police', model: POLICE_MODEL,
    x, y, angle, speed: 0, r: 15,
    color: POLICE_MODEL.color, stuck: 0, lastX: x, lastY: y,
    siren: 0,
  };
}

function spawnEdgePoint(dice) {
  // Spawn on a road near one of the four map edges.
  const side = dice.int(0, 3);
  if (side === 0) return { x: dice.pick(AVENUES), y: 120 };
  if (side === 1) return { x: dice.pick(AVENUES), y: WORLD_H - 120 };
  if (side === 2) return { x: 120, y: dice.pick(STREETS) };
  return { x: WORLD_W - 120, y: dice.pick(STREETS) };
}

// One police car chasing the player: steer toward them with a limited
// turn rate (so a fast player can break line and escape), push out of
// buildings, and recover from being wedged with a short reverse.
export function updatePoliceCar(cop, player, dt, city) {
  const targetAngle = Math.atan2(player.y - cop.y, player.x - cop.x);
  const turn = clamp(angleDelta(cop.angle, targetAngle), -2.4 * dt, 2.4 * dt);
  cop.angle += turn;
  const wantSpeed = POLICE_MODEL.top;
  cop.speed += (wantSpeed - cop.speed) * Math.min(1, 1.4 * dt);
  cop.x += Math.cos(cop.angle) * cop.speed * dt;
  cop.y += Math.sin(cop.angle) * cop.speed * dt;
  cop.siren += dt;
  resolveBuildings(city, cop);

  // Stuck recovery: barely moved in the last second and a half.
  const moved = Math.hypot(cop.x - cop.lastX, cop.y - cop.lastY);
  if (moved < 6) cop.stuck += dt; else cop.stuck = 0;
  if (cop.stuck > 1.5) {
    cop.stuck = 0;
    cop.angle += Math.PI / 2;
    cop.x += Math.cos(cop.angle) * 40;
    cop.y += Math.sin(cop.angle) * 40;
  }
  cop.lastX = cop.x;
  cop.lastY = cop.y;
  return cop;
}

// The whole wanted system for one tick. `onBusted` fires when the meter
// fills. Returns nothing; mutates `wanted` and the player's heat state.
export function updateWanted(wanted, player, dt, dice, onBusted) {
  wanted.heat += dt;

  // Keep the number of police cars proportional to the stars.
  const wantCops = wanted.stars === 0 ? 0 : Math.min(2 + wanted.stars, 5);
  wanted.spawnTimer -= dt;
  if (wanted.police.length < wantCops && wanted.spawnTimer <= 0) {
    const p = spawnEdgePoint(dice);
    const cop = makePoliceCar('cop' + wanted.police.length + '-' + Math.floor(wanted.heat), p.x, p.y, 0);
    wanted.police.push(cop);
    wanted.spawnTimer = 2.5;
  }
  if (wanted.stars === 0) {
    // No heat: the fleet stands down at once.
    wanted.police = [];
  }

  // Busted meter: a nearby cop and a slow player fill it; speed empties it.
  const playerSpeed = player.inCar ? Math.abs(player.inCar.speed) : Math.abs(player.speed || 0);
  let nearest = Infinity;
  for (const c of wanted.police) {
    nearest = Math.min(nearest, Math.hypot(c.x - player.x, c.y - player.y));
  }
  if (wanted.stars > 0 && nearest < 110 && playerSpeed < 70) {
    wanted.bustedMeter = clamp(wanted.bustedMeter + 42 * dt, 0, 100);
  } else {
    wanted.bustedMeter = clamp(wanted.bustedMeter - 26 * dt, 0, 100);
  }
  if (wanted.bustedMeter >= 100) {
    wanted.bustedMeter = 0;
    wanted.stars = 0;
    wanted.police = [];
    onBusted();
  }

  // Cooldown: crime-free and no cop within 320px for 8 seconds loses a star.
  if (wanted.stars > 0 && wanted.heat > 10 && nearest > 320) {
    wanted.quiet += dt;
    if (wanted.quiet >= 8) {
      wanted.stars -= 1;
      wanted.quiet = 0;
    }
  } else if (nearest <= 320) {
    wanted.quiet = 0;
  }
}
