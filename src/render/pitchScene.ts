/**
 * Three.js game view. Reads simulation state, never mutates it. The court, boards and
 * trees come from the Blender-made models (scenery.ts), light and sky from lighting.ts;
 * the boules, jack and aiming overlays are still primitives built here. The pitch is built
 * once from config.physics.arena / throw origin; everything else (camera, preview toggles,
 * ball radii, look) is read live.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Body } from '../engine/types';
import type { TeamId } from '../games/petanque/matchTypes';
import type { Vec3 } from '../engine/vec3';
import type { GameConfig } from '../tuning/config';
import { bakedDynamicMaterial, setContactOccluders } from './bakedLight';
import { aimPose, createCameraRig, type CameraFocus, type CameraMode } from './cameraRig';
import { createDevStats } from './devStats';
import { createLighting } from './lighting';
import { loadScenery } from './scenery';

/** Look-and-feel constants of the placeholder art (not game feel). */
const STYLE = {
  maxPixelRatio: 2,
  throwCircleRadius: 0.25,
  jackColor: 0xffd23a,
  /** Boule tint (multiplies the grey metal texture): neutral = practice, A = cool blue steel, B = warm red bronze. */
  bouleColor: 0xffffff,
  teamBouleColor: { A: 0x9cc4ff, B: 0xffa070 },
  /** Ring under each scoring boule (lighter than the boule tint so it reads on gravel): unit-radius inner/outer (x boule radius), pulse amount and speed (rad/s), height (m). */
  teamRingColor: { A: 0x8ab8ff, B: 0xff9060 },
  scoreRingInner: 1.45,
  scoreRingOuter: 1.85,
  scoreRingPulse: 0.1,
  scoreRingPulseSpeed: 5,
  scoreRingY: 0.009,
  /** Jack zone band (valid jack landing area): fill, border colour/opacity, border width (m), arc segments, ground heights (m). */
  zoneColor: 0xffffff,
  zoneFillOpacity: 0.24,
  zoneBorderOpacity: 0.85,
  zoneBorderWidth: 0.05,
  zoneSegments: 40,
  zoneFillY: 0.003,
  zoneBorderY: 0.004,
  /** The jack is tiny: a ring + beam mark it while the camera is farther than this (m). */
  jackMarkerMinCamDist: 3,
  jackMarkerRingInner: 0.11,
  jackMarkerRingOuter: 0.15,
  jackMarkerBeamHeight: 0.55,
  resultLineWidth: 0.006,
  landingRingInner: 0.17,
  landingRingOuter: 0.22,
  /** Aim dots (flight arc + roll hint): world spacing (m), screen size (CSS px), opacity, hand-end fade-in (m), ground height (m), max dots per set. */
  dotSpacing: 0.25,
  dotPx: 8,
  dotAlpha: 0.5,
  dotFadeInM: 0.6,
  dotGroundY: 0.02,
  dotMax: 200,
  /** The close-up also keeps the last thrown boule in view when it lies within this distance (m) of the jack. */
  frameCurrentWithin: 1.5,
} as const;

export interface AimPreviewView {
  origin: Vec3;
  /** Aim angle (rad), 0 = toward -Z, positive = toward -X. */
  aim: number;
  landing: Vec3;
  /** Where a lone boule would come to rest after landing (for the roll hint); null = unknown. */
  rest: Vec3 | null;
  /** Where the ring marker goes (default: `landing`), e.g. the stop point when the player marks where a roll should stop. */
  ring?: Vec3;
  /** Overrides controls.rollHintFrac (fraction of the roll-out drawn). */
  hintFrac?: number;
  /** Flight arc, ball-centre positions. */
  points: readonly Vec3[];
}

/** Which team a body belongs to (null = neutral steel, e.g. practice boules and the jack). */
export type TeamResolver = (body: Body) => TeamId | null;

/** Valid jack landing area: points whose distance from (originX, originZ) is within [minDist, maxDist] and x within [xMin, xMax]. */
export interface JackZoneView {
  originX: number;
  originZ: number;
  minDist: number;
  maxDist: number;
  xMin: number;
  xMax: number;
}

