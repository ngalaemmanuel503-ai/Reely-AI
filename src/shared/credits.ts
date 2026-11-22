import type { CreditQuote, LengthTier, VoiceTier } from './types.ts';

export const DEFAULT_PRICE_TABLE = {
  script_flat: 20,
  image_standard: 15,
  image_character: 30,
  voice_premium_per_sec: 1.2,
  voice_standard_per_sec: 0.3,
  export_per_30s_block: 10,
  captions_flat: 0,
  music_library_flat: 0,
} as const;

export const PROCESSING_FEE_RATE = 0.03;

export function getSceneCountForLength(lengthTier: LengthTier): number {
  if (lengthTier === 30) return 5;
  if (lengthTier === 60) return 8;
  return 12;
}

export interface QuoteInput {
  lengthTier: LengthTier;
  hasCharacter: boolean;
  styleMultiplier?: number;
  voiceTier: VoiceTier;
  userSuppliedImages?: boolean;
  userSuppliedVoice?: boolean;
  userSuppliedMusic?: boolean;
  prices?: Partial<typeof DEFAULT_PRICE_TABLE>;
}

/**
 * Authoritative credit quote calculation matching Part A10 of the Reely AI specification:
 * - 60s standard images + premium voice = 20 + 8*15 + 72 + 20 = 232
 * - 60s same-character + premium voice = 20 + 8*30 + 72 + 20 = 352
 * - 60s standard images + standard voice = 20 + 8*15 + 18 + 20 = 178
 * - 30s standard images + premium voice = 20 + 5*15 + 36 + 10 = 141
 * - 90s standard images + premium voice = 20 + 12*15 + 108 + 30 = 338
 */
export function calculateCreditQuote(input: QuoteInput): CreditQuote {
  const prices = { ...DEFAULT_PRICE_TABLE, ...(input.prices ?? {}) };
  const sceneCount = getSceneCountForLength(input.lengthTier);
  const multiplier = input.styleMultiplier ?? 1;

  const script = prices.script_flat;

  const perImage = input.hasCharacter ? prices.image_character : prices.image_standard;
  const images = input.userSuppliedImages
    ? 0
    : Math.round(sceneCount * perImage * multiplier);

  const voiceRate =
    input.voiceTier === 'premium'
      ? prices.voice_premium_per_sec
      : prices.voice_standard_per_sec;
  const voice = input.userSuppliedVoice
    ? 0
    : Math.round(input.lengthTier * voiceRate);

  const exportBlocks = Math.ceil(input.lengthTier / 30);
  const exportCost = exportBlocks * prices.export_per_30s_block;

  const captions = prices.captions_flat;
  const music = input.userSuppliedMusic ? 0 : prices.music_library_flat;

  const total = script + images + voice + exportCost + captions + music;

  return {
    script,
    images,
    voice,
    export: exportCost,
    captions,
    music,
    total,
    scene_count: sceneCount,
  };
}

export function calculateCheckoutTotal(baseAmountXaf: number): {
  base_xaf: number;
  fee_xaf: number;
  total_xaf: number;
} {
  const safeBase = Math.max(0, Math.round(baseAmountXaf));
  const fee_xaf = Math.ceil(safeBase * PROCESSING_FEE_RATE);
  return {
    base_xaf: safeBase,
    fee_xaf,
    total_xaf: safeBase + fee_xaf,
  };
}

export function formatXaf(amount: number): string {
  const rounded = Math.round(amount);
  return `${rounded.toLocaleString('en-US')} XAF`;
}

export function formatDurationSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
