import {
  Group,
  InstancedBufferGeometry,
  InstancedBufferAttribute,
  PlaneGeometry,
  ShaderMaterial,
  Mesh,
  Vector2,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
} from 'three';
import { mosaicVertex, mosaicFragment, backingFragment, dustVertex, dustFragment } from './shaders.js';
import { extendShoulders } from './shoulders.js';

const shape = (b) => Math.pow(Math.min(1, Math.max(0, (b - 0.06) / 0.9)), 0.9); // keep in sync with scripts/lib/mosaic.js

/** Sample the portrait map into a cols×rows grid of { b, a }. */
export function samplePortrait(img, cols, rows) {
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, cols, rows);
  const d = ctx.getImageData(0, 0, cols, rows).data;
  const out = [];
  for (let i = 0; i < cols * rows; i++) {
    const l = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
    out.push({ b: shape(l), a: d[i * 4 + 3] / 255 });
  }
  return out;
}

/**
 * The face: one InstancedBufferGeometry, one atlas texture, one shader.
 * Each instance = one website thumbnail crop, tinted by its cell's brightness.
 */
export class Mosaic {
  constructor({ texture, photo, atlas, map, cols: faceCols, rows }) {
    const cell = 1; // grid units; world size is set per-frame via uGridScale
    // widen the grid so the shoulders can slope outwards past the photo's cropped edges
    const ext = extendShoulders(samplePortrait(map, faceCols, rows), faceCols, rows);
    const cols = ext.cols;
    const pad = ext.pad;
    const cells = ext.cells;
    this.cols = cols;
    this.faceCols = faceCols;
    this.rows = rows;
    this.cell = cell;
    const kept = [];
    cells.forEach((v, i) => v.a > 0.02 && kept.push({ ...v, c: i % cols, r: Math.floor(i / cols) }));
    const n = kept.length;
    this.count = n;

    const plane = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute('position', plane.getAttribute('position'));
    geo.setAttribute('uv', plane.getAttribute('uv'));
    geo.instanceCount = n;

    const aGrid = new Float32Array(n * 3);
    const aScatter = new Float32Array(n * 3);
    const aStart = new Float32Array(n * 3);
    const aRect = new Float32Array(n * 4);
    const aB = new Float32Array(n);
    const aA = new Float32Array(n);
    const aCell = new Float32Array(n * 2);
    const aRand = new Float32Array(n);
    const aDelay = new Float32Array(n);

    const { width: AW, height: AH, tiles } = atlas;
    const maxR = Math.hypot(cols / 2, rows / 2);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    kept.forEach((k, i) => {
      const x = (k.c - (cols - 1) / 2) * cell;
      const y = ((rows - 1) / 2 - k.r) * cell;
      const z = (k.b - 0.5) * cell * 3.5; // relief: brighter tiles sit forward → reads in 3D on tilt
      aGrid.set([x, y, z], i * 3);

      const ang = rnd() * Math.PI * 2;
      const rad = 2.6 + Math.pow(rnd(), 0.8) * 11;
      aScatter.set([Math.cos(ang) * rad * 1.35, Math.sin(ang) * rad * 0.95, -40 + rnd() * 52], i * 3);

      aStart.set([x * (1.6 + rnd() * 2.5) + (rnd() - 0.5) * cols, y * (1.6 + rnd() * 2.5) + (rnd() - 0.5) * rows * 0.6, -50 - rnd() * 80], i * 3);

      const t = tiles[Math.floor(rnd() * tiles.length)];
      const side = Math.min(t.w, t.h) * (0.45 + rnd() * 0.25);
      const sx = t.x + rnd() * (t.w - side);
      const sy = t.y + rnd() * (t.h - side);
      aRect.set([sx / AW, 1 - (sy + side) / AH, side / AW, side / AH], i * 4);

      aB[i] = k.b;
      aA[i] = k.a;
      aCell.set([k.c - pad, k.r], i * 2);
      aRand[i] = rnd();
      const r = Math.hypot(k.c - cols / 2, k.r - rows / 2) / maxR;
      aDelay[i] = r * 0.55 + rnd() * 0.45;
    });

    geo.setAttribute('aGrid', new InstancedBufferAttribute(aGrid, 3));
    geo.setAttribute('aScatter', new InstancedBufferAttribute(aScatter, 3));
    geo.setAttribute('aStart', new InstancedBufferAttribute(aStart, 3));
    geo.setAttribute('aRect', new InstancedBufferAttribute(aRect, 4));
    geo.setAttribute('aB', new InstancedBufferAttribute(aB, 1));
    geo.setAttribute('aA', new InstancedBufferAttribute(aA, 1));
    geo.setAttribute('aCell', new InstancedBufferAttribute(aCell, 2));
    geo.setAttribute('aRand', new InstancedBufferAttribute(aRand, 1));
    geo.setAttribute('aDelay', new InstancedBufferAttribute(aDelay, 1));

    this.material = new ShaderMaterial({
      vertexShader: mosaicVertex,
      fragmentShader: mosaicFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTex: { value: texture },
        uPhoto: { value: photo },
        uHue: { value: 0.16 },
        uGrid: { value: new Vector2(faceCols, rows) },
        uIntro: { value: 0 },
        uScatter: { value: 0 },
        uTravel: { value: 0 },
        uTime: { value: 0 },
        uSize: { value: 0.2 },
        uGridScale: { value: 0.08 },
        uGridOffset: { value: new Vector2() },
        uZRange: { value: 52 },
        uOpacity: { value: 1 },
        uVel: { value: 0 },
      },
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.group = new Group();
    // dark silhouette under the tiles (shares the tiles' uniforms, so it flies in and scatters with them)
    this.backing = new Mesh(
      geo,
      new ShaderMaterial({
        vertexShader: mosaicVertex,
        fragmentShader: backingFragment,
        defines: { BACKING: '' },
        transparent: true,
        depthWrite: false,
        uniforms: this.material.uniforms,
      }),
    );
    this.backing.frustumCulled = false;
    this.backing.renderOrder = 1;
    this.group.add(this.backing, this.mesh);

    // floating dust around the face
    const N = 200;
    const dpos = new Float32Array(N * 3);
    const drand = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      dpos.set([(rnd() - 0.5) * 16, (rnd() - 0.5) * 10, (rnd() - 0.5) * 4], i * 3);
      drand[i] = rnd();
    }
    const dgeo = new BufferGeometry();
    dgeo.setAttribute('position', new Float32BufferAttribute(dpos, 3));
    dgeo.setAttribute('aRand', new Float32BufferAttribute(drand, 1));
    this.dustMaterial = new ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPixelRatio: { value: Math.min(2, window.devicePixelRatio) } },
    });
    this.dust = new Points(dgeo, this.dustMaterial);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
    this.width = cols * cell;
    this.height = rows * cell;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.backing.material.dispose();
  }
}
