/**
 * Static scenery loaded from the Blender-made glTF files in public/models/ (see art/): the court
 * + boards + the ground of the square, the village (houses, café terrace, wall/bench/lamps), the
 * distant hills, and the instanced plane trees and cypresses.
 * Until the court arrives (or if it fails to load) a plain placeholder court is shown, so the game
 * is playable either way. Everything lit shares one vertex-colour Lambert material; the hills use
 * one unlit material without fog or tone mapping (their colours are pre-lit and pre-hazed in Blender).
 */
import {
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Object3D } from 'three';

interface Placement {
  variant: string;
  x: number;
  z: number;
  /** Rotation about Y (degrees). */
  rotDeg: number;
  scale: number;
}

/**
 * Plane trees in rows along both sides of the court, off the playing area. The models lean and
 * reach toward +X: ~180° on the right side and ~0° on the left hang the canopy over the court
 * edge, so the foliage frames the top corners of the portrait aim view.
 */
const TREES: readonly Placement[] = [
  { variant: 'b', x: 4.95, z: -1.2, rotDeg: 166, scale: 1.0 },
  { variant: 'a', x: 5.0, z: -7.2, rotDeg: 170, scale: 1.0 },
  { variant: 'c', x: 5.4, z: -12.8, rotDeg: 186, scale: 1.05 },
  { variant: 'a', x: -4.85, z: -0.5, rotDeg: 14, scale: 1.0 },
  { variant: 'c', x: -5.0, z: -6.6, rotDeg: 8, scale: 1.0 },
  { variant: 'b', x: -5.4, z: -12.3, rotDeg: -4, scale: 1.05 },
];

/** Tall dark cypresses behind the far row of houses and in the side streets. */
const CYPRESSES: readonly Placement[] = [
  { variant: 'a', x: -5.2, z: -24.0, rotDeg: 0, scale: 1.05 },
  { variant: 'b', x: 7.8, z: -23.7, rotDeg: 40, scale: 1.1 },
  { variant: 'a', x: -12.8, z: -14.6, rotDeg: 120, scale: 1.0 },
  { variant: 'b', x: 12.6, z: -14.9, rotDeg: 200, scale: 1.0 },
  { variant: 'a', x: 18.0, z: -12.0, rotDeg: 10, scale: 1.1 },
  { variant: 'b', x: -18.4, z: -11.4, rotDeg: 250, scale: 1.0 },
];

/** Static models, in game coordinates. `shadows`: cast + receive (only what is near the court). */
const STATIC_MODELS: readonly { file: string; shadows: boolean; unlit?: boolean }[] = [
  { file: 'houses.glb', shadows: false },
  { file: 'cafe.glb', shadows: false },
  { file: 'props.glb', shadows: false },
  { file: 'hills.glb', shadows: false, unlit: true },
];

/** Model paths are relative to the page, so the site works from any sub-path. */
const modelUrl = (name: string): string => `${import.meta.env.BASE_URL}models/${name}`;

export interface CourtRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Scenery {
  /** The one material all lit scenery shares. */
  material: MeshLambertMaterial;
}

const meshesOf = (root: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
};

export function loadScenery(scene: Scene, court: CourtRect): Scenery {
  const material = new MeshLambertMaterial({ vertexColors: true });
  const unlit = new MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });

  // Placeholder until the court model is in.
  const fallback = new Group();
  const plain = new MeshLambertMaterial({ color: 0xc4a27a });
  const ground = new Mesh(new PlaneGeometry(court.maxX - court.minX, court.maxZ - court.minZ), plain);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((court.minX + court.maxX) / 2, 0, (court.minZ + court.maxZ) / 2);
  ground.receiveShadow = true;
  const around = new Mesh(new PlaneGeometry(120, 120), new MeshLambertMaterial({ color: 0xc08f5c }));
  around.rotation.x = -Math.PI / 2;
  around.position.set(0, -0.02, -15);
  around.receiveShadow = true;
  fallback.add(ground, around);
  scene.add(fallback);

  const loader = new GLTFLoader();

  loader
    .loadAsync(modelUrl('court.glb'))
    .then((gltf) => {
      for (const mesh of meshesOf(gltf.scene)) {
        mesh.material = material;
        mesh.receiveShadow = true;
        mesh.castShadow = mesh.name === 'court_boards';
      }
      scene.add(gltf.scene);
      scene.remove(fallback);
      ground.geometry.dispose();
      around.geometry.dispose();
      plain.dispose();
    })
    .catch((err: unknown) => console.warn('court.glb failed to load, keeping the placeholder court', err));

  for (const model of STATIC_MODELS) {
    loader
      .loadAsync(modelUrl(model.file))
      .then((gltf) => {
        for (const mesh of meshesOf(gltf.scene)) {
          mesh.material = model.unlit ? unlit : material;
          mesh.castShadow = model.shadows;
          mesh.receiveShadow = model.shadows;
        }
        scene.add(gltf.scene);
      })
      .catch((err: unknown) => console.warn(`${model.file} failed to load`, err));
  }

  loadInstanced(loader, scene, material, 'plane_tree.glb', 'plane_tree_', TREES, true);
  loadInstanced(loader, scene, material, 'cypress.glb', 'cypress_', CYPRESSES, false);

  return { material };
}

/**
 * One InstancedMesh per variant (`<prefix><variant>` in the file). The geometry is modelled around
 * the trunk base, so node offsets in the file are ignored.
 */
function loadInstanced(
  loader: GLTFLoader,
  scene: Scene,
  material: MeshLambertMaterial,
  file: string,
  prefix: string,
  placements: readonly Placement[],
  shadows: boolean,
): void {
  loader
    .loadAsync(modelUrl(file))
    .then((gltf) => {
      const geos = new Map<string, BufferGeometry>();
      for (const mesh of meshesOf(gltf.scene)) {
        if (mesh.name.startsWith(prefix)) geos.set(mesh.name.slice(prefix.length), mesh.geometry);
      }
      const m = new Matrix4();
      const q = new Quaternion();
      const pos = new Vector3();
      const scl = new Vector3();
      const yAxis = new Vector3(0, 1, 0);
      for (const [variant, geo] of geos) {
        const list = placements.filter((t) => t.variant === variant);
        if (list.length === 0) continue;
        const inst = new InstancedMesh(geo, material, list.length);
        list.forEach((t, i) => {
          q.setFromAxisAngle(yAxis, (t.rotDeg * Math.PI) / 180);
          m.compose(pos.set(t.x, 0, t.z), q, scl.setScalar(t.scale));
          inst.setMatrixAt(i, m);
        });
        inst.castShadow = shadows;
        inst.receiveShadow = shadows;
        inst.computeBoundingSphere(); // covers all instances, so frustum culling stays correct
        scene.add(inst);
      }
    })
    .catch((err: unknown) => console.warn(`${file} failed to load`, err));
}
