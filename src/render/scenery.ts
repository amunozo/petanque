/**
 * Static scenery loaded from the Blender-made glTF files in public/models/ (see art/): the court
 * + boards + the ground of the square, the village (houses, the mairie closing the far end, café
 * terrace, wall/bench/lamps), the distant hills, and the instanced plane trees and cypresses.
 * Until the court arrives (or if it fails to load) a plain placeholder court is shown, so the game
 * is playable either way.
 *
 * What is loaded, and from which directory, is the venue's (src/render/venues.ts,
 * src/app/venue.ts): the village, or a venue whose assets are still missing (every failed file is
 * warned about and skipped: the fallback court + sky stay).
 *
 * Lighting is baked (art/lib/bake.py, src/render/bakedLight.ts): the ground and the buildings use
 * vertex-colour Lambert materials patched with their lightmaps (sun shadows of every tree, building
 * and prop + ambient occlusion), so nothing static renders into the real-time shadow map; only the
 * boules cast real-time shadows (onto the ground). Trees: smooth-shaded wood + alpha-tested leaf
 * cards (leaf atlas). The hills are unlit, without fog or tone mapping (pre-lit and pre-hazed in
 * Blender). Everything gets the scenery colour grade (src/render/grade.ts).
 */
import {
  BufferGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Object3D } from 'three';
import { bakedMaterial, foliageMaterial, loadBakedTextures, woodMaterial } from './bakedLight';
import { gradeMaterial } from './grade';
import type { InstancedModel, Venue } from './venues';

/** Leaf-card alpha cut-off (alpha-tested, not blended: cheap, sorted for free). */
const STYLE = {
  leafAlphaTest: 0.45,
} as const;

export interface CourtRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const meshesOf = (root: Object3D): Mesh[] => {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
};

export function loadScenery(scene: Scene, court: CourtRect, venue: Venue): void {
  // Model paths are relative to the page, so the site works from any sub-path.
  const modelUrl = (name: string): string => `${import.meta.env.BASE_URL}${venue.modelsDir}/${name}`;
  loadBakedTextures(modelUrl, venue.textures);
  const ground = bakedMaterial(new MeshLambertMaterial({ vertexColors: true }), 'ground');
  const atlas = bakedMaterial(new MeshLambertMaterial({ vertexColors: true }), 'atlas');
  const wood = woodMaterial(new MeshLambertMaterial({ vertexColors: true }));
  const leafMap = new TextureLoader().load(modelUrl(venue.textures.leaves), undefined, undefined, (err: unknown) =>
    console.warn(`${venue.textures.leaves} failed to load, leaf cards stay untextured`, err),
  );
  leafMap.colorSpace = SRGBColorSpace;
  leafMap.flipY = false; // glTF UV convention
  leafMap.anisotropy = 4;
  const leaves = foliageMaterial(
    new MeshLambertMaterial({
      vertexColors: true,
      map: leafMap,
      alphaTest: STYLE.leafAlphaTest,
      alphaToCoverage: true,
      side: DoubleSide,
    }),
  );
  const unlit = gradeMaterial(new MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false }));

  // Placeholder until the court model is in.
  const fallback = new Group();
  const plain = new MeshLambertMaterial({ color: venue.fallback.court });
  const pitch = new Mesh(new PlaneGeometry(court.maxX - court.minX, court.maxZ - court.minZ), plain);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set((court.minX + court.maxX) / 2, 0, (court.minZ + court.maxZ) / 2);
  pitch.receiveShadow = true;
  const around = new Mesh(new PlaneGeometry(120, 120), new MeshLambertMaterial({ color: venue.fallback.ground }));
  around.rotation.x = -Math.PI / 2;
  around.position.set(0, -0.02, -15);
  around.receiveShadow = true;
  fallback.add(pitch, around);
  scene.add(fallback);

  const loader = new GLTFLoader();

  loader
    .loadAsync(modelUrl(venue.court.file))
    .then((gltf) => {
      for (const mesh of meshesOf(gltf.scene)) {
        const isGround = venue.court.groundMeshes.includes(mesh.name);
        mesh.material = isGround ? ground : atlas;
        mesh.receiveShadow = isGround; // the boules' real-time shadows
        mesh.castShadow = false;
      }
      scene.add(gltf.scene);
      scene.remove(fallback);
      pitch.geometry.dispose();
      around.geometry.dispose();
      plain.dispose();
    })
    .catch((err: unknown) => console.warn(`${venue.court.file} failed to load, keeping the placeholder court`, err));

  for (const model of venue.staticModels) {
    loader
      .loadAsync(modelUrl(model.file))
      .then((gltf) => {
        for (const mesh of meshesOf(gltf.scene)) {
          mesh.material = model.unlit ? unlit : atlas;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        }
        scene.add(gltf.scene);
      })
      .catch((err: unknown) => console.warn(`${model.file} failed to load`, err));
  }

  for (const inst of venue.instanced) {
    const materialFor = (part: string): Material => (inst.leaves && part.endsWith('_leaves') ? leaves : wood);
    loadInstanced(loader, scene, modelUrl, inst, materialFor);
  }
}

/**
 * One InstancedMesh per mesh in the file (`<prefix><variant>` and e.g. `<prefix><variant>_leaves`),
 * placed at every placement of that variant. The geometry is modelled around the trunk base, so
 * node offsets in the file are ignored. Placements come from the bake layout, so the trees stand
 * exactly where their baked shadows are. A venue whose layout has no placements yet loads nothing.
 */
function loadInstanced(
  loader: GLTFLoader,
  scene: Scene,
  url: (file: string) => string,
  model: InstancedModel,
  materialFor: (part: string) => Material,
): void {
  const placements = model.placements;
  if (placements.length === 0) return;
  loader
    .loadAsync(url(model.file))
    .then((gltf) => {
      const parts = new Map<string, BufferGeometry>();
      for (const mesh of meshesOf(gltf.scene)) {
        if (mesh.name.startsWith(model.prefix)) parts.set(mesh.name.slice(model.prefix.length), mesh.geometry);
      }
      const m = new Matrix4();
      const q = new Quaternion();
      const pos = new Vector3();
      const scl = new Vector3();
      const yAxis = new Vector3(0, 1, 0);
      for (const [part, geo] of parts) {
        const variant = part.split('_')[0] ?? part;
        const list = placements.filter((t) => t.variant === variant);
        if (list.length === 0) continue;
        const inst = new InstancedMesh(geo, materialFor(part), list.length);
        list.forEach((t, i) => {
          q.setFromAxisAngle(yAxis, (t.rotDeg * Math.PI) / 180);
          m.compose(pos.set(t.x, 0, t.z), q, scl.setScalar(t.scale));
          inst.setMatrixAt(i, m);
        });
        inst.castShadow = false; // baked
        inst.receiveShadow = false;
        inst.computeBoundingSphere(); // covers all instances, so frustum culling stays correct
        scene.add(inst);
      }
    })
    .catch((err: unknown) => console.warn(`${model.file} failed to load`, err));
}
