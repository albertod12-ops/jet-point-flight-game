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
    const leg = world.leg;
    const groundAhead = world.terrainHeight(state.x + leg.dirX * 150, state.z + leg.dirZ * 150);
    const ty = Math.max(next.y, groundAhead + 30);
    return autopilot(state, next.x, ty, next.z, JET.cruiseSpeed);
  };
}

function aimAtRunway(world) {
  return (state) => {
    const leg = world.leg;
    // Distance along the leg direction from the jet to runway B.
    const along = (world.runwayB.x - state.x) * leg.dirX + (world.runwayB.z - state.z) * leg.dirZ;
    const targetY = along > 1200 ? 140 : along > 500 ? 60 : along > 150 ? 25 : 10;
    // Aim point must always sit AHEAD of the jet: aiming at the centre
    // point once past it makes the autopilot U-turn while still over the
    // strip (that bug spiralled it into the grass). Over the strip, hold
    // the centreline ahead; past the strip end the world's go-around
    // teleports it back to final, so aiming at the centre is safe again.
    let aimX;
    let aimZ;
    if (along < -WORLD.runwayLength / 2) {
      aimX = world.runwayB.x;
      aimZ = world.runwayB.z;
    } else {
      const ahead = along > 300 ? 300 : 400;
      const dist = along - ahead;
      aimX = world.runwayB.x - leg.dirX * dist;
      aimZ = world.runwayB.z - leg.dirZ * dist;
    }
    return autopilot(state, aimX, targetY, aimZ, along > 500 ? 80 : 55, 4.0);
  };
}

export function stageShot(name, world) {
  world.reset();
  if (name === 'cover') {
    // Cover: fly until the next ring sits ahead in view
    // (350-700 m out, within ~12° of hdg), capped at 60 s.
    // Bank < 0.20. Camera 40 m left, ring clears the centre post.
    const aim = aimAtNextRing(world);
    const limit = Math.floor(60 / SAMPLE);
    for (let i = 0; i < limit; i += 1) {
      const s = world.state;
      if (s.over) break;
      const next = world.nextRing();
      if (next && s.time > 8) {
        const d = Math.hypot(next.x - s.x, next.y - s.y, next.z - s.z);
        let dh = Math.atan2(next.x - s.x, next.z - s.z) - s.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        if (d < 700 && d > 350 && Math.abs(dh) < 0.22 && Math.abs(s.bank) < 0.20) break;
      }
      const a = aim(s);
      const events = world.step(SAMPLE, { x: a.sx, y: a.sy }, a.td, false, false);
      if (events & EVENT_OVER) break;
    }
    world.state.camRight = -40; // cover: camera 40 m left, ring clears the centre post
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, view: 'FPP' };
  }
  if (name === 'tpp') {
    // Chase view mid-route: break once ring 5+ sits near frame centre.
    const aim = aimAtNextRing(world);
    const limit = Math.floor(70 / SAMPLE);
    for (let i = 0; i < limit; i += 1) {
      const s = world.state;
      if (s.over) break;
      const next = world.nextRing();
      const nextIdx = world.rings.findIndex((r) => !r.passed);
      if (next && nextIdx >= 4 && s.time > 8) {
        const d = Math.hypot(next.x - s.x, next.y - s.y, next.z - s.z);
        let dh = Math.atan2(next.x - s.x, next.z - s.z) - s.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        if (d < 600 && d > 300 && Math.abs(dh) < 0.15 && Math.abs(s.bank) < 0.10) break;
      }
      const a = aim(s);
      const events = world.step(SAMPLE, { x: a.sx, y: a.sy }, a.td, false, false);
      if (events & EVENT_OVER) break;
    }
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, view: 'TPP' };
  }
  if (name === 'takeoff') {
    // Full throttle down the strip, just lifting off.
    flyTo(world, 1.2, (state) => autopilot(state, 0, 60, 800, JET.cruiseSpeed));
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: 0, view: 'FPP' };
  }
  if (name === 'storm') {
    // Mid-route in the storm: rain, traffic, a waypoint in the murk.
    // v10: fly until the next ring is the 6th or later (over the open
    // sea — the first render stopped at 30 s, still over the fields) and
    // the frame is near level, capped at 70 s.
    const aim = aimAtNextRing(world);
    const limit = Math.floor(70 / SAMPLE);
    for (let i = 0; i < limit; i += 1) {
      const s = world.state;
      if (s.over) break;
      const next = world.nextRing();
      const nextIdx = world.rings.findIndex((r) => !r.passed);
      if (next && nextIdx >= 5 && s.time > 8) {
        const d = Math.hypot(next.x - s.x, next.y - s.y, next.z - s.z);
        let dh = Math.atan2(next.x - s.x, next.z - s.z) - s.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        if (d < 550 && d > 300 && Math.abs(dh) < 0.15 && Math.abs(s.bank) < 0.10) break;
      }
      const a = aim(s);
      const events = world.step(SAMPLE, { x: a.sx, y: a.sy }, a.td, false, false);
      if (events & EVENT_OVER) break;
    }
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, view: 'TPP' };
  }
  if (name === 'landing') {
    // Full leg, then final approach — stop on final, 900 m out and still
    // airborne, so the runway fills the frame ahead.
    const aim = aimAtNextRing(world);
    const ringLimit = Math.floor(400 / SAMPLE);
    for (let i = 0; i < ringLimit; i += 1) {
      const s = world.state;
      if (s.over || !world.nextRing()) break;
      const a = aim(s);
      const events = world.step(SAMPLE, { x: a.sx, y: a.sy }, a.td, false, false);
      if (events & EVENT_OVER) break;
    }
    if (!world.state.over) {
      // Place the jet on a stable final: 2500 m out on the centreline,
      // 120 m up, lined up on the runway heading. (The last ring sits
      // only 220 m before the strip, so flying on from it gives no time
      // to stabilise — the v10 third render caught the jet banking hard
      // with the just-passed ring filling the frame edges as green bands.)
      const leg = world.leg;
      const s = world.state;
      s.x = world.runwayB.x - leg.dirX * 2500;
      s.z = world.runwayB.z - leg.dirZ * 2500;
      s.y = 120;
      s.heading = leg.heading;
      s.bank = 0;
      s.pitch = 0;
      s.speed = 80;
      s.throttle = 0.5;
      s.onGround = false;
      s.airborne = true;
      const limit = Math.floor(120 / SAMPLE);
      for (let i = 0; i < limit; i += 1) {
        const st = world.state;
        if (st.over) break;
        const along = (world.runwayB.x - st.x) * leg.dirX + (world.runwayB.z - st.z) * leg.dirZ;
        let dh = leg.heading - st.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        if (along < 700 && !st.onGround && Math.abs(st.bank) < 0.15 && Math.abs(dh) < 0.14) break;
        const a = aimAtRunway(world)(st);
        const events = world.step(SAMPLE, { x: a.sx, y: a.sy }, a.td, false, false);
        if (events & EVENT_OVER) break;
      }
    }
    world.state.camRight = 32; // v16: cockpit camera 32 m right on final, so the runway lines clear the centre post
    return { screen: SCREEN_PLAY, best: world.state.score, view: 'FPP' };
  }
  // Default 'play': 25 seconds into the leg, mid-route, waypoints ahead.
  flyTo(world, 25, aimAtNextRing(world));
  return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score, view: 'FPP' };
}

// The title screen's demo flight uses the same autopilot.
export function attractStep(world, dt) {
  return world.step(dt, { x: 0, y: 0 }, 0, false, true);
}
