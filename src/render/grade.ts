/**
 * Colour grade shared by the scenery materials (lit vertex-colour Lambert, unlit hills, sky): a
 * saturation step on the shaded colour, in linear light, just before tone mapping. It is a shader
 * patch (no extra render pass, so it is free on phones). The balls and HUD markers are not graded,
 * so the jack keeps its own colour. The value is set live from config.look by src/render/lighting.ts.
 */
import type { Material } from 'three';

/** Shared uniform: every graded material reads the same object, so one write updates them all. */
const saturation = { value: 1 };

export function setGradeSaturation(s: number): void {
  saturation.value = s;
}

/** Patches a Lambert / Basic material (anything ending in `#include <opaque_fragment>`). */
export function gradeMaterial<M extends Material>(material: M): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGradeSaturation = saturation;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uGradeSaturation;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        'outgoingLight = max(mix(vec3(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722))), outgoingLight, uGradeSaturation), 0.0);\n#include <opaque_fragment>',
      );
  };
  material.customProgramCacheKey = () => 'grade-v1';
  return material;
}
