/* GLSL for the face mosaic + the fly-through tunnel.
 * The tint math mirrors scripts/lib/mosaic.js (used for the static mosaic / OG image). */

export const mosaicVertex = /* glsl */ `
  attribute vec3 aGrid;
  attribute vec3 aScatter;
  attribute vec3 aStart;
  attribute vec4 aRect;
  attribute vec2 aCell;
  attribute float aA;
  attribute float aB;
  attribute float aRand;
  attribute float aDelay;

  uniform float uIntro;
  uniform float uScatter;
  uniform float uTravel;
  uniform float uTime;
  uniform float uSize;
  uniform float uGridScale;
  uniform vec2 uGridOffset;
  uniform vec2 uGrid;   // cols, rows
  uniform float uZRange;

  varying vec2 vUv;
  varying vec4 vRect;
  varying vec2 vCellUv;
  varying float vA;
  varying float vB;
  varying float vS;
  varying float vFade;
  varying float vRand;
  varying float vRow;

  float easeOutCubic(float t) { return 1.0 - pow(1.0 - t, 3.0); }
  float easeInOut(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }

  void main() {
    vUv = uv;
    vRect = aRect;
    vA = aA;
    vB = aB;
    vRow = (aCell.y + 0.5) / uGrid.y;
    vRand = aRand;
    // where this tile's slice of the real photo lives (texture is flipY: v=1 at the top)
    vCellUv = vec2((aCell.x + 0.5) / uGrid.x, 1.0 - (aCell.y + 0.5) / uGrid.y);

    // 1. intro: fly in from deep Z and settle into the grid
    float ti = clamp((uIntro * 1.7 - aDelay) / 0.7, 0.0, 1.0);
    float ei = easeOutCubic(ti);
    vec3 grid = vec3(aGrid.xy * uGridScale + uGridOffset, aGrid.z * uGridScale);
    vec3 start = vec3(aStart.xy * uGridScale + uGridOffset, aStart.z);
    vec3 pos = mix(start, grid, ei);

    // 2. scatter: tiles leave the face and become a field that streams past the camera
    float s = easeInOut(clamp(uScatter * 1.35 - aRand * 0.35, 0.0, 1.0));
    vec3 sc = aScatter;
    sc.z = mod(sc.z + uTravel * (0.55 + aRand * 0.5) + 40.0, uZRange) - 40.0;
    sc.xy += vec2(sin(uTime * 0.3 + aRand * 20.0), cos(uTime * 0.25 + aRand * 13.0)) * 0.25;
    pos = mix(pos, sc, s);
    vS = s;

    // halftone: bright parts of the face → big tiles, shadows → tiny ones
    float cell = uGridScale * mix(0.24, 0.92, smoothstep(0.0, 0.6, aB));
  #ifdef BACKING
    // silhouette: every cell full size, set just behind the deepest tile, so the head hides what is behind it
    cell = uGridScale * 1.06;
    pos.z = mix(pos.z - aGrid.z * uGridScale * ei - uGridScale * 2.2, pos.z, s);
  #endif
    float size = mix(cell, uSize * (1.0 + aRand), s);
    vec3 p = vec3(position.xy * size, 0.0) + pos;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = -mv.z;
    vFade = smoothstep(0.4, 2.5, depth) * (1.0 - smoothstep(34.0, 52.0, depth)) * smoothstep(0.0, 0.15, ti);
    gl_Position = projectionMatrix * mv;
  }
`;

export const mosaicFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform sampler2D uPhoto;
  uniform float uOpacity;
  uniform float uHue;
  varying vec2 vUv;
  varying vec4 vRect;
  varying vec2 vCellUv;
  varying float vA;
  varying float vB;
  varying float vS;
  varying float vFade;
  varying float vRand;
  varying float vRow;

  void main() {
    // each tile is a real website screenshot in its own colours; brightness follows the portrait
    vec3 shot = texture2D(uTex, vRect.xy + vUv * vRect.zw).rgb;
    float lum = dot(shot, vec3(0.2126, 0.7152, 0.0722));
    vec3 col = shot * (0.38 + 1.25 * vB) + vec3(0.1) * vB;
    // a whisper of your own colouring (red hair, skin, white shirt)
    vec3 photo = texture2D(uPhoto, vCellUv).rgb;
    col = mix(col, photo * (0.55 + lum * 0.7), uHue);
    float shape = smoothstep(0.3, 0.5, vA) * mix(0.35, 1.0, smoothstep(0.0, 0.25, vB));
    shape *= 1.0 - 0.85 * smoothstep(0.86, 1.0, vRow); // bottom of the bust dissolves instead of ending in a hard line

    // scattered tiles show the real screenshot, dimmed so the tunnel stays the focus
    col = mix(col, shot * 0.55, vS);
    // only ~40% of tiles stay visible as ambient "dust" during the flight; the rest dissolve
    float keep = step(vRand, 0.4);
    float a = vFade * uOpacity * mix(shape, 0.32 * keep, vS);
    if (a < 0.003) discard;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
  }
