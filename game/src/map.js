// THE ONE MAP — Jet Point v10 (user 20:40 WIB 26 Nov).
// One GTA-style map for ALL five legs, like GTA V (Los Santos + Blaine
// County): a city, a beach + open sea with islands, forested mountains,
// desert and rolling countryside, all in ONE coherent place. The five legs
// are five ROUTES inside this map (each starts at the main airport and
// lands on a strip in another district) — never five separate worlds.
//
// Everything here is seed-independent (integer-hash noise, fixed islands,
// fixed districts), so the map is literally the same place every time.
// Units are metres; +z is north, +x is east, heading is atan2(dx, dz).
//
// Map sketch (airport at the origin, city around it):
//   north: fields, then a forested mountain range (far north + NE sector)
//   west:  beach, then open sea with islands (leg 2 + leg 3 fly there)
//   east:  desert (leg 5 lands on the desert strip)
//   centre: city around the airport, fields + a lake to the north-west
//   leg 1 flies north over downtown to Metro Field; leg 4 flies north-east
//   up the mountain valley to the Alpine strip.
export const MAP = {
  // The main airport (runway A for every leg) sits at the origin.
  airport: { x: 0, z: 0 },
  city: { x0: -1800, x1: 1800, z0: -1600, z1: 2600 },
  beachWidth: 380,
  lake: { x: -800, z: 3800, r: 500 },
  // Islands in the open sea (fixed — the leg-2 and leg-3 strips sit on two).
  islands: [
    { x: -5750, z: -250, r: 420, h: 45 }, // leg 2 island strip
    { x: -3810, z: 3710, r: 380, h: 50 }, // leg 3 island strip
    { x: -4300, z: 1200, r: 300, h: 35 },
    { x: -5100, z: 3300, r: 350, h: 40 },
    { x: -5600, z: 5800, r: 320, h: 35 },
  ],
  mountain: { sectorMin: 0.15, sectorMax: 1.05, dist: 3600, farNorthZ: 7800 },
  desert: { sectorMin: 1.15, sectorMax: 2.05, dist: 3000 },
};

// Integer-hash value noise (same as gl3d.js — copied so this module is
// self-contained and the map never depends on a seed or import order).
export function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 10000) / 10000;
}
export function vnoise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
export function mottle(x, z, scale) {
  return vnoise2(x / scale, z / scale) * 0.5 + vnoise2(x / (scale * 3.7) + 11, z / (scale * 3.7) + 5) * 0.5;
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smooth(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** The coastline: a wavy north-south line on the west side of the map. */
export function coastX(z) {
  return -2900 + 320 * Math.sin(z * 0.0004) + 150 * Math.sin(z * 0.0011);
}

/** Which district a map point belongs to. */
export function district(x, z) {
  const c = MAP.city;
  const coast = coastX(z);
  if (x < coast) return 'sea';
  if (x < coast + MAP.beachWidth) return 'beach';
  if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return 'city';
  const d = Math.hypot(x, z);
  const ang = Math.atan2(x, z); // 0 north, +pi/2 east, -pi/2 west
  if (z > MAP.mountain.farNorthZ) return 'mountain';
  if (ang > MAP.mountain.sectorMin && ang < MAP.mountain.sectorMax && d > MAP.mountain.dist) return 'mountain';
  if (ang > MAP.desert.sectorMin && ang < MAP.desert.sectorMax && d > MAP.desert.dist) return 'desert';
  return 'fields';
}

/** Distance from (x, z) to the nearest island centre, and that island. */
export function islandAt(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const isl of MAP.islands) {
    const d = Math.hypot(x - isl.x, z - isl.z);
    if (d < bestD) {
      bestD = d;
      best = isl;
    }
  }
  return { island: best, d: bestD };
}

/**
 * Base terrain height at a map point, before runway flattening.
 * distRoute: distance (m) to the current leg's route polyline — the
 * mountain valley and the valley river follow the route, so the leg-4
 * corridor is flyable ground instead of a wall of peaks.
 */
export function mapBaseHeight(x, z, distRoute = Infinity) {
  const dist = district(x, z);
  const n1 = vnoise2(x / 340, z / 340);
  const n2 = vnoise2(x / 110 + 7, z / 110 + 3);
  const n3 = mottle(x, z, 55);
  if (dist === 'sea') {
    // Open sea: water at 0, with the islands rising out of it.
    const { island, d } = islandAt(x, z);
    if (island && d < island.r) {
      const fall = 0.5 * (1 + Math.cos((Math.PI * d) / island.r));
      return island.h * fall + n2 * 3;
    }
    return 0;
  }
  if (dist === 'beach') {
    // Sand sloping down to the waterline.
    const coast = coastX(z);
    const t = clamp01((x - coast) / MAP.beachWidth);
    return 1 + t * 5 + n2 * 1.2;
  }
  if (dist === 'city') {
    // Flat city ground with a gentle roll — the airport needs flat.
    return 8 + n1 * 3 + n2 * 1.5;
  }
  if (dist === 'desert') {
    // Smooth dunes.
    return 6 + n1 * 10 + n2 * 4 + n3 * 3;
  }
  if (dist === 'mountain') {
    // Forested slopes: a wide valley floor along the route, rising to
    // forested ridges away from it (peaks ~200 m, NOT 500 m — the v9
    // mountains were 500 m walls that filled the whole frame with no sky).
    const rise = 185 * smooth(350, 1600, distRoute);
    const farNorth = 170 * smooth(MAP.mountain.farNorthZ, 10200, z);
    let h = 28 + n1 * 14 + n2 * 6 + n3 * 5 + rise + farNorth;
    // A river runs down the valley floor along the route.
    if (distRoute < 42) h = Math.min(h, 6);
    return h;
  }
  // fields: rolling green countryside, forest patches, one lake.
  let h = 10 + n1 * 12 + n2 * 4 + n3 * 3;
  const lakeD = Math.hypot(x - MAP.lake.x, z - MAP.lake.z);
  if (lakeD < MAP.lake.r) h = 2;
  // A river runs down the mountain-valley route where it crosses fields.
  if (distRoute < 42) h = Math.min(h, 6);
  return h;
}

/** Shortest distance from (x, z) to a polyline of {x, z} points. */
export function distToRoute(points, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const ax = points[i].x;
    const az = points[i].z;
    const bx = points[i + 1].x;
    const bz = points[i + 1].z;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 === 0 ? 0 : ((x - ax) * dx + (z - az) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) best = d;
  }
  return best;
}
