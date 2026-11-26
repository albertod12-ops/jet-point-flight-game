// The flight model: a jet flies point to point on THE ONE MAP (v10).
// The jet has a heading (0 = north, +z); it banks to turn, climbs and
// sinks, and follows a lit route of waypoint rings from runway A (the main
// airport) to runway B (a strip in another district of the same map).
// Traffic shares the sky, wind and storms push it around, and the sortie
// ends in a landing — or a crash.
//
// One map, five routes: each leg has a start + heading in map coordinates
// (config.js), and the route is built in leg-local coords (u = lateral,
// v = along the route) then rotated into the map. All geometry that used
// to assume "north along +z" (landing, overshoot, corridor, ring misses,
// traffic crossings) is done in the leg/runway frame instead.
import { JET, LEVELS, SCORE, WORLD } from './config.js';
import { makeNoise } from './random.js';
import { MAP, district, hash2, islandAt, mapBaseHeight, distToRoute } from './map.js';

export const EVENT_RING = 1;
export const EVENT_NEAR = 2;
export const EVENT_CRASH = 4;
export const EVENT_LAND = 8;
export const EVENT_OVER = 16;
export const EVENT_FUEL_LOW = 32;
export const EVENT_THUNDER = 64;
export const EVENT_WARN = 128;
export const EVENT_TAKEOFF = 256;

const TRAFFIC_TYPES = [
  { kind: 'jet', label: 'jet', speed: 165, size: 1.0 },
  { kind: 'airliner', label: 'airliner', speed: 135, size: 1.9 },
  { kind: 'prop', label: 'prop plane', speed: 78, size: 0.7 },
];

