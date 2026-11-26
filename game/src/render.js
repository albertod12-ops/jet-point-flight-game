// Canvas 2D renderer: FIRST-PERSON cockpit view. The pilot sits inside the
// jet: a lit instrument panel below, the route, traffic and weather ahead
// through the windshield, HUD with altitude / speed / heading on top.
import { FIELD, FOCAL, HORIZON_Y, JET, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mixColor(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function fmt(n, digits = 0) {
  return n.toFixed(digits);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = FIELD.width;
  const H = FIELD.height;
  const CX = W / 2;
  const PANEL_Y = 566; // top of the instrument panel (windshield ends here)

  // Project a world point into screen space from the cockpit: yaw by heading,
  // pitch by the jet's climb, roll by its bank. Returns null behind the jet.
  function project(x, y, z, state) {
    const dx = x - state.x;
    const dy = y - state.y;
    const dz = z - state.z;
    const sh = Math.sin(state.heading);
    const ch = Math.cos(state.heading);
    const f = dx * sh + dz * ch;
    const r = dx * ch - dz * sh;
    const cp = Math.cos(state.pitch);
    const sp = Math.sin(state.pitch);
    const fp = f * cp + dy * sp;
    const up = -f * sp + dy * cp;
    if (fp < 10) return null;
    const cb = Math.cos(state.bank);
    const sb = Math.sin(state.bank);
    const x2 = r * cb - up * sb;
    const y2 = r * sb + up * cb;
    return {
      x: CX + (x2 / fp) * FOCAL,
      y: HORIZON_Y + FOCAL * sp - (y2 / fp) * FOCAL,
      s: FOCAL / fp,
      d: fp,
    };
  }

  function drawSky(world, state) {
    const level = world.level;
    const [top, mid, hor] = level.sky;
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 120);
    g.addColorStop(0, top);
    g.addColorStop(0.6, mid);
    g.addColorStop(1, hor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun with a soft halo.
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
    // Distant ridges, parallaxed by heading.
    drawRidge(state, 0.1, 130, 'rgba(143,180,216,0.8)');
    drawRidge(state, 0.24, 88, 'rgba(111,156,196,0.85)');
    drawRidge(state, 0.45, 52, 'rgba(90,138,95,0.9)');
  }

  function drawRidge(state, parallax, baseY, color) {
    const off = -state.heading * 900 * parallax - state.x * parallax * 0.4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, HORIZON_Y + 2);
    for (let x = -40; x <= W + 40; x += 40) {
      const peak = baseY * (0.55 + 0.45 * Math.abs(Math.sin((x + off) * 0.011 + parallax * 40)));
      ctx.lineTo(x, HORIZON_Y + 2 - peak);
    }
    ctx.lineTo(W, HORIZON_Y + 2);
    ctx.closePath();
    ctx.fill();
  }

  function cloudPuff(x, y, r, alpha) {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.arc(x + r * 0.55, y + 4, r * 0.42, 0, Math.PI * 2);
    ctx.arc(x - r * 0.55, y + 5, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground: scanline bands from the horizon to the bottom, drawn in a frame
  // rotated by the bank so the horizon tilts with the jet. Each band samples
  // the terrain colour along the heading.
  function drawGround(world, state) {
    const level = world.level;
    const camH = Math.max(4, state.y - world.terrainHeight(state.x, state.z + 30));
    const horizonY = HORIZON_Y + FOCAL * Math.sin(state.pitch);
    const sh = Math.sin(state.heading);
    const ch = Math.cos(state.heading);
    const rows = 120;
    const segN = 24;
    const dNear = 16;
    const dFar = level.fogFar;
    ctx.save();
    ctx.translate(CX, horizonY);
    ctx.rotate(state.bank);
    ctx.translate(-CX, -horizonY);
    for (let r = rows - 1; r >= 0; r -= 1) {
      const t = r / rows;
      const d = dNear * Math.pow(dFar / dNear, t);
      const yTop = horizonY + (camH * FOCAL) / d;
      const dNext = dNear * Math.pow(dFar / dNear, (r + 1) / rows);
      const yBot = horizonY + (camH * FOCAL) / dNext;
      const h = Math.max(1.5, yBot - yTop);
      const z = state.z + ch * d;
      const fogT = clamp((d - 300) / (dFar * 0.7), 0, level.storm ? 0.88 : 0.8);
      for (let s = 0; s < segN; s += 1) {
        const fx = (s + 0.5) / segN;
        const off = ((fx - 0.5) * W / FOCAL) * d;
        const wx = state.x + sh * d + ch * off;
        const wz = z - sh * off;
        ctx.fillStyle = groundColor(world, wx, wz, fogT);
        ctx.fillRect(s * (W / segN), yTop, W / segN + 1, h + 1);
      }
    }
    ctx.restore();
  }

  function groundColor(world, wx, wz, fogT) {
    const level = world.level;
    const h = world.terrainHeight(wx, wz);
    let c;
    const onRunway =
      (Math.abs(wz - world.runwayA.z) < WORLD.runwayLength / 2 && Math.abs(wx - world.runwayA.x) < WORLD.runwayHalfWidth + 2) ||
      (Math.abs(wz - world.runwayB.z) < WORLD.runwayLength / 2 && Math.abs(wx - world.runwayB.x) < WORLD.runwayHalfWidth + 2);
    if (onRunway) {
      c = [88, 88, 92];
      const dash = Math.floor(wz / 26) % 2 === 0 && Math.abs(wx - (Math.abs(wz - world.runwayB.z) < WORLD.runwayLength / 2 ? world.runwayB.x : world.runwayA.x)) < 1.2;
      if (dash) c = [235, 235, 230];
    } else if (level.theme === 'city') {
      // Street grid + building blocks.
      const street = Math.abs(((wx % 90) + 90) % 90 - 45) < 7 || Math.abs(((wz % 90) + 90) % 90 - 45) < 7;
      const shade = 0.85 + 0.15 * Math.sin(wz * 0.05 + wx * 0.11);
      c = street ? [70, 70, 76] : [132, 130, 122];
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
    } else if (level.theme === 'beach') {
      if (wx < -60) c = [52, 128, 190]; // sea
      else if (wx < -40) c = [230, 214, 170]; // sand edge
      else {
        const shade = 0.85 + 0.15 * Math.sin(wz * 0.05 + wx * 0.09);
        c = [214, 190, 140];
        c = [c[0] * shade, c[1] * shade, c[2] * shade];
      }
    } else if (level.theme === 'sea') {
      c = [46, 122, 188];
      const wave = 0.9 + 0.1 * Math.sin(wz * 0.08 + wx * 0.13);
      c = [c[0] * wave, c[1] * wave, c[2] * wave];
      if (h > 2) c = [96, 150, 88]; // island tops
    } else if (level.theme === 'mountain') {
      const shade = 0.8 + 0.2 * Math.sin(wz * 0.04 + wx * 0.07);
      c = h > 110 ? [226, 232, 238] : h > 55 ? [110, 120, 100] : [84, 122, 72];
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
    } else if (level.theme === 'desert') {
      const shade = 0.85 + 0.15 * Math.sin(wz * 0.03 + wx * 0.06);
      c = h > 30 ? [188, 128, 84] : [216, 170, 112];
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
    } else {
      // Adventure: mixed ground.
      if (wx < -800) c = [52, 128, 190];
      else {
        const shade = 0.82 + 0.18 * Math.sin(wz * 0.05 + wx * 0.11);
        c = h > 26 ? [96, 128, 74] : [112, 158, 82];
        c = [c[0] * shade, c[1] * shade, c[2] * shade];
      }
    }
    return mixColor(c, [207, 227, 242], fogT);
  }

  function drawClouds(world, state) {
    for (const cloud of world.clouds) {
      const p = project(cloud.x, cloud.y, cloud.z, state);
      if (!p || p.y > HORIZON_Y + 60) continue;
      const r = cloud.s * p.s;
      if (r < 2) continue;
      cloudPuff(p.x, p.y, r, 0.85);
    }
    if (world.level.storm) {
      for (const cloud of world.stormClouds) {
        const p = project(cloud.x, cloud.y, cloud.z, state);
        if (!p || p.y > HORIZON_Y + 80) continue;
        const r = cloud.s * p.s;
        if (r < 3) continue;
        ctx.fillStyle = 'rgba(52,58,68,0.9)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * 0.42, 0, 0, Math.PI * 2);
        ctx.ellipse(p.x - r * 0.6, p.y + r * 0.12, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
        ctx.ellipse(p.x + r * 0.6, p.y + r * 0.1, r * 0.5, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawProps(world, state) {
    const visible = [];
    for (const prop of world.props) {
      const dx = prop.x - state.x;
      const dz = prop.z - state.z;
      const f = dx * Math.sin(state.heading) + dz * Math.cos(state.heading);
      if (f < 14 || f > 1600) continue;
      visible.push(prop);
    }
    visible.sort((a, b) => b.z - a.z);
    for (const prop of visible) {
      const base = project(prop.x, world.terrainHeight(prop.x, prop.z), prop.z, state);
      if (!base) continue;
      const s = base.s * prop.s;
      if (prop.kind === 'building' || prop.kind === 'building2') {
        const w = (prop.kind === 'building' ? 22 : 30) * s;
        const h = (prop.kind === 'building' ? 46 : 70) * s;
        ctx.fillStyle = prop.kind === 'building' ? '#7d838e' : '#5d6a7d';
        ctx.fillRect(base.x - w / 2, base.y - h, w, h);
        ctx.fillStyle = '#3d4550';
        ctx.fillRect(base.x - w / 2, base.y - h, w, 3 * s);
        // Lit windows.
        ctx.fillStyle = 'rgba(255,214,120,0.9)';
        const rows = Math.floor(h / (9 * s));
        const cols = Math.floor(w / (8 * s));
        for (let rI = 0; rI < rows; rI += 1) {
          for (let cI = 0; cI < cols; cI += 1) {
            if ((rI * 7 + cI * 3 + Math.floor(prop.x)) % 3 === 0) {
              ctx.fillRect(base.x - w / 2 + 3 * s + cI * 8 * s, base.y - h + 6 * s + rI * 9 * s, 3.4 * s, 4.4 * s);
            }
          }
        }
      } else if (prop.kind === 'palm') {
        const h = 22 * s;
        ctx.strokeStyle = '#6b4a2b';
        ctx.lineWidth = Math.max(1, 2.4 * s);
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.quadraticCurveTo(base.x + 3 * s, base.y - h * 0.6, base.x + 5 * s, base.y - h);
        ctx.stroke();
        ctx.fillStyle = '#2f7d3a';
        for (let k = 0; k < 5; k += 1) {
          const a = -0.4 - k * 0.5;
          ctx.beginPath();
          ctx.moveTo(base.x + 5 * s, base.y - h);
          ctx.quadraticCurveTo(base.x + 5 * s + Math.cos(a) * 12 * s, base.y - h + Math.sin(a) * 7 * s, base.x + 5 * s + Math.cos(a) * 17 * s, base.y - h + Math.sin(a) * 12 * s);
          ctx.quadraticCurveTo(base.x + 5 * s + Math.cos(a) * 9 * s, base.y - h + Math.sin(a) * 3 * s, base.x + 5 * s, base.y - h);
          ctx.fill();
        }
      } else if (prop.kind === 'pine') {
        const h = 24 * s;
        ctx.fillStyle = '#2f6b34';
        ctx.beginPath();
        ctx.moveTo(base.x, base.y - h);
        ctx.lineTo(base.x - h * 0.3, base.y);
        ctx.lineTo(base.x + h * 0.3, base.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#6b4a2b';
        ctx.fillRect(base.x - 1.5 * s, base.y - 2 * s, 3 * s, 3 * s);
      } else if (prop.kind === 'cactus') {
        const h = 14 * s;
        ctx.fillStyle = '#3d7d3a';
        ctx.fillRect(base.x - 2.4 * s, base.y - h, 4.8 * s, h);
        ctx.fillRect(base.x - 7 * s, base.y - h * 0.62, 4 * s, 3 * s);
        ctx.fillRect(base.x + 3 * s, base.y - h * 0.5, 4 * s, 3 * s);
      } else if (prop.kind === 'rock') {
        const h = 10 * s;
        ctx.fillStyle = '#8a7f74';
        ctx.beginPath();
        ctx.moveTo(base.x - h * 0.7, base.y);
        ctx.lineTo(base.x - h * 0.2, base.y - h);
        ctx.lineTo(base.x + h * 0.5, base.y - h * 0.7);
        ctx.lineTo(base.x + h * 0.7, base.y);
        ctx.closePath();
        ctx.fill();
      } else if (prop.kind === 'hut') {
        const w = 14 * s;
        const h = 9 * s;
        ctx.fillStyle = '#d8c9a8';
        ctx.fillRect(base.x - w / 2, base.y - h, w, h);
        ctx.fillStyle = '#a34d2e';
        ctx.beginPath();
        ctx.moveTo(base.x - w / 2 - 2 * s, base.y - h);
        ctx.lineTo(base.x, base.y - h - 6 * s);
        ctx.lineTo(base.x + w / 2 + 2 * s, base.y - h);
        ctx.closePath();
        ctx.fill();
      } else {
        const h = 15 * s;
        ctx.fillStyle = '#3d7d3a';
        ctx.beginPath();
        ctx.moveTo(base.x, base.y - h);
        ctx.lineTo(base.x - h * 0.32, base.y);
        ctx.lineTo(base.x + h * 0.32, base.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRunway(world, state) {
    for (const rw of [world.runwayA, world.runwayB]) {
      const rz = rw.z;
      const rx = rw.x;
      const fwd = Math.sin(state.heading);
      const fwdZ = Math.cos(state.heading);
      const rel = (rz - state.z) * fwdZ + (rx - state.x) * fwd;
      if (rel < 12 || rel > 2600) continue;
      // The near end may sit behind the jet: clamp it to just ahead instead
      // of dropping the whole strip.
      const nearZ = Math.max(rz - WORLD.runwayLength / 2, state.z + 18);
      const farZ = rz + WORLD.runwayLength / 2;
      const a = project(rx - WORLD.runwayHalfWidth, 6.5, nearZ, state);
      const b = project(rx + WORLD.runwayHalfWidth, 6.5, nearZ, state);
      const c = project(rx + WORLD.runwayHalfWidth, 6.5, farZ, state);
      const d = project(rx - WORLD.runwayHalfWidth, 6.5, farZ, state);
      if (!a || !b || !c || !d) continue;
      ctx.fillStyle = 'rgba(70,70,74,0.92)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      // Centreline dashes + threshold chevrons at the near end.
      ctx.fillStyle = '#f5f5f0';
      for (let i = -2; i <= 2; i += 1) {
        const p = project(rx + i * 3, 6.5, rz - WORLD.runwayLength / 2 + 26, state);
        if (p) ctx.fillRect(p.x - 1.4 * p.s, p.y - 1 * p.s, 2.8 * p.s, 12 * p.s);
      }
      // Approach lights: green at the far threshold, red at the near one.
      for (let i = -2; i <= 2; i += 1) {
        const pFar = project(rx + i * 4, 7, rz + WORLD.runwayLength / 2 - 10, state);
        if (pFar) {
          ctx.fillStyle = '#37e08a';
          ctx.beginPath();
          ctx.arc(pFar.x, pFar.y, Math.max(2, 2.4 * pFar.s), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawRings(world, state) {
    const sorted = [...world.rings].sort((a, b) => {
      const da = Math.hypot(a.x - state.x, a.y - state.y, a.z - state.z);
      const db = Math.hypot(b.x - state.x, b.y - state.y, b.z - state.z);
      return db - da;
    });
    for (const ring of sorted) {
      const d = Math.hypot(ring.x - state.x, ring.y - state.y, ring.z - state.z);
      if (d < 12 || d > 2600) continue;
      const p = project(ring.x, ring.y, ring.z, state);
      if (!p) continue;
      const r = WORLD.ringRadius * p.s;
      if (r < 2) continue;
      const isNext = world.nextRing() === ring;
      ctx.save();
      ctx.lineWidth = Math.max(2, r * 0.16);
      if (ring.passed) {
        ctx.strokeStyle = 'rgba(120,220,140,0.85)';
      } else if (isNext) {
        ctx.strokeStyle = '#ffd23e';
        ctx.shadowColor = '#ff9d00';
        ctx.shadowBlur = 18;
      } else {
        ctx.strokeStyle = 'rgba(255,210,62,0.55)';
      }
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.92, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      const g = project(ring.x, world.terrainHeight(ring.x, ring.z), ring.z, state);
      if (g) {
        ctx.strokeStyle = ring.passed ? 'rgba(120,220,140,0.25)' : 'rgba(255,210,62,0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(g.x, g.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (isNext) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(11, Math.round(r * 0.24))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('NEXT WAYPOINT', p.x, p.y - r - 10);
        ctx.textAlign = 'left';
      }
    }
  }

  // Other aircraft in the sky: a small jet silhouette with navigation lights.
  function drawTraffic(world, state) {
    const sorted = [...world.traffic].sort((a, b) => {
      const da = Math.hypot(a.x - state.x, a.y - state.y, a.z - state.z);
      const db = Math.hypot(b.x - state.x, b.y - state.y, b.z - state.z);
      return db - da;
    });
    for (const t of sorted) {
      const d = Math.hypot(t.x - state.x, t.y - state.y, t.z - state.z);
      if (d < 15 || d > 2400) continue;
      const p = project(t.x, t.y, t.z, state);
      if (!p) continue;
      const s = p.s * t.size;
      const w = 26 * s;
      const h = 7 * s;
      if (w < 3) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      // Body + swept wings, seen from behind-side.
      ctx.fillStyle = t.type === 'airliner' ? '#dfe6ec' : t.type === 'jet' ? '#c8ccd2' : '#e8dcc0';
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.quadraticCurveTo(-w * 0.4, -h * 1.4, 0, -h * 0.7);
      ctx.quadraticCurveTo(w * 0.5, -h * 0.5, w, 0);
      ctx.quadraticCurveTo(w * 0.5, h * 0.5, 0, h * 0.7);
      ctx.quadraticCurveTo(-w * 0.4, h * 1.2, -w, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(20,30,44,0.85)';
      ctx.beginPath();
      ctx.moveTo(-w * 0.15, -h * 0.6);
      ctx.lineTo(w * 0.35, -h * 0.4);
      ctx.lineTo(w * 0.3, h * 0.3);
      ctx.lineTo(-w * 0.15, h * 0.5);
      ctx.closePath();
      ctx.fill();
      // Navigation lights: red left, green right, white tail.
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(-w * 0.85, 0, Math.max(1.5, 2.2 * s), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#34e07a';
      ctx.beginPath();
      ctx.arc(w * 0.85, 0, Math.max(1.5, 2.2 * s), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (d < 500) {
        ctx.fillStyle = d < 150 ? '#ff8a7a' : '#ffd23e';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${t.label.toUpperCase()} ${Math.round(d)} m`, p.x, p.y - h - 12);
        ctx.textAlign = 'left';
      }
    }
  }

  // Rain streaks + grey veil when the leg is a storm.
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

  // --- the cockpit: glareshield + lit instruments -------------------------
  function dial(cx, cy, r, label, value, unit) {
    ctx.save();
    ctx.translate(cx, cy);
    // Face.
    const face = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    face.addColorStop(0, '#2a3442');
    face.addColorStop(1, '#10161f');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a94a2';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Ticks.
    ctx.strokeStyle = 'rgba(255,210,62,0.85)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i <= 10; i += 1) {
      const a = -Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
      ctx.lineTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94);
      ctx.stroke();
    }
    // Label + digital value, lit amber.
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, -r * 0.42);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(value, 0, r * 0.52);
    ctx.fillStyle = '#9fb4c8';
    ctx.font = '10px sans-serif';
    ctx.fillText(unit, 0, r * 0.78);
    ctx.restore();
  }

  function needleDial(cx, cy, r, fraction, color) {
    const a = -Math.PI * 0.75 + clamp(fraction, 0, 1) * Math.PI * 1.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAttitude(cx, cy, r, state) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.bank);
    const pitchShift = clamp(state.pitch * 220, -r, r);
    ctx.translate(0, pitchShift);
    // Sky above the horizon line, ground below.
    ctx.fillStyle = '#3d7ac2';
    ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 1.6);
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(-r * 1.6, 0, r * 3.2, r * 1.6);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 1.6, 0);
    ctx.lineTo(r * 1.6, 0);
    ctx.stroke();
    ctx.restore();
    // Rim + fixed aircraft symbol.
    ctx.strokeStyle = '#8a94a2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff9d00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy);
    ctx.lineTo(cx - r * 0.18, cy);
    ctx.moveTo(cx + r * 0.18, cy);
    ctx.lineTo(cx + r * 0.55, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + r * 0.14);
    ctx.stroke();
  }

  function drawHeadingTape(cx, y, w, state) {
    ctx.fillStyle = 'rgba(8,18,32,0.7)';
    ctx.fillRect(cx - w / 2, y, w, 30);
    const heading = ((state.heading * 180) / Math.PI % 360 + 360) % 360;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - w / 2, y, w, 30);
    ctx.clip();
    for (let d = -60; d <= 60; d += 10) {
      const deg = Math.round((heading + d) / 10) * 10;
      const degNorm = ((deg % 360) + 360) % 360;
      const x = cx + ((deg - heading) / 10) * 26;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x, y + (deg % 30 === 0 ? 16 : 11));
      ctx.stroke();
      if (deg % 30 === 0) {
        const label = degNorm === 0 ? 'N' : degNorm === 90 ? 'E' : degNorm === 180 ? 'S' : degNorm === 270 ? 'W' : String(degNorm).padStart(3, '0');
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y + 27);
      }
    }
    ctx.restore();
    // Centre bug.
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(cx, y + 2);
    ctx.lineTo(cx - 6, y - 5);
    ctx.lineTo(cx + 6, y - 5);
    ctx.closePath();
    ctx.fill();
    ctx.textAlign = 'left';
  }

  function drawCockpit(world, state) {
    const level = world.level;
    // Windshield frame: side pillars + top bar.
    ctx.fillStyle = '#141a22';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(46, 0);
    ctx.lineTo(18, PANEL_Y);
    ctx.lineTo(0, PANEL_Y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W - 46, 0);
    ctx.lineTo(W - 18, PANEL_Y);
    ctx.lineTo(W, PANEL_Y);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(0, 0, W, 12);
    // Glass reflection streaks, barely there.
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.beginPath();
    ctx.moveTo(300, 0);
    ctx.lineTo(420, 0);
    ctx.lineTo(240, PANEL_Y);
    ctx.lineTo(160, PANEL_Y);
    ctx.closePath();
    ctx.fill();
    // Glareshield + instrument panel.
    const g = ctx.createLinearGradient(0, PANEL_Y, 0, H);
    g.addColorStop(0, '#232c38');
    g.addColorStop(1, '#0d1219');
    ctx.fillStyle = g;
    ctx.fillRect(0, PANEL_Y, W, H - PANEL_Y);
    ctx.fillStyle = '#3a4552';
    ctx.fillRect(0, PANEL_Y, W, 3);
    // Left: airspeed + altimeter.
    dial(120, 636, 46, 'AIRSPEED', String(Math.round(state.speed * 1.944)), 'KT');
    needleDial(120, 636, 46, state.speed / JET.maxSpeed, '#7be495');
    dial(248, 636, 46, 'ALTITUDE', String(Math.round(state.y * 3.281)), 'FT');
    needleDial(248, 636, 46, state.y / world.level.ceiling, '#7fd0ff');
    // Centre: attitude + heading tape.
    drawAttitude(640, 636, 48, state);
    drawHeadingTape(640, 686, 300, state);
    // Right: fuel + throttle + vertical speed.
    dial(1032, 636, 46, 'FUEL', `${Math.round(state.fuel)}`, '%');
    needleDial(1032, 636, 46, state.fuel / 100, state.fuel < 20 ? '#ff6b5e' : '#7be495');
    dial(1160, 636, 46, 'THROTTLE', `${Math.round(state.throttle * 100)}`, '%');
    needleDial(1160, 636, 46, state.throttle, '#ffd23e');
    // Wind readout + warning lights, centre-left of the panel.
    const windKt = Math.round(Math.hypot(state.windX, state.windZ) * 1.944);
    ctx.fillStyle = '#bcd9f2';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`WIND ${windKt} KT`, 420, 622);
    ctx.fillText(`GUST ${Math.round(state.gust * 1.944)} KT`, 420, 644);
    ctx.fillText(`VSI ${state.onGround ? 0 : Math.round((state.pitch * state.speed) * 196.85)} FPM`, 420, 666);
    // Warning lights.
    const blink = Math.floor(state.time * 3) % 2 === 0;
    if (level.storm && blink) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(880, 622, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('STORM', 880, 644);
    }
    if (state.nearestTrafficD < 420) {
      ctx.fillStyle = '#ffb020';
      ctx.beginPath();
      ctx.arc(880, 668, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('TRAFFIC', 880, 690);
    }
    ctx.textAlign = 'left';
  }

  function drawHud(world, best) {
    const s = world.state;
    const next = world.nextRing();
    ctx.textBaseline = 'alphabetic';
    // Top bar.
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
    ctx.fillText(`RINGS ${s.ringsHit}/${world.rings.length}`, W - 24, 70);
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`SCORE ${s.score}`, W - 330, 44);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#bcd9f2';
    ctx.fillText(`BEST ${best}`, W - 330, 68);
    // Fuel bar.
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(W - 224, 80, 200, 7);
    ctx.fillStyle = s.fuel < 20 ? '#ff6b5e' : '#ffd23e';
    ctx.fillRect(W - 224, 80, 200 * clamp(s.fuel / 100, 0, 1), 7);
    // Route guidance: turn arrow toward the next waypoint + distance.
    if (next) {
      const wantH = Math.atan2(next.x - s.x, next.z - s.z);
      let dh = wantH - s.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const d = Math.hypot(next.x - s.x, next.y - s.y, next.z - s.z);
      const arrow = Math.abs(dh) < 0.12 ? '▲ ON COURSE' : dh > 0 ? 'TURN RIGHT ▶' : '◀ TURN LEFT';
      ctx.textAlign = 'center';
      ctx.fillStyle = Math.abs(dh) < 0.12 ? '#7be495' : '#ffd23e';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`${arrow}   NEXT WP ${(d / 1000).toFixed(1)} km   ALT ${Math.round(next.y * 3.281)} FT`, CX, 108);
      ctx.textAlign = 'left';
    } else if (!s.over) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7be495';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('ALL WAYPOINTS DONE — LAND ON RUNWAY B', CX, 108);
      ctx.textAlign = 'left';
    }
    // Centre flight-path marker.
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
    // Ring / near-miss popup.
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
    // Message line. The over screen has its own text; don't let the
    // transient message poke out from behind its panel.
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

  function drawTitle(world, best) {
    const s = world.state;
    drawSky(world, s);
    drawGround(world, s);
    drawRings(world, s);
    drawProps(world, s);
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
    ctx.fillText('Thread the rings to refuel. Land smooth on runway B.', CX, 244);
    // Leg list.
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
      const y = 276 + i * 26;
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
    ctx.fillText('M — mute', CX, 384);
    ctx.textAlign = 'left';
  }

  function drawOver(world, best) {
    const s = world.state;
    ctx.fillStyle = 'rgba(8,18,32,0.55)';
    ctx.fillRect(0, 0, W, H);
    panel(330, 140, 620, 400);
    ctx.textAlign = 'center';
    if (s.won) {
      ctx.fillStyle = '#7be495';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText('LANDED — MISSION COMPLETE', CX, 210);
      ctx.fillStyle = '#fff';
      ctx.font = '19px sans-serif';
      ctx.fillText(`You landed the jet on runway B — ${world.level.name}.`, CX, 248);
    } else {
      ctx.fillStyle = '#ff6b5e';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText('CRASHED', CX, 210);
      ctx.fillStyle = '#fff';
      ctx.font = '18px sans-serif';
      ctx.fillText(s.crashReason, CX, 248);
    }
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`SCORE ${s.score}`, CX, 308);
    ctx.fillStyle = '#fff';
    ctx.font = '18px sans-serif';
    ctx.fillText(`Rings ${s.ringsHit}/${world.rings.length}    Near misses ${s.nearMisses}    Time ${fmt(s.time, 1)} s    Fuel ${Math.round(s.fuel)}%`, CX, 342);
    ctx.fillStyle = '#bcd9f2';
    ctx.font = '17px sans-serif';
    ctx.fillText(`Best ${Math.max(best, s.score)}`, CX, 374);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('SPACE / CLICK — fly again', CX, 434);
    ctx.fillText('R — restart    1–5 / A — pick another leg', CX, 466);
    ctx.textAlign = 'left';
  }

  function draw(world, screen, best) {
    const s = world.state;
    canvas.width = W;
    canvas.height = H;
    if (screen === SCREEN_TITLE) {
      drawTitle(world, best);
      return;
    }
    drawSky(world, s);
    drawGround(world, s);
    drawRunway(world, s);
    drawClouds(world, s);
    drawProps(world, s);
    drawRings(world, s);
    drawTraffic(world, s);
    if (world.level.storm) drawRain(s);
    drawLightning(s);
    drawCockpit(world, s);
    drawHud(world, best);
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_OVER) drawOver(world, best);
  }

  return { draw };
}
