import type { MotionPreset, SceneItem } from '../shared/types.ts';

export interface SceneEffectValues {
  noise_intensity: number;
  noise_atmosphere: number;
  noise_opacity: number;
  shake_intensity: number;
}

export interface LiveEffectOverride extends SceneEffectValues {
  sceneId: string;
}

export const DEFAULT_SCENE_EFFECTS: SceneEffectValues = {
  noise_intensity: 35,
  noise_atmosphere: 45,
  noise_opacity: 38,
  shake_intensity: 35,
};

export function clampEffectPct(val: unknown, fallback = 35): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : fallback;
  return Math.max(0, Math.min(100, n));
}

export function getEffectiveEffects(
  scene: SceneItem,
  override?: LiveEffectOverride | null
): SceneEffectValues {
  if (override && override.sceneId === scene.id) {
    return {
      noise_intensity: clampEffectPct(override.noise_intensity),
      noise_atmosphere: clampEffectPct(override.noise_atmosphere),
      noise_opacity: clampEffectPct(override.noise_opacity),
      shake_intensity: clampEffectPct(override.shake_intensity),
    };
  }
  return {
    noise_intensity: clampEffectPct(scene.noise_intensity, DEFAULT_SCENE_EFFECTS.noise_intensity),
    noise_atmosphere: clampEffectPct(scene.noise_atmosphere, DEFAULT_SCENE_EFFECTS.noise_atmosphere),
    noise_opacity: clampEffectPct(scene.noise_opacity, DEFAULT_SCENE_EFFECTS.noise_opacity),
    shake_intensity: clampEffectPct(scene.shake_intensity, DEFAULT_SCENE_EFFECTS.shake_intensity),
  };
}

/**
 * CapCut-style organic subtle shake & breathing camera drift.
 * Uses multiple incommensurate harmonics so still images appear smoothly alive without harsh jitter.
 */
export function getCapCutShakeOffsets(
  timeSec: number,
  shakeIntensity: number,
  preset: MotionPreset
): {
  dxPct: number;
  dyPct: number;
  rotDeg: number;
  extraScale: number;
} {
  // Even if shake slider is 0, keep subtle preset multiplier if motion_preset === 'shake_subtle'
  const effectiveStrength =
    shakeIntensity > 0 ? shakeIntensity : preset === 'shake_subtle' ? 28 : 0;

  if (effectiveStrength <= 0) {
    return { dxPct: 0, dyPct: 0, rotDeg: 0, extraScale: 1 };
  }

  const ratio = effectiveStrength / 100;
  // CapCut subtle shake: slow organic float + soft high-frequency micro-tremor
  const ampPct = 0.45 + ratio * 2.15;
  const dxPct =
    (Math.sin(timeSec * 1.45 + 0.3) * 0.55 +
      Math.sin(timeSec * 3.1 + 1.4) * 0.3 +
      Math.sin(timeSec * 6.4 + 2.2) * 0.15) *
    ampPct;

  const dyPct =
    (Math.cos(timeSec * 1.2 + 0.8) * 0.55 +
      Math.sin(timeSec * 2.75 + 2.1) * 0.3 +
      Math.cos(timeSec * 5.7 + 0.5) * 0.15) *
    ampPct;

  const rotDeg =
    (Math.sin(timeSec * 1.15 + 0.6) * 0.6 + Math.cos(timeSec * 2.6 + 1.9) * 0.4) *
    (0.2 + ratio * 0.95);

  // Overscan scale guarantees image borders never show during drift
  const extraScale = 1.03 + ratio * 0.08;

  return { dxPct, dyPct, rotDeg, extraScale };
}

