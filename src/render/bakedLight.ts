/**
 * Baked lighting (see art/lib/bake.py): the static scenery's sun shadows and ambient occlusion
 * come from lightmaps computed in Blender with the same sun as the game:
 *   ground_light.png  (the square's floor, planar over GROUND_LIGHT_RECT, ~1.9 cm texels; UV from
 *                      world x/z; sampled bicubic so magnified texels never show as blocks)
 *   court_light.webp  (sun visibility only, the court + ~2 m around it, ~6 mm texels; cross-faded
 *                      over the ground map inside COURT_LIGHT_RECT, where the camera is closest)
 *   village_light.png (atlas for boards, houses, mairie, café, props; the glb's TEXCOORD_0)
 *   ground_bounce.webp / village_bounce.webp (RGB indirect sun light after 3 diffuse bounces off
 *                      the real albedos: the warm fill that sunlit gravel and limestone throw into
 *                      shaded walls, boards and props; stored sqrt(v / BOUNCE_MAX))
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
import { gradeShader } from './grade';
import { VENUES, type Venue, type VenueTextures } from './venues';

/** Shared uniforms (one write updates every patched material). x = sun shadow strength, y = AO strength. */
const strength = { value: { x: 1, y: 1 } as { x: number; y: number } };
/**
 * Neutral values while a venue's lightmaps are missing (boot, or the moment a venue switch starts):
 * white = fully sunlit / no occlusion, black = no baked bounce, grey = no ground grain. They are
 * shared, never disposed, so they can always go back into the slots.
 */
const NEUTRAL = { white: whiteTexture(), black: blackTexture(), grey: greyTexture() };
const groundMap: { value: Texture } = { value: NEUTRAL.white };
const villageMap: { value: Texture } = { value: NEUTRAL.white };
const courtMap: { value: Texture } = { value: NEUTRAL.white };
const groundBounce: { value: Texture } = { value: NEUTRAL.black };
const villageBounce: { value: Texture } = { value: NEUTRAL.black };
/** Scale of the baked bounce light (look.bounceStrength). */
const bounceStrength = { value: 1 };
/** Decode range of the bounce maps (keep in sync with BOUNCE_MAX in art/lib/bake.py, shared by all venues). */
const BOUNCE_MAX = '0.3';
/** Linear albedo of the court gravel (palette "dust"), for the light the ground throws up onto boules and trunks. */
const groundAlbedo = { value: new Vector3() };
const courtRect = { value: new Vector4() };
let maxAnisotropy = 4;

/** The renderer's max anisotropy, for the ground maps seen at grazing angles (call before loading). */
export function setBakedAnisotropy(n: number): void {
  maxAnisotropy = Math.max(1, n);
}
const detailMap: { value: Texture } = { value: NEUTRAL.grey };
const rect = { value: new Vector3() };
const sunDir = { value: new Vector3() };
/** Ground grain: tile sizes (m) of the two detail samples and the strength (0 = off). */
const detail = { value: new Vector3(0, 0, 0) };
/**
 * Initialises the shared baked-light uniforms (lightmap rectangles, sun, ground albedo, bounce range)
 * from the venue. Called at boot and again on every venue switch (src/render/pitchScene.ts): every
 * venue's lightmaps were baked with exactly these values, so the mapping has to follow the venue.
 */
export function configureBakedLight(venue: Venue): void {
  rect.value.set(venue.groundLightRect.x0, venue.groundLightRect.z0, venue.groundLightRect.size);
  courtRect.value.set(venue.courtLightRect.x0, venue.courtLightRect.z0, venue.courtLightRect.w, venue.courtLightRect.d);
  sunDir.value.set(...venue.sun.dir);
  groundAlbedo.value.set(...venue.groundAlbedo);
}

// Village values until createPitchScene configures the booting venue.
configureBakedLight(VENUES.village);

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

