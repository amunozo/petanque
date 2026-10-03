import {
  HemisphereLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';

/** Placeholder scene layout (metres). Y up, thrower looks toward -Z. */
export const pitchLayout = {
  pitchWidth: 4,
  pitchLength: 15,
  /** Z of the far end of the pitch. */
  pitchFarZ: -9.5,
  throwCircleZ: 5,
  throwCircleRadius: 0.25,
  jackDistance: 8,
  jackRadius: 0.02,
  bouleRadius: 0.0375,
  cameraHeight: 1.6,
  cameraBackOffset: 2.4,
  cameraFovDeg: 52,
  cameraLookAtY: 0.1,
  cameraLookAtZ: -1.5,
  maxPixelRatio: 2,
} as const;

export interface PitchScene {
  resize(): void;
  render(): void;
}

export function createPitchScene(canvas: HTMLCanvasElement): PitchScene {
  const L = pitchLayout;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.background = new Color(0x9ec9e8);
  scene.fog = new Fog(0x9ec9e8, 14, 32);

  const camera = new PerspectiveCamera(L.cameraFovDeg, 1, 0.05, 60);
  camera.position.set(0, L.cameraHeight, L.throwCircleZ + L.cameraBackOffset);
  camera.lookAt(0, L.cameraLookAtY, L.cameraLookAtZ);

  scene.add(new HemisphereLight(0xcfe6ff, 0x8a7a5a, 1.4));
  const sun = new DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(3, 8, 3);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -5;
  sc.right = 5;
  sc.top = 9;
  sc.bottom = -9;
  sc.near = 1;
  sc.far = 24;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Surrounding lawn
  const lawn = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: 0x4f8a45, roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.002;
  lawn.receiveShadow = true;
  scene.add(lawn);

  // Gravel pitch
  const pitchCenterZ = L.pitchFarZ + L.pitchLength / 2;
  const ground = new Mesh(
    new PlaneGeometry(L.pitchWidth, L.pitchLength),
    new MeshStandardMaterial({ color: 0xd2b887, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, pitchCenterZ);
  ground.receiveShadow = true;
  scene.add(ground);

  // Wooden border boards along the pitch
  const boardMat = new MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const board = new Mesh(new BoxGeometry(0.06, 0.08, L.pitchLength), boardMat);
    board.position.set(side * (L.pitchWidth / 2 + 0.03), 0.04, pitchCenterZ);
    board.castShadow = true;
    board.receiveShadow = true;
    scene.add(board);
  }

  // Throwing circle
  const ring = new Mesh(
    new RingGeometry(L.throwCircleRadius - 0.02, L.throwCircleRadius, 48),
    new MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.002, L.throwCircleZ);
  ring.receiveShadow = true;
  scene.add(ring);

  // Jack (cochonnet)
  const jack = new Mesh(
    new SphereGeometry(L.jackRadius, 24, 16),
    new MeshStandardMaterial({ color: 0xe8c23a, roughness: 0.5 }),
  );
  jack.position.set(0.15, L.jackRadius, L.throwCircleZ - L.jackDistance);
  jack.castShadow = true;
  scene.add(jack);

  // Boules
  const boulePositions: [number, number][] = [
    [-0.25, L.throwCircleZ - 3.2],
    [0.35, L.throwCircleZ - 5.6],
    [0.1, L.throwCircleZ - 7.6],
  ];
  const bouleMat = new MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.55, roughness: 0.35 });
  const bouleGeo = new SphereGeometry(L.bouleRadius, 32, 20);
  for (const [x, z] of boulePositions) {
    const boule = new Mesh(bouleGeo, bouleMat);
    boule.position.set(x, L.bouleRadius, z);
    boule.castShadow = true;
    boule.receiveShadow = true;
    scene.add(boule);
  }

  function resize(): void {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, L.maxPixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    resize,
    render: () => renderer.render(scene, camera),
  };
}
