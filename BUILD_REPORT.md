# Build Report — gta6-01 entry "Solmaris Heat" (round 2, recorded rebuild)

Status: **READY TO SUBMIT** (pending the main agent's seal + submit steps
listed at the end). Built 2026-11-19 (WIB) inside a sealed kit recording.

## Why a round 2 exists

Round 1 of this entry was refused by the site on one gate:
thinking_reproduces — only 16.5% of code lines counted as agent-written,
below the 30% floor. Cause: the round-1 builder had read the reference
implementation's source files before rewriting them, so most lines counted
as "read", not "written". This round was built differently: the ONLY
reference material read was the round-1 BUILD_REPORT.md (prose: features,
architecture, test results) plus the kit starter files in this repo. No
source file of the round-1 implementation was opened, listed, or inspected
in any way. Every game file here was written fresh, in-session, from the
prose description, with its own architecture and code.

## What was built

An original top-down open-world crime game, **Solmaris Heat**, in
dependency-free browser JavaScript (ES modules, Canvas 2D, WebAudio synth
— zero assets, zero network). Protagonist Rico Vale, fixer Mira Sol, city
Solmaris Bay — all names, cars, story and art are original; nothing copies
Rockstar's GTA names/art/map.

Features:

1. **Complete open world** — procedural 3600×2600 city (6 avenues × 5
   streets), 7 named landmarks (Hotel Palma, Harbour Warehouse, Miras
   Garage, Police HQ, City Hospital, City Hall, Marina), a park, beach
   and sea; on foot and by car; 15 traffic cars driving the lane grid,
   17 parked cars, 26 pedestrians; wanted system with pursuing police;
   a 5-mission story chain.
2. **Depth / fun** — missions: First Wheels (steal the marked Vela) →
   The Package (load at the Harbour Warehouse) → Hot Drop (timed
   delivery to Hotel Palma) → Cool Down (lose the heat in Miras Garage
   yard) → Sunset Run (4 checkpoints), completion bonus, then free roam.
   Any parked car is stealable (first take of a car adds a wanted star);
   knockdowns, car damage/wrecks, busted (fine + police-station respawn)
   and wasted (hospital bill + hospital respawn); cash economy;
   localStorage save/continue (C on the title screen).
3. **Feel / polish** — arcade driving (throttle/brake/reverse,
   speed-sensitive steering, handbrake slides), camera lookahead + speed
   zoom, HUD (cash, health, wanted stars, BUSTED meter, mission card
   with countdown, message toasts, context prompts, speedometer), live
   minimap, title/pause/busted/wasted screens, synthesized engine/siren/
   effects audio (M mutes).
4. **Look / originality** — sun-soaked palette, own city and story
   throughout.
5. **Source structure** — 12 small modules under `game/src/`, one job
   each (rng, city, cars, people, player, police, missions, audio,
   render, input, shots, main), all commented in a consistent voice.
   Traffic drives road-by-road (never leaves the roads, so it can never
   wedge itself in a building); police steer toward the player with a
   limited turn rate plus a stuck-recovery step.

