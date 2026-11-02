/**
 * Venues: the 3D environment around the court. A venue is its own set of Blender assets, baked
 * lightmaps and layout (art/lib/venues.py, which also writes the generated layout TS read here),
 * plus the look constants that go with its art (sky, fill, fallback ground).
 *
 * The venue is chosen once at boot from the URL (src/app/venue.ts, `?venue=derborence`) and passed
 * into createPitchScene, which threads it through lighting / scenery / baked light. The court
 * itself (physics arena, src/tuning/config.ts) is the same for every venue.
 *
 * Every value here is venue-specific data only: the village entries are exactly the constants that
 * used to live in scenery.ts / lighting.ts / sky.ts / bakedLight.ts.
 */
import { BAKED_SUN, COURT_LIGHT_RECT, GROUND_LIGHT_RECT, INSTANCED, type Placement } from './bakedLayout';
import {
  BAKED_SUN as DERBORENCE_SUN,
  COURT_LIGHT_RECT as DERBORENCE_COURT_LIGHT_RECT,
  GROUND_LIGHT_RECT as DERBORENCE_GROUND_LIGHT_RECT,
  INSTANCED as DERBORENCE_INSTANCED,
} from './bakedLayoutDerborence';

export type VenueId = 'village' | 'derborence';

/** Sky dome colours (sRGB display colours: the sky is not tone-mapped) and its gradient bands. */
export interface SkyStyle {
  zenith: number;
  mid: number;
  horizon: number;
  glow: number;
  /** Elevation (rad) over which the pale horizon blends into the mid blue / the zenith. */
  hazeBand: number;
  midBand: number;
}

/** A static model in game coordinates, lit through the venue's lightmap atlas (or unlit). */
export interface StaticModel {
  file: string;
  unlit?: boolean;
}

/** An asset the layout instances: one InstancedMesh per part, at the layout's placements. */
export interface InstancedModel {
  file: string;
  /** Mesh-name prefix of the parts in the file (`plane_tree_` -> `plane_tree_a`, `_a_leaves`). */
  prefix: string;
  /** Placements from the venue's generated layout TS (empty = nothing to place yet). */
  placements: readonly Placement[];
  /** Leaf cards (`<prefix><variant>_leaves`) use the leaf-atlas material instead of the wood one. */
  leaves: boolean;
}

/** Files in the venue's model directory (see art/lib/venues.py: the bake writes the same names). */
export interface VenueTextures {
  groundLight: string;
  courtLight: string;
  atlasLight: string;
  groundBounce: string;
  atlasBounce: string;
  groundDetail: string;
  leaves: string;
}

export interface Venue {
  id: VenueId;
  /** Model directory, relative to the page (the site works from any sub-path). */
  modelsDir: string;
  /** Buildings, hills, ... loaded as is; the court is separate (it defines the playing surface). */
  staticModels: readonly StaticModel[];
  court: {
    file: string;
    /** Meshes of the court file on the planar ground lightmap (the rest uses the atlas). */
    groundMeshes: readonly string[];
  };
  instanced: readonly InstancedModel[];
  textures: VenueTextures;
  /** Baked sun direction and elevation / azimuth (deg), from the generated layout TS. */
  sun: { dir: readonly [number, number, number]; elevationDeg: number; azimuthDeg: number };
  /** Baked lightmap rectangles (m), from the generated layout TS. */
  groundLightRect: { x0: number; z0: number; size: number };
  courtLightRect: { x0: number; z0: number; w: number; d: number };
  /** Linear albedo of the court gravel (palette "dust"), for the light the ground throws up. */
  groundAlbedo: readonly [number, number, number];
  sky: SkyStyle;
  /** Hemisphere fill (sky / ground colours) and the radius of the sky dome (m). */
  fill: { hemiSky: number; hemiGround: number; skyRadius: number };
  /**
   * Valley-shade lighting (src/render/lighting.ts): the court lies in the mountain's shadow, lit by a
   * soft sky from above instead of the sun. The directional light becomes a mild high key from
   * `keyElevationDeg` / `keyAzimuthDeg` (deg, same convention as the sun) at `key` x look.sunIntensity,
   * with no baked sun shadows (the lightmaps' ambient occlusion still applies) and no baked bounce;
   * `fill` scales look.fillIntensity, `exposure` look.exposure, `bouleShadow` the boules' real-time
   * shadow darkness, `ao` look.aoStrength (the sky fill carries the scene here, so full baked AO reads
   * too dark). The sun (sky glow, the pre-lit backdrop) keeps the baked direction. Absent = sunlit.
   */
  shade?: {
    keyElevationDeg: number;
    keyAzimuthDeg: number;
    key: number;
    fill: number;
    exposure: number;
    bouleShadow: number;
    ao: number;
  };
  /** Plain court / ground planes shown until the venue's court loads (or if it fails). */
  fallback: { court: number; ground: number };
}

/**
 * The instanced assets, described once for every venue: which file holds them, which mesh prefix to
 * look for and whether their parts include leaf cards. The placements come from the venue's layout.
 */
