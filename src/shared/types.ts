export type UserRole = 'user' | 'admin';

export type LengthTier = 30 | 60 | 90;

export type StyleDifficulty = 'easy' | 'medium' | 'hard';

export type VoiceTier = 'standard' | 'premium';

export type CaptionPreset = 'bold_pop' | 'minimal' | 'karaoke' | 'cinematic';

export type MotionPreset =
  | 'slow_zoom_in'
  | 'slow_zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'pan_up'
  | 'pan_down'
  | 'push_in'
  | 'handheld_float'
  | 'shake_subtle';

export type TransitionPreset =
  | 'crossfade'
  | 'dip_to_black'
  | 'slide'
  | 'whip_pan'
  | 'light_leak'
  | 'glitch_cut';

export type PaymentMethod = 'mtn_momo' | 'orange_money';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

export type ProjectStatus = 'draft' | 'creating' | 'ready' | 'failed';

export interface PriceTableItem {
  key: string;
  label: string;
  credits_value: number;
  unit: string;
  active: boolean;
  notes: string;
}

export interface Plan {
  id: string;
  code: 'free' | 'starter' | 'creator' | 'pro' | 'topup';
  name: string;
  price_xaf: number;
  credits: number;
  active: boolean;
  sort: number;
}

export interface Language {
  code: string;
  name: string;
  native_name: string;
  premium_voice_supported: boolean;
  standard_voice_supported: boolean;
  caption_font: string;
  active: boolean;
}

export interface RecipeConfig {
  hook_styles: Array<{
    name: string;
    pattern: string;
    examples: string[];
  }>;
  structure_beats: Array<{
    name: string;
    purpose: string;
    share_pct: number;
  }>;
  pacing: {
    words_per_second: number;
    sentence_length_min: number;
    sentence_length_max: number;
    seconds_per_scene: number;
  };
  narrator: {
    persona: string;
    tone: string;
    energy_curve: string;
    pause_map: {
      after_hook_ms: number;
      after_emotional_line_ms: number;
      before_reveal_ms: number;
      final_beat_ms: number;
    };
  };
  voice_tags: string[];
  visual_mood: {
    palette: string[];
    lighting: string;
    camera_language: string;
    symbolic_motifs: string[];
  };
  allowed_styles: string[];
  character_required: boolean;
  max_characters: number;
  music_mood: string;
  caption_style: CaptionPreset;
  motion_defaults: MotionPreset[];
  ending_types: string[];
  forbidden: string[];
  length_defaults: LengthTier;
}

export interface Niche {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort: number;
  active: boolean;
  sub_niches?: SubNiche[];
}

export interface SubNiche {
  id: string;
  niche_id: string;
  slug: string;
  name: string;
  description: string;
  active: boolean;
  recipe?: RecipeConfig;
}

export interface StyleItem {
  id: string;
  slug: string;
  name: string;
  difficulty: StyleDifficulty;
  style_card: string;
  cover_asset_url: string;
  image_cost_multiplier: number;
  consistency_pass_rate: number;
  active: boolean;
}

export interface CharacterItem {
  id: string;
  user_id: string | null;
  name: string;
  style_id: string;
  age_range: string;
  gender: string;
  hair: string;
  outfit: string;
  mood: string;
  signature_item: string;
  description_card: string;
  master_asset_url: string;
  is_preset: boolean;
  created_at: string;
}

export interface VoiceItem {
  id: string;
  provider_voice_id: string;
  name: string;
  language: string;
  gender: 'female' | 'male';
  tone_tags: string[];
  tier: VoiceTier;
  prebuilt_gemini_voice: string;
  description: string;
  active: boolean;
}

export interface MusicTrack {
  id: string;
  title: string;
  mood_tags: string[];
  niche_tags: string[];
  duration_s: number;
  bpm: number;
  source: 'library' | 'user';
  user_id: string | null;
  audio_url: string;
  license_note: string;
  active: boolean;
}

export interface SceneItem {
  id: string;
  project_id: string;
  idx: number;
  narration_text: string;
  delivery_tags: string[];
  pause_after_ms: number;
  image_prompt: string;
  image_url: string;
  motion_preset: MotionPreset;
  transition_preset: TransitionPreset;
  on_screen_text: string;
  audio_url: string | null;
  duration_ms: number;
  status: 'pending' | 'ready' | 'failed';
  noise_intensity?: number;
  noise_atmosphere?: number;
  noise_opacity?: number;
  shake_intensity?: number;
}

export interface ProjectItem {
  id: string;
  user_id: string;
  title: string;
  niche_id: string;
  sub_niche_id: string;
  niche_name?: string;
  sub_niche_name?: string;
  recipe_version: number;
  reel_language: string;
  topic: string;
  style_id: string;
  style_name?: string;
  character_id: string | null;
  character_name?: string | null;
  voice_id: string;
  voice_name?: string;
  voice_speed: number;
  music_track_id: string | null;
  music_title?: string | null;
  caption_preset: CaptionPreset;
  length_tier: LengthTier;
  status: ProjectStatus;
  credits_quoted: number;
  credits_final: number;
  thumbnail_url: string;
  is_free_watermarked: boolean;
  created_at: string;
  updated_at: string;
  scenes?: SceneItem[];
  job?: JobItem | null;
}

export interface JobEvent {
  id: string;
  job_id: string;
  step: string;
  message_key: string;
  status: 'running' | 'completed' | 'failed';
  created_at: string;
}

export interface JobItem {
  id: string;
  project_id: string;
  kind: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  current_step: string;
  message_key: string;
  progress_pct: number;
  error_key: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  events?: JobEvent[];
}

export interface CreditBalance {
  total: number;
  plan_credits: number;
  topup_credits: number;
  free_credits: number;
  plan_expires_at: string | null;
  topup_expires_at: string | null;
  active_plan_code: string | null;
  active_plan_name: string | null;
  renewal_due_soon: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  default_reel_language: string;
  phone: string | null;
  phone_verified: boolean;
  free_credits_granted: boolean;
  country: string;
  onboarding_completed: boolean;
  interested_niches: string[];
  suspended: boolean;
  created_at: string;
}

export interface CreditQuote {
  script: number;
  images: number;
  voice: number;
  export: number;
  captions: number;
  music: number;
  total: number;
  scene_count: number;
}
