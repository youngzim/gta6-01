// The story: five jobs for Rico Vale, chained in order, then free roam.
// Each stage names its goal, its map marker and (for the timed ones) its
// clock. The game owns the state machine; the renderer only reads it.
// A stage completes when its condition is met; a timed stage that runs
// out restarts itself with a small penalty instead of ending the game.

import { landmarkCenter } from './city.js';

export const MISSION_COUNT = 5;

export function makeMissions(city) {
  const palma = landmarkCenter(city, 'Hotel Palma');
  const harbour = landmarkCenter(city, 'Harbour Warehouse');
  const garage = landmarkCenter(city, 'Miras Garage');
  const marina = landmarkCenter(city, 'Marina');
  const hall = landmarkCenter(city, 'City Hall');
  return {
    stage: 0,
    done: false,
    timer: 0, // seconds left on a timed stage (0 = untimed)
    hold: 0, // seconds the player must stay inside a zone
    checkpoint: 0, // index into the Sunset Run checkpoint list
    message: '',
    messageTimer: 0,
    // The Vela the first job asks for: parked on Palm Row, by the kerb.
    velaSpot: { x: 470, y: 300 },
    stages: [
      {
        title: 'First Wheels',
        goal: 'Steal the marked Vela (walk up and press E)',
        target: { x: 470, y: 300, label: 'VELA' },
        reward: 150,
      },
      {
        title: 'The Package',
        goal: 'Drive to the Harbour Warehouse and wait for the load',
        // Arrival radius 150: the warehouse is a wide building and its
        // centre is inside it — the player can only reach its doors.
        target: { x: harbour.x, y: harbour.y, label: 'HARBOUR', radius: 150 },
        reward: 150,
      },
      {
        title: 'Hot Drop',
        goal: 'Deliver the package to Hotel Palma before the clock runs out',
        target: { x: palma.x, y: palma.y, label: 'PALMA', radius: 150 },
        reward: 300,
        time: 80,
      },
      {
        title: 'Cool Down',
        goal: 'Lose the heat: reach Miras Garage and let the stars fade',
        target: { x: garage.x, y: garage.y, label: 'GARAGE', radius: 150 },
        reward: 100,
      },
      {
        title: 'Sunset Run',
        goal: 'Hit all 4 checkpoints in order before sunset',
        target: { x: marina.x, y: marina.y, label: 'MARINA' },
        reward: 400,
        time: 110,
      },
    ],
    checkpoints: [
      { x: marina.x, y: marina.y, label: 'MARINA', radius: 150 },
      { x: hall.x, y: hall.y, label: 'HALL', radius: 150 },
      { x: 2800, y: 2380, label: 'BEACH', radius: 120 },
      { x: palma.x, y: palma.y, label: 'PALMA', radius: 150 },
    ],
  };
}

export function currentStage(m) {
  return m.done ? null : m.stages[m.stage];
}

export function currentTarget(m) {
  if (m.done) return null;
  if (m.stage === 4) return m.checkpoints[m.checkpoint];
  return m.stages[m.stage].target;
}

function advance(m, player, bonus) {
  const reward = m.stages[m.stage].reward + (bonus || 0);
  player.cash += reward;
  m.message = 'Job done: +' + reward + ' cash';
  m.messageTimer = 4;
  m.stage += 1;
  m.timer = 0;
  m.hold = 0;
  m.checkpoint = 0;
  if (m.stage >= MISSION_COUNT) {
    m.done = true;
    player.cash += 500;
    m.message = 'Story complete: +500 bonus. Free roam, Rico.';
    m.messageTimer = 6;
  }
}

// Called when a timed stage starts, so the clock is set exactly once.
export function startStage(m) {
  const s = m.stages[m.stage];
  m.timer = s.time || 0;
  m.hold = 0;
}

function restartStage(m, player, reason) {
  player.cash = Math.max(0, player.cash - 50);
  m.message = reason + ' Job restarted (-50 cash).';
  m.messageTimer = 4;
  m.timer = m.stages[m.stage].time || 0;
  m.hold = 0;
  m.checkpoint = 0;
}

// The mission tick. `ctx` carries the live world: player, wanted,
// whether the player is driving the mission Vela, and a hook the game
// uses to set the wanted level for the Cool Down stage.
export function updateMissions(m, dt, ctx) {
  if (m.messageTimer > 0) m.messageTimer -= dt;
  if (m.done) return;

  const stage = m.stages[m.stage];
  const player = ctx.player;

  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = 0;
      restartStage(m, player, 'Out of time.');
      return;
    }
  }

  const target = currentTarget(m);
  const d = Math.hypot(player.x - target.x, player.y - target.y);

  if (m.stage === 0) {
    // Complete when the player is driving the marked Vela.
    if (ctx.drivingVela) advance(m, player, 0);
    return;
  }

  if (m.stage === 1) {
    // Wait inside the warehouse zone for the load.
    if (d < (target.radius || 90)) {
      m.hold += dt;
      if (m.hold >= 3) advance(m, player, 0);
    } else {
      m.hold = 0;
    }
    return;
  }

  if (m.stage === 2) {
    if (d < (target.radius || 90)) advance(m, player, 0);
    return;
  }

  if (m.stage === 3) {
    // The heat is set when the stage starts (ctx.heatSet). Complete
    // when the player reaches the garage with no stars left.
    if (d < (target.radius || 90) && ctx.wanted.stars === 0) advance(m, player, 0);
    return;
  }

  if (m.stage === 4) {
    if (d < (target.radius || 90)) {
      m.checkpoint += 1;
      player.cash += 25;
      m.message = 'Checkpoint ' + m.checkpoint + ' of 4 (+25 cash)';
      m.messageTimer = 2.5;
      if (m.checkpoint >= m.checkpoints.length) {
        advance(m, player, 0);
      }
    }
  }
}

// Called by the game when a stage begins, for one-off stage setup:
// the Hot Drop clock, and the heat that makes Cool Down meaningful.
export function onStageStart(m, ctx) {
  startStage(m);
  if (m.stage === 3 && ctx.wanted) {
    ctx.wanted.stars = Math.max(ctx.wanted.stars, 2);
    ctx.wanted.heat = 0;
  }
}
