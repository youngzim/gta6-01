// The city of Solmaris Bay: roads, blocks, buildings, landmarks.
// The layout is a fixed hand-drawn skeleton (avenues and streets on a grid)
// filled in procedurally from the seed: which blocks hold how many
// buildings, their sizes and colours, trees, parked cars and pedestrians.
// The fixed skeleton is what makes the mission geography stable across
// seeds; the procedural fill is what makes each seed feel lived-in.

import { makeDice, clamp } from './rng.js';

export const WORLD_W = 3600;
export const WORLD_H = 2600;

// The road skeleton: 6 avenues (north-south) and 5 streets (east-west).
export const AVENUES = [300, 800, 1300, 1800, 2300, 2800];
export const STREETS = [300, 750, 1200, 1650, 2100];
export const ROAD_HALF = 55; // half the asphalt width
export const WALK = 14; // sidewalk band around each block

// The beach and the sea close the map to the south.
export const BEACH_TOP = 2320;
export const SEA_TOP = 2460;

const BUILDING_PALETTE = [
  '#e8b04b', '#d98a4b', '#c96f5a', '#7fae7a', '#6f9fb8',
  '#b08cc4', '#d9c27a', '#8fb8a8', '#c4a484', '#9aa5b1',
];
const ROOF_PALETTE = ['#5a4a3a', '#6b5a4a', '#4a5a6b', '#7a6a5a'];

// The seven named landmarks. Each is pinned to one block (by its grid
// column/row) so missions can always find it in the same place.
export const LANDMARKS = [
  { name: 'Hotel Palma', short: 'PALMA', col: 3, row: 0, color: '#e8b04b', w: 260, h: 150 },
  { name: 'Harbour Warehouse', short: 'HARBOUR', col: 0, row: 3, color: '#8a7a5a', w: 200, h: 120 },
  { name: 'Miras Garage', short: 'GARAGE', col: 2, row: 2, color: '#c96f5a', w: 200, h: 120 },
  { name: 'Police HQ', short: 'POLICE', col: 4, row: 1, color: '#5a7aa8', w: 220, h: 140 },
  { name: 'City Hospital', short: 'HOSPITAL', col: 1, row: 1, color: '#e8e8e8', w: 230, h: 140 },
  { name: 'City Hall', short: 'HALL', col: 2, row: 0, color: '#d9c27a', w: 210, h: 130 },
  { name: 'Marina', short: 'MARINA', col: 4, row: 3, color: '#6fb8c4', w: 240, h: 120 },
];

