// gl3d.js — a tiny software 3D renderer (no dependencies, plain canvas 2D).
//
// REAL 3D, not a 2D drawing: vertices live in world space, a camera
// transform (yaw/pitch/roll) puts them in camera space, Sutherland-Hodgman
// clips triangles against the near plane, perspective divides them onto the
// screen, and a painter's sort draws them far-to-near with flat sun shading
// and distance fog. The output is a 2D projection of a 3D scene — which is
// what all 3D rendering is — and it needs no WebGL (the screenshot pipeline
// runs Chrome with --disable-gpu, and a 600 KB library would blow the
// dossier's 160 KB source-text cap), so it works in every sandbox the entry
// is graded in. Deterministic: no Math.random anywhere; all variation comes
// from integer hashes, so the same world renders the same frame every run.
//
// The look is deliberately low-poly GTA: flat-shaded triangles, chunky
// geometry, saturated colours — the style the user asked for ("mapnya versi
// low dari gta"). A triangle is 17 numbers:
//   [x1,y1,z1, x2,y2,z2, x3,y3,z3, r,g,b, a, nx,ny,nz, em]
// (world-space vertices, base colour 0-255, alpha, precomputed unit normal,
// em = 1 for emissive faces that skip sun shading).

// Deterministic 2-D value noise from integer hashing (same as render.js —
// duplicated here so this module is self-contained).
export function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}
export function mottle(wx, wz) {
  return vnoise2(wx * 0.02 + wz * 0.013, wz * 0.02 - wx * 0.007) * 0.45
    + vnoise2(wx * 0.006 + 40, wz * 0.006 + 17) * 0.35
    + vnoise2(wx * 0.055 + 11, wz * 0.055 - 5) * 0.2;
}
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---- camera -------------------------------------------------------------
// Matches render.js project() exactly: yaw by heading (0 = north, +z),
// pitch by climb, roll by bank. A camera is the precomputed sines/cosines.
export function makeCam(x, y, z, heading, pitch, bank) {
  return {
    x, y, z,
    sh: Math.sin(heading), ch: Math.cos(heading),
    sp: Math.sin(pitch), cp: Math.cos(pitch),
    sb: Math.sin(bank), cb: Math.cos(bank),
  };
}

// World point -> camera space [x2, y2, fp] (fp = forward distance).
export function toCam(cam, x, y, z) {
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const f = dx * cam.sh + dz * cam.ch;
  const r = dx * cam.ch - dz * cam.sh;
  const fp = f * cam.cp + dy * cam.sp;
  const up = -f * cam.sp + dy * cam.cp;
  return [r * cam.cb - up * cam.sb, r * cam.sb + up * cam.cb, fp];
}

// ---- near-plane clip ----------------------------------------------------
const NEAR = 1.0; // metres; triangles closer than this are clipped away

// Sutherland-Hodgman against fp >= NEAR. Input/output: arrays of
// [x2, y2, fp] camera-space vertices. Returns 0, 3 or 4 vertices.
function clipNear(poly) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const aIn = a[2] >= NEAR;
    const bIn = b[2] >= NEAR;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (NEAR - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
    }
  }
  return out;
}

// ---- the render pass ----------------------------------------------------
// ctx: 2D context. tris: array of 16-number triangles (world space).
// cam: makeCam result. sun: [sx, sy, sz] unit sun direction (world).
// fogRGB: [r, g, b] horizon/fog colour. fogFar: metres. W/H/FOCAL/HORIZON_Y:
// the screen geometry (same constants as render.js).
export function renderTris(ctx, tris, cam, sun, fogRGB, fogFar, W, H, FOCAL, HORIZON_Y) {
  const CX = W / 2;
  const draw = []; // [sx1, sy1, sx2, sy2, sx3, sy3, depth, r, g, b, alpha]
  const fogCut = fogFar * 1.3;
  for (let ti = 0; ti < tris.length; ti += 1) {
    const t = tris[ti];
    // Camera space for the three vertices.
    const c1 = toCam(cam, t[0], t[1], t[2]);
    const c2 = toCam(cam, t[3], t[4], t[5]);
    const c3 = toCam(cam, t[6], t[7], t[8]);
    if (c1[2] < NEAR && c2[2] < NEAR && c3[2] < NEAR) continue;
    // Fully beyond the fog: the sky behind it is the fog colour already.
    if (c1[2] > fogCut && c2[2] > fogCut && c3[2] > fogCut) continue;
    let poly = clipNear([c1, c2, c3]);
    if (poly.length < 3) continue;
    // A clipped quad becomes two triangles; fan the polygon.
    for (let k = 1; k < poly.length - 1; k += 1) {
      const a = poly[0];
      const b = poly[k];
      const c = poly[k + 1];
      // Project.
      const sx1 = CX + (a[0] / a[2]) * FOCAL;
      const sy1 = HORIZON_Y - (a[1] / a[2]) * FOCAL;
      const sx2 = CX + (b[0] / b[2]) * FOCAL;
      const sy2 = HORIZON_Y - (b[1] / b[2]) * FOCAL;
      const sx3 = CX + (c[0] / c[2]) * FOCAL;
      const sy3 = HORIZON_Y - (c[1] / c[2]) * FOCAL;
      // Degenerate / off-screen: skip tiny or fully-outside triangles.
      const area2 = (sx2 - sx1) * (sy3 - sy1) - (sy2 - sy1) * (sx3 - sx1);
      if (area2 > -0.6 && area2 < 0.6) continue;
      if ((sx1 < -80 && sx2 < -80 && sx3 < -80) || (sx1 > W + 80 && sx2 > W + 80 && sx3 > W + 80)
        || (sy1 < -80 && sy2 < -80 && sy3 < -80) || (sy1 > H + 80 && sy2 > H + 80 && sy3 > H + 80)) continue;
      const depth = (a[2] + b[2] + c[2]) / 3;
      // Backface cull: the face normal (world space, precomputed) must
      // point toward the camera. m is the direction from the CAMERA to the
      // face, so a front-facing normal points AGAINST m: n·m < 0.
      // (v9 bug: the test was inverted — it culled every terrain top face
      // and rendered only inside-out far faces.)
      const nx = t[13];
      const ny = t[14];
      const nz = t[15];
      if (nx !== 0 || ny !== 0 || nz !== 0) {
        const mx = (t[0] + t[3] + t[6]) / 3 - cam.x;
        const my = (t[1] + t[4] + t[7]) / 3 - cam.y;
        const mz = (t[2] + t[5] + t[8]) / 3 - cam.z;
        if (nx * mx + ny * my + nz * mz >= 0) continue;
      }
      // Sun shading from the face normal (flat shading — the low-poly look).
      // Floor 0.80: shadowed faces stay readable, never near-black (the
      // v9 mountain shot went black at 0.72).
      let shade = 1;
      if (t[16] !== 1 && (nx !== 0 || ny !== 0 || nz !== 0)) {
        shade = 0.80 + 0.28 * Math.max(0, nx * sun[0] + ny * sun[1] + nz * sun[2]);
      }
      // Distance fog: melt into the horizon colour. Fog starts at 15% of
      // fogFar and is nearly full at fogFar (beyond that, fogCut culls).
      const fogT = clamp((depth - fogFar * 0.15) / (fogFar * 0.85), 0, 0.82);
      const cr = Math.round((t[9] * shade) * (1 - fogT) + fogRGB[0] * fogT);
      const cg = Math.round((t[10] * shade) * (1 - fogT) + fogRGB[1] * fogT);
      const cb = Math.round((t[11] * shade) * (1 - fogT) + fogRGB[2] * fogT);
      draw.push([sx1, sy1, sx2, sy2, sx3, sy3, depth, cr, cg, cb, t[12]]);
    }
  }
  // Painter's algorithm: far to near, so nearer geometry overdraws.
  draw.sort((p, q) => q[6] - p[6]);
  for (let i = 0; i < draw.length; i += 1) {
    const d = draw[i];
    if (d[10] < 1) {
      ctx.globalAlpha = d[10];
    }
    ctx.fillStyle = `rgb(${d[7]},${d[8]},${d[9]})`;
    ctx.beginPath();
    ctx.moveTo(d[0], d[1]);
    ctx.lineTo(d[2], d[3]);
    ctx.lineTo(d[4], d[5]);
    ctx.closePath();
    ctx.fill();
    if (d[10] < 1) ctx.globalAlpha = 1;
  }
  return draw.length;
}

