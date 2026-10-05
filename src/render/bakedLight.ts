/**
 * Baked lighting (see art/lib/bake.py): the static scenery's sun shadows and ambient occlusion
 * come from two lightmaps computed in Blender with the same sun as the game:
 *   ground_light.png  (the square's floor, planar over GROUND_LIGHT_RECT; UV from world x/z)
 *   village_light.png (atlas for boards, houses, mairie, café, props; the glb's TEXCOORD_0)
 * R = sun visibility (soft, dappled tree shadows), G = ambient occlusion. Lambert still shades N.L
 * and the sky fill in real time; the patch multiplies the direct (sun) term by R and the indirect
 * (sky) term by G, scaled by the live `look.shadowStrength` / `look.aoStrength`.
 *
 * Dynamic objects (boules, jack) use `bakedDynamicMaterial`: they look up the ground lightmap where
 * the sun ray through them meets the ground, so a boule rolling into a tree's shade darkens with
 * it. Their own shadows on the ground are the only real-time shadow map (lighting.ts).
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  ShaderChunk,
  TextureLoader,
  Vector3,
  Vector4,
  type Material,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { BAKED_SUN, GROUND_LIGHT_RECT } from './bakedLayout';
import { gradeShader } from './grade';

/** Shared uniforms (one write updates every patched material). x = sun shadow strength, y = AO strength. */
const strength = { value: { x: 1, y: 1 } as { x: number; y: number } };
const groundMap: { value: Texture } = { value: whiteTexture() };
const villageMap: { value: Texture } = { value: whiteTexture() };
const detailMap: { value: Texture } = { value: greyTexture() };
const rect = { value: new Vector3(GROUND_LIGHT_RECT.x0, GROUND_LIGHT_RECT.z0, GROUND_LIGHT_RECT.size) };
const sunDir = { value: new Vector3(...BAKED_SUN.dir) };
/** Ground grain: tile sizes (m) of the two detail samples and the strength (0 = off). */
const detail = { value: new Vector3(0, 0, 0) };
/** Spheres (boules, jack) that occlude the sky light of the ground under them: contact shadows. */
const MAX_OCCLUDERS = 16;
const occluders = { value: Array.from({ length: MAX_OCCLUDERS }, () => new Vector4(0, -100, 0, 0)) };
const occluderCount = { value: 0 };

/** Sets the spheres (centre + radius, m) that darken the ground's sky light under them (analytic ambient occlusion). */
export function setContactOccluders(spheres: readonly { x: number; y: number; z: number; r: number }[]): void {
  const n = Math.min(spheres.length, MAX_OCCLUDERS);
  for (let i = 0; i < n; i++) {
    const s = spheres[i];
    if (s) occluders.value[i]?.set(s.x, s.y, s.z, s.r);
  }
  occluderCount.value = n;
}