export function createWorld(random, levelIndex) {
  const level = LEVELS[levelIndex] ?? LEVELS[0];
  const adventure = level.id === 0;
  const gustNoise = makeNoise(random);
  const routePhase = random.range(0, Math.PI * 2);
  const heading = level.heading;
  const dirX = Math.sin(heading);
  const dirZ = Math.cos(heading);
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  const startX = level.start[0];
  const startZ = level.start[1];
  // Leg-local (u, v) -> map (x, z): u is right of the direction of travel.
  function legToMap(u, v) {
    return { x: startX + u * rightX + v * dirX, z: startZ + u * rightZ + v * dirZ };
  }
  // Map (x, z) -> leg-local (u, v).
  function mapToLeg(x, z) {
    const dx = x - startX;
    const dz = z - startZ;
    return { u: dx * rightX + dz * rightZ, v: dx * dirX + dz * dirZ };
  }
  const leg = { startX, startZ, heading, dirX, dirZ, rightX, rightZ };

  // --- route: runway A (the airport) to runway B, rings snaking between ---
  const rings = [];
  if (!adventure) {
    for (let i = 0; i < WORLD.ringCount; i += 1) {
      const v = 700 + i * WORLD.routeSpacing;
      const u = level.weave * Math.sin(i * 1.7 + routePhase);
      const p = legToMap(u, v);
      rings.push({
        // Many turns: 1.7 rad per ring ≈ 1.6 sine periods over the leg, so
        // the route snakes left-right-left-right instead of one lazy bend.
        x: p.x,
        y: level.ringBase + 42 * Math.sin(i * 1.3 + routePhase * 0.5),
        z: p.z,
        passed: false,
        near: false,
        quality: 0,
      });
    }
  } else {
    // Free roam: rings scattered in a wide circle around the home field.
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + random.range(-0.3, 0.3);
      const r = random.range(900, 2600);
      rings.push({
        x: startX + Math.sin(a) * r,
        y: random.range(90, 220),
        z: startZ + Math.cos(a) * r,
        passed: false,
        near: false,
        quality: 0,
      });
    }
  }
  const runwayA = { x: startX, z: startZ, heading };
  // Final approach is straight: pull the last two rings toward the
  // centreline so the jet lines up with runway B instead of arriving
  // sideways off a hard turn (real procedures do the same).
  if (!adventure && rings.length >= 2) {
    const p2 = mapToLeg(rings[rings.length - 2].x, rings[rings.length - 2].z);
    const p1 = mapToLeg(rings[rings.length - 1].x, rings[rings.length - 1].z);
    const q2 = legToMap(p2.u * 0.5, p2.v);
    const q1 = legToMap(p1.u * 0.25, p1.v);
    rings[rings.length - 2].x = q2.x;
    rings[rings.length - 2].z = q2.z;
    rings[rings.length - 1].x = q1.x;
    rings[rings.length - 1].z = q1.z;
  }
  const runwayB = adventure
    ? { x: startX, z: startZ, heading }
    : (() => {
        const p = legToMap(
          mapToLeg(rings[rings.length - 1].x, rings[rings.length - 1].z).u,
          WORLD.legLength,
        );
        return { x: p.x, z: p.z, heading };
      })();

  // The route polyline in map coords: runway A, rings, runway B. The
  // mountain valley + valley river follow it (distToRoute).
  const routePoints = [{ x: runwayA.x, z: runwayA.z }];
  for (const r of rings) routePoints.push({ x: r.x, z: r.z });
  routePoints.push({ x: runwayB.x, z: runwayB.z });

  // --- scenery props beside the route (leg-local band, mapped to the map) ---
  // Kind is decided by the DISTRICT at the prop's map position, so a route
  // crossing beach / sea / mountains / desert picks up the right scenery
  // automatically — no per-leg theme switch.
  const props = [];
  function propKindAt(x, z) {
    const d = district(x, z);
    if (d === 'city') return random.next() < 0.7 ? 'building' : 'building2';
    if (d === 'beach') return random.next() < 0.6 ? 'palm' : 'hut';
    if (d === 'sea') return random.next() < 0.6 ? 'palm' : 'hut';
    if (d === 'mountain') return random.next() < 0.7 ? 'pine' : 'rock';
    if (d === 'desert') return random.next() < 0.6 ? 'cactus' : 'rock';
    return random.next() < 0.5 ? 'tree' : 'house';
  }
  const propCount = 120;
  for (let i = 0; i < propCount; i += 1) {
    const v = random.range(200, WORLD.legLength + 600);
    const side = random.next() < 0.5 ? -1 : 1;
    const u = side * random.range(30, 320);
    const p = legToMap(u, v);
    const d = district(p.x, p.z);
    // Sea: props live on the map's fixed islands only, never on open
    // water — a tree standing on the sea is the v4 storm-shot defect.
    if (d === 'sea') {
      const { island, d: di } = islandAt(p.x, p.z);
      if (!island || di > island.r * 0.8) continue;
      const a = random.range(0, Math.PI * 2);
      const rr = random.range(0, island.r * 0.55);
      props.push({
        x: island.x + Math.cos(a) * rr,
        z: island.z + Math.sin(a) * rr,
        kind: random.next() < 0.6 ? 'palm' : 'hut',
        s: random.range(0.7, 1.6),
      });
      continue;
    }
    props.push({ x: p.x, z: p.z, kind: propKindAt(p.x, p.z), s: random.range(0.7, 1.6) });
  }
  // City grid: buildings on the city blocks near the route, placed by a
  // position hash (part of the map — the same city every time, not a
  // random scatter). Only inside the city district and near the route.
  for (let u = -600; u <= 600; u += 90) {
    for (let v = -1600; v <= 7000; v += 90) {
      const p = legToMap(u, v);
      if (district(p.x, p.z) !== 'city') continue;
      const h1 = hash2(Math.floor(p.x / 90), Math.floor(p.z / 90));
      if (h1 > 0.55) continue;
      const h2 = hash2(Math.floor(p.x / 90) + 31, Math.floor(p.z / 90) + 17);
      // Building scale: capped so the tallest tower (~52 m) stays well
      // below the route (rings at 140 m) — the v10 first render had
      // 105 m towers hiding the rings from the cockpit.
      const s = 0.45 + h2 * 0.45;
      props.push({
        x: p.x + (h2 - 0.5) * 30,
        z: p.z + (hash2(7, Math.floor(p.z / 90)) - 0.5) * 30,
        kind: h1 < 0.28 ? 'building2' : 'building',
        s,
      });
    }
  }
  // Forest: pines scattered on the mountain and field slopes near the
  // route — the texture that makes the mountains read as forested (REF 1),
  // not giant flat triangles.
  if (!adventure) {
    for (let i = 0; i < 220; i += 1) {
      const v = random.range(0, WORLD.legLength + 800);
      const u = random.range(-1050, 1050);
      const p = legToMap(u, v);
      const d = district(p.x, p.z);
      if (d !== 'mountain' && d !== 'fields') continue;
      if (hash2(Math.floor(p.x / 7), Math.floor(p.z / 7)) < 0.35) continue;
      props.push({ x: p.x, z: p.z, kind: 'pine', s: random.range(0.8, 2.4), forest: true });
    }
  }
  // Clouds drift above the route.
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    const p = legToMap(random.range(-700, 700), random.range(200, WORLD.legLength + 900));
    clouds.push({ x: p.x, y: random.range(240, 380), z: p.z, s: random.range(22, 55) });
  }
  // Storm clouds, lower and darker, for the storm leg.
  const stormClouds = [];
  if (level.storm) {
    for (let i = 0; i < 18; i += 1) {
      const p = legToMap(random.range(-600, 600), random.range(300, WORLD.legLength + 600));
      stormClouds.push({ x: p.x, y: random.range(150, 260), z: p.z, s: random.range(40, 90) });
    }
  }

  function terrainHeight(x, z) {
    const distRoute = distToRoute(routePoints, x, z);
    let h = mapBaseHeight(x, z, distRoute);
    // Flatten both runway strips so a landing reads as a landing.
    // (In each runway's own frame: along the strip, across it.)
    for (const rw of [runwayA, runwayB]) {
      const dx = x - rw.x;
      const dz = z - rw.z;
      const along = dx * Math.sin(rw.heading) + dz * Math.cos(rw.heading);
      const across = dx * Math.cos(rw.heading) - dz * Math.sin(rw.heading);
      if (Math.abs(along) < WORLD.runwayLength / 2 + 100 && Math.abs(across) < WORLD.runwayHalfWidth + 24) {
        const t = Math.min(
          1,
          Math.max(
            0,
            (Math.abs(along) - WORLD.runwayLength / 2) / 100 + (Math.abs(across) - WORLD.runwayHalfWidth) / 24,
          ),
        );
        h = 6 + (h - 6) * Math.max(0, Math.min(1, t));
      }
    }
    return Math.max(0, h);
  }

  // --- traffic: other aircraft sharing the sky ---
  const traffic = [];
  function spawnTraffic(t, ahead) {
    const type = TRAFFIC_TYPES[Math.floor(random.next() * TRAFFIC_TYPES.length)];
    // Cross the route: headings mostly perpendicular to the leg, some
    // same-direction.
    const cross = random.next() < 0.65;
    const tHeading = cross
      ? heading + (random.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + random.range(-0.35, 0.35)
      : heading + random.range(-0.3, 0.3);
    const v = ahead ? mapToLeg(state.x, state.z).v + random.range(500, 1600) : random.range(400, WORLD.legLength);
    const p = legToMap(random.range(-320, 320), v);
    t.x = p.x;
    t.y = random.range(90, 230);
    t.z = p.z;
    t.heading = tHeading;
    t.speed = type.speed * random.range(0.9, 1.1);
    t.type = type.kind;
    t.label = type.label;
    t.size = type.size;
    t.warned = false;
    t.nearMissed = false;
  }
  for (let i = 0; i < level.traffic; i += 1) {
    const t = {};
    spawnTraffic(t, false);
    traffic.push(t);
  }

  // One state object for the world's whole life: reset() rewrites its fields
  // in place, so the `state` the world hands out is always the live one.
  const state = {
    x: 0, y: 6, z: -300, heading: 0, bank: 0, pitch: 0,
    speed: 0, throttle: 0, fuel: JET.startFuel, score: 0,
    ringsHit: 0, nearMisses: 0, time: 0,
    over: false, won: false, crashed: false, crashReason: '',
    landed: false, onGround: true, airborne: false, takeoffGrace: 0,
    message: '', messageT: 0, lastRingScore: 0, lastRingT: 0,
    lowFuelWarned: false, goAround: false,
    windX: 0, windZ: 0, gust: 0, flashT: 0, thunderT: 8,
    nearestTraffic: null, nearestTrafficD: 9999,
  };
  function reset() {
    for (const ring of rings) {
      ring.passed = false;
      ring.near = false;
      ring.quality = 0;
    }
    for (const t of traffic) spawnTraffic(t, false);
    // Start on runway A, 300 m before its centre, facing down the strip.
    const sp = legToMap(0, -300);
    Object.assign(state, {
      x: sp.x, y: 6, z: sp.z, heading, bank: 0, pitch: 0,
      speed: 0, throttle: 0, fuel: JET.startFuel, score: 0,
      ringsHit: 0, nearMisses: 0, time: 0,
      over: false, won: false, crashed: false, crashReason: '',
      landed: false, onGround: true, airborne: false, takeoffGrace: 0,
      message: '', messageT: 0, lastRingScore: 0, lastRingT: 0,
      lowFuelWarned: false, goAround: false,
      windX: 0, windZ: 0, gust: 0, flashT: 0, thunderT: 8,
      nearestTraffic: null, nearestTrafficD: 9999,
    });
  }
  reset();

  function say(text, seconds = 2.5) {
    state.message = text;
    state.messageT = seconds;
  }

  // Position of the jet relative to a runway, in the runway's own frame:
  // along the strip (+) and across it.
  function runwayFrame(rw, x, z) {
    const dx = x - rw.x;
    const dz = z - rw.z;
    return {
      along: dx * Math.sin(rw.heading) + dz * Math.cos(rw.heading),
      across: dx * Math.cos(rw.heading) - dz * Math.sin(rw.heading),
    };
  }

  // One fixed step. steer: {x, y} in -1..1, throttleDelta -1..1, brake bool.
  // `attract` (title-screen demo) flies the jet hands-free.
  function step(dt, steer, throttleDelta, brake, attract = false) {
    if (state.over) return 0;
    let events = 0;
    state.time += dt;
    if (state.messageT > 0) state.messageT -= dt;
    if (state.lastRingT > 0) state.lastRingT -= dt;
    if (state.flashT > 0) state.flashT -= dt;

    // --- weather: gusts ride on the level's base wind ---
    const gustN = gustNoise(state.time * 0.22);
    state.gust = level.gust * (0.4 + 0.6 * Math.abs(gustN));
    state.windX = level.wind * 0.8 + state.gust * gustN;
    state.windZ = level.wind * 0.3 * gustNoise(state.time * 0.17 + 40);
    if (level.storm) {
      state.thunderT -= dt;
      if (state.thunderT <= 0) {
        state.thunderT = 6 + random.range(0, 8);
        state.flashT = 0.14;
        events |= EVENT_THUNDER;
      }
    }

    // --- pilot input (or the demo autopilot) ---
    let sx = steer.x;
    let sy = steer.y;
    let td = throttleDelta;
    if (attract) {
      const next = nextRing();
      const tx = next ? next.x : runwayB.x;
      const ty = next ? next.y : 120;
      const tz = next ? next.z : runwayB.z;
      // Steer by heading error to the target, not by lateral offset.
      const wantH = Math.atan2(tx - state.x, tz - state.z);
      let dh = wantH - state.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      sx = Math.max(-1, Math.min(1, dh * 2.2));
      sy = Math.max(-1, Math.min(1, (ty - state.y) / 30));
      td = state.speed < JET.cruiseSpeed ? 1 : state.speed > JET.cruiseSpeed + 8 ? -1 : 0;
      if (state.onGround) td = 1;
    }

    // --- throttle, speed, drag ---
    state.throttle = Math.max(0, Math.min(1, state.throttle + td * dt * 0.8));
    if (brake) state.throttle = Math.max(0, state.throttle - dt * 1.2);
    const target = JET.minSpeed + state.throttle * (JET.maxSpeed - JET.minSpeed);
    state.speed += (target - state.speed) * Math.min(1, dt * 0.5);
    if (state.speed < JET.minSpeed && !state.onGround) state.speed = JET.minSpeed;

    // --- bank, turn, climb ---
    const targetBank = sx * JET.maxBank;
    state.bank += (targetBank - state.bank) * Math.min(1, dt * 4);
    state.heading += state.bank * JET.turnRate * dt * (0.4 + (state.speed / JET.cruiseSpeed) * 0.6);
    // Turbulence shakes the wings in gusts and storms.
    const shake = (state.gust / 16) * (level.storm ? 1.6 : 1) * Math.sin(state.time * 9.3) * 0.06;
    const climb = sy * JET.maxClimb;
    const stallSink = state.speed < 42 && !state.onGround ? (42 - state.speed) * 0.8 : 0;
    const vy = state.onGround ? 0 : climb - stallSink;
    state.pitch = Math.max(-0.3, Math.min(0.3, (vy / Math.max(1, state.speed)) * 1.4));
    state.y += vy * dt;
    // Move: forward along heading, plus wind drift.
    state.x += (Math.sin(state.heading) * state.speed + state.windX) * dt;
    state.z += (Math.cos(state.heading) * state.speed + state.windZ) * dt;
    state.bank += shake * dt * 8;

    // --- takeoff ---
    if (state.onGround) {
      const ground = terrainHeight(state.x, state.z);
      state.y = ground;
      if (state.speed >= JET.takeoffSpeed) {
        state.onGround = false;
        state.airborne = true;
        state.takeoffGrace = 1.2; // no terrain clip right after lift-off
        state.y = ground + 5;
        say('AIRBORNE — follow the route!', 2.5);
        events |= EVENT_TAKEOFF;
      } else if (runwayFrame(runwayA, state.x, state.z).along > WORLD.runwayLength / 2 + 120) {
        return crash('Ran off the runway — throttle up sooner.');
      }
    }
    if (state.takeoffGrace > 0) state.takeoffGrace -= dt;

    // --- soft corridor bounds (in the leg frame, not axis-aligned) ---
    const lp = mapToLeg(state.x, state.z);
    if (lp.u < -900) {
      const p = legToMap(-900, lp.v);
      state.x = p.x;
      state.z = p.z;
      say('Edge of the area — turn back!', 1.2);
    }
    if (lp.u > 900) {
      const p = legToMap(900, lp.v);
      state.x = p.x;
      state.z = p.z;
      say('Edge of the area — turn back!', 1.2);
    }
    if (lp.v < -500) {
      const p = legToMap(lp.u, -500);
      state.x = p.x;
      state.z = p.z;
      say('Behind the field — turn around!', 1.2);
    }
    if (lp.v > WORLD.legLength + 1400) {
      const p = legToMap(lp.u, WORLD.legLength + 1400);
      state.x = p.x;
      state.z = p.z;
      say('Past the destination — turn back!', 1.2);
    }

    // --- fuel ---
    // Adventure is free roam: a gentler drain so exploring lasts minutes,
    // and its waypoints refuel properly (they are the only fuel source).
    const drain = adventure ? JET.fuelDrain * 0.45 : JET.fuelDrain;
    state.fuel -= (drain + state.throttle * JET.fuelDrainThrottle) * dt;
    if (state.fuel < 20 && !state.lowFuelWarned) {
      state.lowFuelWarned = true;
      say('LOW FUEL — thread waypoints for fuel!', 3);
      events |= EVENT_FUEL_LOW;
    }
    if (state.fuel <= 0) {
      state.fuel = 0;
      return crash('Out of fuel — the engine quit mid-route.');
    }

    // --- rings (3-D distance, so a heading-based route works) ---
    for (const ring of rings) {
      if (ring.passed) continue;
      const dx = state.x - ring.x;
      const dy = state.y - ring.y;
      const dz = state.z - ring.z;
      const d = Math.hypot(dx, dy, dz);
      if (d <= WORLD.ringRadius) {
        ring.passed = true;
        const q = Math.hypot(dx, dy) / WORLD.ringRadius;
        const pts = q < 0.45 ? SCORE.ringCentre : SCORE.ringEdge;
        ring.quality = q;
        state.score += pts;
        state.ringsHit += 1;
        state.fuel = Math.min(JET.startFuel, state.fuel + (adventure ? JET.ringFuel * 4 : JET.ringFuel));
        state.lastRingScore = pts;
        state.lastRingT = 1.4;
        say(q < 0.45 ? `WAYPOINT! +${pts}` : `Waypoint +${pts}`, 1.4);
        events |= EVENT_RING;
      } else if (d <= WORLD.ringRadius + 16) {
        ring.near = true;
      } else if (ring.near && d > WORLD.ringRadius + 40) {
        ring.passed = true;
        state.score += SCORE.ringNear;
        state.lastRingScore = SCORE.ringNear;
        state.lastRingT = 1.2;
        say(`Near miss +${SCORE.ringNear}`, 1.2);
        events |= EVENT_NEAR;
      } else if (!adventure) {
        // Flown 150 m past the ring along the leg direction without
        // threading it: missed. (Directional on purpose: a ring far AHEAD
        // must never count as missed — that bug once voided the whole
        // route at takeoff.)
        const alongRing = (state.x - ring.x) * dirX + (state.z - ring.z) * dirZ;
        if (alongRing > 150) ring.passed = true;
      }
    }

    // --- traffic: move, collide, near-miss, respawn ahead ---
    state.nearestTraffic = null;
    state.nearestTrafficD = 9999;
    for (const t of traffic) {
      t.x += Math.sin(t.heading) * t.speed * dt;
      t.z += Math.cos(t.heading) * t.speed * dt;
      const d = Math.hypot(t.x - state.x, t.y - state.y, t.z - state.z);
      if (d < state.nearestTrafficD) {
        state.nearestTrafficD = d;
        state.nearestTraffic = t;
      }
      if (d < 26 && !state.onGround) {
        return crash(`Mid-air collision with a ${t.label}!`);
      }
      if (d < 130 && !t.nearMissed && !state.onGround) {
        t.nearMissed = true;
        state.nearMisses += 1;
        state.score += SCORE.nearMiss;
        state.lastRingScore = SCORE.nearMiss;
        state.lastRingT = 1.2;
        say(`NEAR MISS +${SCORE.nearMiss} — that ${t.label} was close!`, 1.6);
        events |= EVENT_NEAR;
      }
      if (d < 500 && !t.warned) {
        t.warned = true;
        say(`TRAFFIC — ${t.label} ahead!`, 2);
        events |= EVENT_WARN;
      }
      if (d > 2200) spawnTraffic(t, true);
    }

    // --- runway B / landing (in runway B's own frame) ---
    const bf = runwayFrame(runwayB, state.x, state.z);
    const onStrip = Math.abs(bf.along) < WORLD.runwayLength / 2;
    if (onStrip && !state.landed && !state.onGround && !adventure) {
      const ground = terrainHeight(state.x, state.z);
      if (Math.abs(bf.across) < WORLD.runwayHalfWidth + 10 && state.y - ground < 8 && state.speed < JET.landingMaxSpeed + 4 && state.speed > JET.landingMinSpeed) {
        state.landed = true;
        state.won = true;
        state.over = true;
        state.onGround = true;
        const fuelBonus = Math.round(state.fuel * SCORE.fuelBonusPerUnit);
        const timeBonus = Math.max(0, Math.round((level.time - state.time) * SCORE.timeBonusPerSecond));
        state.score += SCORE.landing + fuelBonus + timeBonus;
        say(`LANDED! +${SCORE.landing}  fuel +${fuelBonus}  time +${timeBonus}`, 6);
        return events | EVENT_LAND | EVENT_OVER;
      }
      if (state.y - ground < 4) {
        if (Math.abs(bf.across) >= WORLD.runwayHalfWidth + 14) return crash('Ran off the runway into the grass.');
        if (state.speed >= JET.landingMaxSpeed + 4) return crash('Landed too fast — the jet overshot the strip.');
        if (state.speed <= JET.landingMinSpeed) return crash('Stalled onto the runway.');
      }
    }
    if (bf.along > WORLD.runwayLength / 2 + 80 && !state.won && !adventure) {
      if (!state.goAround) {
        state.goAround = true;
        say('Overshot! One go-around — climb and come back.', 3);
        const rbLeg = mapToLeg(runwayB.x, runwayB.z);
        const p = legToMap(rbLeg.u, rbLeg.v - WORLD.runwayLength / 2 - 1200);
        state.x = p.x;
        state.z = p.z;
        state.y = Math.max(state.y, 160);
        return events;
      }
      return crash('Overshot the runway twice — out of the area.');
    }
    // Adventure: landing on the home strip ends the run (needs 3+ rings).
    if (adventure && onStrip && !state.landed && !state.onGround && state.ringsHit >= 3) {
      const ground = terrainHeight(state.x, state.z);
      if (Math.abs(bf.across) < WORLD.runwayHalfWidth + 10 && state.y - ground < 8 && state.speed < JET.landingMaxSpeed + 4 && state.speed > JET.landingMinSpeed) {
        state.landed = true;
        state.won = true;
        state.over = true;
        state.onGround = true;
        state.score += SCORE.landing + state.ringsHit * 50;
        say(`LANDED! Adventure complete — ${state.ringsHit} rings.`, 6);
        return events | EVENT_LAND | EVENT_OVER;
      }
    }

    // --- terrain collision ---
    const ground = terrainHeight(state.x, state.z);
    if (!state.onGround && state.takeoffGrace <= 0) {
      if (state.y - ground < JET.minAltitude * 0.55) {
        return crash('Clipped the terrain — watch your altitude!');
      }
      if (state.y < ground + 2) return crash('Flew into the terrain.');
    }
    if (state.y > level.ceiling) {
      state.y = level.ceiling;
      say(`Ceiling ${level.ceiling} m — the air is thin up here.`, 1.2);
    }
    if (state.time > level.time) {
      return crash('Out of time — the sortie window closed.');
    }
    return events;

    function crash(reason) {
      state.over = true;
      state.crashed = true;
      state.crashReason = reason;
      say(reason, 6);
      return events | EVENT_CRASH | EVENT_OVER;
    }
  }

  function nextRing() {
    return rings.find((r) => !r.passed) ?? null;
  }

  return {
    state,
    level,
    leg,
    rings,
    routePoints,
    props,
    clouds,
    stormClouds,
    traffic,
    runwayA,
    runwayB,
    adventure,
    reset,
    step,
    terrainHeight,
    nextRing,
  };
}