Entrypoint: `main.ts` copies `game/` + `screenshots/` to the output dir
and writes `dossier.json` via `vendor/makefun-game.ts` (byte-for-byte the
kit's file). LICENSE is MIT (OSI) from the starter. The starter's "Block
Dodger" game was fully replaced.

## How to run

- Play: `node serve.ts --port 8901`, open `http://127.0.0.1:8901/` (or open
  `game/index.html` directly). Controls in README.md.
- Grader path: `MAKEFUN_OUTPUT_DIR=<dir> node main.ts` (Node ≥ 22.18;
  developed on Node 24, kept Node 22 compatible).

## Testing performed (real results)

1. **Module parse check** — all 12 game JS files parse as ES modules. PASS.
2. **Headless logic suite** (`node test/logic.mjs`): **34/34 PASS** —
   city determinism across builds, 7 landmarks, 0 buildings on roads,
   0 building overlaps, traffic moving (15/15 above 500px in 90s, all
   on roads), walk/steal/mission-0 (cash 270, 1 star), driving distance,
   police spawn + busted meter + busted callback, full 5-mission chain
   fast-forwarded (story completes, cash 1820), timer expiry restarts a
   timed stage, pedestrian walk/flee/knockdown, damage/wasted.
3. **Browser end-to-end** (`node test/e2e.mjs`, Playwright headless
   Chromium — the VM's managed Chrome refuses direct launch, so a
   Playwright Chromium installed under /tmp purely as a test tool):
   **19/19 PASS** — title → Enter → walk to the marked Vela (steered by
   live positions) → E steals it (cash $120→$270, mission advances to
   stage 1, wanted 1 star) → drive (car moves, still in car) →
   pause/resume → frame rate above 30 fps (measured over 3s of play) →
   **zero console errors, zero page errors, zero failed requests.**
4. **Screenshots** — 4 real renders staged by the game's own `?shot=`
   scenes (cover/foot/chase/mission, seed 7), each visually inspected:
   1280×720 JPEG, 62–69 KiB (cap 256 KiB). They show the mission card,
   wanted stars, police contact, minimap and prompts.
5. **Entrypoint determinism** — `node main.ts` run twice into two output
   dirs: byte-identical outputs; dossier.json 429,787 B (cap 1.5 MiB),
   dossier text 74,767 B (cap 163,840 B); game/ = 13 files, 73,873 B
   (caps 993 files / 48 MiB); no `http(s)` references anywhere in game
   code (fully offline).
6. **Kit check** — `node cli/makefun.mjs check --kit <kit> --repo
   <workdir> --worktree`: **4 passed, 0 failed**, 16 skipped
   (transcript checks the site runs on sealed recordings), 5 deferred to
   submission (repo_public, repo_owner, repo_created_after_open,
   commit_in_repo, duplicate_snapshot).

## Bugs found and fixed during the build

- **Landmark arrival zones unreachable**: mission targets were the
  landmark centres (inside the buildings) with a 90px radius, so the
  player could never arrive — the building walls block the way. Fixed
  by giving landmark targets a 150px arrival radius (120px for the open
  beach checkpoint) and proving reachability in the logic suite by
  completing every stage from a point outside the walls. The Harbour
  Warehouse was also narrowed (240→200px) so it fits its narrow block.
- **Park block overwrote a landmark**: the park was pinned to the same
  block as the Harbour Warehouse, so only 6 landmarks were built and
  `makeMissions` crashed on a null landmark. Moved the park to the
  bottom-row west block.
- **Pedestrian flee outran the knockdown**: the flee reaction returned
  before the collision check, so a car already touching a pedestrian
  never knocked them down. Knockdown is now checked first.
- **Render crash on first frame**: `drawWorld` iterated a `game.cars`
  list that was never built. It now reads `game.parked`/`game.traffic`
  directly (and skips cars already taken).
- **Duplicate export** in main.js (`createGame` exported twice) — fixed.
- **Input edge leak**: the interact edge was not consumed by `step`,
  so one E press could enter and immediately exit a car in tests. The
  edge is now consumed where it is handled.
- **Traffic turn bug** (caught in review before testing): the turn code
  swapped the road and the position along it the wrong way round.
  Rewritten so a turn swaps them correctly, with a per-car deterministic
  stream for turn choices.

## Known shortcomings

- Top-down flat-shaded look: polished and readable, but simpler than
  2.5D/isometric entries may be. Chosen deliberately for stability and
  frame rate.
- Police AI is pursuit + bust meter only — no roadblocks or spike strips.
  Police can grind on a building corner while chasing across blocks;
  the stuck-recovery step and the heat cooldown keep this from stalling
  play.
- Traffic occasionally waits behind kerbside-parked cars that narrow a
  lane (reads as real congestion; it always clears via the stuck-creep).
- One difficulty, no settings; audio is synthesized bleeps/engine hum,
  no music.
- Screenshots were produced with Playwright's Chromium build, not the
  managed "Muse Browser" Chrome (which cannot be launched directly in
  this VM). They are genuine unedited renders of the game's own code via
  its `?shot=` mechanism, as the rules require.

## What the MAIN AGENT must still do (not done by this builder, by design)

1. **Seal the recording** covering this build (recording already running
   when this session started; write the Muse usage rows first, then stop
   it) and submit with the kit:
   `node cli/makefun.mjs submit --competition gta6-01 --recording <id>
   --repo-url https://github.com/youngzim/gta6-01 --commit <sha>
   --title "Solmaris Heat" --keypair <file>` before
   **2026-11-24T15:00:00Z**. The payout pin / delegation already covers
   gta6-01 (expires 2026-11-25T18:59:08Z), so no new signature is needed.
   GitHub About for the repo was already set in round 1 (homepage =
   bounty page, topics incl. makefun) — re-verify it before submitting.
2. Re-run `makefun check` against the final commit (not just the
   worktree) and keep the submission proof (entry ID, commit SHA, status)
   in the submissions log.
