// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints the cockpit view. Screens: title
// (pick a leg), play, paused, game over.
//
// ?seed=N fixes the route. ?level=1..5 (or 0 = Free Roam) picks the leg.
// ?shot=takeoff|play|storm|landing (with &level=N &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, LEVELS, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_CRASH,
  EVENT_LAND,
  EVENT_NEAR,
  EVENT_OVER,
  EVENT_RING,
  EVENT_THUNDER,
  EVENT_WARN,
} from './world.js';
import {
  ACTION_ADVENTURE,
  ACTION_CONFIRM,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  ACTION_VIEW,
  createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, VIEW_FPP, VIEW_TPP } from './render.js';
import { createAudio } from './audio.js';
import { attractStep, stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const levelParam = Number.parseInt(params.get('level') ?? '', 10);
const levelIndex = Number.isInteger(levelParam) ? (levelParam === 0 ? 5 : Math.max(0, Math.min(4, levelParam - 1))) : 0;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
let world = createWorld(createRandom(seed), levelIndex);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const view = scene.view ?? (name === 'tpp' ? VIEW_TPP : VIEW_FPP);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, scene.best, view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let currentLevel = 0;
  let view = VIEW_FPP;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function setLevel(idx) {
    currentLevel = idx;
    world = createWorld(createRandom(seed + idx * 7919), idx);
    announce(`Leg ${LEVELS[idx].name} — ${LEVELS[idx].place}. ${LEVELS[idx].note}`);
  }

  function startGame() {
    audio.unlock();
    audio.click();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Flying ${world.level.name}. Follow the route, land on runway B.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (world.state.won) audio.land();
    else audio.crash();
    announce(world.state.won ? `Landed. Score ${world.state.score}.` : `Crashed. Score ${world.state.score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const pick = input.takeLevelPick();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_VIEW) {
      view = view === VIEW_FPP ? VIEW_TPP : VIEW_FPP;
      announce(view === VIEW_FPP ? 'Cockpit view.' : 'Chase view.');
    }
    if (pick >= 1 && pick <= 5) {
      setLevel(pick - 1);
      if (screen === SCREEN_TITLE) startGame();
      return;
    }
    if (actions & ACTION_ADVENTURE) {
      setLevel(5);
      if (screen === SCREEN_TITLE) startGame();
      return;
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      attractStep(world, STEP);
      if (world.state.over) world.reset();
      return;
    }
    const steer = input.steer();
    const events = world.step(STEP, steer, input.throttleDelta(), input.brake(), false);
    audio.update(world.state.speed, world.state.throttle, screen === SCREEN_PLAY, world.level.storm);
    if (events & EVENT_RING) audio.ring(0.2);
    if (events & EVENT_NEAR) audio.nearMiss();
    if (events & EVENT_WARN) audio.warn();
    if (events & EVENT_THUNDER) audio.thunder();
    if (events & EVENT_OVER) endGame();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, best, view);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Jet Point. Press 1-5 or A to pick a leg, Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