export function computeCombinedSceneTransform(params: {
  preset: MotionPreset;
  progress: number;
  timeSec: number;
  shakeIntensity: number;
  reducedMotion?: boolean;
}): string {
  const p = Math.min(1, Math.max(0, params.progress));
  let baseScale = 1;
  let baseX = 0;
  let baseY = 0;

  switch (params.preset) {
    case 'slow_zoom_in':
      baseScale = 1 + p * 0.12;
      break;
    case 'slow_zoom_out':
      baseScale = 1.13 - p * 0.12;
      break;
    case 'push_in':
      baseScale = 1.02 + p * 0.13;
      break;
    case 'pan_left':
      baseScale = 1.12;
      baseX = 3 - p * 6;
      break;
    case 'pan_right':
      baseScale = 1.12;
      baseX = -3 + p * 6;
      break;
    case 'pan_up':
      baseScale = 1.12;
      baseY = 3 - p * 6;
      break;
    case 'pan_down':
      baseScale = 1.12;
      baseY = -3 + p * 6;
      break;
    case 'handheld_float':
      baseScale = 1.08;
      baseX = Math.sin(p * Math.PI * 2) * 1.3;
      baseY = Math.cos(p * Math.PI * 2) * 1.3;
      break;
    case 'shake_subtle':
      baseScale = 1.04 + p * 0.06;
      break;
    default:
      baseScale = 1 + p * 0.1;
      break;
  }

  if (params.reducedMotion) {
    return `scale(${baseScale.toFixed(4)}) translate(${baseX.toFixed(2)}%, ${baseY.toFixed(2)}%)`;
  }

  const shake = getCapCutShakeOffsets(params.timeSec, params.shakeIntensity, params.preset);
  const totalScale = baseScale * shake.extraScale;
  const totalX = baseX + shake.dxPct;
  const totalY = baseY + shake.dyPct;

  return `translate(${totalX.toFixed(3)}%, ${totalY.toFixed(3)}%) rotate(${shake.rotDeg.toFixed(3)}deg) scale(${totalScale.toFixed(4)})`;
}

export function getAtmosphereImageFilter(atmosphere: number): string {
  const a = clampEffectPct(atmosphere, 0) / 100;
  const brightness = 1 - a * 0.22;
  const contrast = 1 + a * 0.22;
  const saturate = 1 - a * 0.18;
  return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)})`;
}

export function getAtmosphereVignetteBackground(atmosphere: number): string {
  const a = clampEffectPct(atmosphere, 0) / 100;
  if (a <= 0.01) return 'none';
  const centerAlpha = (a * 0.12).toFixed(3);
  const midAlpha = (a * 0.36).toFixed(3);
  const edgeAlpha = Math.min(0.92, 0.25 + a * 0.62).toFixed(3);
  return `radial-gradient(ellipse at center, rgba(0,0,0,${centerAlpha}) 26%, rgba(0,0,0,${midAlpha}) 68%, rgba(0,0,0,${edgeAlpha}) 100%)`;
}

/**
 * Renders procedural dark analog noise film grain onto a small 2D canvas.
 * Intensity controls grain density & contrast; opacity controls overall overlay visibility.
 */
export function renderBlackNoiseToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  noiseIntensity: number,
  seedOffset: number
) {
  const intensity = clampEffectPct(noiseIntensity, 0) / 100;
  ctx.clearRect(0, 0, width, height);
  if (intensity <= 0.01) return;

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Fast deterministic xorshift32 per frame so film grain shimmers organically
  let state = (Math.floor(seedOffset * 9973) + 133791) | 0;
  if (state === 0) state = 2463534242;

  const speckleChance = 0.22 + intensity * 0.56;
  const maxDarkAlpha = Math.round(70 + intensity * 185);

  for (let i = 0; i < data.length; i += 4) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const rand = (state >>> 0) / 4294967295;

    if (rand < speckleChance) {
      // Dark carbon/black film grain speckles + rare fine charcoal clumping
      const strength = Math.pow(rand / speckleChance, 0.75);
      const tone = Math.round(strength * 28);
      data[i] = tone;
      data[i + 1] = tone;
      data[i + 2] = tone + 2;
      data[i + 3] = Math.round((0.35 + (1 - strength) * 0.65) * maxDarkAlpha);
    } else {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