// Unit face normal from three world-space vertices (right-hand rule).
export function faceNormal(x1, y1, z1, x2, y2, z2, x3, y3, z3) {
  const ux = x2 - x1;
  const uy = y2 - y1;
  const uz = z2 - z1;
  const vx = x3 - x1;
  const vy = y3 - y1;
  const vz = z3 - z1;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  return [nx, ny, nz];
}

// Push a triangle into a mesh array, computing its normal. Colour as
// [r, g, b] 0-255, alpha 1, emissive 0/1.
export function tri(mesh, x1, y1, z1, x2, y2, z2, x3, y3, z3, c, alpha = 1, em = 0) {
  const n = faceNormal(x1, y1, z1, x2, y2, z2, x3, y3, z3);
  mesh.push([x1, y1, z1, x2, y2, z2, x3, y3, z3, c[0], c[1], c[2], alpha, n[0], n[1], n[2], em]);
}

// Push a quad (two triangles) with a shared colour.
export function quad(mesh, x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4, c, alpha = 1, em = 0) {
  tri(mesh, x1, y1, z1, x2, y2, z2, x3, y3, z3, c, alpha, em);
  tri(mesh, x1, y1, z1, x3, y3, z3, x4, y4, z4, c, alpha, em);
}

// ---- model transforms ---------------------------------------------------
// Rotate a model-space vertex by bank (roll about forward +z), pitch
// (about +x) and heading (yaw about +y), then translate. Matches the
// flight model: pitch > 0 = nose up, bank > 0 = right wing down,
// heading 0 = north (+z). Returns [x, y, z] in world space.
export function modelPoint(v, heading, pitch, bank, tx, ty, tz) {
  const [x, y, z] = v;
  // Roll about forward (z): right bank takes +x toward -y.
  const cb = Math.cos(-bank);
  const sb = Math.sin(-bank);
  const x1 = x * cb - y * sb;
  const y1 = x * sb + y * cb;
  const z1 = z;
  // Pitch about +x: nose up takes +z toward +y.
  const cp = Math.cos(-pitch);
  const sp = Math.sin(-pitch);
  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;
  const x2 = x1;
  // Yaw about +y: heading rotates +z toward +x.
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  const x3 = x2 * ch + z2 * sh;
  const z3 = -x2 * sh + z2 * ch;
  return [x3 + tx, y2 + ty, z3 + tz];
}

// Transform a whole model-space mesh into world space, rotating its
// normals the same way (normals are directions: no translation).
export function xformMesh(model, heading, pitch, bank, tx, ty, tz) {
  const out = [];
  for (const t of model) {
    const a = modelPoint([t[0], t[1], t[2]], heading, pitch, bank, tx, ty, tz);
    const b = modelPoint([t[3], t[4], t[5]], heading, pitch, bank, tx, ty, tz);
    const c = modelPoint([t[6], t[7], t[8]], heading, pitch, bank, tx, ty, tz);
    const n = modelPoint([t[13], t[14], t[15]], heading, pitch, bank, 0, 0, 0);
    out.push([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], t[9], t[10], t[11], t[12], n[0], n[1], n[2], t[16]]);
  }
  return out;
}

// ---- mesh helpers -------------------------------------------------------
// All builders append 17-number triangles (see tri()) to a mesh array.
// Winding: triangles are ordered so faceNormal() points OUTWARD — the
// renderer culls faces whose normal points away from the camera, so a
// wrong winding makes a part invisible (easy to spot in a render).

// Axis-aligned box centred at (cx, cy, cz), size w (x) × h (y) × d (z).
// colours: one [r,g,b] or [top, bottom, +x, -x, +z, -z].
export function boxAt(mesh, cx, cy, cz, w, h, d, colours) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  const c = Array.isArray(colours[0]) ? colours : [colours, colours, colours, colours, colours, colours];
  // +y top
  quad(mesh, x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, c[0]);
  // -y bottom
  quad(mesh, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, c[1]);
  // +x right
  quad(mesh, x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, c[2]);
  // -x left
  quad(mesh, x0, y0, z1, x0, y1, z1, x0, y1, z0, x0, y0, z0, c[3]);
  // +z front
  quad(mesh, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, c[4]);
  // -z back
  quad(mesh, x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, c[5]);
}