const instancedModels = (placements: Readonly<Record<string, readonly Placement[]>>): InstancedModel[] => [
  { file: 'plane_tree.glb', prefix: 'plane_tree_', placements: placements.plane_tree ?? [], leaves: true },
  { file: 'cypress.glb', prefix: 'cypress_', placements: placements.cypress ?? [], leaves: false },
];

/** The Provençal village: the original scene, unchanged. */
const VILLAGE: Venue = {
  id: 'village',
  modelsDir: 'models',
  staticModels: [{ file: 'houses.glb' }, { file: 'mairie.glb' }, { file: 'cafe.glb' }, { file: 'props.glb' }, { file: 'hills.glb', unlit: true }],
  court: { file: 'court.glb', groundMeshes: ['court_gravel', 'court_surround'] },
  instanced: instancedModels(INSTANCED),
  textures: {
    groundLight: 'ground_light.png',
    courtLight: 'court_light.webp',
    atlasLight: 'village_light.png',
    groundBounce: 'ground_bounce.webp',
    atlasBounce: 'village_bounce.webp',
    groundDetail: 'ground_detail.png',
    leaves: 'leaves.png',
  },
  sun: BAKED_SUN,
  groundLightRect: GROUND_LIGHT_RECT,
  courtLightRect: COURT_LIGHT_RECT,
  groundAlbedo: [0.5, 0.41, 0.27],
  sky: {
    zenith: 0x3d70b8,
    mid: 0x6f9ed4,
    horizon: 0xc6d6e4,
    glow: 0xfff3dc,
    hazeBand: 0.16,
    midBand: 0.7,
  },
  fill: { hemiSky: 0xc8d4e2, hemiGround: 0xcdb48e, skyRadius: 70 },
  fallback: { court: 0xbcab8d, ground: 0xac9879 },
};

/**
 * An alpine forest court: the petanque court at Derborence (Valais) on a late October afternoon.
 * Grey gravel framed by weathered logs and limestone stones, spruces and golden larches around, a
 * log chalet up the bank behind the far end and the cirque's limestone cliffs beyond (art/assets/
 * derborence/, art/lib/layout_derborence.py). The clearing lies in the valley's shade (`shade`: soft
 * sky light, no sun or tree shadows on the court); only the cliffs beyond catch the low sun.
 */
const DERBORENCE: Venue = {
  id: 'derborence',
  modelsDir: 'models/derborence',
  staticModels: [
    { file: 'terrain.glb' },
    { file: 'chalet.glb' },
    { file: 'props.glb' },
    { file: 'boulders.glb' },
    { file: 'backdrop.glb', unlit: true },
  ],
  court: { file: 'court.glb', groundMeshes: ['court_gravel', 'court_surround', 'court_litter'] },
  instanced: [
    { file: 'spruce.glb', prefix: 'spruce_', placements: DERBORENCE_INSTANCED.spruce ?? [], leaves: true },
    { file: 'larch.glb', prefix: 'larch_', placements: DERBORENCE_INSTANCED.larch ?? [], leaves: true },
    { file: 'pine.glb', prefix: 'pine_', placements: DERBORENCE_INSTANCED.pine ?? [], leaves: true },
  ],
  textures: {
    groundLight: 'ground_light.png',
    courtLight: 'court_light.webp',
    atlasLight: 'derborence_light.png',
    groundBounce: 'ground_bounce.webp',
    atlasBounce: 'derborence_bounce.webp',
    groundDetail: 'ground_detail.png',
    leaves: 'leaves.webp',
  },
  sun: DERBORENCE_SUN,
  groundLightRect: DERBORENCE_GROUND_LIGHT_RECT,
  courtLightRect: DERBORENCE_COURT_LIGHT_RECT,
  // grey gravel / forest floor (palette d_gravel, d_soil), linear
  groundAlbedo: [0.31, 0.29, 0.25],
  // clear, pale alpine blue; the horizon matches art/lib/palette.py "d_sky_horizon"
  sky: {
    zenith: 0x3f72c4,
    mid: 0x74a2d6,
    horizon: 0xd5e0ea,
    glow: 0xffe4c0,
    hazeBand: 0.14,
    midBand: 0.7,
  },
  // cool sky fill in the shade, darker forest-floor bounce
  fill: { hemiSky: 0xb8c7da, hemiGround: 0x8a7f6c, skyRadius: 70 },
  // the clearing lies in the valley's shade (only the cliffs behind catch the low sun): even sky
  // light, no tree-shadow blotches on the court
  shade: { keyElevationDeg: 62, keyAzimuthDeg: -30, key: 0.3, fill: 1.25, exposure: 1.0, bouleShadow: 0.55, ao: 0.65 },
  fallback: { court: 0xa19e97, ground: 0x6c5e4c },
};

export const VENUES: Readonly<Record<VenueId, Venue>> = { village: VILLAGE, derborence: DERBORENCE };
