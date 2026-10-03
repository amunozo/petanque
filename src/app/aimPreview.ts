/**
 * Aim preview shared by the modes: gesture preview -> predicted arc, landing
 * marker and roll-out hint (scene) + power meter (HUD). The roll-out
 * (a lone-ball simulation) is cached on the rounded (aim, power, loft) so it
 * only reruns when the preview meaningfully changes.
 */
import type { ThrowParams, Vec3 } from '../engine';
import { predictRestPoint, previewThrow } from '../games/petanque';
import type { AimPreview } from '../input';
import type { LoftPreset } from '../tuning';
import type { AppContext } from './context';

export interface AimPreviewer {
  /** `p` null (or `ball` null) clears the preview. `ball` = 'jack' previews with the jack's size and weight. */
  update(p: AimPreview | null, ball: 'boule' | 'jack' | null): void;
}

export function createAimPreviewer(ctx: AppContext): AimPreviewer {
  const { cfg, scene, hud, loftPicker } = ctx;
  let restKey = '';
  let restPoint: Vec3 | null = null;
  ctx.store.subscribe(() => {
    restKey = ''; // any tuning change invalidates the cache
  });

  function restFor(p: AimPreview, loft: LoftPreset, ball: 'boule' | 'jack', params: ThrowParams): Vec3 | null {
    if (cfg.controls.rollHintFrac <= 0) return null;
    const key = `${Math.round(p.aim * 1000)}|${Math.round(p.power * 200)}|${loft}|${ball}`;
    if (key !== restKey) {
      restKey = key;
      restPoint = predictRestPoint(params, ballCfg(ball));
    }
    return restPoint;
  }
  const ballCfg = (ball: 'boule' | 'jack') => (ball === 'jack' ? { ...cfg, balls: { ...cfg.balls, boule: cfg.balls.jack } } : cfg);

  return {
    update(p, ball) {
      if (!p || !ball) {
        hud.setPower(null);
        scene.setAimPreview(null);
        return;
      }
      scene.setCameraMode('aim');
      hud.setPower(cfg.controls.showPowerMeter ? p.power : null);
      const loft = loftPicker.get();
      const { params, flight } = previewThrow({ aim: p.aim, power: p.power, loft }, ballCfg(ball));
      scene.setAimPreview({ origin: params.origin, aim: p.aim, landing: flight.landing, rest: restFor(p, loft, ball, params), points: flight.points });
    },
  };
}
