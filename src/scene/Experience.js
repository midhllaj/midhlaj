import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Texture,
  NoColorSpace,
  LinearMipmapLinearFilter,
  LinearFilter,
  Raycaster,
  Vector2,
  Vector3,
  MathUtils,
} from 'three';
import { gsap } from 'gsap';
import { Mosaic } from './Mosaic.js';
import { Tunnel } from './Tunnel.js';

const D = 10; // distance from camera to the face
const smooth = (a, b, x) => {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (a, b, lambda, dt) => MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt));

export class Experience {
  constructor({ canvas, projects, atlas, atlasImage, mapImage, photoImage, isMobile, labelsEl, onHover, onSelect, getTextTop }) {
    this.getTextTop = getTextTop;
    this.projects = projects;
    this.isMobile = isMobile;
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.active = true;
    this.panelOpen = false;
    this.isTouch = window.matchMedia('(hover: none)').matches;

    // transparent canvas: the hero signature sits behind it (the page background is the same #0a0a0b)
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: !isMobile, powerPreference: 'high-performance' });
    renderer.setClearColor(0x0a0a0b, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    this.renderer = renderer;

    const texture = new Texture(atlasImage);
    texture.colorSpace = NoColorSpace; // shaders work in display (sRGB) values directly
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    this.texture = texture;

    const photo = new Texture(photoImage);
    photo.colorSpace = NoColorSpace;
    photo.minFilter = LinearMipmapLinearFilter;
    photo.magFilter = LinearFilter;
    photo.anisotropy = texture.anisotropy;
    photo.needsUpdate = true;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(50, 1, 0.1, 120);
    this.scene.add(this.camera);

    const [cols, rows] = isMobile ? [40, 52] : [70, 90];
    this.mosaic = new Mosaic({ texture, photo, atlas, map: mapImage, cols, rows });
    this.scene.add(this.mosaic.group);

    const aspect = window.innerWidth / window.innerHeight;
    this.tunnel = new Tunnel({ texture, atlas, projects, aspect, lite: isMobile });
    this.scene.add(this.tunnel.mesh);

    // floating project labels (HTML, positioned from 3D anchors every frame)
    this.labels = this.tunnel.anchors.map((a) => {
      const p = projects[a.project];
      const el = document.createElement('div');
      el.className = 'fly-label';
      el.innerHTML = `<span class="fly-label__name"></span><span class="fly-label__meta"></span>`;
      el.children[0].textContent = p.name;
      el.children[1].textContent = `${String(a.project + 1).padStart(2, '0')} — ${p.category} · ${p.year}`;
      labelsEl.appendChild(el);
      return { el, anchor: a, visible: false };
    });

    this.scroll = { heroP: 0, flyP: 0, vel: 0, shift: 0 };
    this.s = { pixel: 0, scatter: 0, camZ: 0, mx: 0, my: 0, vel: 0, tunnelOpacity: 0, shift: 0 };
    this.focus = { x: 0, y: 0 };
    this.pointer = new Vector2(-10, -10);
    this.pointerClient = { x: -1, y: -1 };
    this.hasPointer = false;
    this.mouse = { x: 0, y: 0 };
    this.raycaster = new Raycaster();
    this.hovered = -1;
    this._v = new Vector3();

    this._onMove = (e) => {
      this.hasPointer = e.pointerType === 'mouse';
      this.pointerClient.x = e.clientX;
      this.pointerClient.y = e.clientY;
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.mouse.x = this.pointer.x;
      this.mouse.y = this.pointer.y;
    };
    this._onClick = (e) => {
      if (e.target !== canvas || this.panelOpen || this.s.tunnelOpacity < 0.5) return;
      const i = this.pick(e.clientX, e.clientY);
      if (i >= 0) this.onSelect?.(i);
    };
    window.addEventListener('pointermove', this._onMove, { passive: true });
    window.addEventListener('click', this._onClick);
    this.resize();
  }

  get travel() {
    return this.tunnel.length;
  }

  /** scroll fraction (0..1 of the fly section) where the camera looks at tunnel item i */
  flyProgressForItem(i) {
    const z = this.tunnel.items[i].position.z + 4.2;
    return MathUtils.clamp((-z - 2) / (this.travel - 2), 0, 1);
  }

  firstItemOf(projectIndex) {
    const i = this.tunnel.items.findIndex((it) => it.project === projectIndex && it.tile.kind === 'desktop');
    return i >= 0 ? i : this.tunnel.items.findIndex((it) => it.project === projectIndex);
  }

  pick(clientX, clientY) {
    const p = new Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const hit = this.raycaster.intersectObject(this.tunnel.mesh, false).find((h) => h.distance > 1 && h.distance < 22);
    return hit ? hit.instanceId : -1;
  }

  intro() {
    return gsap.to(this.mosaic.material.uniforms.uIntro, { value: 1, duration: 3.4, ease: 'none' });
  }

  focusItem(i) {
    const it = this.tunnel.items[i];
    const sideShift = this.isMobile ? 0 : 1.1; // leave room for the side panel on the right
    gsap.to(this.focus, { x: it.position.x * 0.8 + sideShift, y: it.position.y * 0.8, duration: 1.6, ease: 'power3.inOut' });
    this.tunnel.material.uniforms.uFocus.value = i;
    this.panelOpen = true;
    this.setHover(-1);
  }

  clearFocus() {
    gsap.to(this.focus, { x: 0, y: 0, duration: 1.2, ease: 'power3.inOut' });
    this.tunnel.material.uniforms.uFocus.value = -1;
    this.panelOpen = false;
  }

  setHover(i) {
    if (i === this.hovered) return;
    this.hovered = i;
    this.tunnel.hoverTarget = i;
    this.onHover?.(i >= 0 ? this.tunnel.items[i] : null);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.baseFov = aspect < 1 ? 62 : 48;
    this.camera.aspect = aspect;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();

    // fit the face: desktop → right of the copy, bottom-anchored; mobile → upper part of the screen
    const visH = 2 * D * Math.tan(MathUtils.degToRad(this.baseFov / 2));
    const visW = visH * aspect;
    // at the About strip the face slides left by this share of the screen (matches --slide: 14vw in CSS)
    this.slideW = aspect >= 1.05 ? visW * 0.14 : 0;
    const { faceCols: cols, rows } = this.mosaic; // size by the face; shoulders may run past it
    const u = this.mosaic.material.uniforms;
    if (aspect >= 1.05) {
      // centred, from just under the header down behind the name (like the reference)
      const cell = Math.min((visH * 0.9) / rows, (visW * 0.5) / cols);
      u.uGridScale.value = cell;
      u.uGridOffset.value.set(0, -visH / 2 + (rows * cell) / 2 - visH * 0.02);
    } else {
      // portrait screens: fit the face between the header and the top of the hero copy
      const top = 64 / h; // header
      const textTop = (this.getTextTop?.() ?? h * 0.6) / h;
      const avail = Math.max(0.3, textTop - top - 0.02);
      const cell = Math.min((visW * 0.98) / cols, (visH * avail) / rows);
      u.uGridScale.value = cell;
      const faceH = rows * cell;
      const faceHpx = (faceH / visH) * h;
      // sit the shoulders right on the name (no gap); any spare height goes up under the header
      const faceTopPx = textTop * h - faceHpx + 4;
      u.uGridOffset.value.set(0, visH / 2 - (faceTopPx / h) * visH - faceH / 2);
      // where the face lands on screen (px), so the CSS can tuck the signature behind the neck
      const root = document.documentElement.style;
      root.setProperty('--face-top', `${faceTopPx.toFixed(1)}px`);
      root.setProperty('--face-h', `${faceHpx.toFixed(1)}px`);
    }
    this.size = { w, h };
  }

  /** called every frame by the GSAP ticker */
  /** Full-page strips for the scrolling tiles (loaded after the intro). */
  setScroll(scroll, image) {
    const tex = new Texture(image);
    tex.colorSpace = NoColorSpace;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.anisotropy = this.texture.anisotropy;
    tex.needsUpdate = true;
    this.tunnel.setStrips(scroll, tex);
  }

  update(time, dt) {
    if (!this.active) return;
    dt = Math.min(dt, 1 / 20);
    const { heroP, flyP } = this.scroll;
    const s = this.s;

    // scatter out on the way in, regroup into the face at the end of the flight
    const scatterTarget = smooth(0.04, 0.85, heroP) * (1 - smooth(0.9, 0.985, flyP));
    s.scatter = damp(s.scatter, scatterTarget, 6, dt);
    s.camZ = damp(s.camZ, -(heroP * 2 + flyP * (this.travel - 2)), 8, dt);
    s.vel = damp(s.vel, MathUtils.clamp(Math.abs(this.scroll.vel) / 45, 0, 1), 5, dt);
    s.tunnelOpacity = damp(s.tunnelOpacity, smooth(0.15, 0.7, heroP) * (1 - smooth(0.93, 0.99, flyP)), 6, dt);
    s.mx = damp(s.mx, this.mouse.x, 3, dt);
    s.my = damp(s.my, this.mouse.y, 3, dt);
    s.shift = damp(s.shift, this.scroll.shift, 7, dt);

    const inFly = smooth(0.2, 0.8, heroP);
    const cam = this.camera;
    cam.position.set(this.focus.x + s.mx * 0.35 * inFly, this.focus.y + s.my * 0.2 * inFly, s.camZ);
    cam.rotation.set(s.my * 0.035 * inFly, -s.mx * 0.05 * inFly, 0);
    const fov = this.baseFov + s.vel * 7;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    // mosaic rides with the camera; mouse tilts the face in 3D
    const g = this.mosaic.group;
    g.position.set(-s.shift * this.slideW, 0, s.camZ - D);
    const face = 1 - s.scatter;
    g.rotation.y = s.mx * 0.22 * face;
    g.rotation.x = -s.my * 0.14 * face;
    const mu = this.mosaic.material.uniforms;
    mu.uScatter.value = s.scatter;
    const du = this.mosaic.dustMaterial.uniforms;
    du.uTime.value = time;
    du.uOpacity.value = (1 - s.scatter) * MathUtils.clamp(mu.uIntro.value * 2, 0, 1);
    mu.uTravel.value = -s.camZ;
    mu.uTime.value = time;
    mu.uVel.value = s.vel;

    const tu = this.tunnel.material.uniforms;
    tu.uOpacity.value = s.tunnelOpacity;
    tu.uVel.value = s.vel;
    this.tunnel.update(dt, time);

    // hover picking
    if (!this.panelOpen && s.tunnelOpacity > 0.5 && !this.isTouch && this.hasPointer) {
      this.setHover(this.pick(this.pointerClient.x, this.pointerClient.y));
    } else if (!this.panelOpen && this.hovered !== -1) this.setHover(-1);

    this.updateLabels();
    this.renderer.render(this.scene, cam);
  }

  updateLabels() {
    const { w, h } = this.size;
    const camZ = this.s.camZ;
    const op = this.s.tunnelOpacity * (this.panelOpen ? 0.15 : 1);
    for (const l of this.labels) {
      const dist = camZ - l.anchor.z;
      const o = op * smooth(17, 10, dist) * smooth(1.2, 5, dist);
      if (o < 0.01) {
        if (l.visible) { l.el.style.opacity = 0; l.visible = false; }
        continue;
      }
      l.visible = true;
      this._v.copy(l.anchor.position).project(this.camera);
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;
      const sc = MathUtils.clamp(5.5 / dist, 0.25, 1.8) * (this.isMobile ? 0.8 : 1);
      l.el.style.opacity = o.toFixed(3);
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${sc.toFixed(3)}) translate(-50%, -50%)`;
    }
  }

  setActive(on) {
    this.active = on;
    this.renderer.domElement.style.visibility = on ? 'visible' : 'hidden';
  }
}
