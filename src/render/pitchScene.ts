/**
 * Three.js game view (placeholder primitives). Reads simulation state, never
 * mutates it. The pitch is built once from config.physics.arena / throw origin;
 * everything else (camera, preview toggles, ball radii) is read live.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
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
import type { Vec3 } from '../engine/vec3';
import type { GameConfig } from '../tuning/config';
import { createCameraRig, type CameraFocus, type CameraMode } from './cameraRig';

/** Look-and-feel constants of the placeholder art (not game feel). */
const STYLE = {
  maxPixelRatio: 2,
  throwCircleRadius: 0.25,
  boardHeight: 0.08,
  boardThickness: 0.06,
  jackColor: 0xffd23a,
  bouleColor: 0xffffff,
  /** The jack is tiny: a ring + beam mark it while the camera is farther than this (m). */
  jackMarkerMinCamDist: 3,
  jackMarkerRingInner: 0.11,
  jackMarkerRingOuter: 0.15,
  jackMarkerBeamHeight: 0.55,
  aimLineWidth: 0.03,
  resultLineWidth: 0.006,
  landingRingInner: 0.17,
  landingRingOuter: 0.22,
  maxArcPoints: 512,
  /** The close-up also keeps the last thrown boule in view when it lies within this distance (m) of the jack. */
  frameCurrentWithin: 1.5,
} as const;

export interface AimPreviewView {
  origin: Vec3;
  /** Aim angle (rad), 0 = toward -Z, positive = toward -X. */
  aim: number;
  landing: Vec3;
  /** Flight arc, ball-centre positions. */
  points: readonly Vec3[];
}

export interface PitchScene {
  resize(): void;
  /** Updates the camera (dt = real seconds since last frame) and draws. */
  render(dt: number): void;
  /** One mesh per body id; `currentId` is highlighted and followed by the camera. */
  syncBodies(bodies: readonly Body[], currentId: string | null): void;
  setCameraMode(mode: CameraMode): void;
  /** null hides the aim line / landing marker / arc. Marker and arc obey the live controls config. */
  setAimPreview(p: AimPreviewView | null): void;
  /** Thin line on the ground between two points (jack -> closest boule); null hides it. */
  setResultLine(from: Vec3 | null, to: Vec3 | null): void;
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
  const width = arena.maxX - arena.minX;
  const length = arena.maxZ - arena.minZ;
  const cx = (arena.minX + arena.maxX) / 2;
  const cz = (arena.minZ + arena.maxZ) / 2;

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.background = new Color(0x9ec9e8);
  scene.fog = new Fog(0x9ec9e8, 14, 32);

  const camera = new PerspectiveCamera(cfg0.camera.fovDeg, 1, 0.05, 60);
  const rig = createCameraRig(camera, getConfig);

  scene.add(new HemisphereLight(0xcfe6ff, 0x8a7a5a, 1.4));
  const sun = new DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(cx + 3, 8, cz + 3);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -(width / 2 + 1);
  sc.right = width / 2 + 1;
  sc.top = length / 2 + 1.5;
  sc.bottom = -(length / 2 + 1.5);
  sc.near = 1;
  sc.far = 24;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Surrounding lawn
  const lawn = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: 0x4f8a45, roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(cx, -0.002, cz);
  lawn.receiveShadow = true;
  scene.add(lawn);

  // Gravel pitch = the arena footprint
  const ground = new Mesh(new PlaneGeometry(width, length), new MeshStandardMaterial({ color: 0xd2b887, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, 0, cz);
  ground.receiveShadow = true;
  scene.add(ground);

  // Side boards: inner faces at x = minX / maxX
  const boardMat = new MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9 });
  for (const x of [arena.minX - STYLE.boardThickness / 2, arena.maxX + STYLE.boardThickness / 2]) {
    const board = new Mesh(new BoxGeometry(STYLE.boardThickness, STYLE.boardHeight, length), boardMat);
    board.position.set(x, STYLE.boardHeight / 2, cz);
    board.castShadow = true;
    board.receiveShadow = true;
    scene.add(board);
  }

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
  const bouleMat = new MeshStandardMaterial({ color: STYLE.bouleColor, map: bouleTex, metalness: 0.45, roughness: 0.4 });
  const bouleCurrentMat = new MeshStandardMaterial({
    color: STYLE.bouleColor,
    map: bouleTex,
    metalness: 0.45,
    roughness: 0.4,
    emissive: new Color(0x6a4a10),
    emissiveIntensity: 0.3,
  });
  const jackMat = new MeshStandardMaterial({ color: STYLE.jackColor, roughness: 0.5 });
  const meshes = new Map<string, Mesh>();
  const q = new Quaternion();
  const axis = new Vector3();

