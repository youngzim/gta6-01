// Rendering: one Canvas 2D pass per frame. The world is drawn in world
// coordinates under a camera transform (follow + lookahead + speed
// zoom); the HUD and minimap are drawn in screen coordinates on top.
// The palette is a sun-soaked coast city: warm sand, teal sea, terracotta
// roofs, dark asphalt with pale lane dashes.

import {
  AVENUES, STREETS, ROAD_HALF, WORLD_W, WORLD_H, BEACH_TOP, SEA_TOP,
} from './city.js';
import { clamp } from './rng.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;

const SKY = '#f7e8c8';

export function makeCamera() {
  return { x: 0, y: 0, zoom: 1 };
}

export function updateCamera(cam, player, dt) {
  const speed = player.inCar ? Math.abs(player.inCar.speed) : Math.abs(player.speed || 0);
  const look = 90 + Math.min(120, speed * 0.35);
  const tx = player.x + Math.cos(player.angle) * look - VIEW_W / 2;
  const ty = player.y + Math.sin(player.angle) * look - VIEW_H / 2;
  const k = 1 - Math.exp(-4 * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  const targetZoom = speed > 150 ? 0.82 : 1;
  cam.zoom += (targetZoom - cam.zoom) * k;
  cam.x = clamp(cam.x, -100, WORLD_W - VIEW_W + 100);
  cam.y = clamp(cam.y, -100, WORLD_H - VIEW_H + 100);
}

function drawCarBody(ctx, x, y, angle, color, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const w = 34;
  const h = 18;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
  ctx.fillStyle = color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 5);
  ctx.fill();
  // Cabin and windshield.
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  roundRect(ctx, -6, -h / 2 + 2, 12, h - 4, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,240,0.9)';
  ctx.fillRect(6, -h / 2 + 3, 4, h - 6);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(w / 2 - 2, -h / 2 + 2, 2, 4);
  ctx.fillRect(w / 2 - 2, h / 2 - 6, 2, 4);
  if (opts.police) {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-w / 2 + 2, -h / 2, 6, h);
    ctx.fillStyle = (Math.floor(performance.now() / 300) % 2 === 0) ? '#ff3b30' : '#3b7bff';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (opts.marked) {
    ctx.strokeStyle = '#ffe94d';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, game) {
  const { city, peds, police, player, missions, time } = game;
  const cam = game.camera;

  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  // Ground: grass, then beach sand, then the sea.
  ctx.fillStyle = '#8fbf6a';
  ctx.fillRect(0, 0, WORLD_W, BEACH_TOP);
  ctx.fillStyle = '#ecd9a0';
  ctx.fillRect(0, BEACH_TOP, WORLD_W, SEA_TOP - BEACH_TOP);
  ctx.fillStyle = '#3d9db8';
  ctx.fillRect(0, SEA_TOP, WORLD_W, WORLD_H - SEA_TOP);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 8; i++) {
    const wx = ((i * 430 + time * 12) % WORLD_W);
    ctx.fillRect(wx, SEA_TOP + 18 + (i % 3) * 22, 90, 3);
  }

  // City blocks (pavement).
  ctx.fillStyle = '#c9bda6';
  for (const b of city.blocks) {
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  // The park block stays green.
  const park = city.blocks.find((b) => b.col === 0 && b.row === 4);
  if (park) {
    ctx.fillStyle = '#6fae56';
    ctx.fillRect(park.x, park.y, park.w, park.h);
  }

  // Roads: asphalt, centre dashes, edge lines.
  ctx.fillStyle = '#3a3f4a';
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_HALF, 0, ROAD_HALF * 2, BEACH_TOP);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
  ctx.strokeStyle = 'rgba(240,230,180,0.8)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  for (const ax of AVENUES) { ctx.moveTo(ax, 0); ctx.lineTo(ax, BEACH_TOP); }
  for (const sy of STREETS) { ctx.moveTo(0, sy); ctx.lineTo(WORLD_W, sy); }
  ctx.stroke();
  ctx.setLineDash([]);

  // Buildings: body, roof inset, landmark label.
  for (const b of city.buildings) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 6);
    if (b.short) {
      ctx.fillStyle = '#222';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.short, b.x + b.w / 2, b.y + b.h / 2 + 5);
    }
  }

  // Trees.
  for (const t of city.trees) {
    ctx.fillStyle = '#5a8a4a';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5a3a';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mission marker: a pulsing beacon over the current target.
  const target = game.missionTarget;
  if (target) {
    const pulse = 1 + 0.18 * Math.sin(time * 5);
    ctx.strokeStyle = '#ffe94d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffe94d';
    ctx.beginPath();
    ctx.moveTo(target.x, target.y - 52);
    ctx.lineTo(target.x - 10, target.y - 34);
    ctx.lineTo(target.x + 10, target.y - 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(target.label, target.x, target.y - 58);
  }

  // Pedestrians.
  for (const p of peds) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.state === 'down' ? '#999' : p.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(4, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Cars: parked, traffic, police, then the driven car on top.
  for (const c of game.parked) {
    if (!c.taken) drawCarBody(ctx, c.x, c.y, c.angle, c.color, { marked: c.mission });
  }
  for (const c of game.traffic) {
    drawCarBody(ctx, c.x, c.y, c.angle, c.color);
  }
  for (const cop of police.police) {
    drawCarBody(ctx, cop.x, cop.y, cop.angle, cop.color, { police: true });
  }
  if (player.inCar) {
    drawCarBody(ctx, player.inCar.x, player.inCar.y, player.inCar.angle, player.inCar.color);
  }

  // The player on foot.
  if (!player.inCar) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#e84f4f';
    ctx.beginPath();
    ctx.arc(0, 0, player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(5, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawStars(ctx, n, x, y) {
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < n ? '#ffd94d' : 'rgba(255,255,255,0.25)';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillText('★', x + i * 28, y);
  }
}

export function drawHUD(ctx, game) {
  const { player, missions, wanted } = game;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Top-left: cash, health, wanted stars.
  ctx.fillStyle = 'rgba(10,14,22,0.55)';
  roundRect(ctx, 12, 12, 250, 96, 10);
  ctx.fill();
  ctx.fillStyle = '#7dff8a';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('$' + player.cash, 26, 44);
  ctx.fillStyle = '#e84f4f';
  ctx.fillRect(26, 56, 120, 10);
  ctx.fillStyle = '#7dff8a';
  ctx.fillRect(26, 56, 120 * (player.health / 100), 10);
  drawStars(ctx, wanted.stars, 26, 92);

  // Busted meter.
  if (wanted.bustedMeter > 2) {
    ctx.fillStyle = 'rgba(10,14,22,0.55)';
    roundRect(ctx, 12, 116, 250, 40, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('BUSTED', 26, 134);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(26, 140, 222 * (wanted.bustedMeter / 100), 8);
  }

  // Mission card, top centre.
  const stage = missions.done ? null : missions.stages[missions.stage];
  ctx.fillStyle = 'rgba(10,14,22,0.55)';
  roundRect(ctx, VIEW_W / 2 - 260, 12, 520, 64, 10);
  ctx.fill();
  ctx.fillStyle = '#ffe94d';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  if (missions.done) {
    ctx.fillText('FREE ROAM — story complete', VIEW_W / 2, 38);
    ctx.fillStyle = '#fff';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Solmaris Bay is yours. Keep the change.', VIEW_W / 2, 60);
  } else {
    ctx.fillText((missions.stage + 1) + '. ' + stage.title, VIEW_W / 2, 36);
    ctx.fillStyle = '#fff';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(stage.goal, VIEW_W / 2, 58);
  }
  if (missions.timer > 0) {
    ctx.fillStyle = missions.timer < 15 ? '#ff6b5e' : '#fff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(Math.ceil(missions.timer) + 's', VIEW_W / 2 + 280, 40);
  }

  // Toasts and prompts, bottom centre.
  let y = VIEW_H - 96;
  if (missions.messageTimer > 0) {
    ctx.fillStyle = 'rgba(10,14,22,0.65)';
    roundRect(ctx, VIEW_W / 2 - 220, y - 24, 440, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#ffe94d';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(missions.message, VIEW_W / 2, y);
    y -= 42;
  }
  if (game.prompt) {
    ctx.fillStyle = 'rgba(10,14,22,0.65)';
    roundRect(ctx, VIEW_W / 2 - 200, y - 24, 400, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(game.prompt, VIEW_W / 2, y);
    y -= 42;
  }
  // Speedometer, bottom right.
  const speed = player.inCar ? Math.abs(player.inCar.speed) : 0;
  if (player.inCar) {
    ctx.fillStyle = 'rgba(10,14,22,0.55)';
    roundRect(ctx, VIEW_W - 140, VIEW_H - 64, 128, 52, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(speed * 0.9) + '', VIEW_W - 30, VIEW_H - 30);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(player.inCar.model.name, VIEW_W - 30, VIEW_H - 52);
    ctx.textAlign = 'left';
  }

  drawMinimap(ctx, game);
}

export function drawMinimap(ctx, game) {
  const { city, player, police } = game;
  const mw = 210;
  const mh = 152;
  const mx = VIEW_W - mw - 12;
  const my = 12;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.fillStyle = 'rgba(10,14,22,0.6)';
  roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  ctx.fillStyle = '#5a7a4a';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#3d9db8';
  ctx.fillRect(mx, my + (SEA_TOP * sy), mw, mh);
  ctx.fillStyle = '#3a3f4a';
  for (const ax of AVENUES) ctx.fillRect(mx + ax * sx - 2, my, 4, mh);
  for (const sy2 of STREETS) ctx.fillRect(mx, my + sy2 * sy - 2, mw, 4);
  const target = game.missionTarget;
  if (target) {
    ctx.fillStyle = '#ffe94d';
    ctx.beginPath();
    ctx.arc(mx + target.x * sx, my + target.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of police.police) {
    ctx.fillStyle = '#3b7bff';
    ctx.beginPath();
    ctx.arc(mx + cop.x * sx, my + cop.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(mx + player.x * sx, my + player.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e84f4f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(mx + player.x * sx, my + player.y * sy, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawScreen(ctx, kind, game) {
  ctx.fillStyle = 'rgba(8,10,18,0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe94d';
  ctx.font = 'bold 64px system-ui, sans-serif';
  const titles = {
    title: 'SOLMARIS HEAT',
    pause: 'PAUSED',
    busted: 'BUSTED',
    wasted: 'WASTED',
  };
  ctx.fillText(titles[kind] || kind, VIEW_W / 2, VIEW_H / 2 - 60);
  ctx.fillStyle = '#fff';
  ctx.font = '20px system-ui, sans-serif';
  const lines = {
    title: [
      'Solmaris Bay, 7:40 PM. Rico Vale needs money, and Mira Sol has jobs.',
      'WASD / arrows — move & drive · E — steal / enter a car · Space — handbrake',
      'P — pause · M — mute',
      '',
      'Press ENTER to start' + (game.hasSave ? ' — or C to continue your save' : ''),
    ],
    pause: ['Press P or Esc to keep playing.'],
    busted: ['The cops caught you. Fine paid, car impounded.', 'Press ENTER to walk out of the station.'],
    wasted: ['You woke up in City Hospital. The bill stings.', 'Press ENTER to get back on the street.'],
  }[kind] || [];
  lines.forEach((line, i) => {
    ctx.fillText(line, VIEW_W / 2, VIEW_H / 2 - 10 + i * 32);
  });
  if (kind === 'title') {
    ctx.fillStyle = '#9aa5b1';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('An original open-world crime game. No Rockstar assets, no network, no mercy.', VIEW_W / 2, VIEW_H - 40);
  }
}
