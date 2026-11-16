import {
  InstancedMesh,
  PlaneGeometry,
  ShaderMaterial,
  InstancedBufferAttribute,
  Matrix4,
  Quaternion,
  Euler,
  Vector3,
} from 'three';
import { tunnelVertex, tunnelFragment } from './shaders.js';

import { FIRST, SEG } from './constants.js';

/**
 * The fly-through: every real screenshot as a floating plane, grouped by project along -Z.
 * Built entirely from projects.json + atlas.json.
 */
export class Tunnel {
  constructor({ texture, atlas, projects, aspect, lite }) {
    const { width: AW, height: AH } = atlas;
    const items = [];
    this.anchors = [];
    projects.forEach((p, pi) => {
      const zStart = -(FIRST + pi * SEG);
      const tiles = atlas.tiles.filter((t) => t.project === p.id);
      this.anchors.push({ project: pi, position: new Vector3(0, 0.15, zStart), z: zStart });
      tiles.forEach((t, k) => items.push({ t, pi, k, n: tiles.length, zStart }));
    });
    const n = Math.max(1, items.length);
    this.count = items.length;
    this.items = [];

    const geo = new PlaneGeometry(1, 1);
    const mat = new ShaderMaterial({
      vertexShader: tunnelVertex,
      fragmentShader: tunnelFragment,
      transparent: true,
      depthWrite: false,
      defines: lite ? { LITE: '' } : {},
      uniforms: {
        uTex: { value: texture },
        uOpacity: { value: 0 },
        uVel: { value: 0 },
        uFar: { value: 30 },
        uFocus: { value: -1 },
        uTime: { value: 0 },
        uScroll: { value: texture }, // swapped for the strip atlas once it loads
        uScrollOn: { value: 0 },
      },
    });
    this.material = mat;
    const mesh = new InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;

    const aRect = new Float32Array(n * 4);
    const aHover = new Float32Array(n);
    const aIndex = new Float32Array(n);
    const aDir = new Float32Array(n * 2);
    const aPhase = new Float32Array(n);
    const m = new Matrix4(), q = new Quaternion(), e = new Euler(), s = new Vector3(), pos = new Vector3();

    const rx = Math.min(4.2, Math.max(1.5, aspect * 2.5));
    const ry = aspect < 1 ? 2.8 : 2.3;
    const dW = aspect < 1 ? 1.7 : 2.7; // desktop screenshot width
    const mH = aspect < 1 ? 1.5 : 2.1; // mobile screenshot height
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    items.forEach((it, i) => {
      const { t, pi, k, n: count, zStart } = it;
      const ang = pi * 1.7 + k * 2.39996 + (rnd() - 0.5) * 0.4;
      const spread = 0.9 + rnd() * 0.3;
      const x = Math.cos(ang) * rx * spread;
      const y = Math.sin(ang) * ry * spread;
      const z = zStart - 2.2 - (k / Math.max(1, count - 1)) * (SEG - 5) - rnd() * 0.6;
      pos.set(x, y, z);
      e.set(y * 0.035, -x * 0.05, (rnd() - 0.5) * 0.04);
      q.setFromEuler(e);
      const aspectT = t.w / t.h;
      if (t.kind === 'mobile') s.set(mH * aspectT, mH, 1);
      else s.set(dW, dW / aspectT, 1);
      m.compose(pos, q, s);
      mesh.setMatrixAt(i, m);
      const inset = 0.5;
      aRect.set([(t.x + inset) / AW, 1 - (t.y + t.h - inset) / AH, (t.w - inset * 2) / AW, (t.h - inset * 2) / AH], i * 4);
      aIndex[i] = i;
      aPhase[i] = rnd();
      const len = Math.hypot(x, y) || 1;
      aDir.set([x / len, y / len], i * 2);
      this.items.push({ project: pi, tile: t, position: pos.clone() });
    });
    mesh.instanceMatrix.needsUpdate = true;
    geo.setAttribute('aRect', new InstancedBufferAttribute(aRect, 4));
    this.hoverAttr = new InstancedBufferAttribute(aHover, 1);
    geo.setAttribute('aHover', this.hoverAttr);
    geo.setAttribute('aIndex', new InstancedBufferAttribute(aIndex, 1));
    geo.setAttribute('aDir', new InstancedBufferAttribute(aDir, 2));
    geo.setAttribute('aPhase', new InstancedBufferAttribute(aPhase, 1));
    this.stripAttr = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.viewAttr = new InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('aStrip', this.stripAttr);
    geo.setAttribute('aView', this.viewAttr);
    this.projects = projects;
    mesh.computeBoundingSphere();
    this.mesh = mesh;
    this.length = FIRST + projects.length * SEG + 4;
    this.hoverTarget = -1;
  }

  /** z at which the camera should sit to look at project i */
  projectViewZ(i) {
    return -(FIRST + i * SEG) + 4;
  }

  /** Point every tile at its project's full-page strip so it scrolls like a real page. */
  setStrips(scroll, texture) {
    const { width: SW, height: SH, strips } = scroll;
    const byKey = new Map(strips.map((s) => [`${s.project}:${s.kind}`, s]));
    this.items.forEach((it, i) => {
      const s = byKey.get(`${this.projects[it.project].id}:${it.tile.kind}`);
      if (!s || s.h <= s.vh) return;
      this.stripAttr.array.set([s.x / SW, 1 - (s.y + s.h) / SH, s.w / SW, s.h / SH], i * 4);
      this.viewAttr.array[i] = s.vh / s.h;
    });
    this.stripAttr.needsUpdate = true;
    this.viewAttr.needsUpdate = true;
    this.material.uniforms.uScroll.value = texture;
    this.scrollTarget = 1;
  }

  update(dt, time = 0) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    if (this.scrollTarget) u.uScrollOn.value += (this.scrollTarget - u.uScrollOn.value) * (1 - Math.exp(-dt * 2.5));
    const a = this.hoverAttr.array;
    let dirty = false;
    const k = 1 - Math.exp(-dt * 10);
    for (let i = 0; i < a.length; i++) {
      const target = i === this.hoverTarget ? 1 : 0;
      const v = a[i] + (target - a[i]) * k;
      if (Math.abs(v - a[i]) > 0.0005) { a[i] = v; dirty = true; }
    }
    if (dirty) this.hoverAttr.needsUpdate = true;
  }
}
