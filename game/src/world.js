// The flight model: a jet flies point to point. The jet has a heading (0 =
// north, +z); it banks to turn, climbs and sinks, and follows a lit route of
// waypoint rings from runway A to runway B. Traffic shares the sky, wind and
// storms push it around, and the sortie ends in a landing — or a crash.
import { JET, LEVELS, SCORE, WORLD } from './config.js';
import { makeNoise } from './random.js';

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
  const hillNoise = makeNoise(random);
  const gustNoise = makeNoise(random);
  const routePhase = random.range(0, Math.PI * 2);

  // --- route: runway A (0,0) to runway B, rings snaking between them ---
  const rings = [];
  if (!adventure) {
    for (let i = 0; i < WORLD.ringCount; i += 1) {
      const z = 700 + i * WORLD.routeSpacing;
      rings.push({
        // Many turns: 1.7 rad per ring ≈ 1.6 sine periods over the leg, so
        // the route snakes left-right-left-right instead of one lazy bend.
        x: level.weave * Math.sin(i * 1.7 + routePhase),
        y: 110 + 42 * Math.sin(i * 1.3 + routePhase * 0.5),
        z,
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
        x: Math.sin(a) * r,
        y: random.range(90, 220),
        z: Math.cos(a) * r,
        passed: false,
        near: false,
        quality: 0,
      });
    }
  }
  const runwayA = { x: 0, z: 0 };
  // Final approach is straight: pull the last two rings toward the
  // centreline so the jet lines up with runway B instead of arriving
  // sideways off a hard turn (real procedures do the same).
  if (!adventure && rings.length >= 2) {
    rings[rings.length - 2].x *= 0.5;
    rings[rings.length - 1].x *= 0.25;
  }
  const runwayB = adventure
    ? { x: 0, z: 0 }
    : { x: rings[rings.length - 1].x, z: WORLD.legLength };

  // The route's centreline x at a given z (linear through the rings): the
  // mountain valley follows this line, so the rings always sit over low
  // ground even when the route snakes.
  function routeCenterX(z) {
    if (adventure) return 0;
    const pts = [{ x: 0, z: 0 }];
    for (const r of rings) pts.push({ x: r.x, z: r.z });
    pts.push({ x: runwayB.x, z: WORLD.legLength });
    if (z <= pts[0].z) return pts[0].x;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      if (z >= a.z && z <= b.z) {
        const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z);
        return a.x + (b.x - a.x) * t;
      }
    }
    return pts[pts.length - 1].x;
  }

  // --- scenery props beside the route ---
  const props = [];
  const propCount = level.theme === 'city' ? 150 : 110;
  for (let i = 0; i < propCount; i += 1) {
    const z = random.range(200, WORLD.legLength + 600);
    const side = random.next() < 0.5 ? -1 : 1;
    const x = side * random.range(30, 320);
    const kind = random.next();
    props.push({
      x,
      z,
      kind:
        level.theme === 'city'
          ? kind < 0.7 ? 'building' : 'building2'
          : level.theme === 'beach'
            ? kind < 0.6 ? 'palm' : 'hut'
            : level.theme === 'mountain'
              ? kind < 0.7 ? 'pine' : 'rock'
              : level.theme === 'desert'
                ? kind < 0.6 ? 'cactus' : 'rock'
                : kind < 0.5 ? 'tree' : 'house',
      s: random.range(0.7, 1.6),
    });
  }
  // Islands for the sea leg (terrain humps + a few palms on top).
  const islands = [];
  if (level.theme === 'sea' || adventure) {
    for (let i = 0; i < 7; i += 1) {
      islands.push({
        x: random.range(-700, 700),
        z: random.range(600, WORLD.legLength),
        r: random.range(120, 260),
        h: random.range(24, 60),
      });
    }
  }
  // Clouds drift above the route.
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: random.range(-700, 700),
      y: random.range(240, 380),
      z: random.range(200, WORLD.legLength + 900),
      s: random.range(22, 55),
    });
  }
  // Storm clouds, lower and darker, for the storm leg.
  const stormClouds = [];
  if (level.storm) {
    for (let i = 0; i < 18; i += 1) {
      stormClouds.push({
        x: random.range(-600, 600),
        y: random.range(150, 260),
        z: random.range(300, WORLD.legLength + 600),
        s: random.range(40, 90),
      });
    }
  }

  function terrainHeight(x, z) {
    const base = 8 + hillNoise(z * 0.004 + x * 0.011) * 7 + hillNoise(z * 0.0012) * 5;
    let h = base;
    if (level.theme === 'beach') {
      // Sea to the west (x < -60), sand and dunes to the east.
      if (x < -60) h = 0;
      else h = 4 + hillNoise(z * 0.006 + x * 0.02) * 5;
    } else if (level.theme === 'sea') {
      h = 0;
      for (const isl of islands) {
        const d = Math.hypot(x - isl.x, z - isl.z);
        if (d < isl.r) h = Math.max(h, isl.h * (1 - (d / isl.r) * (d / isl.r)));
      }
    } else if (level.theme === 'mountain') {
      // A valley that follows the route centreline; peaks rise hard at the
      // edges, so the rings always sit over flyable ground. Wide enough
      // (±140 m flat floor, gentle walls) that a jet banking through the
      // route's turns stays clear of the rock.
      const dx = Math.abs(x - routeCenterX(z));
      h = 20 + hillNoise(z * 0.005 + x * 0.02) * 20;
      h += Math.max(0, dx - 140) * 1.0;
      h += Math.max(0, dx - 300) * 0.8;
    } else if (level.theme === 'desert') {
      h = 8 + hillNoise(z * 0.005 + x * 0.015) * 12;
      // Canyon walls follow the route centreline (not absolute x), so a
      // snaking route never flies its rings into a cliff face.
      h += Math.max(0, Math.abs(x - routeCenterX(z)) - 150) * 0.5;
    } else if (adventure) {
      h = base;
      if (x < -800) h = 0; // sea to the west
      if (z > 3800) h += (z - 3800) * 0.03; // mountains to the north
    }
    // Flatten both runway strips so a landing reads as a landing.
    for (const rw of [runwayA, runwayB]) {
      const dz = Math.abs(z - rw.z);
      const dx = Math.abs(x - rw.x);
      if (dz < WORLD.runwayLength / 2 + 100 && dx < WORLD.runwayHalfWidth + 24) {
        const t = Math.min(1, Math.max(0, (dz - WORLD.runwayLength / 2) / 100 + (dx - WORLD.runwayHalfWidth) / 24));
        h = 6 + (h - 6) * Math.max(0, Math.min(1, t));
      }
    }
    return Math.max(0, h);
  }

  // --- traffic: other aircraft sharing the sky ---
  const traffic = [];
  function spawnTraffic(t, ahead) {
    const type = TRAFFIC_TYPES[Math.floor(random.next() * TRAFFIC_TYPES.length)];
    // Cross the route: headings mostly east-west, some same-direction.
    const cross = random.next() < 0.65;
    const heading = cross
      ? (random.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + random.range(-0.35, 0.35)
      : random.range(-0.3, 0.3);
    const z = ahead ? state.z + random.range(500, 1600) : random.range(400, WORLD.legLength);
    t.x = random.range(-320, 320);
    t.y = random.range(90, 230);
    t.z = z;
    t.heading = heading;
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
    Object.assign(state, {
      x: 0, y: 6, z: -300, heading: 0, bank: 0, pitch: 0,
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
      } else if (state.z > runwayA.z + WORLD.runwayLength / 2 + 120) {
        return crash('Ran off the runway — throttle up sooner.');
      }
    }
    if (state.takeoffGrace > 0) state.takeoffGrace -= dt;

    // --- soft corridor bounds ---
    if (state.x < -900) {
      state.x = -900;
      say('Edge of the area — turn back!', 1.2);
    }
    if (state.x > 900) {
      state.x = 900;
      say('Edge of the area — turn back!', 1.2);
    }
    if (state.z < -500) {
      state.z = -500;
      say('Behind the field — turn around!', 1.2);
    }
    if (state.z > WORLD.legLength + 1400) {
      state.z = WORLD.legLength + 1400;
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
      } else if (!adventure && state.z > ring.z + 150) {
        // Flown 150 m past the ring's line without threading it: missed.
        // (Directional on purpose: a ring far AHEAD must never count as
        // missed — that bug once voided the whole route at takeoff.)
        ring.passed = true;
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

    // --- runway B / landing ---
    const bz = runwayB.z;
    const bx = runwayB.x;
    const onStrip = Math.abs(state.z - bz) < WORLD.runwayLength / 2;
    if (onStrip && !state.landed && !state.onGround && !adventure) {
      const ground = terrainHeight(state.x, state.z);
      if (Math.abs(state.x - bx) < WORLD.runwayHalfWidth + 10 && state.y - ground < 8 && state.speed < JET.landingMaxSpeed + 4 && state.speed > JET.landingMinSpeed) {
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
        if (Math.abs(state.x - bx) >= WORLD.runwayHalfWidth + 14) return crash('Ran off the runway into the grass.');
        if (state.speed >= JET.landingMaxSpeed + 4) return crash('Landed too fast — the jet overshot the strip.');
        if (state.speed <= JET.landingMinSpeed) return crash('Stalled onto the runway.');
      }
    }
    if (state.z > bz + WORLD.runwayLength / 2 + 80 && !state.won && !adventure) {
      if (!state.goAround) {
        state.goAround = true;
        say('Overshot! One go-around — climb and come back.', 3);
        state.z = bz - WORLD.runwayLength / 2 - 1200;
        state.y = Math.max(state.y, 160);
        return events;
      }
      return crash('Overshot the runway twice — out of the area.');
    }
    // Adventure: landing on the home strip ends the run (needs 3+ rings).
    if (adventure && onStrip && !state.landed && !state.onGround && state.ringsHit >= 3) {
      const ground = terrainHeight(state.x, state.z);
      if (Math.abs(state.x - bx) < WORLD.runwayHalfWidth + 10 && state.y - ground < 8 && state.speed < JET.landingMaxSpeed + 4 && state.speed > JET.landingMinSpeed) {
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
    rings,
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