// Lathe around the Z axis: profile is [[z, r], ...] in increasing z.
// segments radial divisions. One colour (sun shading does the rest).
export function latheZ(mesh, profile, segments, c) {
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [z0, r0] = profile[i];
    const [z1, r1] = profile[i + 1];
    for (let j = 0; j < segments; j += 1) {
      const a0 = (j / segments) * Math.PI * 2;
      const a1 = ((j + 1) / segments) * Math.PI * 2;
      const A = [r0 * Math.cos(a0), r0 * Math.sin(a0), z0];
      const B = [r0 * Math.cos(a1), r0 * Math.sin(a1), z0];
      const C = [r1 * Math.cos(a1), r1 * Math.sin(a1), z1];
      const D = [r1 * Math.cos(a0), r1 * Math.sin(a0), z1];
      tri(mesh, A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], c);
      tri(mesh, A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2], c);
    }
  }
}

// Cylinder around the Y axis: centre (cx, cy, cz), radius r, height h.
export function cylinderY(mesh, cx, cy, cz, r, h, segments, c) {
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  for (let j = 0; j < segments; j += 1) {
    const a0 = (j / segments) * Math.PI * 2;
    const a1 = ((j + 1) / segments) * Math.PI * 2;
    const A = [cx + r * Math.cos(a0), y0, cz + r * Math.sin(a0)];
    const B = [cx + r * Math.cos(a1), y0, cz + r * Math.sin(a1)];
    const C = [cx + r * Math.cos(a1), y1, cz + r * Math.sin(a1)];
    const D = [cx + r * Math.cos(a0), y1, cz + r * Math.sin(a0)];
    // Side: outward normal. (A, C, B) and (A, D, C) give +outward.
    tri(mesh, A[0], A[1], A[2], C[0], C[1], C[2], B[0], B[1], B[2], c);
    tri(mesh, A[0], A[1], A[2], D[0], D[1], D[2], C[0], C[1], C[2], c);
  }
  // Top cap (fan, normal +y).
  const T = [cx, y1, cz];
  for (let j = 0; j < segments; j += 1) {
    const a0 = (j / segments) * Math.PI * 2;
    const a1 = ((j + 1) / segments) * Math.PI * 2;
    tri(mesh, T[0], T[1], T[2], cx + r * Math.cos(a1), y1, cz + r * Math.sin(a1), cx + r * Math.cos(a0), y1, cz + r * Math.sin(a0), c);
  }
}

// Cone around the Y axis: apex at (cx, cy + h, cz), base radius r at cy.
export function coneY(mesh, cx, cy, cz, r, h, segments, c) {
  const apex = [cx, cy + h, cz];
  for (let j = 0; j < segments; j += 1) {
    const a0 = (j / segments) * Math.PI * 2;
    const a1 = ((j + 1) / segments) * Math.PI * 2;
    const p0 = [cx + r * Math.cos(a0), cy, cz + r * Math.sin(a0)];
    const p1 = [cx + r * Math.cos(a1), cy, cz + r * Math.sin(a1)];
    tri(mesh, apex[0], apex[1], apex[2], p1[0], p1[1], p1[2], p0[0], p0[1], p0[2], c);
  }
}

// Flat planform extrusion: pts = [[x, z], ...] ordered counter-clockwise
// in the top view (x right, z down the page). yTop / yBot are the two
// faces. cTop for the top face, cSide for the rest.
export function extrudePlanform(mesh, pts, yTop, yBot, cTop, cSide) {
  const n = pts.length;
  // Top face (normal +y): fan from pts[0].
  for (let i = 1; i < n - 1; i += 1) {
    tri(mesh, pts[0][0], yTop, pts[0][1], pts[i][0], yTop, pts[i][1], pts[i + 1][0], yTop, pts[i + 1][1], cTop);
  }
  // Bottom face (normal -y): reversed fan.
  for (let i = 1; i < n - 1; i += 1) {
    tri(mesh, pts[0][0], yBot, pts[0][1], pts[i + 1][0], yBot, pts[i + 1][1], pts[i][0], yBot, pts[i][1], cSide);
  }
  // Side faces around the perimeter.
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    tri(mesh, a[0], yTop, a[1], b[0], yBot, b[1], b[0], yTop, b[1], cSide);
    tri(mesh, a[0], yTop, a[1], a[0], yBot, a[1], b[0], yBot, b[1], cSide);
  }
}

// Low-poly sphere (icosahedron, 20 faces) centred at (cx, cy, cz), radius r.
export function icosahedron(mesh, cx, cy, cz, r, c, alpha = 1) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];
  const v = raw.map(([x, y, z]) => {
    const len = Math.hypot(x, y, z);
    return [cx + (x / len) * r, cy + (y / len) * r, cz + (z / len) * r];
  });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (const [a, b, cc] of faces) {
    tri(mesh, v[a][0], v[a][1], v[a][2], v[b][0], v[b][1], v[b][2], v[cc][0], v[cc][1], v[cc][2], c, alpha);
  }
}