export interface PitchScene {
  resize(): void;
  /** Updates the camera (dt = real seconds since last frame) and draws. */
  render(dt: number): void;
  /** One mesh per body id; `currentId` is highlighted and followed by the camera; `teamOf` tints boules per team. */
  syncBodies(bodies: readonly Body[], currentId: string | null, teamOf?: TeamResolver): void;
  setCameraMode(mode: CameraMode): void;
  cameraMode(): CameraMode;
  /** null hides the flight arc / landing marker / roll hint. Marker and roll hint obey the live controls config. */
  setAimPreview(p: AimPreviewView | null): void;
  /** Thin line on the ground between two points (jack -> closest boule); null hides it. */
  setResultLine(from: Vec3 | null, to: Vec3 | null): void;
  /** Pulsing ring on the ground under each listed body (the scoring boules); null/empty hides them. The close-up also frames them. */
  setScoringHighlight(ids: readonly string[] | null, team: TeamId | null): void;
  /** Faint band on the ground marking where a jack may come to rest; null hides it. */
  setJackZone(zone: JackZoneView | null): void;
  /** Screen position (CSS px from the canvas's top-left) of a world point with the current camera; null when behind the camera. For DOM overlays (measuring lines, effects). */
  project(p: Vec3): { x: number; y: number } | null;
  /**
   * The aim view (where the camera settles while aiming, even if it is still
   * moving there): ground point (y = 0) under a screen point (CSS px), null above
   * the horizon; and the screen position of a world point. For placing a marker on the court.
   */
  pickAim(x: number, y: number): { x: number; z: number } | null;
  projectAim(p: Vec3): { x: number; y: number } | null;
}

