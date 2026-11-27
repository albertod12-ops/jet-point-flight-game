// glweb.js — real WebGL renderer, same renderTris signature + tri records
// as the old Canvas 2D painter, same projection, fog and Lambert formulas.
const states = new WeakMap();
const VS = [
  'attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;attribute vec3 aM;',
  'uniform mat4 uM;varying vec3 vN;varying vec3 vC;varying vec3 vM;varying vec3 vW;varying float vD;',
  'void main(){vec4 c=uM*vec4(aP,1.0);gl_Position=c;vD=c.w;vW=aP;vN=aN;vC=aC;vM=aM;}',
].join('\n');
const FS = [
  'precision highp float;',
  'uniform vec3 uSun;uniform vec3 uFog;uniform vec3 uCam;uniform float uFogFar;uniform float uTFogFar;',
  'varying vec3 vN;varying vec3 vC;varying vec3 vM;varying vec3 vW;varying float vD;',
  'float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
  'float vn(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);',
  'return mix(mix(h21(i),h21(i+vec2(1.,0.)),u.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),u.x),u.y);}',
  'void main(){',
  'vec3 n=vec3(0.,1.,0.);if(length(vN)>0.01)n=normalize(vN);',
  'float em=vM.y;float tag=vM.z;float shade=1.0;',
  'if(em<0.5&&length(vN)>0.01){float dl=max(dot(n,uSun),0.0);',
  'shade=tag>0.5?0.96+0.07*dl:0.80+0.28*dl;}',
  'vec3 col=vC*shade;',
  'if(tag>0.5&&em<0.5){float t=vn(vW.xz*0.5)*0.6+vn(vW.xz*0.125+7.3)*0.4;col*=0.95+0.10*t;}',
  'if(tag>0.5&&em<0.5&&n.y>0.9){',
  'float sm=0.0;',
  'if(vC.b-vC.r>0.15&&vC.b>vC.g)sm=0.45;',
  'else if(min(vC.r,min(vC.g,vC.b))>0.75)sm=0.25;',
  'if(sm>0.0){vec3 V=normalize(uCam-vW);vec3 Hv=normalize(normalize(uSun)+V);',
  'col+=vec3(1.0,0.98,0.9)*pow(max(dot(n,Hv),0.0),40.0)*sm;}}',
  'float tf=tag>0.5?uTFogFar:uFogFar;',
  'float ft=clamp((vD-tf*0.15)/(tf*0.85),0.0,0.82);',
  'gl_FragColor=vec4(mix(col,uFog,ft),vM.x);}',
].join('\n');
function sh(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('glweb shader', gl.getShaderInfoLog(s)); return null; }
  return s;
}
function getState(ctx, W, H) {
  let st = states.get(ctx);
  if (st) return st;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl2', { antialias: true, alpha: true, depth: true, premultipliedAlpha: true })
    || cv.getContext('webgl', { antialias: true, alpha: true, depth: true, premultipliedAlpha: true });
  if (!gl) { console.warn('glweb: no WebGL context'); states.set(ctx, { gl: null }); return states.get(ctx); }
  const vs = sh(gl, gl.VERTEX_SHADER, VS);
  const fs = sh(gl, gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) { states.set(ctx, { gl: null }); return states.get(ctx); }
  const pr = gl.createProgram();
  gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.warn('glweb link', gl.getProgramInfoLog(pr)); states.set(ctx, { gl: null }); return states.get(ctx); }
  gl.useProgram(pr);
  const loc = {};
  for (const n of ['aP', 'aN', 'aC', 'aM']) loc[n] = gl.getAttribLocation(pr, n);
  for (const n of ['uM', 'uSun', 'uFog', 'uCam', 'uFogFar', 'uTFogFar']) loc[n] = gl.getUniformLocation(pr, n);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearDepth(1);
  gl.disable(gl.CULL_FACE);
  st = {
    gl, cv, pr, loc, W, H,
    sBuf: gl.createBuffer(), sCount: 0, sTrans: [],
    dBuf: gl.createBuffer(), tBuf: gl.createBuffer(),
    prev: null, M: new Float32Array(16),
  };
  states.set(ctx, st);
  return st;
}
function smoothMaps(list) {
  const nm = new Map(); const cm = new Map();
  for (const t of list) {
    if (t[17] !== 1 || t[16] === 1) continue;
    const c = [t[9], t[10], t[11]];
    for (let k = 0; k < 9; k += 3) {
      const key = t[k] + ',' + t[k + 1] + ',' + t[k + 2];
      let a = nm.get(key);
      if (!a) { a = [0, 0, 0]; nm.set(key, a); }
      a[0] += t[13]; a[1] += t[14]; a[2] += t[15];
      let cl = cm.get(key);
      if (!cl) { cl = []; cm.set(key, cl); }
      cl.push(c);
    }
  }
  return { nm, cm };
}
function emit(F, o, t, sm) {
  const ter = t[17] === 1 && t[16] !== 1;
  const vc = t.length > 18;
  for (let k = 0; k < 3; k += 1) {
    const px = t[k * 3]; const py = t[k * 3 + 1]; const pz = t[k * 3 + 2];
    let nx = t[13]; let ny = t[14]; let nz = t[15];
    let r = t[9] / 255; let g = t[10] / 255; let b = t[11] / 255;
    if (vc) { r = t[18 + k * 3] / 255; g = t[19 + k * 3] / 255; b = t[20 + k * 3] / 255; }
    if (ter && sm) {
      const key = px + ',' + py + ',' + pz;
      const a = sm.nm.get(key);
      if (a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; nx = a[0] / l; ny = a[1] / l; nz = a[2] / l; }
      if (!vc) {
        const cl = sm.cm.get(key);
        let R = 0; let G = 0; let B = 0; let n = 0;
        for (const c of cl) {
          if (Math.abs(c[0] - t[9]) + Math.abs(c[1] - t[10]) + Math.abs(c[2] - t[11]) < 60) { R += c[0]; G += c[1]; B += c[2]; n += 1; }
        }
        if (n) { r = R / n / 255; g = G / n / 255; b = B / n / 255; }
      }
    }
    F[o] = px; F[o + 1] = py; F[o + 2] = pz; F[o + 3] = nx; F[o + 4] = ny; F[o + 5] = nz;
    F[o + 6] = r; F[o + 7] = g; F[o + 8] = b; F[o + 9] = t[12]; F[o + 10] = t[16]; F[o + 11] = t[17] | 0;
    o += 12;
  }
  return o;
}
function chunk(list) {
  let n = 0; const tr = [];
  for (const t of list) { if (t[12] < 1) tr.push(t); else n += 1; }
  const F = new Float32Array(n * 36);
  const sm = smoothMaps(list);
  let o = 0;
  for (const t of list) { if (t[12] >= 1) o = emit(F, o, t, sm); }
  return { F, n: n * 3, tr };
}
function drawBuf(st, buf, n) {
  const gl = st.gl; const L = st.loc;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.vertexAttribPointer(L.aP, 3, gl.FLOAT, false, 48, 0);
  gl.vertexAttribPointer(L.aN, 3, gl.FLOAT, false, 48, 12);
  gl.vertexAttribPointer(L.aC, 3, gl.FLOAT, false, 48, 24);
  gl.vertexAttribPointer(L.aM, 3, gl.FLOAT, false, 48, 36);
  for (const a of [L.aP, L.aN, L.aC, L.aM]) gl.enableVertexAttribArray(a);
  gl.drawArrays(gl.TRIANGLES, 0, n);
}
function bindChunk(st, buf, F, n, usage) {
  st.gl.bindBuffer(st.gl.ARRAY_BUFFER, buf);
  st.gl.bufferData(st.gl.ARRAY_BUFFER, F, usage);
  drawBuf(st, buf, n);
}
export function renderTris(ctx, tris, cam, sun, fogRGB, fogFar, W, H, FOCAL, HORIZON_Y, terrainFogFar = fogFar) {
  const st = getState(ctx, W, H);
  if (!st.gl) return null;
  const gl = st.gl;
  let p = 0;
  if (st.prev) {
    const m = Math.min(st.prev.length, tris.length);
    while (p < m && st.prev[p] === tris[p]) p += 1;
  }
  const tail = tris.length - p;
  if (p >= 1000 && tail >= 10 && p !== st.sCount) {
    const c = chunk(tris.slice(0, p));
    gl.bindBuffer(gl.ARRAY_BUFFER, st.sBuf);
    gl.bufferData(gl.ARRAY_BUFFER, c.F, gl.STATIC_DRAW);
    st.sCount = p; st.sVerts = c.n; st.sTrans = c.tr;
  } else if (p < 1000) { st.sCount = 0; st.sTrans = []; }
  const { sh, ch, sp, cp, sb, cb } = cam;
  const rx = [cb * ch + sb * sh * sp, -sb * cp, -cb * sh + sb * ch * sp];
  const ry = [sb * ch - cb * sh * sp, cb * cp, -sb * sh - cb * ch * sp];
  const rz = [sh * cp, sp, ch * cp];
  const ky = FOCAL / (H / 2); const oy = 1 - HORIZON_Y / (H / 2);
  const m1 = [ky * ry[0] + oy * rz[0], ky * ry[1] + oy * rz[1], ky * ry[2] + oy * rz[2]];
  const far = fogFar * 1.3; const near = 1;
  const A = (far + near) / (far - near); const B = -2 * far * near / (far - near);
  const dc = [cam.x, cam.y, cam.z];
  const dot = (a) => a[0] * dc[0] + a[1] * dc[1] + a[2] * dc[2];
  const M = st.M;
  M[0] = rx[0]; M[1] = m1[0]; M[2] = A * rz[0]; M[3] = rz[0];
  M[4] = rx[1]; M[5] = m1[1]; M[6] = A * rz[1]; M[7] = rz[1];
  M[8] = rx[2]; M[9] = m1[2]; M[10] = A * rz[2]; M[11] = rz[2];
  M[12] = -dot(rx); M[13] = -dot(m1); M[14] = -A * dot(rz) + B; M[15] = -dot(rz);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(st.pr);
  gl.uniformMatrix4fv(st.loc.uM, false, M);
  gl.uniform3f(st.loc.uSun, sun[0], sun[1], sun[2]);
  gl.uniform3f(st.loc.uFog, fogRGB[0] / 255, fogRGB[1] / 255, fogRGB[2] / 255);
  gl.uniform3f(st.loc.uCam, cam.x, cam.y, cam.z);
  gl.uniform1f(st.loc.uFogFar, fogFar);
  gl.uniform1f(st.loc.uTFogFar, terrainFogFar);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  if (st.sCount > 0) drawBuf(st, st.sBuf, st.sVerts);
  const dyn = st.sCount > 0 ? tris.slice(st.sCount) : tris;
  const dc2 = chunk(dyn);
  if (dc2.n > 0) bindChunk(st, st.dBuf, dc2.F, dc2.n, gl.DYNAMIC_DRAW);
  const fwd = rz;
  const all = st.sTrans.concat(dc2.tr);
  if (all.length) {
    const dep = all.map((t) => {
      const cx = (t[0] + t[3] + t[6]) / 3 - cam.x;
      const cy = (t[1] + t[4] + t[7]) / 3 - cam.y;
      const cz = (t[2] + t[5] + t[8]) / 3 - cam.z;
      return [cx * fwd[0] + cy * fwd[1] + cz * fwd[2], t];
    });
    dep.sort((a, b) => b[0] - a[0]);
    const F = new Float32Array(all.length * 36);
    let o = 0;
    for (const [, t] of dep) o = emit(F, o, t, null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    bindChunk(st, st.tBuf, F, all.length * 3, gl.DYNAMIC_DRAW);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
  st.prev = tris;
  return st.cv;
}