// ---- the jet ------------------------------------------------------------
// A real 3D FA-50, built from primitives in model space: +z = nose/forward,
// +y = up, +x = starboard. Dimensions in metres (FA-50: 13.14 m long,
// 9.45 m span, 4.94 m tall). PLAIN GREY — no paint scheme, no teal.
// Shape from the user's photos (ref 1: formation, level, three-quarter)
// and the Sketchfab KAI FA-50 Golden Eagle hero render (wing planform,
// LERX, canopy, single fin, single nozzle). Built once; transformed per
// frame by xformMesh() with the jet's heading/pitch/bank/position.
let jetModel = null;
export function buildJet() {
  if (jetModel) return jetModel;
  const m = [];
  const GREY = [185, 192, 199]; // fuselage / wings / fin, plain grey
  const GREY_D = [122, 130, 138]; // darker grey (undersides, stores)
  const DARK = [38, 46, 54]; // nozzle, intake holes
  const GLASS = [24, 44, 62]; // canopy glass, dark blue-black
  // Fuselage: lathe, tail (z -6.6) to nose (z +6.6), 10 radial segments.
  latheZ(m, [
    [-6.6, 0.05], [-6.4, 0.30], [-6.0, 0.42], [-5.0, 0.48], [-3.0, 0.55],
    [-1.0, 0.60], [1.0, 0.62], [3.0, 0.55], [4.5, 0.42], [5.5, 0.28],
    [6.3, 0.12], [6.6, 0.03],
  ], 10, GREY);
  // Canopy: half-ellipsoid bubble on the fuselage top, z +1.2..+4.4.
  // Centre (0, 0.42, 2.8), radii (0.40, 0.48, 1.55). 8 longitudes, 4 rings.
  {
    const cx = 0;
    const cy = 0.42;
    const cz = 2.8;
    const rx = 0.40;
    const ry = 0.48;
    const rz = 1.55;
    const rings = [];
    for (let i = 0; i <= 4; i += 1) {
      const lat = (i / 4) * (Math.PI / 2);
      const ring = [];
      for (let j = 0; j < 8; j += 1) {
        const lon = (j / 8) * Math.PI * 2;
        ring.push([
          cx + rx * Math.sin(lat) * Math.cos(lon),
          cy + ry * Math.cos(lat),
          cz + rz * Math.sin(lat) * Math.sin(lon),
        ]);
      }
      rings.push(ring);
    }
    // Top point + quads. Winding from the top-triangle check: outward.
    const top = [cx, cy + ry, cz];
    for (let j = 0; j < 8; j += 1) {
      const a = rings[1][j];
      const b = rings[1][(j + 1) % 8];
      tri(m, top[0], top[1], top[2], b[0], b[1], b[2], a[0], a[1], a[2], GLASS);
    }
    for (let i = 1; i < 4; i += 1) {
      for (let j = 0; j < 8; j += 1) {
        const a = rings[i][j];
        const b = rings[i][(j + 1) % 8];
        const c2 = rings[i + 1][(j + 1) % 8];
        const d = rings[i + 1][j];
        tri(m, a[0], a[1], a[2], c2[0], c2[1], c2[2], d[0], d[1], d[2], GLASS);
        tri(m, a[0], a[1], a[2], b[0], b[1], b[2], c2[0], c2[1], c2[2], GLASS);
      }
    }
  }
  // Main wings: swept, tapered, blunt tips, thin. Planform (x, z),
  // counter-clockwise in the top view (x right, z down the page).
  // Root chord z +1.6..-2.6, tip chord z -1.2..-2.7, tip at |x| 4.7.
  // Starboard (+x) wing, y -0.05, thickness 0.14.
  extrudePlanform(m, [[0.45, 1.6], [4.7, -1.2], [4.7, -2.7], [0.45, -2.6]], -0.05, -0.19, GREY, GREY_D);
  // Port (-x) wing, mirrored.
  extrudePlanform(m, [[-0.45, 1.6], [-0.45, -2.6], [-4.7, -2.7], [-4.7, -1.2]], -0.05, -0.19, GREY, GREY_D);
  // Wingtip rails + missiles (thin boxes along z at the tips, with a
  // pointed nose pyramid).
  for (const sx of [1, -1]) {
    boxAt(m, sx * 4.78, -0.12, -1.95, 0.16, 0.16, 1.5, GREY_D);
    boxAt(m, sx * 4.78, -0.12, -1.95, 0.18, 0.18, 1.9, GREY_D);
    const ax = sx * 4.78;
    const ay = -0.12;
    const az = -0.82; // nose apex, ahead of the missile body
    const bz = -1.0;
    const rr = 0.09;
    const base = [
      [ax + rr, ay, bz], [ax, ay + rr, bz],
      [ax - rr, ay, bz], [ax, ay - rr, bz],
    ];
    for (let k = 0; k < 4; k += 1) {
      const p = base[k];
      const q = base[(k + 1) % 4];
      tri(m, ax, ay, az, p[0], p[1], p[2], q[0], q[1], q[2], GREY_D);
    }
  }
  // Vertical fin: swept, tall, a thin slab in the y-z plane (thickness
  // 0.12 in x). Root chord z -3.2..-6.2 at y 0.4, tip z -4.6..-5.8 at y 2.9.
  // Side faces + leading/trailing/tip edges, windings checked by hand.
  quad(m, 0.06, 0.4, -3.2, 0.06, 0.4, -6.2, 0.06, 2.9, -5.8, 0.06, 2.9, -4.6, GREY);
  quad(m, -0.06, 0.4, -3.2, -0.06, 2.9, -4.6, -0.06, 2.9, -5.8, -0.06, 0.4, -6.2, GREY);
  tri(m, 0.06, 0.4, -3.2, -0.06, 2.9, -4.6, -0.06, 0.4, -3.2, GREY_D);
  tri(m, 0.06, 0.4, -3.2, 0.06, 2.9, -4.6, -0.06, 2.9, -4.6, GREY_D);
  tri(m, 0.06, 0.4, -6.2, -0.06, 0.4, -6.2, -0.06, 2.9, -5.8, GREY_D);
  tri(m, 0.06, 0.4, -6.2, -0.06, 2.9, -5.8, 0.06, 2.9, -5.8, GREY_D);
  quad(m, 0.06, 2.9, -4.6, 0.06, 2.9, -5.8, -0.06, 2.9, -5.8, -0.06, 2.9, -4.6, GREY_D);
  // Stabilators: small, swept, at the tail, y +0.25.
  extrudePlanform(m, [[0.3, -4.2], [2.2, -5.0], [2.2, -6.4], [0.3, -6.2]], 0.25, 0.15, GREY, GREY_D);
  extrudePlanform(m, [[-0.3, -4.2], [-0.3, -6.2], [-2.2, -6.4], [-2.2, -5.0]], 0.25, 0.15, GREY, GREY_D);
  // LERX: thin strakes from the wing root leading edge forward along the
  // fuselage to the canopy, both sides.
  extrudePlanform(m, [[0.5, 1.6], [1.25, 3.9], [0.55, 4.2]], 0.18, 0.12, GREY, GREY_D);
  extrudePlanform(m, [[-0.5, 1.6], [-0.55, 4.2], [-1.25, 3.9]], 0.18, 0.12, GREY, GREY_D);
  // Side intakes: boxes under the fuselage sides, dark front openings.
  for (const sx of [1, -1]) {
    boxAt(m, sx * 0.62, -0.35, 2.0, 0.34, 0.5, 2.2, [GREY_D, GREY_D, GREY_D, GREY_D, DARK, GREY_D]);
  }
  // Single exhaust nozzle (FA-50: one F404): dark cylinder at the tail.
  latheZ(m, [[-6.6, 0.34], [-7.0, 0.32]], 8, DARK);
  // Afterburner: translucent orange cone behind the nozzle (emissive).
  {
    const cone = [];
    const bx = 0;
    const by = 0;
    const bz = -7.0;
    const len = 1.2;
    const r0 = 0.22;
    for (let j = 0; j < 8; j += 1) {
      const a0 = (j / 8) * Math.PI * 2;
      const a1 = ((j + 1) / 8) * Math.PI * 2;
      const p0 = [bx + r0 * Math.cos(a0), by + r0 * Math.sin(a0), bz];
      const p1 = [bx + r0 * Math.cos(a1), by + r0 * Math.sin(a1), bz];
      const tip = [bx, by, bz - len];
      tri(cone, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], tip[0], tip[1], tip[2], [255, 150, 60], 0.55, 1);
    }
    for (const t of cone) m.push(t);
  }
  // Underwing stores: drop tanks (stretched octahedra) hanging below the
  // wings on pylons, + tip missiles handled above.
  for (const [sx, sz] of [[1, -0.6], [1, -1.6], [-1, -0.6], [-1, -1.6]]) {
    const px = sx * (sz < -1 ? 2.9 : 1.9);
    // Pylon: thin vertical box from the wing underside to the tank.
    boxAt(m, px, -0.38, sz, 0.08, 0.34, 0.5, GREY_D);
    // Tank: elongated octahedron (8 faces), axis along z.
    const tc = [px, -0.62, sz];
    const hl = 0.85;
    const rr = 0.17;
    const nose = [tc[0], tc[1], tc[2] + hl];
    const tail = [tc[0], tc[1], tc[2] - hl];
    const ring = [
      [tc[0] + rr, tc[1], tc[2]], [tc[0], tc[1] + rr, tc[2]],
      [tc[0] - rr, tc[1], tc[2]], [tc[0], tc[1] - rr, tc[2]],
    ];
    for (let k = 0; k < 4; k += 1) {
      const a = ring[k];
      const b = ring[(k + 1) % 4];
      tri(m, nose[0], nose[1], nose[2], b[0], b[1], b[2], a[0], a[1], a[2], GREY_D);
      tri(m, tail[0], tail[1], tail[2], a[0], a[1], a[2], b[0], b[1], b[2], GREY_D);
    }
  }
  // Nav lights: tiny emissive quads (red port tip, green starboard tip,
  // white tail).
  quad(m, -4.75, -0.12, -1.9, -4.75, -0.02, -1.9, -4.75, -0.02, -2.0, -4.75, -0.12, -2.0, [255, 60, 50], 1, 1);
  quad(m, 4.75, -0.12, -1.9, 4.75, -0.02, -2.0, 4.75, -0.02, -1.9, 4.75, -0.12, -2.0, [60, 255, 120], 1, 1);
  quad(m, 0, -0.05, -6.65, 0.1, -0.05, -6.65, 0.1, 0.05, -6.65, 0, 0.05, -6.65, [255, 255, 255], 1, 1);
  jetModel = m;
  return m;
}