`;

/* the head's silhouette in the page colour, drawn under the tiles: whatever is behind the canvas
   (the hero signature) disappears behind the face instead of showing through the gaps between tiles */
export const backingFragment = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying float vA;
  varying float vS;
  varying float vFade;
  varying float vRow;
  void main() {
    float shape = smoothstep(0.3, 0.5, vA) * (1.0 - smoothstep(0.8, 1.0, vRow));
    float a = vFade * uOpacity * shape * (1.0 - smoothstep(0.0, 0.25, vS));
    if (a < 0.003) discard;
    gl_FragColor = vec4(0.039, 0.039, 0.043, a);
  }
`;

export const dustVertex = /* glsl */ `
  attribute float aRand;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.12 + aRand * 40.0) * 0.25;
    p.y += mod(uTime * (0.03 + aRand * 0.05) + aRand * 10.0, 10.0) - 5.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + aRand * 2.2) * uPixelRatio;
    vAlpha = 0.12 + 0.38 * fract(aRand * 7.31);
  }
`;

export const dustFragment = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vec3(0.92), vAlpha * uOpacity);
  }
`;

export const tunnelVertex = /* glsl */ `
  attribute vec4 aRect;
  attribute float aHover;
  attribute float aIndex;
  attribute vec2 aDir;
  attribute vec4 aStrip;  // full-page strip in the scroll atlas (uv rect)
  attribute float aView;  // visible window / strip height; 0 = no strip (static screenshot)
  attribute float aPhase;
  uniform float uFocus;
  uniform float uTime;
  varying vec2 vUv;
  varying vec4 vRect;
  varying float vHover;
  varying float vDepth;
  varying float vDim;
  varying vec2 vDir;
  varying vec4 vStrip;
  varying float vView;
  varying float vPos;
  void main() {
    vUv = uv;
    vRect = aRect;
    vStrip = aStrip;
    vView = aView;
    // scroll like a person reading: hold, then glide down ~3/4 of a screen; back up when the strip ends
    float t = uTime * 0.34 + aPhase * 9.0;
    float steps = floor(t) + smoothstep(0.45, 1.0, fract(t));
    float maxS = max(1.0 - aView, 0.0);
    float per = 2.0 * maxS;
    float p = per > 0.0 ? mod(steps * aView * 0.75, per) : 0.0;
    vPos = p > maxS ? per - p : p;
    vHover = aHover;
    vDir = aDir;
    vDim = (uFocus < 0.0 || abs(uFocus - aIndex) < 0.5) ? 1.0 : 0.28;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const tunnelFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uTex;
  uniform sampler2D uScroll;
  uniform float uScrollOn;
  uniform float uOpacity;
  uniform float uVel;
  uniform float uFar;
  varying vec2 vUv;
  varying vec4 vRect;
  varying float vHover;
  varying float vDepth;
  varying float vDim;
  varying vec2 vDir;
  varying vec4 vStrip;
  varying float vView;
  varying float vPos;

  vec3 tap(vec2 uv) {
    vec2 lo = vRect.xy + vec2(0.0005);
    vec2 hi = vRect.xy + vRect.zw - vec2(0.0005);
    return texture2D(uTex, clamp(uv, lo, hi)).rgb;
  }
  vec3 tapS(vec2 uv) {
    vec2 lo = vStrip.xy + vec2(0.0003);
    vec2 hi = vStrip.xy + vStrip.zw - vec2(0.0003);
    return texture2D(uScroll, clamp(uv, lo, hi)).rgb;
  }

  void main() {
    vec2 uv = vRect.xy + vUv * vRect.zw;
    vec3 col;
    #ifdef LITE
      col = tap(uv);
    #else
      // radial motion blur driven by scroll velocity
      vec2 off = vDir * uVel * 0.035 * vRect.zw;
      col = (tap(uv) * 0.3 + tap(uv - off) * 0.22 + tap(uv - off * 2.0) * 0.18 + tap(uv + off) * 0.18 + tap(uv - off * 3.0) * 0.12);
    #endif
    if (vView > 0.0 && uScrollOn > 0.001) {
      // window into the full-page strip (texture is flipped: strip top = vStrip.y + vStrip.w)
      float fromTop = vPos + (1.0 - vUv.y) * vView;
      vec2 suv = vec2(vStrip.x + vUv.x * vStrip.z, vStrip.y + vStrip.w * (1.0 - fromTop));
      vec3 sc;
      #ifdef LITE
        sc = tapS(suv);
      #else
        vec2 soff = vDir * uVel * 0.035 * vec2(vStrip.z, vStrip.w * vView);
        sc = tapS(suv) * 0.3 + tapS(suv - soff) * 0.22 + tapS(suv - soff * 2.0) * 0.18 + tapS(suv + soff) * 0.18 + tapS(suv - soff * 3.0) * 0.12;
      #endif
      col = mix(col, sc, uScrollOn);
    }
    col *= mix(0.68, 1.06, vHover) * vDim;
    // thin 1px-ish frame that lights up on hover
    vec2 e = min(vUv, 1.0 - vUv);
    float edge = 1.0 - smoothstep(0.0, 0.012, min(e.x, e.y * 1.6));
    col = mix(col, vec3(0.95), edge * (0.12 + 0.6 * vHover));
    float fog = (1.0 - smoothstep(uFar * 0.45, uFar, vDepth)) * smoothstep(0.2, 1.6, vDepth);
    float a = fog * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;
