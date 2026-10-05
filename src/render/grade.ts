/**
 * Colour grade shared by the scenery materials (baked Lambert, foliage, unlit hills, sky): a
 * saturation step on the shaded colour, in linear light, just before tone mapping. It is a shader
 * patch (no extra render pass, so it is free on phones). The balls and HUD markers are not graded,
 * so the jack keeps its own colour. The value is set live from config.look by src/render/lighting.ts.
 */
import type { Material, WebGLProgramParametersWithUniforms } from 'three';

/** Shared uniform: every graded material reads the same object, so one write updates them all. */
const saturation = { value: 1 };

export function setGradeSaturation(s: number): void {
  saturation.value = s;
}

/** Applies the grade to a compiled-shader description (Lambert / Basic / Standard: anything ending in `#include <opaque_fragment>`). */
export function gradeShader(shader: WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uGradeSaturation = saturation;
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform float uGradeSaturation;\nvoid main() {')
    .replace(
      '#include <opaque_fragment>',
      'outgoingLight = max(mix(vec3(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722))), outgoingLight, uGradeSaturation), 0.0);\n#include <opaque_fragment>',
    );
}

/** Patches a material with the grade only. */
export function gradeMaterial<M extends Material>(material: M): M {
  material.onBeforeCompile = gradeShader;
  material.customProgramCacheKey = () => 'grade-v1';
  return material;
}