/** Grey metal with two dark grooves and two dark patches, so rolling spin is visible. */
function makeBouleTexture(): CanvasTexture {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#b4bac2';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b3037';
    for (const v of [0.3, 0.7]) g.fillRect(0, h * v - 3, w, 6);
    for (const u of [0.25, 0.75]) {
      g.beginPath();
      g.arc(w * u, h * 0.5, 13, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createPitchScene(canvas: HTMLCanvasElement, getConfig: () => GameConfig): PitchScene {
  const cfg0 = getConfig();
  const arena = cfg0.physics.arena;

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  const scene = new Scene();
  const camera = new PerspectiveCamera(cfg0.camera.fovDeg, 1, 0.05, 90);
  const rig = createCameraRig(camera, getConfig);
  const lighting = createLighting(scene, renderer, getConfig, arena);
  loadScenery(scene, arena);
  const devStats = createDevStats(renderer);

  // Throwing circle at the throw origin
  const ring = new Mesh(
    new RingGeometry(STYLE.throwCircleRadius - 0.02, STYLE.throwCircleRadius, 48),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(cfg0.throw.originX, 0.002, cfg0.throw.originZ);
  ring.receiveShadow = true;
  scene.add(ring);

  // ---- bodies --------------------------------------------------------------
  const unitSphere = new SphereGeometry(1, 32, 20);
  const bouleTex = makeBouleTexture();
  // Boules and jack darken in the baked shade of the trees / buildings (bakedLight.ts).
  const mkBouleMat = (color: number, current: boolean): MeshStandardMaterial =>
    bakedDynamicMaterial(new MeshStandardMaterial({
      color,
      map: bouleTex,
      metalness: 0.45,
      roughness: 0.4,
      ...(current ? { emissive: new Color(0x6a4a10), emissiveIntensity: 0.3 } : {}),
    }));
  const bouleMats = {
    none: { rest: mkBouleMat(STYLE.bouleColor, false), current: mkBouleMat(STYLE.bouleColor, true) },
    A: { rest: mkBouleMat(STYLE.teamBouleColor.A, false), current: mkBouleMat(STYLE.teamBouleColor.A, true) },
    B: { rest: mkBouleMat(STYLE.teamBouleColor.B, false), current: mkBouleMat(STYLE.teamBouleColor.B, true) },
  };
  const jackMat = bakedDynamicMaterial(new MeshStandardMaterial({ color: STYLE.jackColor, roughness: 0.5 }));
  const meshes = new Map<string, Mesh>();
  const q = new Quaternion();
  const axis = new Vector3();

  // Jack marker (the jack itself is only ~3 cm wide, invisible from the aim view)
  const markerMat = new MeshBasicMaterial({ color: STYLE.jackColor, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
  const markerRing = new Mesh(new RingGeometry(STYLE.jackMarkerRingInner, STYLE.jackMarkerRingOuter, 32), markerMat);
  markerRing.rotation.x = -Math.PI / 2;
  const markerBeam = new Mesh(
    new CylinderGeometry(0.01, 0.01, STYLE.jackMarkerBeamHeight, 8),
    new MeshBasicMaterial({ color: STYLE.jackColor, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
  );
  markerRing.visible = false;
  markerBeam.visible = false;
  scene.add(markerRing, markerBeam);

  // Scoring rings (pooled; one per highlighted id)
  const scoreRingGeo = new RingGeometry(STYLE.scoreRingInner, STYLE.scoreRingOuter, 40);
  scoreRingGeo.rotateX(-Math.PI / 2);
  const scoreRingMat = new MeshBasicMaterial({ color: STYLE.teamRingColor.A, transparent: true, opacity: 0.95, depthWrite: false, side: DoubleSide, toneMapped: false });
  const scoreRings: Mesh[] = [];
  const ringBase: number[] = [];
  let highlightIds: readonly string[] = [];
  let pulseClock = 0;

  const focus: CameraFocus = { ball: null, jack: null, frame: [] };
  const camToJack = new Vector3();

  function syncBodies(bodies: readonly Body[], currentId: string | null, teamOf?: TeamResolver): void {
    const seen = new Set<string>();
    focus.ball = null;
    focus.jack = null;
    let nearest: Body | null = null;
    let nearestD = Infinity;
    const jackBody = bodies.find((b) => b.kind === 'jack' && b.state !== 'out');
    for (const b of bodies) {
      seen.add(b.id);
      const isJack = b.kind === 'jack';
      let mesh = meshes.get(b.id);
      if (!mesh) {
        mesh = new Mesh(unitSphere, isJack ? jackMat : bouleMats.none.rest);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        meshes.set(b.id, mesh);
      }
      const r = b.spec.radius;
      mesh.scale.setScalar(r);
      mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
      const angle = Math.hypot(b.rot.x, b.rot.y, b.rot.z);
      if (angle > 1e-9) {
        axis.set(b.rot.x / angle, b.rot.y / angle, b.rot.z / angle);
        q.setFromAxisAngle(axis, angle);
        mesh.quaternion.copy(q);
      } else {
        mesh.quaternion.identity();
      }
      if (!isJack) {
        const set = bouleMats[teamOf?.(b) ?? 'none'];
        mesh.material = b.id === currentId ? set.current : set.rest;
      }
      if (b.id === currentId) focus.ball = { x: b.pos.x, y: b.pos.y, z: b.pos.z };
      if (isJack && b.state !== 'out') focus.jack = { x: b.pos.x, y: b.pos.y, z: b.pos.z };
      if (jackBody && !isJack && b.state !== 'out') {
        const d = Math.hypot(b.pos.x - jackBody.pos.x, b.pos.z - jackBody.pos.z);
        if (d < nearestD) {
          nearestD = d;
          nearest = b;
        }
      }
    }
    // Close-up framing: the jack, the nearest boule, and the last thrown one if it is close too.
    focus.frame = [];
    if (jackBody && nearest) {
      const near: Body = nearest;
      focus.frame.push({ ...jackBody.pos }, { ...near.pos });
      const cur = bodies.find((b) => b.id === currentId);
      if (cur && cur !== near && cur.state !== 'out') {
        if (Math.hypot(cur.pos.x - jackBody.pos.x, cur.pos.z - jackBody.pos.z) < STYLE.frameCurrentWithin) focus.frame.push({ ...cur.pos });
      }
    }
    // End of an end: the close-up also keeps the highlighted (scoring) boules in view.
    if (jackBody && highlightIds.length > 0) {
      if (focus.frame.length === 0) focus.frame.push({ ...jackBody.pos });
      for (const id of highlightIds) {
        const hb = bodies.find((b) => b.id === id);
        if (hb && hb.state !== 'out') focus.frame.push({ ...hb.pos });
      }
    }
    // Scoring rings follow their boules.
    highlightIds.forEach((id, i) => {
      const hb = bodies.find((b) => b.id === id);
      const ringMesh = scoreRings[i];
      if (!ringMesh) return;
      ringMesh.visible = Boolean(hb) && hb?.state !== 'out';
      if (hb) {
        ringMesh.position.set(hb.pos.x, STYLE.scoreRingY, hb.pos.z);
        ringBase[i] = hb.spec.radius;
      }
    });
    // Contact shadows of the balls on the ground (sky light they block; bakedLight.ts).
    setContactOccluders(bodies.filter((b) => b.state !== 'out').map((b) => ({ x: b.pos.x, y: b.pos.y, z: b.pos.z, r: b.spec.radius })));
    for (const [id, mesh] of meshes) {
      if (!seen.has(id)) {
        scene.remove(mesh);
        meshes.delete(id);
      }
    }
    if (focus.jack) {
      markerRing.position.set(focus.jack.x, 0.004, focus.jack.z);
      markerBeam.position.set(focus.jack.x, STYLE.jackMarkerBeamHeight / 2, focus.jack.z);
    }
  }

  // ---- aim preview + result line ----------------------------------------------
  const flat = new PlaneGeometry(1, 1);
  flat.rotateX(-Math.PI / 2);
  const mkRibbon = (color: number, opacity: number): Mesh => {
    const m = new Mesh(flat, new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
    m.visible = false;
    scene.add(m);
    return m;
  };
  const placeRibbon = (m: Mesh, ax: number, az: number, bx: number, bz: number, w: number): void => {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    m.position.set((ax + bx) / 2, 0.006, (az + bz) / 2);
    m.rotation.y = Math.atan2(dx, dz);
    m.scale.set(w, 1, Math.max(len, 1e-4));
    m.visible = len > 1e-3;
  };
  const resultRibbon = mkRibbon(0xff7a2f, 0.95);

  const landingMarker = new Mesh(
    new RingGeometry(STYLE.landingRingInner, STYLE.landingRingOuter, 40),
    new MeshBasicMaterial({ color: 0xff7a2f, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
  );
  landingMarker.rotation.x = -Math.PI / 2;
  landingMarker.visible = false;
  scene.add(landingMarker);

  // Aim dots: small, soft, half-transparent white points of constant screen size, evenly spaced in world
  // distance along the flight arc, then continuing on the ground (fading out) as the roll hint.
  const dotTex = ((): CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.6, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
    }
    return new CanvasTexture(c);
  })();
  const mkDotSet = (): { points: Points; pos: Float32Array; col: Float32Array } => {
    const pos = new Float32Array(STYLE.dotMax * 3);
    const col = new Float32Array(STYLE.dotMax * 4);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('color', new BufferAttribute(col, 4));
    geo.setDrawRange(0, 0);
    const points = new Points(
      geo,
      new PointsMaterial({ map: dotTex, size: STYLE.dotPx, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }),
    );
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    return { points, pos, col };
  };
  const arcDots = mkDotSet();
  const hintDots = mkDotSet();

  /**
   * Fills a dot set with points evenly spaced (world distance) along the polyline `pts`, up to `maxLen`
   * metres of path. `alphaAt(d)` gives the opacity at path distance d.
   */
  function fillDots(set: { points: Points; pos: Float32Array; col: Float32Array }, pts: readonly Vec3[], maxLen: number, alphaAt: (d: number) => number): void {
    let n = 0;
    const put = (v: { x: number; y: number; z: number }, d: number): void => {
      set.pos.set([v.x, v.y, v.z], n * 3);
      set.col.set([1, 1, 1, alphaAt(d)], n * 4);
      n++;
    };
    let dist = 0; // path length at the start of the current segment
    let next = 0; // path distance of the next dot
    for (let i = 1; i < pts.length && n < STYLE.dotMax; i++) {
      const a = pts[i - 1] as Vec3;
      const b = pts[i] as Vec3;
      const segLen = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      while (next <= dist + segLen && next <= maxLen && n < STYLE.dotMax) {
        const t = segLen > 0 ? (next - dist) / segLen : 0;
        put({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, next);
        next += STYLE.dotSpacing;
      }
      dist += segLen;
    }
    const geo = set.points.geometry;
    geo.setDrawRange(0, n);
    (geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as BufferAttribute).needsUpdate = true;
    set.points.visible = n > 0;
  }

  function setAimPreview(p: AimPreviewView | null): void {
    if (!p) {
      landingMarker.visible = false;
      arcDots.points.visible = false;
      hintDots.points.visible = false;
      return;
    }
    const { controls } = getConfig();
    landingMarker.visible = controls.showLandingMarker;
    const ring = p.ring ?? p.landing;
    landingMarker.position.set(ring.x, 0.008, ring.z);

    // The dotted flight arc is the aim indicator. The first dots near the hand fade in to keep the bottom of the screen clear.
    fillDots(arcDots, p.points, Infinity, (d) => STYLE.dotAlpha * Math.min(1, d / STYLE.dotFadeInM));

    // Roll hint: the same dots continuing along the ground from the landing point, fading out.
    const rest = p.rest;
    const full = rest ? Math.hypot(rest.x - p.landing.x, rest.z - p.landing.z) : 0;
    const len = full * Math.min(1, Math.max(0, p.hintFrac ?? controls.rollHintFrac));
    if (rest && len >= STYLE.dotSpacing / 2) {
      const from = { x: p.landing.x, y: STYLE.dotGroundY, z: p.landing.z };
      const to = { x: p.landing.x + ((rest.x - p.landing.x) * len) / full, y: STYLE.dotGroundY, z: p.landing.z + ((rest.z - p.landing.z) * len) / full };
      fillDots(hintDots, [from, to], len, (d) => STYLE.dotAlpha * (1 - d / len));
    } else {
      hintDots.points.visible = false;
    }
  }

  function setResultLine(from: Vec3 | null, to: Vec3 | null): void {
    if (!from || !to) {
      resultRibbon.visible = false;
      return;
    }
    placeRibbon(resultRibbon, from.x, from.z, to.x, to.z, STYLE.resultLineWidth);
  }

  function setScoringHighlight(ids: readonly string[] | null, team: TeamId | null): void {
    highlightIds = ids ?? [];
    scoreRingMat.color.setHex(STYLE.teamRingColor[team ?? 'A']);
    while (scoreRings.length < highlightIds.length) {
      const m = new Mesh(scoreRingGeo, scoreRingMat);
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      scoreRings.push(m);
      ringBase.push(STYLE.scoreRingInner);
    }
    scoreRings.forEach((m, i) => {
      if (i >= highlightIds.length) m.visible = false;
    });
  }

  // Jack zone band: fill between the two arcs + thin borders (arcs and side lines), rebuilt on each call.
  const zoneGroup = new Group();
  zoneGroup.visible = false;
  scene.add(zoneGroup);
  const zoneFillMat = new MeshBasicMaterial({ color: STYLE.zoneColor, transparent: true, opacity: STYLE.zoneFillOpacity, depthWrite: false, side: DoubleSide, toneMapped: false });
  const zoneBorderMat = new MeshBasicMaterial({ color: STYLE.zoneColor, transparent: true, opacity: STYLE.zoneBorderOpacity, depthWrite: false, side: DoubleSide, toneMapped: false });

  /** Triangle strip between two equally long polylines on the ground (x, z pairs) at height y. */
  function stripGeometry(a: readonly [number, number][], b: readonly [number, number][], y: number): BufferGeometry {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < a.length; i++) {
      const pa = a[i] as [number, number];
      const pb = b[i] as [number, number];
      pos.push(pa[0], y, pa[1], pb[0], y, pb[1]);
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    return g;
  }

  function setJackZone(zone: JackZoneView | null): void {
    for (const c of [...zoneGroup.children]) {
      zoneGroup.remove(c);
      (c as Mesh).geometry.dispose();
    }
    if (!zone) {
      zoneGroup.visible = false;
      return;
    }
    const lo = Math.min(zone.minDist, zone.maxDist);
    const hi = Math.max(zone.minDist, zone.maxDist);
    const n = STYLE.zoneSegments;
    const w = STYLE.zoneBorderWidth / 2;
    /** Ground point at distance r from the circle for each x across [xMin, xMax] (clamped so |x - originX| <= r). */
    const arc = (r: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const x = zone.xMin + ((zone.xMax - zone.xMin) * i) / n;
        const dx = Math.min(Math.abs(x - zone.originX), r);
        pts.push([x, zone.originZ - Math.sqrt(r * r - dx * dx)]);
      }
      return pts;
    };
    const inner = arc(lo);
    const outer = arc(hi);
    const add = (g: BufferGeometry, mat: MeshBasicMaterial): void => {
      const m = new Mesh(g, mat);
      m.renderOrder = 1;
      zoneGroup.add(m);
    };
    add(stripGeometry(inner, outer, STYLE.zoneFillY), zoneFillMat);
    // Borders: arcs (offset radially) and the two side lines (offset in x).
    add(stripGeometry(arc(lo - w), arc(lo + w), STYLE.zoneBorderY), zoneBorderMat);
    add(stripGeometry(arc(hi - w), arc(hi + w), STYLE.zoneBorderY), zoneBorderMat);
    const side = (x: number): void => {
      const a = inner[x === zone.xMin ? 0 : n] as [number, number];
      const b = outer[x === zone.xMin ? 0 : n] as [number, number];
      add(stripGeometry([[a[0] - w, a[1]], [b[0] - w, b[1]]], [[a[0] + w, a[1]], [b[0] + w, b[1]]], STYLE.zoneBorderY), zoneBorderMat);
    };
    side(zone.xMin);
    side(zone.xMax);
    zoneGroup.visible = true;
  }

  function resize(): void {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, STYLE.maxPixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  rig.snap(focus);
  const projected = new Vector3();

  // A copy of the camera parked at the aim pose, for pickAim / projectAim.
  const aimCam = new PerspectiveCamera();
  const ray = new Vector3();
  function syncAimCam(): void {
    const cfg = getConfig();
    const pose = aimPose(cfg);
    aimCam.fov = cfg.camera.fovDeg;
    aimCam.aspect = camera.aspect;
    aimCam.near = camera.near;
    aimCam.far = camera.far;
    aimCam.position.copy(pose.pos);
    aimCam.lookAt(pose.look);
    aimCam.updateProjectionMatrix();
    aimCam.updateMatrixWorld(true);
  }

  return {
    resize,
    render(dt) {
      rig.update(dt, focus);
      if (highlightIds.length > 0) {
        pulseClock += dt;
        const k = 1 + STYLE.scoreRingPulse * Math.sin(pulseClock * STYLE.scoreRingPulseSpeed);
        scoreRings.forEach((m, i) => m.scale.setScalar((ringBase[i] ?? 0.0375) * k));
      }
      // The jack marker is only needed while the camera is far from the jack.
      const show =
        focus.jack !== null &&
        camToJack.set(focus.jack.x, focus.jack.y, focus.jack.z).sub(camera.position).length() > STYLE.jackMarkerMinCamDist;
      markerRing.visible = show;
      markerBeam.visible = show;
      lighting.update(camera);
      renderer.render(scene, camera);
      devStats.frame();
    },
    syncBodies,
    setCameraMode: (mode) => rig.setMode(mode),
    cameraMode: () => rig.getMode(),
    setAimPreview,
    setResultLine,
    setScoringHighlight,
    setJackZone,
    project(p) {
      projected.set(p.x, p.y, p.z).project(camera);
      if (projected.z > 1) return null;
      return { x: (projected.x * 0.5 + 0.5) * canvas.clientWidth, y: (-projected.y * 0.5 + 0.5) * canvas.clientHeight };
    },
    pickAim(x, y) {
      syncAimCam();
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      ray.set((x / w) * 2 - 1, -(y / h) * 2 + 1, 0.5).unproject(aimCam).sub(aimCam.position);
      if (ray.y >= -1e-6) return null; // at or above the horizon
      const k = -aimCam.position.y / ray.y;
      return { x: aimCam.position.x + ray.x * k, z: aimCam.position.z + ray.z * k };
    },
    projectAim(p) {
      syncAimCam();
      projected.set(p.x, p.y, p.z).project(aimCam);
      if (projected.z > 1) return null;
      return { x: (projected.x * 0.5 + 0.5) * canvas.clientWidth, y: (-projected.y * 0.5 + 0.5) * canvas.clientHeight };
    },
  };
}