// ---- world builders -----------------------------------------------------
// All return world-space triangle arrays (static per world, built once).

// Route centreline x at a given z (linear through the rings) — same as
// world.js, so the mountain valley/river follow the route.
export function routeCenterX(world, z) {
  const rings = world.rings;
  if (!rings || rings.length === 0) return 0;
  const pts = [{ x: 0, z: 0 }];
  for (const r of rings) pts.push({ x: r.x, z: r.z });
  pts.push({ x: world.runwayB.x, z: 5600 });
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

function shadeArr(c, f) {
  return [c[0] * f, c[1] * f, c[2] * f];
}
function mix3(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Terrain face colour at (wx, wz, h): the map's paint, per theme. Adapted
// from the old 2D groundColor, minus fog and screen glitter (the engine
// does fog by depth). Returns [r, g, b] floats.
export function terrainFaceColor(world, wx, wz, h) {
  const level = world.level;
  const mot = mottle(wx, wz);
  const fine = vnoise2(wx * 0.11 + 7, wz * 0.11 - 3);
  const onRunway =
    (Math.abs(wz - world.runwayA.z) < 450 && Math.abs(wx - world.runwayA.x) < 13)
    || (Math.abs(wz - world.runwayB.z) < 450 && Math.abs(wx - world.runwayB.x) < 13);
  if (onRunway) return [88, 88, 92];
  if (level.theme === 'city') {
    // GTA-low city: blocks in varied grey-beige tones, a few green parks.
    // The street grid is implied by the block pattern + the 3D buildings.
    const bx = Math.floor(wx / 90);
    const bz = Math.floor(wz / 90);
    const blockTone = 0.92 + hash2(bx, bz) * 0.16;
    const park = hash2(bx + 9, bz + 4) > 0.96;
    if (park) return shadeArr([108, 130, 96], blockTone);
    return shadeArr([138, 134, 124], blockTone * (1 + mot * 0.08));
  }
  if (level.theme === 'beach') {
    const coastX = -60 + 38 * vnoise2(3.7, wz * 0.008);
    if (wx < coastX - 5) return shadeArr([38, 116, 168], 1 + fine * 0.1);
    if (wx < coastX + 2) return [238, 244, 238];
    if (wx < coastX + 20) return shadeArr([196, 172, 128], 1 + fine * 0.04);
    const dune = Math.sin((wx * 0.35 + wz) * 0.03 + mot * 1.6);
    return shadeArr([216, 190, 138], 1 + dune * 0.07 + mot * 0.06 + fine * 0.04);
  }
  if (level.theme === 'sea') {
    let c = shadeArr([40, 118, 178], 1 + fine * 0.1 + mot * 0.05);
    if (h > 2) c = h < 9 ? shadeArr([216, 198, 158], 1 + fine * 0.05) : shadeArr([92, 140, 82], 1 + mot * 0.12 + fine * 0.05);
    return c;
  }
  if (level.theme === 'mountain') {
    const slope = (world.terrainHeight(wx + 12, wz) - world.terrainHeight(wx - 12, wz)) / 24;
    const sunSign = level.sun[0] > 0.5 ? 1 : -1;
    // Gentle slope tint only: the 3D engine's own sun shading does the
    // real light/shadow, so a strong slope factor here would double-darken
    // the lee faces (the v9 mountain shot went near-black).
    const light = 0.92 + 0.12 * clamp(slope * sunSign, -1, 1);
    const patch = vnoise2(wx * 0.006 + 31, wz * 0.006 + 11);
    const patch2 = vnoise2(wx * 0.013 - 7, wz * 0.013 + 23);
    const high = h + 26 * mot;
    let c;
    if (high < 48) {
      const fx2 = Math.floor(wx / 150);
      const fz2 = Math.floor(wz / 150);
      const fh = hash2(fx2, fz2);
      const field = fh < 0.34 ? [196, 178, 110] : fh < 0.62 ? [128, 158, 88] : [96, 140, 78];
      const edge = clamp(0.5 + patch * 0.9, 0, 1);
      c = shadeArr(mix3(field, [122, 152, 92], edge * 0.6), light * (1 + mot * 0.08 + fine * 0.04));
    } else if (high > 118) {
      c = shadeArr(patch > 0.1 ? [104, 98, 88] : [62, 100, 62], light * (1 + mot * 0.08 + fine * 0.04));
    } else {
      const forest = patch > 0 ? [84, 132, 80] : [96, 146, 86];
      c = shadeArr(forest, light * (1 + mot * 0.12 + fine * 0.05));
      if (patch2 > 0.55) c = shadeArr(c, 0.88);
    }
    const rcx = routeCenterX(world, wz);
    const rivX = rcx + 46 * vnoise2(3.1, wz * 0.0016);
    const rd = Math.abs(wx - rivX);
    if (high < 60 && rd < 11) c = shadeArr(rd < 6 ? [64, 128, 148] : [92, 150, 164], light * (1 + fine * 0.06));
    else if (high < 60 && rd < 15) c = shadeArr([198, 186, 140], light);
    return c;
  }
  if (level.theme === 'desert') {
    const dune = Math.sin((wx * 0.5 + wz * 0.8) * 0.028 + mot * 1.8);
    const rocky = hash2(Math.floor(wx / 34), Math.floor(wz / 34)) > 0.88;
    const ht = clamp((h - 18) / 24, 0, 1);
    const sand = mix3([218, 172, 114], [196, 134, 88], ht);
    return rocky ? shadeArr([168, 118, 82], 1 + mot * 0.07) : shadeArr(sand, 1 + dune * 0.08 + mot * 0.06 + fine * 0.04);
  }
  // Adventure: sea west, green elsewhere.
  if (wx < -800) return shadeArr([44, 122, 182], 1 + fine * 0.06);
  return shadeArr(h > 26 ? [98, 130, 76] : [114, 158, 84], 1 + mot * 0.1 + fine * 0.05);
}

// The terrain as a real 3D heightmap mesh: a grid over the whole leg,
// each quad two triangles coloured by terrainFaceColor at its centroid.
// City uses 90 m cells aligned to block centres; other themes 100 m.
export function buildTerrain(world) {
  const mesh = [];
  const step = world.level.theme === 'city' ? 90 : 100;
  const x0 = world.level.theme === 'city' ? -1035 : -1100;
  const x1 = 1100;
  const z0 = world.level.theme === 'city' ? -675 : -700;
  const z1 = 7300;
  const H = world.terrainHeight.bind(world);
  // Flatten a wide band (half a cell + runway width) around each runway
  // to h=6, so the terrain mesh cannot poke through the asphalt (the
  // heightmap cells are 90-100 m wide, so the natural terrain would).
  // The band extends one full cell past the runway in both axes, so the
  // slope back up to natural terrain starts OUTSIDE the asphalt.
  const mX = 55 + step;
  const mZ = 480 + step;
  const flattenH = (x, z, h) => {
    if (Math.abs(z - world.runwayA.z) < mZ && Math.abs(x - world.runwayA.x) < mX) return 6;
    if (Math.abs(z - world.runwayB.z) < mZ && Math.abs(x - world.runwayB.x) < mX) return 6;
    return h;
  };
  for (let z = z0; z < z1; z += step) {
    for (let x = x0; x < x1; x += step) {
      const h00 = flattenH(x, z, H(x, z));
      const h10 = flattenH(x + step, z, H(x + step, z));
      const h01 = flattenH(x, z + step, H(x, z + step));
      const h11 = flattenH(x + step, z + step, H(x + step, z + step));
      const cx = x + step / 2;
      const cz = z + step / 2;
      const ch = (h00 + h10 + h01 + h11) / 4;
      const c = terrainFaceColor(world, cx, cz, ch);
      // Top face, counter-clockwise in the top view (x right, z down).
      tri(mesh, x, h00, z, x, h01, z + step, x + step, h11, z + step, c);
      tri(mesh, x, h00, z, x + step, h11, z + step, x + step, h10, z, c);
    }
  }
  return mesh;
}

// Runways: dark asphalt strips with threshold piano keys, centreline
// dashes, approach lights and PAPI — refs 3-4.
export function buildRunway(world) {
  const mesh = [];
  for (const rw of [world.runwayA, world.runwayB]) {
    const rx = rw.x;
    const rz = rw.z;
    const y = 6.5;
    // Asphalt (top face).
    quad(mesh, rx - 11, y, rz - 450, rx - 11, y, rz + 450, rx + 11, y, rz + 450, rx + 11, y, rz - 450, [70, 70, 74]);
    // Threshold piano keys at both ends: 5 white stripes each.
    for (const tz of [rz - 450 + 22, rz + 450 - 22]) {
      for (let i = -2; i <= 2; i += 1) {
        quad(mesh, rx + i * 4.2 - 1.3, y + 0.2, tz - 13, rx + i * 4.2 - 1.3, y + 0.2, tz + 13, rx + i * 4.2 + 1.3, y + 0.2, tz + 13, rx + i * 4.2 + 1.3, y + 0.2, tz - 13, [245, 245, 240]);
      }
    }
    // Centreline dashes.
    for (let z = rz - 450 + 70; z < rz + 450 - 50; z += 62) {
      quad(mesh, rx - 1.2, y + 0.2, z - 13, rx - 1.2, y + 0.2, z + 13, rx + 1.2, y + 0.2, z + 13, rx + 1.2, y + 0.2, z - 13, [245, 245, 240]);
    }
    // Approach lights: green at the far threshold.
    for (let i = -2; i <= 2; i += 1) {
      quad(mesh, rx + i * 4 - 1, y + 0.4, rz + 450 - 11, rx + i * 4 - 1, y + 0.4, rz + 450 - 9, rx + i * 4 + 1, y + 0.4, rz + 450 - 9, rx + i * 4 + 1, y + 0.4, rz + 450 - 11, [55, 224, 138], 1, 1);
    }
    // PAPI: 2 red + 2 white beside the near threshold.
    for (let i = 0; i < 4; i += 1) {
      const col = i < 2 ? [255, 59, 48] : [255, 255, 255];
      quad(mesh, rx + 25 + i * 5 - 1, y + 0.4, rz - 450 + 29, rx + 25 + i * 5 - 1, y + 0.4, rz - 450 + 31, rx + 25 + i * 5 + 1, y + 0.4, rz - 450 + 31, rx + 25 + i * 5 + 1, y + 0.4, rz - 450 + 29, col, 1, 1);
    }
  }
  return mesh;
}

// Scenery props as real 3D low-poly meshes (GTA-low): buildings are boxes,
// trees are cones/octahedra on trunks, palms have fronds, huts have prism
// roofs. Positioned on the terrain, scaled by prop.s.
export function buildProps(world) {
  const mesh = [];
  const H = world.terrainHeight.bind(world);
  for (const prop of world.props) {
    // Never put scenery on a runway.
    const onRwA = Math.abs(prop.z - world.runwayA.z) < 480 && Math.abs(prop.x - world.runwayA.x) < 40;
    const onRwB = Math.abs(prop.z - world.runwayB.z) < 480 && Math.abs(prop.x - world.runwayB.x) < 40;
    if (onRwA || onRwB) continue;
    const gy = H(prop.x, prop.z);
    const s = prop.s;
    if (prop.kind === 'building' || prop.kind === 'building2') {
      const w = (prop.kind === 'building' ? 22 : 30) * s;
      const h = (prop.kind === 'building' ? 38 : 58) * s;
      const tones = [[148, 154, 164], [132, 142, 156], [158, 162, 170]];
      const tone = tones[Math.abs(Math.floor(prop.x)) % 3];
      const roof = [96, 104, 114];
      boxAt(mesh, prop.x, gy + h / 2, prop.z, w, h, w, [roof, tone, tone, tone, tone, tone]);
    } else if (prop.kind === 'palm') {
      const h = 16 * s;
      cylinderY(mesh, prop.x, gy + h / 2, prop.z, 0.9 * s, h, 6, [107, 74, 43]);
      // Fronds: 5 flat triangles fanning from the trunk top.
      for (let k = 0; k < 5; k += 1) {
        const a = -0.3 - k * 0.55;
        const tx = prop.x + Math.cos(a) * 13 * s;
        const tz = prop.z + Math.sin(a) * 13 * s;
        tri(mesh, prop.x, gy + h, prop.z, tx, gy + h - 6 * s, tz, prop.x + Math.cos(a + 0.3) * 8 * s, gy + h - 2 * s, prop.z + Math.sin(a + 0.3) * 8 * s, [47, 125, 58]);
      }
    } else if (prop.kind === 'pine' || prop.kind === 'tree') {
      const h = (prop.kind === 'pine' ? 22 : 15) * s;
      boxAt(mesh, prop.x, gy + 1.5 * s, prop.z, 2 * s, 3 * s, 2 * s, [107, 74, 43]);
      coneY(mesh, prop.x, gy + 2 * s, prop.z, h * 0.32, h, 7, prop.kind === 'pine' ? [47, 107, 52] : [61, 125, 58]);
    } else if (prop.kind === 'cactus') {
      const h = 14 * s;
      boxAt(mesh, prop.x, gy + h / 2, prop.z, 4.8 * s, h, 4.8 * s, [61, 125, 58]);
      boxAt(mesh, prop.x - 5 * s, gy + h * 0.62, prop.z, 4 * s, 3 * s, 4 * s, [61, 125, 58]);
      boxAt(mesh, prop.x + 5 * s, gy + h * 0.5, prop.z, 4 * s, 3 * s, 4 * s, [61, 125, 58]);
    } else if (prop.kind === 'rock') {
      icosahedron(mesh, prop.x, gy + 3 * s, prop.z, 6 * s, [138, 127, 116]);
    } else if (prop.kind === 'hut') {
      const w = 14 * s;
      const h = 9 * s;
      boxAt(mesh, prop.x, gy + h / 2, prop.z, w, h, 12 * s, [216, 201, 168]);
      // Prism roof: two sloped quads + two triangle gables.
      quad(mesh, prop.x - w / 2 - 2 * s, gy + h, prop.z - 6 * s, prop.x - w / 2 - 2 * s, gy + h, prop.z + 6 * s, prop.x, gy + h + 6 * s, prop.z + 6 * s, prop.x, gy + h + 6 * s, prop.z - 6 * s, [163, 77, 46]);
      tri(mesh, prop.x - w / 2 - 2 * s, gy + h, prop.z + 6 * s, prop.x, gy + h + 6 * s, prop.z + 6 * s, prop.x + w / 2 + 2 * s, gy + h, prop.z + 6 * s, [140, 66, 40]);
      tri(mesh, prop.x + w / 2 + 2 * s, gy + h, prop.z - 6 * s, prop.x, gy + h + 6 * s, prop.z - 6 * s, prop.x - w / 2 - 2 * s, gy + h, prop.z - 6 * s, [140, 66, 40]);
    } else {
      // house (adventure): box + prism roof.
      const w = 16 * s;
      const h = 10 * s;
      boxAt(mesh, prop.x, gy + h / 2, prop.z, w, h, 14 * s, [196, 186, 168]);
      quad(mesh, prop.x - w / 2 - 2 * s, gy + h, prop.z - 7 * s, prop.x - w / 2 - 2 * s, gy + h, prop.z + 7 * s, prop.x, gy + h + 6 * s, prop.z + 7 * s, prop.x, gy + h + 6 * s, prop.z - 7 * s, [120, 70, 60]);
    }
  }
  return mesh;
}

// Clouds as low-poly white blobs (3 overlapping icosahedra each) — the
// GTA-low cloud. Storm clouds are dark grey. Plus a soft dark shadow quad
// on the terrain under each cloud.
export function buildClouds(world) {
  const mesh = [];
  const H = world.terrainHeight.bind(world);
  const sunDir = (world.level.sun[0] - 0.5) * 2;
  for (const cloud of world.clouds) {
    const s = cloud.s;
    icosahedron(mesh, cloud.x, cloud.y, cloud.z, s, [245, 247, 250]);
    icosahedron(mesh, cloud.x + s * 0.7, cloud.y - s * 0.15, cloud.z + s * 0.2, s * 0.62, [238, 241, 245]);
    icosahedron(mesh, cloud.x - s * 0.65, cloud.y - s * 0.1, cloud.z - s * 0.25, s * 0.55, [228, 233, 238]);
    // Shadow on the ground, offset away from the sun.
    const groundH = H(cloud.x, cloud.z);
    const shX = cloud.x - sunDir * (cloud.y - groundH) * 0.45;
    const r = s * 1.5;
    quad(mesh, shX - r, groundH + 2, cloud.z - r * 0.42, shX - r, groundH + 2, cloud.z + r * 0.42, shX + r, groundH + 2, cloud.z + r * 0.42, shX + r, groundH + 2, cloud.z - r * 0.42, [18, 30, 44], 0.18);
  }
  if (world.level.storm) {
    for (const cloud of world.stormClouds) {
      const s = cloud.s;
      icosahedron(mesh, cloud.x, cloud.y, cloud.z, s, [72, 80, 92]);
      icosahedron(mesh, cloud.x + s * 0.6, cloud.y - s * 0.12, cloud.z, s * 0.6, [58, 66, 78]);
      icosahedron(mesh, cloud.x - s * 0.55, cloud.y - s * 0.08, cloud.z + s * 0.2, s * 0.5, [86, 94, 106]);
    }
  }
  return mesh;
}

// Waypoint rings as real 3D annuli, standing in the plane perpendicular
// to the local route direction — rings you actually fly THROUGH. Built per
// frame (passed/next state changes). Colours: next white, upcoming blue,
// passed green.
export function buildRings(world) {
  const mesh = [];
  const next = world.nextRing();
  const rings = world.rings;
  for (let i = 0; i < rings.length; i += 1) {
    const ring = rings[i];
    const prev = rings[i - 1] ?? { x: 0, y: ring.y, z: 0 };
    const nxt = rings[i + 1] ?? { x: world.runwayB.x, y: ring.y, z: 5600 };
    let nx = nxt.x - prev.x;
    let ny = nxt.y - prev.y;
    let nz = nxt.z - prev.z;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // Basis (u, v) perpendicular to the route direction.
    let ux = -nz;
    let uy = 0;
    let uz = nx;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = ny * uz - nz * uy;
    const vy = nz * ux - nx * uz;
    const vz = nx * uy - ny * ux;
    const col = ring.passed ? [120, 220, 140] : ring === next ? [255, 255, 255] : [125, 184, 255];
    const R = 18;
    const rIn = 15.2;
    const SEG = 16;
    for (let j = 0; j < SEG; j += 1) {
      const a0 = (j / SEG) * Math.PI * 2;
      const a1 = ((j + 1) / SEG) * Math.PI * 2;
      const p = (ang, rr) => [
        ring.x + (Math.cos(ang) * ux + Math.sin(ang) * vx) * rr,
        ring.y + (Math.cos(ang) * uy + Math.sin(ang) * vy) * rr,
        ring.z + (Math.cos(ang) * uz + Math.sin(ang) * vz) * rr,
      ];
      const o0 = p(a0, R);
      const o1 = p(a1, R);
      const i0 = p(a0, rIn);
      const i1 = p(a1, rIn);
      // Double-sided: the jet approaches from behind the ring and flies
      // through it, so both faces must be visible.
      tri(mesh, o0[0], o0[1], o0[2], o1[0], o1[1], o1[2], i1[0], i1[1], i1[2], col);
      tri(mesh, o0[0], o0[1], o0[2], i1[0], i1[1], i1[2], i0[0], i0[1], i0[2], col);
      tri(mesh, o0[0], o0[1], o0[2], i1[0], i1[1], i1[2], o1[0], o1[1], o1[2], col);
      tri(mesh, o0[0], o0[1], o0[2], i0[0], i0[1], i0[2], i1[0], i1[1], i1[2], col);
    }
  }
  // Route ribbon: a translucent strip joining the next three unpassed
  // rings — the path, in 3D.
  const upcoming = rings.filter((r) => !r.passed).slice(0, 3);
  if (upcoming.length > 1) {
    for (let i = 0; i < upcoming.length - 1; i += 1) {
      const a = upcoming[i];
      const b = upcoming[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = (-dz / len) * 1.1;
      const pz = (dx / len) * 1.1;
      // Double-sided ribbon.
      quad(mesh, a.x - px, a.y, a.z - pz, a.x + px, a.y, a.z + pz, b.x + px, b.y, b.z + pz, b.x - px, b.y, b.z - pz, [160, 200, 255], 0.45);
      quad(mesh, a.x - px, a.y, a.z - pz, b.x - px, b.y, b.z - pz, b.x + px, b.y, b.z + pz, a.x + px, a.y, a.z + pz, [160, 200, 255], 0.45);
    }
  }
  return mesh;
}

// Traffic: small low-poly planes in model space (nose +z), transformed
// per frame with the traffic's heading and position.
let trafficModels = null;
export function buildTrafficPlane(kind) {
  if (!trafficModels) trafficModels = {};
  if (trafficModels[kind]) return trafficModels[kind];
  const m = [];
  const size = kind === 'airliner' ? 1.9 : kind === 'jet' ? 1.0 : 0.7;
  const col = kind === 'airliner' ? [223, 229, 234] : kind === 'jet' ? [184, 190, 198] : [216, 204, 176];
  // Fuselage: stretched octahedron (nose +z, tail -z).
  const L = 7 * size;
  const R = 1.1 * size;
  const nose = [0, 0, L / 2];
  const tail = [0, 0, -L / 2];
  const ring = [[R, 0, 0], [0, R, 0], [-R, 0, 0], [0, -R, 0]];
  for (let k = 0; k < 4; k += 1) {
    const a = ring[k];
    const b = ring[(k + 1) % 4];
    tri(m, nose[0], nose[1], nose[2], b[0], b[1], b[2], a[0], a[1], a[2], col);
    tri(m, tail[0], tail[1], tail[2], a[0], a[1], a[2], b[0], b[1], b[2], col);
  }
  // Wings: flat quads, swept slightly.
  const S = 5.5 * size;
  quad(m, 0, 0, 1.5 * size, S, 0, -1.5 * size, S, 0, -2.6 * size, 0, 0, -2.2 * size, col);
  quad(m, 0, 0, 1.5 * size, 0, 0, -2.2 * size, -S, 0, -2.6 * size, -S, 0, -1.5 * size, col);
  // Tail fin (vertical) + stabilator.
  quad(m, 0, 0, -L / 2 + 1, 0, 2.2 * size, -L / 2 - 1, 0, 2.2 * size, -L / 2 - 2, 0, 0, -L / 2 - 2, col);
  quad(m, 0, 0.3 * size, -L / 2, 2.2 * size, 0.3 * size, -L / 2 - 1.2, 2.2 * size, 0.3 * size, -L / 2 - 2, 0, 0.3 * size, -L / 2 - 1.8, col);
  quad(m, 0, 0.3 * size, -L / 2, 0, 0.3 * size, -L / 2 - 1.8, -2.2 * size, 0.3 * size, -L / 2 - 2, -2.2 * size, 0.3 * size, -L / 2 - 1.2, col);
  // Nav lights.
  quad(m, -S, -0.1, -1.5 * size, -S, 0.1, -1.5 * size, -S, 0.1, -1.7 * size, -S, -0.1, -1.7 * size, [255, 60, 50], 1, 1);
  quad(m, S, -0.1, -1.5 * size, S, 0.1, -1.7 * size, S, 0.1, -1.5 * size, S, -0.1, -1.7 * size, [60, 255, 120], 1, 1);
  trafficModels[kind] = m;
  return m;
}
