// Screenshot staging: `?shot=<scene>&seed=<n>` puts the game into a
// fixed, deterministic pose and renders one frame, so the four dossier
// screenshots are genuine renders of the game's own code. The e2e test
// waits for `window.__shotReady` before capturing.

import { landmarkCenter } from './city.js';
import { makeDrivenCar } from './cars.js';
import { addCrime } from './police.js';

export const SHOT_NAMES = ['cover', 'foot', 'chase', 'mission'];

// Stage one scene. Mutates the live game object, then the caller runs a
// few fixed update ticks and renders. Returns false for an unknown scene.
export function stageShot(game, name) {
  const { player, missions, wanted, city } = game;
  const palma = landmarkCenter(city, 'Hotel Palma');
  const harbour = landmarkCenter(city, 'Harbour Warehouse');

  // Reset the player to a clean pose first.
  player.inCar = null;
  player.health = 100;
  wanted.stars = 0;
  wanted.police = [];
  wanted.bustedMeter = 0;
  missions.stage = 0;
  missions.done = false;
  missions.message = '';
  missions.messageTimer = 0;

  if (name === 'cover') {
    // Rico driving the Vela down Palm Row past Hotel Palma, one star.
    const vela = game.parked.find((c) => c.mission) || game.parked[0];
    const driven = makeDrivenCar(vela.x, vela.y, 0, vela.model);
    driven.mission = true;
    player.inCar = driven;
    player.x = driven.x;
    player.y = driven.y;
    player.angle = 0;
    driven.speed = 90;
    missions.stage = 1;
    missions.message = 'The Package: drive to the Harbour Warehouse';
    missions.messageTimer = 99;
    addCrime(wanted, 1);
    game.camera.x = player.x - 640;
    game.camera.y = player.y - 360;
    return true;
  }

  if (name === 'foot') {
    // Rico on foot beside the marked Vela, prompt showing.
    const vela = game.parked.find((c) => c.mission) || game.parked[0];
    player.x = vela.x - 60;
    player.y = vela.y + 40;
    player.angle = 0;
    game.prompt = 'E — Steal the marked Vela';
    game.camera.x = player.x - 640;
    game.camera.y = player.y - 360;
    return true;
  }

  if (name === 'chase') {
    // Full speed down an avenue, three stars, two interceptors closing in.
    const vela = game.parked.find((c) => c.mission) || game.parked[0];
    const driven = makeDrivenCar(1300, 1200, Math.PI / 2, vela.model);
    driven.speed = 190;
    player.inCar = driven;
    player.x = driven.x;
    player.y = driven.y;
    player.angle = Math.PI / 2;
    addCrime(wanted, 3);
    missions.stage = 2;
    missions.timer = 62;
    missions.message = 'Hot Drop: deliver to Hotel Palma';
    missions.messageTimer = 99;
    game.camera.x = player.x - 640;
    game.camera.y = player.y - 360;
    // Spawn the two cops right behind the player for the shot.
    wanted.spawnTimer = 99;
    for (let i = 0; i < 2; i++) {
      wanted.police.push({
        id: 'shot-cop' + i, kind: 'police', model: { name: 'Interceptor', color: '#20242e', top: 178, accel: 155 },
        x: 1300 + (i === 0 ? -14 : 14), y: 1200 - 130 - i * 40,
        angle: Math.PI / 2, speed: 170, r: 15, color: '#20242e',
        stuck: 0, lastX: 1300, lastY: 1200 - 130, siren: 0,
      });
    }
    return true;
  }

  if (name === 'mission') {
    // Arriving at the Harbour Warehouse for the pickup: parked on the
    // pavement just south of the warehouse doors, inside the zone.
    const driven = makeDrivenCar(harbour.x, harbour.y + 130, 0, game.parked[0].model);
    driven.speed = 40;
    player.inCar = driven;
    player.x = driven.x;
    player.y = driven.y;
    player.angle = 0;
    missions.stage = 1;
    missions.hold = 1.5;
    missions.message = 'Loading the package… stay in the zone';
    missions.messageTimer = 99;
    game.camera.x = player.x - 640;
    game.camera.y = player.y - 360;
    return true;
  }

  return false;
}