export function buildCity(seed) {
  const dice = makeDice(seed);
  const blocks = [];
  const buildings = [];
  const trees = [];

  // Blocks are the rectangles between neighbouring roads. A block's
  // walkable edge is inset from the road by the sidewalk band.
  const colEdges = [0, ...AVENUES, WORLD_W];
  const rowEdges = [0, ...STREETS, BEACH_TOP];
  for (let r = 0; r < rowEdges.length - 1; r++) {
    for (let c = 0; c < colEdges.length - 1; c++) {
      const x0 = colEdges[c] + (c === 0 ? 0 : ROAD_HALF) + WALK;
      const x1 = colEdges[c + 1] - (c === colEdges.length - 2 ? 0 : ROAD_HALF) - WALK;
      const y0 = rowEdges[r] + (r === 0 ? 0 : ROAD_HALF) + WALK;
      const y1 = rowEdges[r + 1] - (r === rowEdges.length - 2 ? 0 : ROAD_HALF) - WALK;
      const block = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, col: c, row: r };
      blocks.push(block);
      // The south-west block (bottom row, first column) is the park:
      // grass, trees, no buildings. It must not be a landmark block.
      if (c === 0 && r === 4) {
        for (let i = 0; i < 26; i++) {
          trees.push({
            x: block.x + dice.range(20, block.w - 20),
            y: block.y + dice.range(20, block.h - 20),
            r: dice.range(9, 15),
          });
        }
        continue;
      }
      // A landmark block holds exactly its landmark, centred.
      const mark = LANDMARKS.find((m) => m.col === c && m.row === r);
      if (mark) {
        buildings.push({
          x: block.x + (block.w - mark.w) / 2,
          y: block.y + (block.h - mark.h) / 2,
          w: mark.w, h: mark.h,
          color: mark.color, roof: '#4a3a2a',
          landmark: mark.name, short: mark.short,
        });
        continue;
      }
      // Ordinary blocks: 1-3 buildings fitted inside the block with a
      // margin, sized first and placed second so nothing ever overlaps
      // a road or another building.
      const count = dice.int(1, 3);
      const placed = [];
      for (let i = 0; i < count; i++) {
        const bw = dice.range(90, Math.min(220, block.w - 30));
        const bh = dice.range(70, Math.min(170, block.h - 30));
        let bx = 0;
        let by = 0;
        let ok = false;
        for (let tries = 0; tries < 12 && !ok; tries++) {
          bx = block.x + dice.range(8, Math.max(9, block.w - bw - 8));
          by = block.y + dice.range(8, Math.max(9, block.h - bh - 8));
          ok = placed.every((p) => bx + bw + 18 < p.x || p.x + p.w + 18 < bx
            || by + bh + 18 < p.y || p.y + p.h + 18 < by);
        }
        if (!ok) continue;
        const b = {
          x: bx, y: by, w: bw, h: bh,
          color: dice.pick(BUILDING_PALETTE),
          roof: dice.pick(ROOF_PALETTE),
        };
        placed.push(b);
        buildings.push(b);
      }
      // A few palm trees along the block edge.
      const nTrees = dice.int(0, 3);
      for (let i = 0; i < nTrees; i++) {
        trees.push({
          x: block.x + dice.range(10, block.w - 10),
          y: block.y + dice.range(10, block.h - 10),
          r: dice.range(8, 12),
        });
      }
    }
  }

  // Beach palms along the sand.
  for (let i = 0; i < 14; i++) {
    trees.push({ x: 60 + i * 250 + dice.range(-30, 30), y: BEACH_TOP + 60 + dice.range(0, 60), r: 12 });
  }

  return { blocks, buildings, trees, seed };
}

// --- Queries -------------------------------------------------------------

export function isOnRoad(city, x, y) {
  if (y >= BEACH_TOP) return false;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_HALF) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_HALF) return true;
  return false;
}

// The nearest point on any road centreline, for snapping spawns.
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < bestD) { bestD = d; best = { x: ax, y: clamp(y, 0, WORLD_H) }; }
  }
  for (const sy of STREETS) {
    const d = Math.abs(y - sy);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 0, WORLD_W), y: sy }; }
  }
  return best;
}

// Circle-vs-buildings: push a circle of radius r out of any building it
// overlaps. Returns true when a push happened. Buildings are the only
// solid obstacles; roads, sidewalks, the park and the beach are open.
export function resolveBuildings(city, body) {
  let pushed = false;
  for (const b of city.buildings) {
    const cx = clamp(body.x, b.x, b.x + b.w);
    const cy = clamp(body.y, b.y, b.y + b.h);
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.r * body.r) continue;
    pushed = true;
    if (d2 > 0.01) {
      const d = Math.sqrt(d2);
      body.x = cx + (dx / d) * body.r;
      body.y = cy + (dy / d) * body.r;
    } else {
      // Centre inside the building: push out along the shortest side.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) body.x = b.x - body.r;
      else if (m === right) body.x = b.x + b.w + body.r;
      else if (m === top) body.y = b.y - body.r;
      else body.y = b.y + b.h + body.r;
    }
  }
  // Keep everything inside the world.
  body.x = clamp(body.x, body.r, WORLD_W - body.r);
  body.y = clamp(body.y, body.r, WORLD_H - body.r);
  return pushed;
}

export function buildingAt(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

export function landmarkCenter(city, name) {
  for (const b of city.buildings) {
    if (b.landmark === name) return { x: b.x + b.w / 2, y: b.y + b.h / 2, b };
  }
  return null;
}

// A random point on a sidewalk (a block edge), for pedestrian spawns.
export function randomSidewalkPoint(city, dice) {
  const block = dice.pick(city.blocks);
  const side = dice.int(0, 3);
  if (side === 0) return { x: block.x + dice.range(0, block.w), y: block.y - WALK / 2 };
  if (side === 1) return { x: block.x + dice.range(0, block.w), y: block.y + block.h + WALK / 2 };
  if (side === 2) return { x: block.x - WALK / 2, y: block.y + dice.range(0, block.h) };
  return { x: block.x + block.w + WALK / 2, y: block.y + dice.range(0, block.h) };
}
