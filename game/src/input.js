// Keyboard + mouse steering. Arrow keys / WASD fly, W/S throttle, Space brakes,
// mouse move steers toward the pointer, click confirms on menus.
// Number keys 1-5 pick a leg on the title screen, A picks Free Roam.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;
export const ACTION_ADVENTURE = 16;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let levelPick = -1; // 1..5, or 0 for adventure, once a key is pressed
  let pointerX = 0.5; // 0..1 across the canvas
  let pointerY = 0.5;
  let pointerActive = false;
  let pointerDown = false;

  function onKeyDown(event) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(event.key.toLowerCase());
    if (event.key === ' ' || event.key === 'Enter') actions |= ACTION_CONFIRM;
    if (event.key.toLowerCase() === 'p' || event.key === 'Escape') actions |= ACTION_PAUSE;
    if (event.key.toLowerCase() === 'r') actions |= ACTION_RESTART;
    if (event.key.toLowerCase() === 'm') actions |= ACTION_MUTE;
    if (event.key.toLowerCase() === 'a') actions |= ACTION_ADVENTURE;
    const n = Number.parseInt(event.key, 10);
    if (n >= 1 && n <= 5) levelPick = n;
  }
  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }
  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointerX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    pointerY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    pointerActive = true;
  }
  function onPointerDown(event) {
    onPointerMove(event);
    pointerDown = true;
    actions |= ACTION_CONFIRM;
  }
  function onPointerUp() {
    pointerDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);

  return {
    // -1..1 lateral, -1..1 vertical (positive = climb), from keys or pointer.
    steer() {
      let x = 0;
      let y = 0;
      if (keys.has('arrowleft') || keys.has('a')) x -= 1;
      if (keys.has('arrowright') || keys.has('d')) x += 1;
      if (keys.has('arrowup')) y += 1;
      if (keys.has('arrowdown')) y -= 1;
      if (x === 0 && y === 0 && pointerActive && pointerDown) {
        // Hold the mouse button and drag: the jet chases the pointer.
        x = Math.max(-1, Math.min(1, (pointerX - 0.5) * 2.4));
        y = Math.max(-1, Math.min(1, (0.5 - pointerY) * 2.4));
      }
      return { x, y };
    },
    // -1 (idle) .. +1 (full): W/S or Shift, Space brakes.
    throttleDelta() {
      let d = 0;
      if (keys.has('w') || keys.has('shift')) d += 1;
      if (keys.has('s')) d -= 1;
      return d;
    },
    brake() {
      return keys.has(' ');
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    // The leg the player picked on the title screen (-1 = none yet).
    takeLevelPick() {
      const pick = levelPick;
      levelPick = -1;
      return pick;
    },
  };
}
