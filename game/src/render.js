// Canvas 2D renderer v9: FIRST-PERSON glass cockpit (737-style) + TPP chase
// view. The pilot sits inside the jet: a layered flight deck below —
// glareshield with MCP, six glass screens (PFD / ND / EICAS / standby),
// centre pedestal with throttle quadrant and CDU, yokes — and the route,
// traffic and weather ahead through the windshield. C/V toggles to a chase
// view. v9: the world is REAL 3D — a custom software renderer (gl3d.js)
// builds the terrain as a heightmap mesh, the city as low-poly 3D boxes,
// the FA-50 as a ~500-triangle model (Sketchfab KAI FA-50 Golden Eagle
// hero render for the wing planform + LERX; the user's own FA-50 photos
// for the level three-quarter profile, plain grey), and the rings as 3D
// annuli you fly through. The map is GTA-low: flat-shaded low-poly city,
// coastline, mountains, desert. The cockpit (APPROVED by the user, v7)
// and the HUD are untouched 2D overlays.
import { FIELD, FOCAL, HORIZON_Y } from './config.js';
import {
  makeCam, renderTris, xformMesh, buildJet, buildTerrain, buildRunway,
  buildProps, buildClouds, buildRings, buildTrafficPlane,
} from './gl3d.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const VIEW_FPP = 'FPP';
export const VIEW_TPP = 'TPP';

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mixColor(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}
function mixArr(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function fmt(n, digits = 0) {
  return n.toFixed(digits);
}

function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise2(x, z) {
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
function darkRgba(rgba, f) {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(rgba);
  if (!m) return rgba;
  return `rgba(${Math.round(m[1] * f)},${Math.round(m[2] * f)},${Math.round(m[3] * f)},${m[4]})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = FIELD.width;
  const H = FIELD.height;
  const CX = W / 2;
  const PANEL_Y = 498; // top of the flight deck (windshield ends here)

  function drawSky(world, state) {
    const level = world.level;
    const [top, mid, hor] = level.sky;
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 120);
    g.addColorStop(0, top);
    g.addColorStop(0.6, mid);
    g.addColorStop(1, hor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const sunX = W * level.sun[0];
    const sunY = level.sun[1];
    const halo = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 130);
    halo.addColorStop(0, 'rgba(255,244,190,0.95)');
    halo.addColorStop(0.35, 'rgba(255,230,150,0.5)');
    halo.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
    ctx.fill();
    const ridgePalettes = {
      desert: [['rgba(122,84,58,0.8)', 'rgba(178,128,88,0.8)'], ['rgba(96,64,44,0.88)', 'rgba(150,102,66,0.88)'], ['rgba(72,46,32,0.92)', 'rgba(122,80,52,0.92)']],
      sea: [['rgba(70,88,88,0.8)', 'rgba(116,134,132,0.8)'], ['rgba(52,68,68,0.88)', 'rgba(92,110,108,0.88)'], ['rgba(36,50,50,0.92)', 'rgba(70,88,86,0.92)']],
      beach: [['rgba(110,128,88,0.8)', 'rgba(168,178,132,0.8)'], ['rgba(84,102,64,0.88)', 'rgba(138,150,104,0.88)'], ['rgba(60,78,46,0.92)', 'rgba(108,122,80,0.92)']],
    };
    const ridgePal = ridgePalettes[level.ridge] || [['rgba(206,222,236,0.8)', 'rgba(236,244,250,0.8)'], ['rgba(178,198,220,0.88)', 'rgba(222,234,244,0.88)'], ['rgba(150,172,198,0.92)', 'rgba(204,220,236,0.92)']];
    const horizonY = HORIZON_Y + FOCAL * Math.sin(state.pitch);
    ctx.save();
    ctx.translate(CX, horizonY);
    ctx.rotate(-state.bank);
    ctx.translate(-CX, -horizonY);
    const sunLeft = level.sun[0] < 0.5;
    drawRidge(state, 0.1, 130, ridgePal[0][0], ridgePal[0][1], false, sunLeft, horizonY);
    drawRidge(state, 0.24, 88, ridgePal[1][0], ridgePal[1][1], false, sunLeft, horizonY);
    drawRidge(state, 0.45, 52, ridgePal[2][0], ridgePal[2][1], false, sunLeft, horizonY);
    const hz = level.groundFog < 0.5 ? 0.6 : 0.16; // L1 morning haze: wash the ridge green out of the cover shot
    const haze = ctx.createLinearGradient(0, horizonY - 160, 0, horizonY + 34);
    haze.addColorStop(0, 'rgba(226,232,238,0)');
    haze.addColorStop(0.25, `rgba(226,232,238,${hz})`);
    haze.addColorStop(0.75, `rgba(226,232,238,${hz})`);
    haze.addColorStop(1, 'rgba(226,232,238,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizonY - 160, W, 194);
    ctx.restore();
  }

  function drawRidge(state, parallax, baseY, color, litColor, snow, sunLeft, horizonY) {
    const off = -state.heading * 900 * parallax - state.x * parallax * 0.4;
    const base = horizonY + 2;
    const step = 22;
    const pts = [];
    for (let x = -100; x <= W + 140; x += step) {
      const n1 = vnoise2((x + off) * 0.0035 + parallax * 31, parallax * 17);
      const n2 = vnoise2((x + off) * 0.011 + parallax * 47, parallax * 29);
      const n3 = vnoise2((x + off) * 0.028 + parallax * 71, parallax * 41);
      let h = baseY * (0.42 + 0.38 * n1 + 0.16 * n2 + 0.07 * n3);
      h = clamp(h, baseY * 0.12, baseY * 1.12);
      pts.push({ x, y: base - h });
    }
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const slope = (b.y - a.y) / (b.x - a.x); // <0: face looks left
      const facesLeft = slope < 0;
      const lit = sunLeft ? facesLeft : !facesLeft;
      const top = lit ? litColor : color;
      const g = ctx.createLinearGradient(0, Math.min(a.y, b.y), 0, base);
      g.addColorStop(0, top);
      g.addColorStop(1, darkRgba(top, 0.55));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(a.x, base);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, base);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(235,244,238,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const midY = (a.y + b.y) / 2;
      const depth = base - midY;
      if (depth < 14) continue;
      for (let k = 0; k < 3; k += 1) {
        const hx = hash2(Math.floor((a.x + k * 17) / 6), Math.floor(parallax * 100) + k * 5);
        if (hx < 0.5) continue;
        const sx = a.x + 3 + k * 7 + hx * 5;
        const sy = midY + 6 + hash2(Math.floor(sx * 3), 11) * depth * 0.62;
        const sr = 1.4 + hash2(Math.floor(sx * 5), 23) * 2.4;
        ctx.fillStyle = 'rgba(16,34,22,0.32)';
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const hx = hash2(Math.floor(a.x / 9), Math.floor(parallax * 100) + 77);
      if (hx < 0.86) continue;
      const midY = (a.y + b.y) / 2;
      const rx = (a.x + b.x) / 2;
      ctx.fillStyle = 'rgba(196,198,190,0.30)';
      ctx.beginPath();
      ctx.moveTo(rx - 7, midY + 4);
      ctx.lineTo(rx - 2, midY - 2);
      ctx.lineTo(rx + 6, midY + 3);
      ctx.lineTo(rx + 2, midY + 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  function seaGlitter(c, level, fx, fogT, wx, wz) {
    const sunX = level.sun[0];
    const near = clamp(1 - Math.abs(fx - sunX) / 0.3, 0, 1);
    if (near <= 0 || fogT > 0.7) return c;
    const sparkle = vnoise2(wx * 0.09, wz * 0.09);
    if (sparkle < 0.15) return c;
    const g = near * (sparkle - 0.15) * 1.8;
    return [c[0] + 110 * g, c[1] + 115 * g, c[2] + 95 * g];
  }

  function drawRain(state) {
    ctx.strokeStyle = 'rgba(200,214,228,0.4)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 130; i += 1) {
      const x = ((i * 97 + state.time * 260) % (W + 120)) - 60;
      const y = ((i * 173 + state.time * 720) % (PANEL_Y + 40));
      ctx.moveTo(x, y);
      ctx.lineTo(x - 9, y + 22);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(90,100,112,0.10)';
    ctx.fillRect(0, 0, W, PANEL_Y);
  }

  function drawLightning(state) {
    if (state.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(state.flashT / 0.14, 0, 1) * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // --- the flight deck: a 737-style glass cockpit, layered for depth -----
  function glassScreen(x, y, w, h) {
    ctx.fillStyle = '#0a0f16';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.strokeStyle = '#3a4552';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#05080d';
    ctx.fillRect(x, y, w, h);
  }

  function drawPFD(x, y, w, h, state) {
    glassScreen(x, y, w, h);
    const cx = x + w / 2;
    const cy = y + h / 2 + 4;
    const r = Math.min(w, h) / 2 - 14;
    ctx.fillStyle = '#7be495';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AT  |  LNAV  |  VNAV PTH', cx, y + 12);
    ctx.textAlign = 'left';
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.bank);
    const pitchShift = clamp(state.pitch * 260, -r, r);
    ctx.translate(0, pitchShift);
    ctx.fillStyle = '#2f7fd0';
    ctx.fillRect(-r * 1.8, -r * 1.8, r * 3.6, r * 1.8);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-r * 1.8, 0, r * 3.6, r * 1.8);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 1.8, 0);
    ctx.lineTo(r * 1.8, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    for (const off of [-r * 0.45, r * 0.45]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, off);
      ctx.lineTo(r * 0.5, off);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#8a94a2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff9d00';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy);
    ctx.lineTo(cx - r * 0.16, cy);
    ctx.moveTo(cx + r * 0.16, cy);
    ctx.lineTo(cx + r * 0.5, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + r * 0.12);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r + 3);
    ctx.lineTo(cx - 5, cy - r + 10);
    ctx.lineTo(cx + 5, cy - r + 10);
    ctx.closePath();
    ctx.fill();
    const spdKt = Math.round(state.speed * 1.944);
    const altFt = Math.round(state.y * 3.281);
    ctx.fillStyle = 'rgba(10,18,30,0.85)';
    ctx.fillRect(x + 4, y + 18, 34, h - 26);
    ctx.fillRect(x + w - 38, y + 18, 34, h - 26);
    ctx.fillStyle = '#bcd9f2';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (let i = -2; i <= 2; i += 1) {
      const v = spdKt + i * 20;
      if (v < 0) continue;
      ctx.fillText(String(v), x + 21, cy + i * 16 + 3);
    }
    for (let i = -2; i <= 2; i += 1) {
      const v = altFt + i * 100;
      if (v < 0) continue;
      ctx.fillText(String(v), x + w - 21, cy + i * 16 + 3);
    }
    ctx.fillStyle = '#0d1a2a';
    ctx.fillRect(x + 2, cy - 9, 38, 18);
    ctx.fillRect(x + w - 40, cy - 9, 38, 18);
    ctx.strokeStyle = '#7be495';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 2, cy - 9, 38, 18);
    ctx.strokeRect(x + w - 40, cy - 9, 38, 18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(String(spdKt), x + 21, cy + 4);
    ctx.fillText(String(altFt), x + w - 21, cy + 4);
    ctx.textAlign = 'left';
    const hdg = ((Math.round((state.heading * 180) / Math.PI) % 360) + 360) % 360;
    ctx.fillStyle = '#bcd9f2';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${String(hdg).padStart(3, '0')}°`, cx, y + h - 5);
    ctx.textAlign = 'left';
  }

  function drawND(x, y, w, h, world, state) {
    glassScreen(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const cx = x + w / 2;
    const cy = y + h - 26;
    const r = Math.min(w, h) / 2 - 8;
    ctx.strokeStyle = 'rgba(120,160,200,0.35)';
    ctx.lineWidth = 1;
    for (const rr of [r * 0.5, r]) {
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    const hdg = ((state.heading * 180) / Math.PI % 360 + 360) % 360;
    ctx.fillStyle = '#bcd9f2';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    for (const [deg, label] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      let rel = deg - hdg;
      while (rel > 180) rel -= 360;
      while (rel < -180) rel += 360;
      const a = (-rel * Math.PI) / 180 - Math.PI / 2;
      ctx.fillText(label, cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8) + 3);
    }
    ctx.textAlign = 'left';
    const range = 6000;
    function mapPoint(px, pz) {
      const dx = px - state.x;
      const dz = pz - state.z;
      const d = Math.hypot(dx, dz);
      if (d > range) return null;
      const bearing = Math.atan2(dx, dz);
      const rel = bearing - state.heading;
      const rr = (d / range) * r;
      return { x: cx + Math.sin(rel) * rr, y: cy - Math.cos(rel) * rr, d };
    }
    const upcoming = world.rings.filter((wp) => !wp.passed).slice(0, 4);
    ctx.strokeStyle = '#ff4fd8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (const wp of upcoming) {
      const p = mapPoint(wp.x, wp.z);
      if (!p) continue;
      if (!started) {
        ctx.moveTo(cx, cy);
        started = true;
      }
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    for (const wp of upcoming) {
      const p = mapPoint(wp.x, wp.z);
      if (!p) continue;
      const fi = world.rings.length > 1 ? world.rings.indexOf(wp) / (world.rings.length - 1) : 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = fi < 1 / 3 ? '#eb463c' : fi < 2 / 3 ? '#4682ff' : '#46c864';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    for (const t of world.traffic) {
      const p = mapPoint(t.x, t.z);
      if (!p) continue;
      ctx.fillStyle = '#ffb020';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 9);
    ctx.lineTo(cx - 6, cy + 6);
    ctx.lineTo(cx + 6, cy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7be495';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('MAP  10 NM', x + 8, y + 12);
    ctx.fillText(`WIND ${Math.round(Math.hypot(state.windX, state.windZ) * 1.944)} KT`, x + 8, y + h - 6);
    ctx.restore();
  }

  function drawEICAS(x, y, w, h, world, state) {
    glassScreen(x, y, w, h);
    const cx = x + w / 2;
    ctx.fillStyle = '#7be495';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ENG', cx, y + 12);
    ctx.textAlign = 'left';
    for (let e = 0; e < 2; e += 1) {
      const bx = x + 22 + e * 34;
      const bh = h - 44;
      const frac = clamp(state.throttle * 0.92 + 0.08, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx, y + 20, 12, bh);
      const grad = ctx.createLinearGradient(0, y + 20 + bh, 0, y + 20);
      grad.addColorStop(0, '#2f9e5f');
      grad.addColorStop(1, '#7be495');
      ctx.fillStyle = grad;
      ctx.fillRect(bx, y + 20 + bh * (1 - frac), 12, bh * frac);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(frac * 100)}`, bx + 6, y + h - 8);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = '#bcd9f2';
    ctx.font = '11px sans-serif';
    ctx.fillText(`FUEL ${Math.round(state.fuel)}%`, x + 70, y + 30);
    ctx.fillText(`FLAP ${state.onGround ? '15' : '0'}`, x + 70, y + 48);
  }

  function drawStandby(x, y, w, h, world, state) {
    glassScreen(x, y, w, h);
    const cx = x + w / 2;
    const cy = y + 34;
    const r = 22;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.bank);
    ctx.translate(0, clamp(state.pitch * 120, -r, r));
    ctx.fillStyle = '#2f7fd0';
    ctx.fillRect(-r * 2, -r * 2, r * 4, r * 2);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-r * 2, 0, r * 4, r * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r * 2, 0);
    ctx.lineTo(r * 2, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#8a94a2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#bcd9f2';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STBY', cx, y + h - 22);
    const blink = Math.floor(state.time * 3) % 2 === 0;
    if (world.level.storm && blink) {
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(x + 14, y + h - 14, 12, 8);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('STORM', x + 32, y + h - 6);
    }
    if (state.nearestTrafficD < 500) {
      ctx.fillStyle = '#ffb020';
      ctx.fillRect(x + 14, y + h - 14, 12, 8);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('TFC', x + 32, y + h - 6);
    }
    ctx.textAlign = 'left';
  }

  function drawPedestal(world, state) {
    const x0 = 420;
    const x1 = 860;
    const yTop = 664;
    const yBot = 720;
    ctx.fillStyle = '#1b232e';
    ctx.beginPath();
    ctx.moveTo(x0 + 14, yTop);
    ctx.lineTo(x1 - 14, yTop);
    ctx.lineTo(x1 + 10, yBot);
    ctx.lineTo(x0 - 10, yBot);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3a4552';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (let e = 0; e < 2; e += 1) {
      const lx = 560 + e * 46;
      const lean = -14 + state.throttle * 22;
      ctx.strokeStyle = '#8a94a2';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(lx, yTop + 40);
      ctx.lineTo(lx + lean, yTop + 12);
      ctx.stroke();
      ctx.fillStyle = '#d7dde3';
      ctx.beginPath();
      ctx.arc(lx + lean, yTop + 10, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#bcd9f2';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`ENG ${e + 1}`, lx, yTop + 52);
      ctx.textAlign = 'left';
    }
    for (let e = 0; e < 2; e += 1) {
      const lx = 668 + e * 30;
      ctx.strokeStyle = '#c8a24a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(lx, yTop + 40);
      ctx.lineTo(lx + 8, yTop + 18);
      ctx.stroke();
    }
    ctx.fillStyle = '#04120a';
    ctx.fillRect(700, yTop + 8, 130, 44);
    ctx.strokeStyle = '#1f6b3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(700, yTop + 8, 130, 44);
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('ROUTE  ' + world.level.name.toUpperCase(), 706, yTop + 22);
    ctx.fillText('NEXT WP ' + (world.nextRing() ? `${(Math.hypot(world.nextRing().x - state.x, world.nextRing().z - state.z) / 1000).toFixed(1)} KM` : 'RWY B'), 706, yTop + 36);
    ctx.fillText('FUEL ' + Math.round(state.fuel) + '%', 706, yTop + 48);
    ctx.fillStyle = '#0a0f16';
    ctx.fillRect(452, yTop + 12, 76, 18);
    ctx.fillRect(452, yTop + 34, 76, 18);
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('121.50', 458, yTop + 25);
    ctx.fillText('118.10', 458, yTop + 47);
  }

  function drawYoke(cx) {
    ctx.save();
    ctx.strokeStyle = '#20262f';
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 44, 720);
    ctx.lineTo(cx - 44, 690);
    ctx.quadraticCurveTo(cx - 44, 672, cx - 26, 672);
    ctx.lineTo(cx + 26, 672);
    ctx.quadraticCurveTo(cx + 44, 672, cx + 44, 690);
    ctx.lineTo(cx + 44, 720);
    ctx.stroke();
    ctx.strokeStyle = '#4a545f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 44, 720);
    ctx.lineTo(cx - 44, 692);
    ctx.moveTo(cx + 44, 720);
    ctx.lineTo(cx + 44, 692);
    ctx.stroke();
    ctx.fillStyle = '#20262f';
    ctx.beginPath();
    ctx.arc(cx, 676, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8a24a';
    ctx.beginPath();
    ctx.arc(cx, 676, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCockpit(world, state) {
    ctx.fillStyle = '#12181f';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(54, 0);
    ctx.lineTo(26, PANEL_Y);
    ctx.lineTo(0, PANEL_Y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W - 54, 0);
    ctx.lineTo(W - 26, PANEL_Y);
    ctx.lineTo(W, PANEL_Y);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(0, 0, W, 12);
    ctx.fillStyle = '#12181f';
    ctx.beginPath();
    ctx.moveTo(CX - 8, 0);
    ctx.lineTo(CX + 8, 0);
    ctx.lineTo(CX + 6, PANEL_Y);
    ctx.lineTo(CX - 6, PANEL_Y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(50, 0, 3, PANEL_Y);
    ctx.fillRect(W - 53, 0, 3, PANEL_Y);
    ctx.fillRect(CX - 8, 0, 2, PANEL_Y);
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.beginPath();
    ctx.moveTo(300, 0);
    ctx.lineTo(420, 0);
    ctx.lineTo(240, PANEL_Y);
    ctx.lineTo(160, PANEL_Y);
    ctx.closePath();
    ctx.fill();
    const vig = ctx.createRadialGradient(CX, 300, 300, CX, 300, 760);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, PANEL_Y);
    const g = ctx.createLinearGradient(0, PANEL_Y, 0, PANEL_Y + 30);
    g.addColorStop(0, '#2c3644');
    g.addColorStop(1, '#171e27');
    ctx.fillStyle = g;
    ctx.fillRect(0, PANEL_Y, W, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, PANEL_Y, W, 2);
    const hdg = ((Math.round((state.heading * 180) / Math.PI) % 360) + 360) % 360;
    const mcp = [
      ['HDG', String(hdg).padStart(3, '0')],
      ['ALT', String(Math.round(state.y * 3.281))],
      ['SPD', String(Math.round(state.speed * 1.944))],
      ['V/S', state.onGround ? '0' : String(Math.round(state.pitch * state.speed * 196.85))],
    ];
    ctx.textAlign = 'center';
    mcp.forEach(([label, val], i) => {
      const x = CX - 190 + i * 96;
      ctx.fillStyle = '#05080d';
      ctx.fillRect(x, PANEL_Y + 6, 84, 19);
      ctx.strokeStyle = '#3a4552';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, PANEL_Y + 6, 84, 19);
      ctx.fillStyle = '#7be495';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${label} ${val}`, x + 42, PANEL_Y + 19);
    });
    for (const [label, i] of [['LNAV', 0], ['VNAV', 1], ['HDG SEL', 2], ['APP', 3]]) {
      const x = CX + 210 + i * 62;
      ctx.fillStyle = i === 0 ? 'rgba(123,228,149,0.25)' : 'rgba(255,255,255,0.07)';
      ctx.fillRect(x, PANEL_Y + 7, 54, 17);
      ctx.fillStyle = i === 0 ? '#7be495' : '#bcd9f2';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(label, x + 27, PANEL_Y + 19);
    }
    ctx.textAlign = 'left';
    const pg = ctx.createLinearGradient(0, PANEL_Y + 30, 0, H);
    pg.addColorStop(0, '#232c38');
    pg.addColorStop(1, '#0d1219');
    ctx.fillStyle = pg;
    ctx.fillRect(0, PANEL_Y + 30, W, H - PANEL_Y - 30);
    ctx.fillStyle = '#3a4552';
    ctx.fillRect(0, PANEL_Y + 30, W, 2);
    const sy = PANEL_Y + 36;
    const sh = 134;
    drawPFD(24, sy, 198, sh, state);
    drawND(230, sy, 198, sh, world, state);
    drawEICAS(436, sy, 198, 64, world, state);
    drawEICAS2(436, sy + 70, 198, 64, world, state);
    drawND(642, sy, 198, sh, world, state);
    drawPFD(848, sy, 198, sh, state);
    drawStandby(1054, sy, 198, sh, world, state);
    drawPedestal(world, state);
    drawYoke(130);
    drawYoke(1150);
  }

  function drawEICAS2(x, y, w, h, world, state) {
    glassScreen(x, y, w, h);
    ctx.fillStyle = '#7be495';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SYS', x + w / 2, y + 12);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#bcd9f2';
    ctx.font = '11px sans-serif';
    ctx.fillText(`HYD A/B OK`, x + 10, y + 30);
    ctx.fillText(`ELEC 28V`, x + 10, y + 46);
    ctx.fillText(`ANTI-ICE ${world.level.storm ? 'ON' : 'OFF'}`, x + 96, y + 30);
    ctx.fillStyle = '#7be495';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('GEAR', x + 96, y + 46);
    for (let g = 0; g < 3; g += 1) {
      ctx.fillStyle = '#34e07a';
      ctx.beginPath();
      ctx.arc(x + 132 + g * 16, y + 42, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHud(world, best, view = VIEW_FPP) {
    const s = world.state;
    const next = world.nextRing();
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(8,18,32,0.55)';
    ctx.fillRect(0, 14, W, 64);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`${Math.round(s.speed * 1.944)}`, 24, 48);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#bcd9f2';
    ctx.fillText('KNOTS', 24, 68);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`${Math.round(s.y * 3.281)}`, 150, 48);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#bcd9f2';
    ctx.fillText('ALT FT', 150, 68);
    const heading = ((Math.round((s.heading * 180) / Math.PI) % 360) + 360) % 360;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(heading).padStart(3, '0') + '°', CX, 50);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#bcd9f2';
    ctx.fillText('HDG', CX, 68);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(CX, 72);
    ctx.lineTo(CX, 78);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillStyle = s.fuel < 20 ? '#ff6b5e' : '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`FUEL ${Math.round(s.fuel)}%`, W - 24, 44);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`WP ${s.ringsHit}/${world.rings.length}`, W - 24, 70);
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`SCORE ${s.score}`, W - 330, 44);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#bcd9f2';
    ctx.fillText(`BEST ${best}`, W - 330, 68);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(W - 224, 80, 200, 7);
    ctx.fillStyle = s.fuel < 20 ? '#ff6b5e' : '#ffd23e';
    ctx.fillRect(W - 224, 80, 200 * clamp(s.fuel / 100, 0, 1), 7);
    if (next) {
      const wantH = Math.atan2(next.x - s.x, next.z - s.z);
      let dh = wantH - s.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const d = Math.hypot(next.x - s.x, next.y - s.y, next.z - s.z);
      const arrow = Math.abs(dh) < 0.12 ? '▲ ON COURSE' : dh > 0 ? 'TURN RIGHT ▶' : '◀ TURN LEFT';
      const label = `${arrow}   NEXT WP ${(d / 1000).toFixed(1)} km   ALT ${Math.round(next.y * 3.281)} FT`;
      ctx.textAlign = 'center';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = 'rgba(8,18,32,0.6)';
      const lw = ctx.measureText(label).width + 28;
      ctx.fillRect(CX - lw / 2, 86, lw, 30);
      ctx.fillStyle = Math.abs(dh) < 0.12 ? '#7be495' : '#ffd23e';
      ctx.fillText(label, CX, 108);
      ctx.textAlign = 'left';
    } else if (!s.over) {
      const label = 'ALL WAYPOINTS DONE — LAND ON RUNWAY B';
      ctx.textAlign = 'center';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = 'rgba(8,18,32,0.6)';
      const lw = ctx.measureText(label).width + 28;
      ctx.fillRect(CX - lw / 2, 86, lw, 30);
      ctx.fillStyle = '#7be495';
      ctx.fillText(label, CX, 108);
      ctx.textAlign = 'left';
    }
    if (view !== VIEW_TPP) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(CX, 400, 10, 0, Math.PI * 2);
      ctx.moveTo(CX - 18, 400);
      ctx.lineTo(CX - 10, 400);
      ctx.moveTo(CX + 10, 400);
      ctx.lineTo(CX + 18, 400);
      ctx.moveTo(CX, 382);
      ctx.lineTo(CX, 390);
      ctx.stroke();
    }
    if (s.lastRingT > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(s.lastRingT, 0, 1);
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`+${s.lastRingScore}`, CX, 250);
      ctx.restore();
      ctx.textAlign = 'left';
    }
    if (s.messageT > 0 && s.message && !s.over) {
      ctx.fillStyle = 'rgba(8,18,32,0.6)';
      const mw = ctx.measureText(s.message).width + 36;
      ctx.fillRect(CX - mw / 2, 128, mw, 34);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.message, CX, 151);
      ctx.textAlign = 'left';
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8,18,32,0.72)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,210,62,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  // ---- v9: the world as REAL 3D ----------------------------------------
  const worldMeshCache = new WeakMap();
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function drawWorld3D(world, cam, withJet) {
    const level = world.level;
    let staticMesh = worldMeshCache.get(world);
    if (!staticMesh) {
      staticMesh = [
        ...buildTerrain(world),
        ...buildRunway(world),
        ...buildProps(world),
        ...buildClouds(world),
      ];
      worldMeshCache.set(world, staticMesh);
    }
    const sunSign = level.sun[0] > 0.5 ? 1 : -1;
    const sun = [sunSign * 0.55, 0.85, 0.35];
    const fogColor = hexToRgb(level.sky[2]);
    const fogFar = level.fogFar;
    const cam3 = makeCam(cam.x, cam.y, cam.z, cam.heading, cam.pitch, cam.bank);
    const frame = [...staticMesh, ...buildRings(world)];
    for (const t of world.traffic) {
      frame.push(...xformMesh(buildTrafficPlane(t.type), t.heading, 0, 0, t.x, t.y, t.z));
    }
    if (withJet) {
      const st = world.state;
      frame.push(...xformMesh(buildJet(), st.heading, st.pitch, st.bank, st.x, st.y, st.z));
    }
    renderTris(ctx, frame, cam3, sun, fogColor, fogFar, W, H, FOCAL, HORIZON_Y, fogFar * (level.groundFog ?? 0.7));
  }

  function drawTitle(world, best) {
    const s = world.state;
    drawSky(world, s);
    drawWorld3D(world, s, false);
    drawCockpit(world, s);
    ctx.fillStyle = 'rgba(8,18,32,0.35)';
    ctx.fillRect(0, 0, W, H);
    panel(190, 84, 900, 400);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('JET POINT', CX, 152);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Point to Point — take off, fly the route, land.', CX, 190);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#dbeafe';
    ctx.fillText('Five legs, five skies. Storms, gusts and traffic share the route.', CX, 220);
    ctx.fillText('Follow the red, blue and green rings to runway B. Waypoints top up a little fuel.', CX, 244);
    ctx.fillText('C / V — switch cockpit and chase view.', CX, 268);
    ctx.textAlign = 'left';
    ctx.font = 'bold 17px sans-serif';
    const rows = [
      ['1', 'Metro Hop', 'City — day, clear'],
      ['2', 'Sunset Coast', 'Beach — golden hour'],
      ['3', 'Storm Crossing', 'Open sea — thunderstorm'],
      ['4', 'Alpine Pass', 'Mountains — high wind'],
      ['5', 'Desert Dash', 'Desert — dusk, busy sky'],
      ['A', 'Free Roam', 'Adventure — explore the whole map'],
    ];
    rows.forEach((row, i) => {
      const y = 296 + i * 24;
      ctx.fillStyle = '#ffd23e';
      ctx.fillText(`[${row[0]}]`, 300, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(row[1], 350, y);
      ctx.fillStyle = '#9fb4c8';
      ctx.fillText(row[2], 560, y);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Press 1–5 or A to pick a leg — SPACE / CLICK to fly', CX, 452);
    if (best > 0) {
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(`BEST SCORE ${best}`, CX, 478);
    }
    ctx.textAlign = 'left';
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,18,32,0.6)';
    ctx.fillRect(0, 0, W, H);
    panel(440, 250, 400, 170);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('PAUSED', CX, 318);
    ctx.font = '17px sans-serif';
    ctx.fillStyle = '#dbeafe';
    ctx.fillText('P / Esc — resume    R — restart', CX, 356);
    ctx.fillText('C / V — cockpit / chase    M — mute', CX, 384);
    ctx.textAlign = 'left';
  }

  function drawOver(world, best) {
    const s = world.state;
    ctx.fillStyle = 'rgba(8,18,32,0.15)';
    ctx.fillRect(0, 0, W, H);
    panel(310, 88, 660, 220);
    ctx.textAlign = 'center';
    if (s.won) {
      ctx.fillStyle = '#7be495';
      ctx.font = 'bold 33px sans-serif';
      ctx.fillText('LANDED — MISSION COMPLETE', CX, 140);
      ctx.fillStyle = '#fff';
      ctx.font = '18px sans-serif';
      ctx.fillText(`You landed the jet on runway B — ${world.level.name}.`, CX, 170);
    } else {
      ctx.fillStyle = '#ff6b5e';
      ctx.font = 'bold 33px sans-serif';
      ctx.fillText('CRASHED', CX, 140);
      ctx.fillStyle = '#fff';
      ctx.font = '18px sans-serif';
      ctx.fillText(s.crashReason, CX, 170);
    }
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 27px sans-serif';
    ctx.fillText(`SCORE ${s.score}`, CX, 210);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText(`Waypoints ${s.ringsHit}/${world.rings.length}    Near misses ${s.nearMisses}    Time ${fmt(s.time, 1)} s    Fuel ${Math.round(s.fuel)}%`, CX, 238);
    ctx.fillStyle = '#bcd9f2';
    ctx.font = '17px sans-serif';
    ctx.fillText(`Best ${Math.max(best, s.score)}`, CX, 262);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('SPACE — fly again  ·  R — restart  ·  1–5 / A — another leg', CX, 294);
    ctx.textAlign = 'left';
  }

  function draw(world, screen, best, view = VIEW_FPP) {
    const s = world.state;
    canvas.width = W;
    canvas.height = H;
    if (screen === SCREEN_TITLE) {
      drawTitle(world, best);
      return;
    }
    if (view === VIEW_TPP) {
      const side = 16;
      const back = 20;
      const camX = s.x - Math.sin(s.heading) * back + Math.cos(s.heading) * side;
      const camZ = s.z - Math.cos(s.heading) * back - Math.sin(s.heading) * side;
      const cam = {
        x: camX,
        y: s.y + 4,
        z: camZ,
        heading: Math.atan2(s.x - camX, s.z - camZ),
        pitch: s.pitch + 0.02,
        bank: s.bank * 0.35,
        time: s.time,
        tpp: true,
      };
      drawSky(world, cam);
      drawWorld3D(world, cam, true);
      if (world.level.storm) drawRain(s);
      drawLightning(s);
      drawHud(world, best, VIEW_TPP);
      ctx.fillStyle = 'rgba(8,18,32,0.55)';
      ctx.fillRect(CX - 150, H - 34, 300, 24);
      ctx.fillStyle = '#bcd9f2';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CHASE VIEW  ·  C / V — cockpit', CX, H - 17);
      ctx.textAlign = 'left';
    } else {
      const cam = s.camRight ? { ...s, x: s.x + Math.cos(s.heading) * s.camRight, z: s.z - Math.sin(s.heading) * s.camRight } : s;
      drawSky(world, cam);
      drawWorld3D(world, cam, false);
      if (world.level.storm) drawRain(s);
      drawLightning(s);
      drawCockpit(world, s);
      drawHud(world, best, VIEW_FPP);
    }
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_OVER) drawOver(world, best);
  }

  return { draw };
}

