/**
 * Static scenery loaded from the Blender-made glTF files in public/models/ (see art/):
 * the court + boards + surrounding ground, and a few plane trees (instanced).
 * Until the files arrive (or if they fail to load) a plain placeholder court is shown, so the
 * game is playable either way. Everything shares one vertex-colour Lambert material.
 */
import {
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Object3D } from 'three';

/** Plane trees around the court (x, z in metres; y rotation in degrees; uniform scale). Off the playing area. */
const TREES: readonly { variant: 'a' | 'b'; x: number; z: number; rotDeg: number; scale: number }[] = [
  // Both variants lean toward +X in the model: rotation 0 leans away from the court on the right side, ~180 on the left.
  { variant: 'a', x: 4.9, z: -3.0, rotDeg: 10, scale: 1.0 },
  { variant: 'b', x: 5.0, z: -10.5, rotDeg: -20, scale: 1.1 },
  { variant: 'b', x: -5.0, z: -6.5, rotDeg: 195, scale: 1.0 },
  { variant: 'a', x: -4.9, z: -13.5, rotDeg: 165, scale: 1.1 },
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
  /** The one material all scenery shares. */
  material: MeshLambertMaterial;
}

export function loadScenery(scene: Scene, court: CourtRect): Scenery {
  const material = new MeshLambertMaterial({ vertexColors: true });

  // Placeholder until the models are in.
  const fallback = new Group();
  const plain = new MeshLambertMaterial({ color: 0xcdb48c });
  const ground = new Mesh(new PlaneGeometry(court.maxX - court.minX, court.maxZ - court.minZ), plain);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((court.minX + court.maxX) / 2, 0, (court.minZ + court.maxZ) / 2);
  ground.receiveShadow = true;
  const around = new Mesh(new PlaneGeometry(120, 120), new MeshLambertMaterial({ color: 0xa9a070 }));
  around.rotation.x = -Math.PI / 2;
  around.position.set(0, -0.02, -15);
  around.receiveShadow = true;
  fallback.add(ground, around);
  scene.add(fallback);

  const loader = new GLTFLoader();
  const meshesOf = (root: Object3D): Mesh[] => {
    const out: Mesh[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) out.push(o as Mesh);
    });
    return out;
  };

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

  loader
    .loadAsync(modelUrl('plane_tree.glb'))
    .then((gltf) => {
      const geos = new Map<string, BufferGeometry>();
      for (const mesh of meshesOf(gltf.scene)) {
        const v = mesh.name.endsWith('_a') ? 'a' : mesh.name.endsWith('_b') ? 'b' : null;
        if (v) geos.set(v, mesh.geometry); // geometry is modelled around the trunk base; node offsets are ignored
      }
      const m = new Matrix4();
      const q = new Quaternion();
      const yAxis = new Vector3(0, 1, 0);
      for (const variant of ['a', 'b'] as const) {
        const geo = geos.get(variant);
        const list = TREES.filter((t) => t.variant === variant);
        if (!geo || list.length === 0) continue;
        const inst = new InstancedMesh(geo, material, list.length);
        list.forEach((t, i) => {
          q.setFromAxisAngle(yAxis, (t.rotDeg * Math.PI) / 180);
          m.compose(new Vector3(t.x, 0, t.z), q, new Vector3(t.scale, t.scale, t.scale));
          inst.setMatrixAt(i, m);
        });
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.frustumCulled = false; // few instances; always keep their shadows
        scene.add(inst);
      }
    })
    .catch((err: unknown) => console.warn('plane_tree.glb failed to load, no trees', err));

  return { material };
}
