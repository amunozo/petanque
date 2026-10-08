/**
 * Aim preview shared by the modes: gesture preview -> predicted arc, landing
 * marker and roll-out hint (scene) + power meter (HUD). The roll-out
 * (a lone-ball simulation) is cached on the rounded (aim, power, loft) so it
 * only reruns when the preview meaningfully changes.
 */
import type { ThrowParams, Vec3 } from '../engine';
import { ballConfig, predictRestPoint, previewThrow } from '../games/petanque';
import type { AimPreview, ThrowIntent } from '../input';
import type { GameConfig, LoftPreset } from '../tuning';
import type { AppContext } from './context';

export interface AimPreviewer {
  /** `p` null (or `ball` null) clears the preview. `ball` = 'jack' previews with the jack's size and weight. */
  update(p: AimPreview | null, ball: 'boule' | 'jack' | null): void;
  /**
   * Shows what a throw intent would do (zero noise): the dots arc and landing ring only,
   * no power meter or roll-out line. Used to show the computer's aim before it throws.
   */
  showIntent(intent: ThrowIntent, ball: 'boule' | 'jack'): void;
}

/** `config`: the live tuning by default; online matches pass the defaults (what the server plays with). */
export function createAimPreviewer(ctx: AppContext, config: () => GameConfig = () => ctx.cfg): AimPreviewer {
  const { scene, hud, loftPicker } = ctx;
  let restKey = '';
  let restCfg: GameConfig | null = null;
  let restPoint: Vec3 | null = null;
  ctx.store.subscribe(() => {
    restKey = ''; // any tuning change invalidates the cache
  });

  function restFor(cfg: GameConfig, p: AimPreview, loft: LoftPreset, ball: 'boule' | 'jack', params: ThrowParams): Vec3 | null {
    if (cfg.controls.rollHintFrac <= 0) return null;
    const key = `${Math.round(p.aim * 1000)}|${Math.round(p.power * 200)}|${loft}|${ball}`;
    if (key !== restKey || cfg !== restCfg) {
      restKey = key;
      restCfg = cfg;
      restPoint = predictRestPoint(params, ballCfg(cfg, ball));
    }
    return restPoint;
  }
  const ballCfg = ballConfig<GameConfig>;

  return {
    showIntent(intent, ball) {
      scene.setCameraMode('aim');
      hud.setPower(null);
      const { params, flight, ring } = previewThrow(intent, ballCfg(config(), ball));
      scene.setAimPreview({ origin: params.origin, aim: intent.aim, landing: ring, rest: null, points: flight.points });
    },
    update(p, ball) {
      if (!p || !ball) {
        hud.setPower(null);
        scene.setAimPreview(null);
        return;
      }
      const cfg = config();
      scene.setCameraMode('aim');
      hud.setPower(cfg.controls.showPowerMeter ? p.power : null);
      const loft = loftPicker.get();
      const { params, flight, ring } = previewThrow({ aim: p.aim, power: p.power, loft }, ballCfg(cfg, ball));
      // The ring is the first ground contact (for 'shoot': the spot a boule is struck squarely, see aimRing).
      const target = p.target;
      if (target?.meaning === 'rest') {
        // Landing-spot controls, roll: the ring marks where it stops (the solved spot); the whole roll-out is drawn.
        const stop = { x: target.x, y: 0, z: target.z };
        scene.setAimPreview({ origin: params.origin, aim: p.aim, landing: flight.landing, rest: stop, ring: stop, hintFrac: 1, points: flight.points });
        return;
      }
      scene.setAimPreview({ origin: params.origin, aim: p.aim, landing: ring, rest: restFor(cfg, p, loft, ball, params), points: flight.points });
    },
  };
}