function blackTexture(): Texture {
  const t = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

/** Strength of the baked bounce (indirect sun) light: 0 = off, 1 = as baked. */
export function setBounceStrength(k: number): void {
  bounceStrength.value = k;
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

/** One shared uniform slot, the venue file that fills it and what it holds until that file is in. */
interface BakeSlot {
  slot: { value: Texture };
  neutral: Texture;
  repeat: boolean;
  mips: boolean;
  file: keyof VenueTextures;
}

const BAKED_SLOTS: readonly BakeSlot[] = [
  { slot: groundMap, neutral: NEUTRAL.white, repeat: false, mips: true, file: 'groundLight' },
  { slot: courtMap, neutral: NEUTRAL.white, repeat: false, mips: true, file: 'courtLight' },
  { slot: groundBounce, neutral: NEUTRAL.black, repeat: false, mips: true, file: 'groundBounce' },
  { slot: villageBounce, neutral: NEUTRAL.black, repeat: false, mips: false, file: 'atlasBounce' },
  { slot: villageMap, neutral: NEUTRAL.white, repeat: false, mips: false, file: 'atlasLight' },
  { slot: detailMap, neutral: NEUTRAL.grey, repeat: true, mips: true, file: 'groundDetail' },
];

/** The textures a load installed (the neutral placeholders never are), so only they get disposed. */
const installed = new Map<{ value: Texture }, Texture>();
/** Bumped by every load and by disposal: a load whose generation is gone drops what arrives. */
let generation = 0;

/** Back to the neutral placeholders, disposing the venue textures currently installed. */
function restoreNeutral(): void {
  for (const s of BAKED_SLOTS) {
    const previous = installed.get(s.slot);
    if (!previous) continue;
    s.slot.value = s.neutral;
    previous.dispose();
    installed.delete(s.slot);
  }
}

export interface BakedTextures {
  /** Resolves when every map has loaded or failed (never rejects), or at once if disposed. */
  ready: Promise<void>;
  /** Frees this load's textures (if still installed) and puts the neutral values back. */
  dispose(): void;
}

/**
 * Loads the venue's lightmaps and the ground grain (all linear data; mipmapped, no flip: glTF UV
 * convention) into the shared slots, starting from the neutral values so the new scenery is never
 * lit by the previous venue's lightmaps. A missing file is warned about, and the surfaces it lights
 * stay unshadowed / ungrained. Only the latest call's textures are kept: a superseded load drops
 * and disposes whatever arrives late, and disposing it frees the textures it installed.
 */
export function loadBakedTextures(url: (file: string) => string, textures: VenueTextures): BakedTextures {
  const mine = ++generation;
  restoreNeutral(); // the previous venue's maps would light this one wrongly
  const stale = (): boolean => mine !== generation;
  const loader = new TextureLoader();
  const pending = BAKED_SLOTS.map(
    (s) =>
      loader
        .loadAsync(url(textures[s.file]))
        .then((t) => {
          if (stale()) {
            t.dispose(); // superseded while loading: never reaches a material
            return;
          }
          t.colorSpace = NoColorSpace;
          t.flipY = false;
          t.minFilter = s.mips ? LinearMipmapLinearFilter : LinearFilter;
          t.generateMipmaps = s.mips;
          t.magFilter = LinearFilter;
          t.anisotropy = maxAnisotropy;
          if (s.repeat) t.wrapS = t.wrapT = RepeatWrapping;
          t.needsUpdate = true;
          installed.get(s.slot)?.dispose();
          s.slot.value = t;
          installed.set(s.slot, t);
        })
        .catch((err: unknown) => console.warn(`${textures[s.file]} failed to load (scenery stays unshadowed)`, err)),
  );
  return {
    ready: Promise.all(pending).then(() => undefined),
    dispose() {
      if (stale()) return; // a newer load owns the slots now
      generation++;
      restoreNeutral();
    },
  };
}

/**
 * Light the sunlit ground throws up onto a surface (boules, trunks): ground radiance (its albedo x
 * (sun x visibility + baked bounce)) over the lower half of the surface's view, plus a little of the
 * bounce arriving there. Needs the sun (directional light 0) and uBounceStrength, uGroundAlbedo, uSunDir.
 */
const GROUND_FILL = /* glsl */ `
vec3 groundFill( vec3 viewNormal, vec3 albedo, float groundSun, vec3 bounce ) {
#if NUM_DIR_LIGHTS > 0
  vec3 wn = inverseTransformDirection( viewNormal, viewMatrix );
  float down = 0.5 * ( 1.0 - wn.y );
  vec3 up = uGroundAlbedo * ( uSunDir.y * groundSun + bounce );
  return BRDF_Lambert( albedo ) * directionalLights[ 0 ].color * ( up * down + bounce * 0.5 ) * uBounceStrength;
#else
  return vec3( 0.0 );
#endif
}
`;

/** Cubic B-spline lightmap lookup from 4 bilinear taps (smooth when the texels are magnified). */
const BICUBIC = /* glsl */ `
vec3 bakeBicubic( sampler2D tex, vec2 uv ) {
  vec2 ts = vec2( textureSize( tex, 0 ) );
  vec2 st = uv * ts - 0.5;
  vec2 i = floor( st );
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = ( 1.0 - 3.0 * f + 3.0 * f2 - f3 ) / 6.0;
  vec2 w1 = ( 4.0 - 6.0 * f2 + 3.0 * f3 ) / 6.0;
  vec2 w2 = ( 1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3 ) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = ( i - 0.5 + w1 / g0 ) / ts;
  vec2 h1 = ( i + 1.5 + w3 / g1 ) / ts;
  return g0.y * ( g0.x * texture2D( tex, vec2( h0.x, h0.y ) ).rgb + g1.x * texture2D( tex, vec2( h1.x, h0.y ) ).rgb )
       + g1.y * ( g0.x * texture2D( tex, vec2( h0.x, h1.y ) ).rgb + g1.x * texture2D( tex, vec2( h1.x, h1.y ) ).rgb );
}
/** Sun visibility from the dense court map, faded in over 0.4 m inside its rectangle. */
float bakeCourt( sampler2D tex, vec4 rect, vec2 xz, float fallback ) {
  vec2 cUv = vec2( ( xz.x - rect.x ) / rect.z, 1.0 - ( xz.y - rect.y ) / rect.w );
  vec2 cEdge = min( cUv, 1.0 - cUv ) * rect.zw;
  float w = smoothstep( 0.0, 0.4, min( cEdge.x, cEdge.y ) );
  return mix( fallback, texture2D( tex, clamp( cUv, 0.0, 1.0 ) ).r, w );
}
`;

const BAKE_FRAGMENT = /* glsl */ `
uniform sampler2D uBakeMap;
uniform sampler2D uBounceMap;
uniform float uBounceStrength;
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
uniform sampler2D uCourtMap;
uniform vec4 uCourtRect;
varying vec2 vGroundXZ;
${BICUBIC}
#endif
`;

const PLANAR_UV = /* glsl */ `
  vec4 bakeWp = modelMatrix * vec4( transformed, 1.0 );
  vBakeUv = vec2( ( bakeWp.x - uBakeRect.x ) / uBakeRect.z, 1.0 - ( bakeWp.z - uBakeRect.y ) / uBakeRect.z );
  vBakeInside = vBakeUv;
`;

/** Lightmap lookup: outside the ground rectangle the floor is in open sun. */
const SAMPLE = /* glsl */ `
#ifdef BAKE_PLANAR
  vec3 bakeL = bakeBicubic( uBakeMap, vBakeUv );
  vec2 bakeEdge = min( vBakeInside, 1.0 - vBakeInside );
  bakeL = mix( vec3( 1.0 ), bakeL, smoothstep( 0.0, 0.004, min( bakeEdge.x, bakeEdge.y ) ) );
  bakeL.r = bakeCourt( uCourtMap, uCourtRect, vGroundXZ, bakeL.r );
#else
  vec3 bakeL = texture2D( uBakeMap, vBakeUv ).rgb;
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
#if NUM_DIR_LIGHTS > 0
  // baked bounce: the sun's light reflected off the ground and walls (already occluded where it should be)
  vec3 bounceT = texture2D( uBounceMap, vBakeUv ).rgb;
  reflectedLight.indirectDiffuse += BRDF_Lambert( diffuseColor.rgb ) * directionalLights[ 0 ].color
    * bounceT * bounceT * ${BOUNCE_MAX} * uBounceStrength;
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
    shader.uniforms.uBounceMap = planar ? groundBounce : villageBounce;
    shader.uniforms.uBounceStrength = bounceStrength;
    shader.uniforms.uBakeStrength = strength;
    if (planar) {
      shader.uniforms.uBakeRect = rect;
      shader.uniforms.uDetailMap = detailMap;
      shader.uniforms.uDetail = detail;
      shader.uniforms.uOccluders = occluders;
      shader.uniforms.uOccluderCount = occluderCount;
      shader.uniforms.uCourtMap = courtMap;
      shader.uniforms.uCourtRect = courtRect;
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
  material.customProgramCacheKey = () => `baked-${kind}-v3`;
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
    shader.uniforms.uCourtMap = courtMap;
    shader.uniforms.uCourtRect = courtRect;
    shader.uniforms.uBounceMap = groundBounce;
    shader.uniforms.uBounceStrength = bounceStrength;
    shader.uniforms.uGroundAlbedo = groundAlbedo;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBakeWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vBakeWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform sampler2D uBakeMap;\nuniform vec2 uBakeStrength;\nuniform vec3 uBakeRect;\nuniform vec3 uSunDir;\nuniform sampler2D uCourtMap;\nuniform vec4 uCourtRect;\nuniform sampler2D uBounceMap;\nuniform float uBounceStrength;\nuniform vec3 uGroundAlbedo;\nvarying vec3 vBakeWorld;\n${BICUBIC}`,
      )
      .replace('void main() {', `${GROUND_FILL}\nvoid main() {`)
      .replace(
        '#include <aomap_fragment>',
        `
  vec2 bakeG = vBakeWorld.xz - uSunDir.xz * ( max( vBakeWorld.y, 0.0 ) / max( uSunDir.y, 0.1 ) );
  vec2 bakeUv = vec2( ( bakeG.x - uBakeRect.x ) / uBakeRect.z, 1.0 - ( bakeG.y - uBakeRect.y ) / uBakeRect.z );
  vec3 bakeL = texture2D( uBakeMap, clamp( bakeUv, 0.0, 1.0 ) ).rgb;
  vec2 bakeEdge = min( bakeUv, 1.0 - bakeUv );
  bakeL = mix( vec3( 1.0 ), bakeL, step( 0.0, min( bakeEdge.x, bakeEdge.y ) ) );
  bakeL.r = bakeCourt( uCourtMap, uCourtRect, bakeG, bakeL.r );
  float bakeSun = mix( 1.0, bakeL.r, uBakeStrength.x );
  reflectedLight.directDiffuse *= bakeSun;
  reflectedLight.directSpecular *= bakeSun;
  reflectedLight.indirectDiffuse *= mix( 1.0, bakeL.g, uBakeStrength.y * 0.6 );
  vec2 bakeHere = vec2( ( vBakeWorld.x - uBakeRect.x ) / uBakeRect.z, 1.0 - ( vBakeWorld.z - uBakeRect.y ) / uBakeRect.z );
  float groundSun = texture2D( uBakeMap, clamp( bakeHere, 0.0, 1.0 ) ).r;
  groundSun = bakeCourt( uCourtMap, uCourtRect, vBakeWorld.xz, groundSun );
  vec3 groundBounce = texture2D( uBounceMap, clamp( bakeHere, 0.0, 1.0 ) ).rgb;
  groundBounce *= groundBounce * ${BOUNCE_MAX};
  reflectedLight.indirectDiffuse += groundFill( normal, diffuseColor.rgb, mix( 1.0, groundSun, uBakeStrength.x ), groundBounce );
#include <aomap_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'baked-dynamic-v4';
  return material;
}

/**
 * Tree wood (instanced, not in the lightmaps): the grade + the light thrown up by the sunlit
 * ground, so the shaded side of the pale trunks is warm, not grey.
 */
export function woodMaterial<M extends Material>(material: M): M {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uBounceStrength = bounceStrength;
    shader.uniforms.uGroundAlbedo = groundAlbedo;
    shader.uniforms.uSunDir = sunDir;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uBounceStrength;\nuniform vec3 uGroundAlbedo;\nuniform vec3 uSunDir;',
      )
      .replace('void main() {', `${GROUND_FILL}\nvoid main() {`)
      .replace(
        '#include <aomap_fragment>',
        'reflectedLight.indirectDiffuse += groundFill( normal, diffuseColor.rgb, 0.75, vec3( 0.04 ) );\n#include <aomap_fragment>',
      );
    gradeShader(shader);
  };
  material.customProgramCacheKey = () => 'wood-v2';
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
