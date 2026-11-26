// Screenshot scenes behind ?shot=takeoff|play|storm|landing (with &level=N
// and &seed=N). Each one plays the real rules forward from a fresh world,
// steered by an autopilot that aims at the next waypoint (or the runway), so
// the frame is what a real sortie looks like.
import { JET, STEP, WORLD } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;

/** Steer by heading error to a target point (x, y, z). */
function autopilot(state, targetX, targetY, targetZ, speedTarget, gain = 2.2) {
  const wantH = Math.atan2(targetX - state.x, targetZ - state.z);
  let dh = wantH - state.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const sx = Math.max(-1, Math.min(1, dh * gain));
  const sy = Math.max(-1, Math.min(1, (targetY - state.y) / 30));
  const td = state.speed < speedTarget ? 1 : state.speed > speedTarget + 8 ? -1 : 0;
  return { sx, sy, td };
}

function flyTo(world, seconds, aim) {
  const limit = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < limit; i += 1) {
    const state = world.state;
    if (state.over) break;
    const a = aim(state);
    const events = world.step(SAMPLE, { x: a.sx, y: a.sy }, a.td, false, false);
    if (events & EVENT_OVER) break;
  }
}

function aimAtNextRing(world) {
  return (state) => {
    const next = world.nextRing();
    if (!next) return aimAtRunway(world)(state);
    const groundAhead = world.terrainHeight(state.x, state.z + 150);
    const ty = Math.max(next.y, groundAhead + 30);
    return autopilot(state, next.x, ty, next.z, JET.cruiseSpeed);
  };
}

function aimAtRunway(world) {
  return (state) => {
    const bz = world.runwayB.z;
    const dz = bz - state.z;
    const targetY = dz > 1200 ? 140 : dz > 500 ? 60 : dz > 150 ? 25 : 10;
    // Aim point must always sit AHEAD of the jet: aiming at the centre
    // point once past it makes the autopilot U-turn while still over the
    // strip (that bug spiralled it into the grass). Over the strip, hold
    // the centreline ahead; past the strip end the world's go-around
    // teleports it back to final, so aiming at the centre is safe again.
    let aimZ;
    if (state.z > bz + WORLD.runwayLength / 2) aimZ = bz;
    else if (dz > 300) aimZ = state.z + 300;
    else aimZ = state.z + 400;
    return autopilot(state, world.runwayB.x, targetY, aimZ, dz > 500 ? 80 : 55, 4.0);
  };
}

export function stageShot(name, world) {
  world.reset();
  if (name === 'takeoff') {
    // Full throttle down the strip, just lifting off.
    flyTo(world, 1.2, (state) => autopilot(state, 0, 60, 800, JET.cruiseSpeed));
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: 0 };
  }
  if (name === 'storm') {
    // Mid-route in the storm: rain, traffic, a ring in the murk.
    flyTo(world, 30, aimAtNextRing(world));
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'landing') {
    // Full leg: rings, then the final approach and touchdown.
    flyTo(world, 400, aimAtNextRing(world));
    if (!world.state.over) flyTo(world, 200, aimAtRunway(world));
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  // Default 'play': 25 seconds into the leg, mid-route, rings ahead.
  flyTo(world, 25, aimAtNextRing(world));
  return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}

// The title screen's demo flight uses the same autopilot.
export function attractStep(world, dt) {
  return world.step(dt, { x: 0, y: 0 }, 0, false, true);
}
