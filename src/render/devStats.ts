/** Dev-only renderer statistics: logs draw calls / triangles once the scene has settled. */
import type { WebGLRenderer } from 'three';

export interface DevStats {
  /** Call after every renderer.render(). */
  frame(): void;
}

const noop: DevStats = { frame() {} };

export function createDevStats(renderer: WebGLRenderer): DevStats {
  if (!import.meta.env.DEV) return noop;
  let frames = 0;
  const snapshot = () => {
    const { render, memory } = renderer.info;
    return { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
  };
  (window as unknown as { __renderInfo: () => unknown }).__renderInfo = snapshot;
  return {
    frame() {
      frames++;
      if (frames === 150 || frames === 600) console.info('[render] ', JSON.stringify(snapshot()));
    },
  };
}
