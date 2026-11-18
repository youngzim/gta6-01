// Keyboard input: one shared state object the game loop reads each
// frame. WASD and arrows both drive; E interacts, P/Esc pauses, M
// mutes, Enter starts. The game reads `input.up` etc. — never events
// directly — so headless tests can drive the game by setting flags.

export function makeInput() {
  return {
    up: false, down: false, left: false, right: false,
    handbrake: false, interact: false,
    pausePressed: false, mutePressed: false, startPressed: false,
    continuePressed: false,
    // Edge-triggered actions, consumed by the game each frame.
    interactEdge: false, pauseEdge: false, muteEdge: false, startEdge: false,
    continueEdge: false,
    anyKey: false,
  };
}

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  KeyE: 'interact',
};

export function attachInput(input) {
  window.addEventListener('keydown', (e) => {
    const field = KEYMAP[e.code];
    if (field) {
      if (field === 'interact' && !input.interact) input.interactEdge = true;
      input[field] = true;
      e.preventDefault();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (!input.pausePressed) input.pauseEdge = true;
      input.pausePressed = true;
    }
    if (e.code === 'KeyM') {
      if (!input.mutePressed) input.muteEdge = true;
      input.mutePressed = true;
    }
    if (e.code === 'Enter') {
      if (!input.startPressed) input.startEdge = true;
      input.startPressed = true;
    }
    if (e.code === 'KeyC') {
      if (!input.continuePressed) input.continueEdge = true;
      input.continuePressed = true;
    }
    input.anyKey = true;
  });
  window.addEventListener('keyup', (e) => {
    const field = KEYMAP[e.code];
    if (field) input[field] = false;
    if (e.code === 'KeyP' || e.code === 'Escape') input.pausePressed = false;
    if (e.code === 'KeyM') input.mutePressed = false;
    if (e.code === 'Enter') input.startPressed = false;
    if (e.code === 'KeyC') input.continuePressed = false;
  });
  window.addEventListener('blur', () => {
    input.up = input.down = input.left = input.right = false;
    input.handbrake = false;
    input.interact = false;
  });
}

// Consume the edge flags after the game has read them.
export function clearEdges(input) {
  input.interactEdge = false;
  input.pauseEdge = false;
  input.muteEdge = false;
  input.startEdge = false;
  input.continueEdge = false;
}