function whiteTexture(): Texture {
  const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

function greyTexture(): Texture {
  const t = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

export function setBakeStrength(sunShadow: number, ao: number): void {
  strength.value.x = sunShadow;
  strength.value.y = ao;
}

/** Ground grain: two tiling samples (tile sizes in m) and its strength. */
export function setGroundDetail(tileA: number, tileB: number, amount: number): void {
  detail.value.set(1 / Math.max(tileA, 1e-3), 1 / Math.max(tileB, 1e-3), amount);
}

/** Loads the lightmaps and the ground grain (all linear data; mipmapped, no flip: glTF UV convention). */
export function loadBakedTextures(url: (file: string) => string): void {
  const loader = new TextureLoader();
  // The atlas skips mipmaps: smaller mips would bleed between its many small UV islands.
  const load = (file: string, slot: { value: Texture }, repeat: boolean, mips = true): void => {
    loader
      .loadAsync(url(file))
      .then((t) => {
        t.colorSpace = NoColorSpace;
        t.flipY = false;
        t.minFilter = mips ? LinearMipmapLinearFilter : LinearFilter;
        t.generateMipmaps = mips;
        t.magFilter = LinearFilter;
        t.anisotropy = 4;
        if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
        t.needsUpdate = true;
        slot.value = t;
      })
      .catch((err: unknown) => console.warn(`${file} failed to load (scenery stays unshadowed)`, err));
  };
  load('ground_light.png', groundMap, false);
  load('village_light.png', villageMap, false, false);
  load('ground_detail.png', detailMap, true);
}

const BAKE_FRAGMENT = /* glsl */ `
uniform sampler2D uBakeMap;
uniform vec2 uBakeStrength;
varying vec2 vBakeUv;
#ifdef BAKE_PLANAR
varying vec2 vBakeInside;
#endif
#ifdef BAKE_DETAIL
uniform sampler2D uDetailMap;
uniform vec3 uDetail;
uniform vec4 uOccluders[ ${MAX_OCCLUDERS} ];
uniform int uOccluderCount;
varying vec2 vGroundXZ;
#endif
`;

const PLANAR_UV = /* glsl */ `
  vec4 bakeWp = modelMatrix * vec4( transformed, 1.0 );
  vBakeUv = vec2( ( bakeWp.x - uBakeRect.x ) / uBakeRect.z, 1.0 - ( bakeWp.z - uBakeRect.y ) / uBakeRect.z );
  vBakeInside = vBakeUv;
`;

/** Lightmap lookup: outside the ground rectangle the floor is in open sun. */
const SAMPLE = /* glsl */ `
  vec3 bakeL = texture2D( uBakeMap, vBakeUv ).rgb;
#ifdef BAKE_PLANAR
  vec2 bakeEdge = min( vBakeInside, 1.0 - vBakeInside );
  bakeL = mix( vec3( 1.0 ), bakeL, smoothstep( 0.0, 0.004, min( bakeEdge.x, bakeEdge.y ) ) );
#endif
  reflectedLight.directDiffuse *= mix( 1.0, bakeL.r, uBakeStrength.x );
  reflectedLight.indirectDiffuse *= mix( 1.0, bakeL.g, uBakeStrength.y );
#ifdef BAKE_DETAIL
  // contact shadows: sky light blocked by the spheres resting / rolling on the ground
  float bakeOcc = 0.0;
  for ( int i = 0; i < ${MAX_OCCLUDERS}; i ++ ) {
    if ( i >= uOccluderCount ) break;
    vec4 o = uOccluders[ i ];
    vec3 d = o.xyz - vec3( vGroundXZ.x, 0.0, vGroundXZ.y );
    float l2 = max( dot( d, d ), 1e-6 );
    bakeOcc += o.w * o.w / l2 * max( d.y * inversesqrt( l2 ), 0.0 );
  }
  reflectedLight.indirectDiffuse *= 1.0 - clamp( bakeOcc, 0.0, 1.0 ) * uBakeStrength.y;
#endif
`;

export type BakeKind = 'ground' | 'atlas';

/**
 * Patches a vertex-coloured MeshLambertMaterial for baked light. 'ground': planar lightmap from
 * the world position + the gravel grain; 'atlas': the village lightmap through the mesh UVs.
 */
export function bakedMaterial<M extends Material>(material: M, kind: BakeKind): M {
  const planar = kind === 'ground';
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uBakeMap = planar ? groundMap : villageMap;
    shader.uniforms.uBakeStrength = strength;
    if (planar) {
      shader.uniforms.uBakeRect = rect;
      shader.uniforms.uDetailMap = detailMap;
      shader.uniforms.uDetail = detail;
      shader.uniforms.uOccluders = occluders;
      shader.uniforms.uOccluderCount = occluderCount;
    }
    const defs = planar ? '#define BAKE_PLANAR\n#define BAKE_DETAIL\n' : '';
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${defs}varying vec2 vBakeUv;\n#ifdef BAKE_PLANAR\nuniform vec3 uBakeRect;\nvarying vec2 vBakeInside;\nvarying vec2 vGroundXZ;\n#endif`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\n#ifdef BAKE_PLANAR\n${PLANAR_UV}\n  vGroundXZ = bakeWp.xz;\n#else\n  vBakeUv = uv;\n#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${defs}${BAKE_FRAGMENT}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
#ifdef BAKE_DETAIL
  float grain = texture2D( uDetailMap, vGroundXZ * uDetail.x ).r + texture2D( uDetailMap, vGroundXZ * uDetail.y + 0.37 ).r;
  diffuseColor.rgb *= max( 1.0 + ( grain - 1.0 ) * uDetail.z, 0.0 );
#endif`,
      )
      .replace('#include <aomap_fragment>', `${SAMPLE}\n#include <aomap_fragment>`);
    gradeShader(shader);
  };
  material.customProgramCacheKey = () => `baked-${kind}-v1`;
  return material;
}

/**
 * Boules / jack: darken with the baked shade at the point of the ground the sun ray through the
 * fragment reaches (so a ball in a tree's shadow is in shade too). Works on Lambert / Standard.
 */
export function bakedDynamicMaterial<M extends Material>(material: M): M {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uBakeMap = groundMap;
    shader.uniforms.uBakeStrength = strength;
    shader.uniforms.uBakeRect = rect;
    shader.uniforms.uSunDir = sunDir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBakeWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vBakeWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uBakeMap;\nuniform vec2 uBakeStrength;\nuniform vec3 uBakeRect;\nuniform vec3 uSunDir;\nvarying vec3 vBakeWorld;',
      )
      .replace(
        '#include <aomap_fragment>',
        `
  vec2 bakeG = vBakeWorld.xz - uSunDir.xz * ( max( vBakeWorld.y, 0.0 ) / max( uSunDir.y, 0.1 ) );
  vec2 bakeUv = vec2( ( bakeG.x - uBakeRect.x ) / uBakeRect.z, 1.0 - ( bakeG.y - uBakeRect.y ) / uBakeRect.z );
  vec3 bakeL = texture2D( uBakeMap, clamp( bakeUv, 0.0, 1.0 ) ).rgb;
  vec2 bakeEdge = min( bakeUv, 1.0 - bakeUv );
  bakeL = mix( vec3( 1.0 ), bakeL, step( 0.0, min( bakeEdge.x, bakeEdge.y ) ) );
  float bakeSun = mix( 1.0, bakeL.r, uBakeStrength.x );
  reflectedLight.directDiffuse *= bakeSun;
  reflectedLight.directSpecular *= bakeSun;
  reflectedLight.indirectDiffuse *= mix( 1.0, bakeL.g, uBakeStrength.y * 0.6 );
#include <aomap_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'baked-dynamic-v1';
  return material;
}

/**
 * Leaf cards: double sided, but keep the authored "spherical" normals on both faces (three flips
 * the normal of back faces, which would light the far side of the crown from inside).
 */
export function foliageMaterial<M extends Material>(material: M): M {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
    );
    gradeShader(shader);
  };
  material.customProgramCacheKey = () => 'foliage-v1';
  return material;
}