  // Jack marker (the jack itself is only ~3 cm wide, invisible from the aim view)
  const markerMat = new MeshBasicMaterial({ color: STYLE.jackColor, transparent: true, opacity: 0.7, depthWrite: false });
  const markerRing = new Mesh(new RingGeometry(STYLE.jackMarkerRingInner, STYLE.jackMarkerRingOuter, 32), markerMat);
  markerRing.rotation.x = -Math.PI / 2;
  const markerBeam = new Mesh(
    new CylinderGeometry(0.01, 0.01, STYLE.jackMarkerBeamHeight, 8),
    new MeshBasicMaterial({ color: STYLE.jackColor, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  markerRing.visible = false;
  markerBeam.visible = false;
  scene.add(markerRing, markerBeam);

  const focus: CameraFocus = { ball: null, jack: null, frame: [] };
  const camToJack = new Vector3();

  function syncBodies(bodies: readonly Body[], currentId: string | null): void {
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
        mesh = new Mesh(unitSphere, isJack ? jackMat : bouleMat);
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
      if (!isJack) mesh.material = b.id === currentId ? bouleCurrentMat : bouleMat;
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
    const m = new Mesh(flat, new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
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
  const aimRibbon = mkRibbon(0xffffff, 0.6);
  const resultRibbon = mkRibbon(0xff7a2f, 0.95);

  const landingMarker = new Mesh(
    new RingGeometry(STYLE.landingRingInner, STYLE.landingRingOuter, 40),
    new MeshBasicMaterial({ color: 0xff7a2f, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  landingMarker.rotation.x = -Math.PI / 2;
  landingMarker.visible = false;
  scene.add(landingMarker);

  const arcPositions = new Float32Array(STYLE.maxArcPoints * 3);
  const arcGeo = new BufferGeometry();
  arcGeo.setAttribute('position', new BufferAttribute(arcPositions, 3));
  arcGeo.setDrawRange(0, 0);
  const arc = new Line(arcGeo, new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
  arc.frustumCulled = false;
  arc.visible = false;
  scene.add(arc);

  function setAimPreview(p: AimPreviewView | null): void {
    if (!p) {
      aimRibbon.visible = false;
      landingMarker.visible = false;
      arc.visible = false;
      return;
    }
    const { controls } = getConfig();
    const dx = p.landing.x - p.origin.x;
    const dz = p.landing.z - p.origin.z;
    // Ground line from the circle toward the aim direction, as long as the predicted flight.
    const len = Math.max(1, Math.hypot(dx, dz));
    placeRibbon(aimRibbon, p.origin.x, p.origin.z, p.origin.x - Math.sin(p.aim) * len, p.origin.z - Math.cos(p.aim) * len, STYLE.aimLineWidth);

    landingMarker.visible = controls.showLandingMarker;
    landingMarker.position.set(p.landing.x, 0.008, p.landing.z);

    arc.visible = controls.showTrajectory;
    if (controls.showTrajectory) {
      const n = Math.min(p.points.length, STYLE.maxArcPoints);
      for (let i = 0; i < n; i++) {
        const pt = p.points[i] as Vec3;
        arcPositions[i * 3] = pt.x;
        arcPositions[i * 3 + 1] = pt.y;
        arcPositions[i * 3 + 2] = pt.z;
      }
      arcGeo.setDrawRange(0, n);
      (arcGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }
  }

  function setResultLine(from: Vec3 | null, to: Vec3 | null): void {
    if (!from || !to) {
      resultRibbon.visible = false;
      return;
    }
    placeRibbon(resultRibbon, from.x, from.z, to.x, to.z, STYLE.resultLineWidth);
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

  return {
    resize,
    render(dt) {
      rig.update(dt, focus);
      // The jack marker is only needed while the camera is far from the jack.
      const show =
        focus.jack !== null &&
        camToJack.set(focus.jack.x, focus.jack.y, focus.jack.z).sub(camera.position).length() > STYLE.jackMarkerMinCamDist;
      markerRing.visible = show;
      markerBeam.visible = show;
      renderer.render(scene, camera);
    },
    syncBodies,
    setCameraMode: (mode) => rig.setMode(mode),
    setAimPreview,
    setResultLine,
  };
}
