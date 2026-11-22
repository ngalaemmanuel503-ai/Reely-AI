import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CreditBalance, RecipeConfig } from '../src/shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const GENERATED_DIR = path.resolve(DATA_DIR, 'generated');
if (!fs.existsSync(GENERATED_DIR)) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
}

const DB_PATH = path.resolve(DATA_DIR, 'reely.db');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      default_reel_language TEXT NOT NULL DEFAULT 'en',
      phone TEXT,
      phone_verified INTEGER NOT NULL DEFAULT 0,
      free_credits_granted INTEGER NOT NULL DEFAULT 0,
      country TEXT NOT NULL DEFAULT 'CM',
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      interested_niches_json TEXT NOT NULL DEFAULT '[]',
      suspended INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS phone_otps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS languages (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      native_name TEXT NOT NULL,
      premium_voice_supported INTEGER NOT NULL DEFAULT 1,
      standard_voice_supported INTEGER NOT NULL DEFAULT 1,
      caption_font TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      price_xaf INTEGER NOT NULL,
      credits INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL,
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS credit_lots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      amount INTEGER NOT NULL,
      remaining INTEGER NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      project_id TEXT,
      job_id TEXT,
      balance_after INTEGER NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_ref TEXT,
      method TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      amount_base_xaf INTEGER NOT NULL,
      fee_xaf INTEGER NOT NULL,
      total_xaf INTEGER NOT NULL,
      status TEXT NOT NULL,
      purpose TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      raw_payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS price_table (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      credits_value REAL NOT NULL,
      unit TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS niches (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sub_niches (
      id TEXT PRIMARY KEY,
      niche_id TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (niche_id) REFERENCES niches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      sub_niche_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (sub_niche_id) REFERENCES sub_niches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS styles (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      style_card TEXT NOT NULL,
      cover_asset_url TEXT NOT NULL,
      image_cost_multiplier REAL NOT NULL DEFAULT 1.0,
      consistency_pass_rate INTEGER NOT NULL DEFAULT 90,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      style_id TEXT NOT NULL,
      age_range TEXT NOT NULL,
      gender TEXT NOT NULL,
      hair TEXT NOT NULL,
      outfit TEXT NOT NULL,
      mood TEXT NOT NULL,
      signature_item TEXT NOT NULL,
      description_card TEXT NOT NULL,
      master_asset_url TEXT NOT NULL,
      is_preset INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voices (
      id TEXT PRIMARY KEY,
      provider_voice_id TEXT NOT NULL,
      name TEXT NOT NULL,
      language TEXT NOT NULL,
      gender TEXT NOT NULL,
      tone_tags_json TEXT NOT NULL,
      tier TEXT NOT NULL,
      prebuilt_gemini_voice TEXT NOT NULL,
      description TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS music_tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      mood_tags_json TEXT NOT NULL,
      niche_tags_json TEXT NOT NULL,
      duration_s INTEGER NOT NULL,
      bpm INTEGER NOT NULL,
      source TEXT NOT NULL,
      user_id TEXT,
      audio_url TEXT NOT NULL,
      license_note TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      url TEXT NOT NULL,
      rights_confirmed INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      niche_id TEXT NOT NULL,
      sub_niche_id TEXT NOT NULL,
      recipe_version INTEGER NOT NULL DEFAULT 1,
      reel_language TEXT NOT NULL DEFAULT 'en',
      topic TEXT NOT NULL,
      style_id TEXT NOT NULL,
      character_id TEXT,
      voice_id TEXT NOT NULL,
      voice_speed REAL NOT NULL DEFAULT 1.0,
      music_track_id TEXT,
      caption_preset TEXT NOT NULL DEFAULT 'bold_pop',
      length_tier INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'creating',
      credits_quoted INTEGER NOT NULL DEFAULT 0,
      credits_final INTEGER NOT NULL DEFAULT 0,
      thumbnail_url TEXT NOT NULL DEFAULT '',
      is_free_watermarked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      narration_text TEXT NOT NULL,
      delivery_tags_json TEXT NOT NULL DEFAULT '[]',
      pause_after_ms INTEGER NOT NULL DEFAULT 400,
      image_prompt TEXT NOT NULL,
      image_url TEXT NOT NULL,
      motion_preset TEXT NOT NULL,
      transition_preset TEXT NOT NULL,
      on_screen_text TEXT NOT NULL DEFAULT '',
      audio_url TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 3500,
      noise_intensity INTEGER NOT NULL DEFAULT 35,
      noise_atmosphere INTEGER NOT NULL DEFAULT 45,
      noise_opacity INTEGER NOT NULL DEFAULT 38,
      shake_intensity INTEGER NOT NULL DEFAULT 35,
      status TEXT NOT NULL DEFAULT 'ready',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'generate_reel',
      status TEXT NOT NULL,
      current_step TEXT NOT NULL,
      message_key TEXT NOT NULL,
      progress_pct INTEGER NOT NULL DEFAULT 0,
      error_key TEXT,
      attempts INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS job_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      step TEXT NOT NULL,
      message_key TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS generation_costs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      step TEXT NOT NULL,
      units REAL NOT NULL,
      cost_usd REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS showcase_reels (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      niche_label TEXT NOT NULL,
      style_label TEXT NOT NULL,
      language_label TEXT NOT NULL,
      duration_s INTEGER NOT NULL,
      cover_url TEXT NOT NULL,
      hook_line TEXT NOT NULL,
      captions_json TEXT NOT NULL
    );
  `);

  // Safe column migration for existing SQLite databases
  const sceneCols = db.prepare('PRAGMA table_info(scenes)').all() as Array<{ name: string }>;
  const colNames = new Set(sceneCols.map((c) => c.name));
  if (!colNames.has('noise_intensity')) {
    db.exec('ALTER TABLE scenes ADD COLUMN noise_intensity INTEGER NOT NULL DEFAULT 35');
  }
  if (!colNames.has('noise_atmosphere')) {
    db.exec('ALTER TABLE scenes ADD COLUMN noise_atmosphere INTEGER NOT NULL DEFAULT 45');
  }
  if (!colNames.has('noise_opacity')) {
    db.exec('ALTER TABLE scenes ADD COLUMN noise_opacity INTEGER NOT NULL DEFAULT 38');
  }
  if (!colNames.has('shake_intensity')) {
    db.exec('ALTER TABLE scenes ADD COLUMN shake_intensity INTEGER NOT NULL DEFAULT 35');
  }

  seedInitialData();

  // Seed Psychology Demo Reel for any existing users who have 0 projects
  const users = db.prepare('SELECT id FROM users').all() as Array<{ id: string }>;
  for (const u of users) {
    ensureDemoPsychologyProjectForUser(u.id);
  }
}

function seedInitialData() {
  const now = new Date().toISOString();

  // Languages
  const langCount = (db.prepare('SELECT COUNT(*) as c FROM languages').get() as { c: number }).c;
  if (langCount === 0) {
    const insertLang = db.prepare(`
      INSERT INTO languages (code, name, native_name, premium_voice_supported, standard_voice_supported, caption_font, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    const langs = [
      ['en', 'English', 'English', 1, 1, 'Plus Jakarta Sans'],
      ['fr', 'French', 'Français', 1, 1, 'Plus Jakarta Sans'],
      ['es', 'Spanish', 'Español', 1, 1, 'Plus Jakarta Sans'],
      ['it', 'Italian', 'Italiano', 1, 1, 'Plus Jakarta Sans'],
      ['de', 'German', 'Deutsch', 1, 1, 'Plus Jakarta Sans'],
      ['pt', 'Portuguese', 'Português', 1, 1, 'Plus Jakarta Sans'],
    ];
    for (const l of langs) insertLang.run(...l);
  }

  // Plans
  const planCount = (db.prepare('SELECT COUNT(*) as c FROM plans').get() as { c: number }).c;
  if (planCount === 0) {
    const insertPlan = db.prepare(`
      INSERT INTO plans (id, code, name, price_xaf, credits, active, sort)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    insertPlan.run('plan_free', 'free', 'Free Starter', 0, 120, 1);
    insertPlan.run('plan_starter', 'starter', 'Starter', 3500, 1000, 2);
    insertPlan.run('plan_creator', 'creator', 'Creator', 9000, 2700, 3);
    insertPlan.run('plan_pro', 'pro', 'Pro', 20000, 6300, 4);
    insertPlan.run('plan_topup', 'topup', 'Top-up Pack', 4000, 1000, 5);
  }

  // Price table
  const priceCount = (db.prepare('SELECT COUNT(*) as c FROM price_table').get() as { c: number }).c;
  if (priceCount === 0) {
    const insertPrice = db.prepare(`
      INSERT INTO price_table (key, label, credits_value, unit, active, notes, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);
    const items: Array<[string, string, number, string, string, string]> = [
      ['script_flat', 'Script and retention edit', 20, 'per reel', 'Flat cost for hook + script + editor + split', now],
      ['image_standard', 'Standard scene visual', 15, 'per scene', 'Multiplied by style difficulty multiplier', now],
      ['image_character', 'Character-consistent visual', 30, 'per scene', 'Multiplied by style difficulty multiplier', now],
      ['voice_premium_per_sec', 'Premium narrator voice', 1.2, 'per second', 'Expressive delivery with audio tags', now],
      ['voice_standard_per_sec', 'Standard narrator voice', 0.3, 'per second', 'Fast natural narration', now],
      ['export_per_30s_block', 'Vertical 1080x1920 export', 10, 'per 30s block', 'Rounded up to 30-second blocks', now],
      ['captions_flat', 'Animated captions', 0, 'per reel', 'Included at no extra charge', now],
      ['music_library_flat', 'Library background music', 0, 'per reel', 'Included at no extra charge', now],
    ];
    for (const [k, label, val, unit, notes, ts] of items) {
      insertPrice.run(k, label, val, unit, notes, ts);
    }
  }

  // App settings
  const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM app_settings').get() as { c: number }).c;
  if (settingsCount === 0) {
    const insertSetting = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)');
    insertSetting.run('daily_cost_alert_usd', '25');
    insertSetting.run('free_grant_amount', '120');
    insertSetting.run('topup_expiry_days', '90');
    insertSetting.run('whatsapp_support_url', process.env.WHATSAPP_SUPPORT_URL || 'https://wa.me/237600000000');
    insertSetting.run('admin_passcode_hash', '');
  }

  // Niches, Sub-Niches & Recipes (Part B3)
  const nicheCount = (db.prepare('SELECT COUNT(*) as c FROM niches').get() as { c: number }).c;
  const subNicheCount = (db.prepare('SELECT COUNT(*) as c FROM sub_niches').get() as { c: number }).c;
  const recipeCount = (db.prepare('SELECT COUNT(*) as c FROM recipes').get() as { c: number }).c;
  if (nicheCount === 0 || subNicheCount === 0 || recipeCount === 0) {
    const seedNichesAndRecipes = db.transaction(() => {
    const insertNiche = db.prepare('INSERT OR IGNORE INTO niches (id, slug, name, description, sort, active) VALUES (?, ?, ?, ?, ?, 1)');
    const insertSub = db.prepare('INSERT OR IGNORE INTO sub_niches (id, niche_id, slug, name, description, active) VALUES (?, ?, ?, ?, ?, ?)');
    const insertRecipe = db.prepare('INSERT OR IGNORE INTO recipes (id, sub_niche_id, version, config_json, active, updated_at) VALUES (?, ?, 1, ?, 1, ?)');

    insertNiche.run('niche_psych', 'psychology-mind', 'Psychology & Mind', 'High-retention reflections on discipline, feelings, and human behavior.', 1);
    insertNiche.run('niche_stoic', 'stoic-quotes', 'Stoic & Motivational', 'Timeless philosophy and sharp modern takeaways.', 2);
    insertNiche.run('niche_horror', 'horror-mystery', 'Horror & Mystery', 'Slow-burn suspense stories with recurring characters and atmospheric silence.', 3);
    insertNiche.run('niche_animated', 'short-animated', 'Short Animated Stories', 'Crisis-first character narratives built for emotional twists.', 4);
    insertNiche.run('niche_faith', 'bible-verses', 'Bible Stories & Verses', 'Reverent scripture storytelling and grounded modern reflections.', 5);

    const makeRecipe = (r: RecipeConfig) => JSON.stringify(r);

    // 1. Motivation and quotes
    insertSub.run('sub_motivation', 'niche_psych', 'motivation-quotes', 'Motivation & Discipline', 'Firm truths, reframes, and momentum-building stories.', 1);
    insertRecipe.run('rec_motivation', 'sub_motivation', makeRecipe({
      hook_styles: [
        { name: 'Hard truth', pattern: 'Direct reality check under 10 words', examples: ['Nobody is coming to save your year.', 'Comfort is quietly costing you your sharpest years.'] },
        { name: 'Reframe', pattern: 'Flip a familiar belief on its head', examples: ['You are not tired, you are unchallenged.', 'Discipline is not punishment, it is self-respect.'] },
      ],
      structure_beats: [
        { name: 'Hook', purpose: 'Stop the scroll with an undeniable line', share_pct: 12 },
        { name: 'Truth', purpose: 'State the uncomfortable pattern clearly', share_pct: 20 },
        { name: 'Example', purpose: 'Show a concrete everyday moment', share_pct: 24 },
        { name: 'Turn', purpose: 'Shift perspective toward agency', share_pct: 22 },
        { name: 'Action & Loop', purpose: 'One clear move echoing the opening hook', share_pct: 22 },
      ],
      pacing: { words_per_second: 2.5, sentence_length_min: 5, sentence_length_max: 12, seconds_per_scene: 3.2 },
      narrator: {
        persona: 'Calm, firm mentor',
        tone: 'Firm rising energy, crisp articulation, zero hype fluff',
        energy_curve: 'steady_to_strong',
        pause_map: { after_hook_ms: 450, after_emotional_line_ms: 500, before_reveal_ms: 600, final_beat_ms: 500 },
      },
      voice_tags: ['[firmly]', '[calmly]', '[emphatically]'],
      visual_mood: {
        palette: ['#1C1917', '#FF6A1A', '#F59E0B', '#334155'],
        lighting: 'Golden dawn rim light against deep urban shadows',
        camera_language: 'Wide rooftops, lonely staircases, morning rain on glass',
        symbolic_motifs: ['lone figure at dawn', 'rain-slicked city street', 'ascending stone stairs'],
      },
      allowed_styles: ['cinematic_realistic', '3d_animated', 'japanese_anime', 'stickman'],
      character_required: false,
      max_characters: 1,
      music_mood: 'building cinematic',
      caption_style: 'bold_pop',
      motion_defaults: ['slow_zoom_in', 'push_in', 'pan_up'],
      ending_types: ['loop-back', 'action-challenge'],
      forbidden: ['cliché hustle jargon', 'medical claims', 'greetings like hey guys'],
      length_defaults: 60,
    }), now);

    // 2. Emotional storytelling
    insertSub.run('sub_emotional', 'niche_psych', 'emotional-storytelling', 'Emotional Storytelling', 'Intimate moments, quiet realizations, and warm close.', 1);
    insertRecipe.run('rec_emotional', 'sub_emotional', makeRecipe({
      hook_styles: [
        { name: 'In the middle of a feeling', pattern: 'Begin inside a quiet specific scene', examples: ['You still keep their message thread pinned at the top.', 'The house only feels loud after everyone leaves.'] },
      ],
      structure_beats: [
        { name: 'Moment', purpose: 'Drop straight into the emotional scene', share_pct: 15 },
        { name: 'Backstory', purpose: 'Two concrete lines explaining how we got here', share_pct: 25 },
        { name: 'Turning point', purpose: 'The small detail that changed everything', share_pct: 25 },
        { name: 'Quiet realization', purpose: 'Name the hidden truth gently', share_pct: 20 },
        { name: 'Gentle close', purpose: 'Warm loop back to the opening image', share_pct: 15 },
      ],
      pacing: { words_per_second: 2.2, sentence_length_min: 6, sentence_length_max: 12, seconds_per_scene: 3.5 },
      narrator: {
        persona: 'Close trusted friend',
        tone: 'Warm, intimate, unhurried',
        energy_curve: 'soft_reflective',
        pause_map: { after_hook_ms: 600, after_emotional_line_ms: 900, before_reveal_ms: 800, final_beat_ms: 700 },
      },
      voice_tags: ['[softly]', '[warmly]', '[sighs]'],
      visual_mood: {
        palette: ['#292524', '#D97706', '#FDE68A', '#57534E'],
        lighting: 'Soft twilight window glow and warm interior lamps',
        camera_language: 'Intimate close framing, shallow focus, gentle stillness',
        symbolic_motifs: ['rain on windowpane', 'two tea cups on wooden table', 'warm hallway doorway'],
      },
      allowed_styles: ['cinematic_realistic', 'japanese_anime', 'flat_illustration', '3d_animated'],
      character_required: false,
      max_characters: 2,
      music_mood: 'warm piano',
      caption_style: 'cinematic',
      motion_defaults: ['slow_zoom_in', 'handheld_float', 'slow_zoom_out'],
      ending_types: ['loop-back', 'save'],
      forbidden: ['melodrama clichés', 'medical diagnosis'],
      length_defaults: 60,
    }), now);

    // 3. Human relationships
    insertSub.run('sub_relationships', 'niche_psych', 'human-relationships', 'Human Relationships', 'Honest patterns in trust, boundaries, and connection.', 1);
    insertRecipe.run('rec_relationships', 'sub_relationships', makeRecipe({
      hook_styles: [
        { name: 'Signs and patterns', pattern: 'Point out a specific unspoken behavior', examples: ['If they only call when things fall apart, watch closely.', 'Notice who claps quietly when you win.'] },
        { name: 'Direct question', pattern: 'Short relatable question', examples: ['Why do we confuse intensity with care?'] },
      ],
      structure_beats: [
        { name: 'Hook', purpose: 'Name the recognizable pattern', share_pct: 15 },
        { name: 'Three signs', purpose: 'Three crisp everyday clues', share_pct: 35 },
        { name: 'Why it happens', purpose: 'Explain the human motive simply', share_pct: 25 },
        { name: 'What to do', purpose: 'Clear practical boundary or close', share_pct: 25 },
      ],
      pacing: { words_per_second: 2.4, sentence_length_min: 6, sentence_length_max: 12, seconds_per_scene: 3.0 },
      narrator: {
        persona: 'Honest observant friend',
        tone: 'Conversational, grounded, clear',
        energy_curve: 'conversational_clear',
        pause_map: { after_hook_ms: 500, after_emotional_line_ms: 700, before_reveal_ms: 600, final_beat_ms: 500 },
      },
      voice_tags: ['[calmly]', '[gently]', '[emphatically]'],
      visual_mood: {
        palette: ['#1E293B', '#EA580C', '#E2E8F0', '#94A3B8'],
        lighting: 'Warm café tungsten against cool evening streets',
        camera_language: 'Symbolic two-object compositions, eye-level framing',
        symbolic_motifs: ['empty chair across café table', 'phone screen face down', 'two paths diverging in park'],
      },
      allowed_styles: ['flat_illustration', 'cinematic_realistic', 'comic_book', 'stickman'],
      character_required: false,
      max_characters: 2,
      music_mood: 'minimal ambient',
      caption_style: 'minimal',
      motion_defaults: ['pan_left', 'pan_right', 'slow_zoom_in'],
      ending_types: ['share', 'question'],
      forbidden: ['therapy diagnoses', 'gender generalizations'],
      length_defaults: 60,
    }), now);

    // 4. Loneliness & inner life
    insertSub.run('sub_loneliness', 'niche_psych', 'loneliness-inner-life', 'Loneliness & Inner Life', 'Quiet reflections on solitude and steadying the mind.', 1);
    insertRecipe.run('rec_loneliness', 'sub_loneliness', makeRecipe({
      hook_styles: [
        { name: 'Quiet you statement', pattern: 'Second-person observation of inner solitude', examples: ['There is a kind of silence you feel in a full room.', 'Some evenings feel heavier before you even know why.'] },
      ],
      structure_beats: [
        { name: 'Name the feeling', purpose: 'Acknowledge the quiet feeling without judgment', share_pct: 20 },
        { name: 'Show it', purpose: 'Concrete sensory scene', share_pct: 25 },
        { name: 'Explain gently', purpose: 'Normalize solitude as a signal, not a flaw', share_pct: 25 },
        { name: 'One small step', purpose: 'One grounded, caring action toward connection', share_pct: 30 },
      ],
      pacing: { words_per_second: 2.0, sentence_length_min: 5, sentence_length_max: 11, seconds_per_scene: 3.6 },
      narrator: {
        persona: 'Gentle reassuring voice',
        tone: 'Soft, slow, unhurried',
        energy_curve: 'quiet_warm',
        pause_map: { after_hook_ms: 700, after_emotional_line_ms: 1000, before_reveal_ms: 800, final_beat_ms: 800 },
      },
      voice_tags: ['[softly]', '[gently]'],
      visual_mood: {
        palette: ['#0F172A', '#3B82F6', '#CBD5E1', '#F59E0B'],
        lighting: 'Blue twilight with a single warm interior glow',
        camera_language: 'Still architectural spaces, windows, rain, dusk',
        symbolic_motifs: ['quiet sunlit window', 'steaming mug by rainy glass', 'lantern on porch'],
      },
      allowed_styles: ['japanese_anime', 'flat_illustration', 'cinematic_realistic'],
      character_required: false,
      max_characters: 0,
      music_mood: 'soft piano ambient',
      caption_style: 'cinematic',
      motion_defaults: ['slow_zoom_in', 'slow_zoom_out'],
      ending_types: ['save', 'loop-back'],
      forbidden: ['medical claims', 'diagnosis', 'self-harm', 'suicide', 'hopelessness'],
      length_defaults: 60,
    }), now);

    // 5. Stoic & Motivational Quotes
    insertSub.run('sub_stoic_wisdom', 'niche_stoic', 'stoic-wisdom', 'Stoic Philosophy', 'Public-domain wisdom translated into everyday strength.', 1);
    insertRecipe.run('rec_stoic', 'sub_stoic_wisdom', makeRecipe({
      hook_styles: [
        { name: 'Modern twist on ancient quote', pattern: 'Open with a sharp quote or paradox', examples: ['We suffer more in imagination than in reality.', 'You control the effort, never the applause.'] },
      ],
      structure_beats: [
        { name: 'Quote', purpose: 'Deliver a crisp public-domain quote or paraphrase', share_pct: 18 },
        { name: 'Meaning', purpose: 'Unpack what it truly means today', share_pct: 25 },
        { name: 'Everyday example', purpose: 'Place it in modern work or life', share_pct: 32 },
        { name: 'One action', purpose: 'Leave one durable habit', share_pct: 25 },
      ],
      pacing: { words_per_second: 2.3, sentence_length_min: 5, sentence_length_max: 12, seconds_per_scene: 3.3 },
      narrator: {
        persona: 'Measured philosopher',
        tone: 'Steady, resonant, unshakeable',
        energy_curve: 'grounded_authoritative',
        pause_map: { after_hook_ms: 600, after_emotional_line_ms: 650, before_reveal_ms: 700, final_beat_ms: 600 },
      },
      voice_tags: ['[calmly]', '[firmly]'],
      visual_mood: {
        palette: ['#1C1917', '#D6D3D1', '#B45309', '#78716C'],
        lighting: 'Warm dusk sunbeams through stone colonnades',
        camera_language: 'Classical marble statues, desert dusk, quiet courtyards',
        symbolic_motifs: ['marble sculpture in sunbeam', 'ancient stone archway', 'hourglass on stone'],
      },
      allowed_styles: ['cinematic_realistic', 'chinese_animation', '3d_animated'],
      character_required: false,
      max_characters: 1,
      music_mood: 'epic strings calm',
      caption_style: 'minimal',
      motion_defaults: ['slow_zoom_in', 'pan_up', 'slow_zoom_out'],
      ending_types: ['save', 'loop-back'],
      forbidden: ['invented quotes', 'fake attributions'],
      length_defaults: 60,
    }), now);

    // 6. Horror & Mystery Stories
    insertSub.run('sub_horror', 'niche_horror', 'midnight-mystery', 'Midnight Mystery', 'Atmospheric suspense with a recurring character and late twist.', 1);
    insertRecipe.run('rec_horror', 'sub_horror', makeRecipe({
      hook_styles: [
        { name: 'Middle of something wrong', pattern: 'Start at the unsettling detail', examples: ['The footsteps upstairs stopped the second I locked my door.', 'My father left one rule: never answer the back gate after midnight.'] },
      ],
      structure_beats: [
        { name: 'Cold open', purpose: 'Drop straight into the anomaly', share_pct: 12 },
        { name: 'Normal world', purpose: 'Establish the quiet setting briefly', share_pct: 15 },
        { name: 'First wrong detail', purpose: 'Small sensory clue', share_pct: 18 },
        { name: 'Escalation', purpose: 'Tension climbs twice', share_pct: 25 },
        { name: 'Silence & Reveal', purpose: 'Pause then deliver the final sting', share_pct: 30 },
      ],
      pacing: { words_per_second: 2.1, sentence_length_min: 4, sentence_length_max: 11, seconds_per_scene: 3.2 },
      narrator: {
        persona: 'Hushed storyteller',
        tone: 'Low whisper settling into eerie calm',
        energy_curve: 'tense_whisper',
        pause_map: { after_hook_ms: 700, after_emotional_line_ms: 800, before_reveal_ms: 1200, final_beat_ms: 900 },
      },
      voice_tags: ['[whispers]', '[softly]', '[tense]'],
      visual_mood: {
        palette: ['#09090B', '#27272A', '#D97706', '#52525B'],
        lighting: 'Low-key lantern glow, thick fog, deep silhouettes',
        camera_language: 'Long narrow corridors, dutch angles, mist',
        symbolic_motifs: ['flickering lantern', 'foggy forest path', 'ajar wooden door'],
      },
      allowed_styles: ['cinematic_realistic', 'comic_book', 'japanese_anime', '3d_animated'],
      character_required: true,
      max_characters: 2,
      music_mood: 'low suspense drone',
      caption_style: 'bold_pop',
      motion_defaults: ['push_in', 'handheld_float', 'shake_subtle'],
      ending_types: ['twist-sting', 'loop-back'],
      forbidden: ['graphic gore', 'sexual content', 'real people', 'harm to children'],
      length_defaults: 60,
    }), now);

    // 7. Short Animated Stories
    insertSub.run('sub_animated', 'niche_animated', 'character-fables', 'Character Fables', 'Crisis-first animated storytelling with heart and a memorable twist.', 1);
    insertRecipe.run('rec_animated', 'sub_animated', makeRecipe({
      hook_styles: [
        { name: 'Crisis flash', pattern: 'Start at the dramatic climax, then rewind', examples: ['She held the last train ticket while the clock hit zero.', 'Everyone laughed at his broken bicycle until the flood arrived.'] },
      ],
      structure_beats: [
        { name: 'Crisis flash', purpose: 'High-stakes opening image', share_pct: 12 },
        { name: 'Setup & Goal', purpose: 'Who our character is and what they need', share_pct: 22 },
        { name: 'Two obstacles', purpose: 'Two escalating setbacks', share_pct: 32 },
        { name: 'Twist & Moral', purpose: 'Unexpected resolution echoing the start', share_pct: 34 },
      ],
      pacing: { words_per_second: 2.5, sentence_length_min: 5, sentence_length_max: 12, seconds_per_scene: 2.9 },
      narrator: {
        persona: 'Expressive fable narrator',
        tone: 'Warm, vivid, dynamic emotion',
        energy_curve: 'dramatic_arc',
        pause_map: { after_hook_ms: 500, after_emotional_line_ms: 700, before_reveal_ms: 750, final_beat_ms: 550 },
      },
      voice_tags: ['[warmly]', '[excited]', '[softly]'],
      visual_mood: {
        palette: ['#FFF4EC', '#FF6A1A', '#1E293B', '#0D9488'],
        lighting: 'Expressive animated cinema lighting',
        camera_language: 'Dynamic character framing, close reactions, wide payoffs',
        symbolic_motifs: ['character on journey', 'golden sunset bridge', 'workshop lantern'],
      },
      allowed_styles: ['3d_animated', 'japanese_anime', 'chinese_animation', 'comic_book', 'flat_illustration'],
      character_required: true,
      max_characters: 2,
      music_mood: 'uplifting adventure',
      caption_style: 'karaoke',
      motion_defaults: ['pan_right', 'push_in', 'slow_zoom_out'],
      ending_types: ['moral-echo', 'share'],
      forbidden: ['real politicians', 'copyrighted superheroes'],
      length_defaults: 60,
    }), now);

    // 8. Bible Stories & Verses
    insertSub.run('sub_bible', 'niche_faith', 'scripture-reflections', 'Scripture & Reflections', 'Faithful biblical events paired with respectful modern reflection.', 1);
    insertRecipe.run('rec_bible', 'sub_bible', makeRecipe({
      hook_styles: [
        { name: 'Surprising detail from the text', pattern: 'Highlight an overlooked biblical moment', examples: ['Before David faced Goliath, he quietly chose five smooth stones.', 'In the middle of the storm, the boat was still moving forward.'] },
      ],
      structure_beats: [
        { name: 'Setting', purpose: 'Anchor the true biblical scene', share_pct: 18 },
        { name: 'Event & Turning point', purpose: 'Retell faithfully without inventing quotes', share_pct: 37 },
        { name: 'Modern reflection', purpose: 'Clearly labeled reflection for daily life', share_pct: 30 },
        { name: 'Closing blessing', purpose: 'Peaceful closing line', share_pct: 15 },
      ],
      pacing: { words_per_second: 2.2, sentence_length_min: 6, sentence_length_max: 12, seconds_per_scene: 3.4 },
      narrator: {
        persona: 'Reverent warm storyteller',
        tone: 'Reverent, steady, warm',
        energy_curve: 'steady_uplifting',
        pause_map: { after_hook_ms: 600, after_emotional_line_ms: 800, before_reveal_ms: 700, final_beat_ms: 700 },
      },
      voice_tags: ['[warmly]', '[calmly]'],
      visual_mood: {
        palette: ['#FEF3C7', '#B45309', '#1C1917', '#78350F'],
        lighting: 'Warm golden oil-lamp and desert sunrise illumination',
        camera_language: 'Painterly wide landscapes, calm dramatic skies',
        symbolic_motifs: ['golden hills at dawn', 'open parchment scroll', 'calm sea at sunrise'],
      },
      allowed_styles: ['cinematic_realistic', 'chinese_animation', '3d_animated'],
      character_required: false,
      max_characters: 1,
      music_mood: 'reverent acoustic',
      caption_style: 'cinematic',
      motion_defaults: ['slow_zoom_in', 'pan_up'],
      ending_types: ['blessing', 'save'],
      forbidden: ['invented scripture quotes', 'mocking any faith'],
      length_defaults: 60,
    }), now);
    });
    seedNichesAndRecipes();
  }

  // Styles (Part B5) - idempotent upsert/seed so new styles & stickman artwork apply to existing DBs
  const insertStyle = db.prepare(`
    INSERT OR IGNORE INTO styles (id, slug, name, difficulty, style_card, cover_asset_url, image_cost_multiplier, consistency_pass_rate, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const stylesData: Array<[string, string, string, string, string, string, number, number]> = [
    ['style_stickman', 'stickman', 'Stickman Animation', 'easy', 'Iconic 2D stickman animation film frame, clean crisp white round head and expressive black-ink stick body, flowing warm amber scarf, kinetic motion lines, moody minimalist storytelling backdrop.', '/src/assets/images/stickman_anime_style_1795355967506.jpg', 1.0, 96],
    ['style_flat', 'flat_illustration', 'Flat Editorial', 'easy', 'Modern editorial flat vector illustration, warm terracotta and slate palette, clean geometric shapes, subtle grain texture, uncluttered composition.', '/src/assets/images/reel_sample_stoic_1795353526542.jpg', 1.0, 94],
    ['style_comic', 'comic_book', 'Graphic Comic', 'medium', 'Bold graphic novel illustration, crisp ink hatching, dramatic chiaroscuro lighting, rich amber and charcoal tones, cinematic panel framing.', '/src/assets/images/reel_sample_horror_1795353526303.jpg', 1.0, 91],
    ['style_anime', 'japanese_anime', 'Japanese Anime', 'medium', 'Japanese anime film still, clean line art, soft cel shading, expressive eyes, painted skies, warm cinematic lighting, shallow depth of field.', '/src/assets/images/reel_sample_anime_1795353526457.jpg', 1.0, 92],
    ['style_ghibli', 'ghibli_anime', 'Ghibli Anime', 'medium', 'Hand-painted Studio Ghibli inspired anime film still, sunlit green hillside meadows, billowing gouache clouds, soft cel shading, nostalgic warm breeze.', '/src/assets/images/ghibli_character_portrait_1795355968900.jpg', 1.0, 94],
    ['style_cyberpunk', 'cyberpunk_neon', 'Cyberpunk Neon', 'medium', 'Cyberpunk anime film still, rain-slicked futuristic megalopolis rooftop at night, glowing amber visor and neon cyan street reflections, deep sci-fi atmosphere.', '/src/assets/images/cyberpunk_character_portrait_1795355968518.jpg', 1.2, 91],
    ['style_halloween', 'halloween_dark', 'Halloween Night', 'medium', 'Dark Halloween fantasy animation, harvest moonlight through gnarled trees, carved glowing pumpkins and cursed orchard fruits, gothic fog and warm lantern ember light.', '/src/assets/images/halloween_dark_character_1795355968336.jpg', 1.1, 92],
    ['style_chinese', 'chinese_animation', 'Ink & Gold Epic', 'medium', 'Chinese animated epic, ink-wash textures with gold highlights, flowing fabric, misty mountains, dramatic wide framing, rich red and jade palette.', '/src/assets/images/reel_sample_chinese_epic_1795353526462.jpg', 1.0, 89],
    ['style_3d', '3d_animated', '3D Animated', 'medium', 'Stylized 3D animated film frame, warm subsurface scattering, soft studio rim light, expressive proportions, vibrant sunlit depth of field.', '/src/assets/images/style_preview_3d_1795353526103.jpg', 1.0, 93],
    ['style_cinematic', 'cinematic_realistic', 'Cinematic Film', 'hard', 'Cinematic 35mm documentary film still, natural golden-hour light, shallow depth of field, atmospheric haze, rich organic contrast.', '/src/assets/images/reel_sample_motivation_1795353526355.jpg', 1.5, 88],
    ['style_realistic_human', 'realistic_human', 'Realistic Portrait', 'hard', 'Photorealistic editorial cinematography, natural skin texture, Leica 35mm lens depth, soft directional window light, grounded realism.', '/src/assets/images/reel_sample_stoic_1795353526542.jpg', 1.5, 86],
  ];
  for (const s of stylesData) insertStyle.run(...s);
  db.prepare(
    `UPDATE styles SET name = ?, style_card = ?, cover_asset_url = ? WHERE id = 'style_stickman'`
  ).run(
    'Stickman Animation',
    stylesData[0][4],
    '/src/assets/images/stickman_anime_style_1795355967506.jpg'
  );

  // Preset Characters (idempotent so newly added styles & Halloween characters always appear)
  const insertChar = db.prepare(`
    INSERT OR IGNORE INTO characters (id, user_id, name, style_id, age_range, gender, hair, outfit, mood, signature_item, description_card, master_asset_url, is_preset, created_at)
    VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  insertChar.run(
    'char_amara',
    'Amara',
    'style_3d',
    '20-25',
    'Female',
    'Natural curly puffs with gold beads',
    'Warm terracotta corduroy overshirt over charcoal tee',
    'Curious and determined',
    'Round brass spectacles and spiral notebook',
    'Young African creative in her early twenties, warm brown eyes, round brass glasses, curly dark hair with small gold beads, terracotta corduroy jacket, carrying a small spiral notebook.',
    '/src/assets/images/style_preview_3d_1795353526103.jpg',
    now
  );
  insertChar.run(
    'char_kofi',
    'Kofi',
    'style_anime',
    '25-30',
    'Male',
    'Short fade with sharp line-up',
    'Olive trench coat over cream knit sweater',
    'Calm and observant',
    'Vintage silver wristwatch',
    'Young man in his late twenties, short dark fade, calm observant gaze, olive trench coat over cream knit sweater, wearing a vintage silver wristwatch.',
    '/src/assets/images/reel_sample_anime_1795353526457.jpg',
    now
  );
  insertChar.run(
    'char_lin',
    'Master Lin',
    'style_chinese',
    '35-45',
    'Male',
    'Long dark hair tied with jade pin',
    'Flowing jade and crimson silk traveler robes',
    'Stoic and serene',
    'Carved bronze ink compass',
    'Seasoned traveler in flowing jade and crimson robes, long dark hair bound with a jade pin, calm stoic expression, carrying a carved bronze compass.',
    '/src/assets/images/reel_sample_chinese_epic_1795353526462.jpg',
    now
  );
  insertChar.run(
    'char_claire',
    'Claire',
    'style_cinematic',
    '26-32',
    'Female',
    'Braided crown',
    'Camel wool coat and scarf',
    'Reflective',
    'Brass lantern',
    'Woman in her late twenties with a braided crown, camel wool coat, calm focused expression, carrying a warm brass lantern in misty light.',
    '/src/assets/images/reel_sample_horror_1795353526303.jpg',
    now
  );
  insertChar.run(
    'char_stickman_kai',
    'Kai (Stickman)',
    'style_stickman',
    'Timeless',
    'Neutral',
    'Smooth white round animated head',
    'Black ink stick silhouette with flowing amber scarf',
    'Determined and kinetic',
    'Flowing amber scarf',
    'Iconic 2D animated stickman hero with crisp round white head, bold black ink limbs, white gloves, and a flowing warm amber scarf in dynamic action stance.',
    '/src/assets/images/stickman_anime_style_1795355967506.jpg',
    now
  );
  insertChar.run(
    'char_ghibli_hana',
    'Hana (Ghibli)',
    'style_ghibli',
    '18-22',
    'Female',
    'Windswept chestnut bob with red bow ribbon',
    'Cream linen vest over sage cotton shirt and dark trousers',
    'Warm and wondrous',
    'Weathered leather sketchbook',
    'Hand-painted Ghibli-style traveler in a sunlit green hillside meadow, windswept chestnut bob with red bow, cream vest over sage shirt, holding a leather sketchbook.',
    '/src/assets/images/ghibli_character_portrait_1795355968900.jpg',
    now
  );
  insertChar.run(
    'char_cyber_nova',
    'Nova-9 (Cyberpunk)',
    'style_cyberpunk',
    '24-28',
    'Female',
    'Sleek midnight bob under hooded collar',
    'Charcoal rainproof techwear coat with amber LED trim',
    'Sharp and focused',
    'Glowing amber tactical visor',
    'Cyberpunk rooftop courier in rain-drenched neon city, glowing amber visor, high-collar charcoal techwear coat, carrying an illuminated encrypted case.',
    '/src/assets/images/cyberpunk_character_portrait_1795355968518.jpg',
    now
  );
  insertChar.run(
    'char_halloween_pipkin',
    'Pipkin (Halloween Fruit)',
    'style_halloween',
    'Ancient',
    'Neutral',
    'Carved glowing pumpkin & autumn vine crown',
    'Patched midnight cloak woven with gnarled vines and berries',
    'Eerie and mischievous',
    'Cursed crimson orchard apples & wooden staff',
    'Halloween harvest pumpkin-fruit spirit with glowing ember eyes, gnarled vine collar, tattered midnight cloak, surrounded by cursed dark crimson apples in misty October woods.',
    '/src/assets/images/halloween_fruit_character_1795355968887.jpg',
    now
  );
  insertChar.run(
    'char_halloween_vespera',
    'Vespera (Halloween Dark)',
    'style_halloween',
    'Timeless',
    'Neutral',
    'Shadowed cowl beneath pale harvest moonlight',
    'Tattered obsidian gothic velvet cloak with silver clasp',
    'Chilling and mysterious',
    'Ornate glowing amber brass lantern',
    'Dark Halloween gothic phantom standing in misty moonlit woods wearing a hooded obsidian velvet cloak with silver clasp and holding a glowing brass lantern.',
    '/src/assets/images/halloween_dark_character_1795355968336.jpg',
    now
  );

  // Voices (6 voices per language: 3 female, 3 male mapped to Gemini 3.8 TTS prebuilt voices)
  const voiceCount = (db.prepare('SELECT COUNT(*) as c FROM voices').get() as { c: number }).c;
  if (voiceCount === 0) {
    const insertVoice = db.prepare(`
      INSERT INTO voices (id, provider_voice_id, name, language, gender, tone_tags_json, tier, prebuilt_gemini_voice, description, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const langVoices: Array<[string, string, string, string, 'female' | 'male', string[], 'standard' | 'premium', string, string]> = [
      // English
      ['v_en_1', 'en_kore_prem', 'Amina (Warm Storyteller)', 'en', 'female', ['warm', 'intimate', 'clear'], 'premium', 'Kore', 'Rich, calm storyteller ideal for emotional and faith stories.'],
      ['v_en_2', 'en_zephyr_std', 'Claire (Crisp Narrator)', 'en', 'female', ['crisp', 'modern', 'steady'], 'standard', 'Zephyr', 'Clean everyday narration for psychology and quick tips.'],
      ['v_en_3', 'en_kore_soft', 'Nadia (Gentle Calm)', 'en', 'female', ['soft', 'soothing'], 'standard', 'Kore', 'Soft reflective voice for quiet late-night stories.'],
      ['v_en_4', 'en_charon_prem', 'Marcus (Deep Mentor)', 'en', 'male', ['firm', 'deep', 'cinematic'], 'premium', 'Charon', 'Authoritative baritone built for stoic and motivational hooks.'],
      ['v_en_5', 'en_fenrir_prem', 'Samuel (Midnight Mystery)', 'en', 'male', ['tense', 'hushed', 'dramatic'], 'premium', 'Fenrir', 'Low resonant cadence crafted for horror and mystery.'],
      ['v_en_6', 'en_puck_std', 'Leo (Upbeat Fable)', 'en', 'male', ['bright', 'energetic'], 'standard', 'Puck', 'Engaging energetic tone for short animated fables.'],
      // French
      ['v_fr_1', 'fr_kore_prem', 'Camille (Douce et Claire)', 'fr', 'female', ['warm', 'intimate'], 'premium', 'Kore', 'Voix chaleureuse et posée pour récits émotionnels.'],
      ['v_fr_2', 'fr_zephyr_std', 'Chloé (Moderne)', 'fr', 'female', ['crisp', 'modern'], 'standard', 'Zephyr', 'Narration fluide pour psychologie et relations.'],
      ['v_fr_3', 'fr_kore_std', 'Inès (Calme)', 'fr', 'female', ['soft', 'calm'], 'standard', 'Kore', 'Ton doux pour réflexions nocturnes.'],
      ['v_fr_4', 'fr_charon_prem', 'Olivier (Mentor Stoïque)', 'fr', 'male', ['firm', 'cinematic'], 'premium', 'Charon', 'Voix grave et assurée pour motivation et stoïcisme.'],
      ['v_fr_5', 'fr_fenrir_prem', 'Théo (Mystère)', 'fr', 'male', ['tense', 'whisper'], 'premium', 'Fenrir', 'Idéal pour suspense et mystères de minuit.'],
      ['v_fr_6', 'fr_puck_std', 'Lucas (Dynamique)', 'fr', 'male', ['bright', 'story'], 'standard', 'Puck', 'Rythme vivant pour fables animées.'],
      // Spanish
      ['v_es_1', 'es_kore_prem', 'Sofía (Narradora)', 'es', 'female', ['warm', 'clear'], 'premium', 'Kore', 'Voz cálida para historias de vida y fe.'],
      ['v_es_2', 'es_zephyr_std', 'Lucía (Clara)', 'es', 'female', ['crisp', 'modern'], 'standard', 'Zephyr', 'Narración directa y natural.'],
      ['v_es_3', 'es_kore_std', 'Elena (Serena)', 'es', 'female', ['soft', 'calm'], 'standard', 'Kore', 'Tono suave para reflexión interior.'],
      ['v_es_4', 'es_charon_prem', 'Mateo (Profundo)', 'es', 'male', ['firm', 'cinematic'], 'premium', 'Charon', 'Voz firme para disciplina y estoicismo.'],
      ['v_es_5', 'es_fenrir_prem', 'Diego (Suspenso)', 'es', 'male', ['tense', 'mystery'], 'premium', 'Fenrir', 'Ritmo pausado para misterio.'],
      ['v_es_6', 'es_puck_std', 'Carlos (Fábula)', 'es', 'male', ['bright', 'story'], 'standard', 'Puck', 'Narración ágil para relatos animados.'],
      // Italian
      ['v_it_1', 'it_kore_prem', 'Giulia (Calda)', 'it', 'female', ['warm'], 'premium', 'Kore', 'Voce espressiva per racconti emotivi.'],
      ['v_it_2', 'it_zephyr_std', 'Chiara (Chiara)', 'it', 'female', ['crisp'], 'standard', 'Zephyr', 'Narrazione moderna e limpida.'],
      ['v_it_3', 'it_kore_std', 'Sofia (Calma)', 'it', 'female', ['soft'], 'standard', 'Kore', 'Tono intimo e pacato.'],
      ['v_it_4', 'it_charon_prem', 'Lorenzo (Profondo)', 'it', 'male', ['firm'], 'premium', 'Charon', 'Voce autorevole per filosofia stoica.'],
      ['v_it_5', 'it_fenrir_prem', 'Marco (Mistero)', 'it', 'male', ['tense'], 'premium', 'Fenrir', 'Atmosfera sospesa per misteri.'],
      ['v_it_6', 'it_puck_std', 'Matteo (Vivace)', 'it', 'male', ['bright'], 'standard', 'Puck', 'Ritmo dinamico per storie brevi.'],
      // German
      ['v_de_1', 'de_kore_prem', 'Hannah (Warm)', 'de', 'female', ['warm'], 'premium', 'Kore', 'Ruhige Erzählstimme für Psychologie.'],
      ['v_de_2', 'de_zephyr_std', 'Lena (Klar)', 'de', 'female', ['crisp'], 'standard', 'Zephyr', 'Klare Stimme für Alltagsthemen.'],
      ['v_de_3', 'de_kore_std', 'Mia (Sanft)', 'de', 'female', ['soft'], 'standard', 'Kore', 'Sanfte Stimme für innere Ruhe.'],
      ['v_de_4', 'de_charon_prem', 'Lukas (Stoisch)', 'de', 'male', ['firm'], 'premium', 'Charon', 'Tiefe Stimme für Motivation.'],
      ['v_de_5', 'de_fenrir_prem', 'Jonas (Spannung)', 'de', 'male', ['tense'], 'premium', 'Fenrir', 'Dunkle Erzählung für Mystery.'],
      ['v_de_6', 'de_puck_std', 'Felix (Lebhaft)', 'de', 'male', ['bright'], 'standard', 'Puck', 'Lebhafte Erzählung für Fabeln.'],
      // Portuguese
      ['v_pt_1', 'pt_kore_prem', 'Beatriz (Calorosa)', 'pt', 'female', ['warm'], 'premium', 'Kore', 'Voz envolvente para histórias emocionais.'],
      ['v_pt_2', 'pt_zephyr_std', 'Mariana (Clara)', 'pt', 'female', ['crisp'], 'standard', 'Zephyr', 'Narração direta para relacionamentos.'],
      ['v_pt_3', 'pt_kore_std', 'Lara (Suave)', 'pt', 'female', ['soft'], 'standard', 'Kore', 'Tom calmo para reflexões.'],
      ['v_pt_4', 'pt_charon_prem', 'Rafael (Firme)', 'pt', 'male', ['firm'], 'premium', 'Charon', 'Voz marcante para disciplina e estoicismo.'],
      ['v_pt_5', 'pt_fenrir_prem', 'Tiago (Mistério)', 'pt', 'male', ['tense'], 'premium', 'Fenrir', 'Cadência sombria para suspense.'],
      ['v_pt_6', 'pt_puck_std', 'Lucas (Fábula)', 'pt', 'male', ['bright'], 'standard', 'Puck', 'Energia leve para histórias animadas.'],
    ];
    for (const v of langVoices) {
      insertVoice.run(v[0], v[1], v[2], v[3], v[4], JSON.stringify(v[5]), v[6], v[7], v[8]);
    }
  }

  // Music tracks
  const musicCount = (db.prepare('SELECT COUNT(*) as c FROM music_tracks').get() as { c: number }).c;
  if (musicCount === 0) {
    const insertMusic = db.prepare(`
      INSERT INTO music_tracks (id, title, mood_tags_json, niche_tags_json, duration_s, bpm, source, user_id, audio_url, license_note, active)
      VALUES (?, ?, ?, ?, ?, ?, 'library', NULL, ?, ?, 1)
    `);
    const tracks: Array<[string, string, string[], string[], number, number, string, string]> = [
      ['mus_dawn_rise', 'Dawn Horizon', ['building cinematic', 'inspiring'], ['motivation-quotes', 'stoic-wisdom'], 95, 86, '/api/music/synth/mus_dawn_rise.wav', 'Licensed in-app ambient score'],
      ['mus_glass_rain', 'Quiet Window', ['warm piano', 'soft piano ambient'], ['emotional-storytelling', 'loneliness-inner-life'], 95, 72, '/api/music/synth/mus_glass_rain.wav', 'Licensed in-app piano motif'],
      ['mus_midnight_drone', 'Hollow Corridor', ['low suspense drone', 'mystery'], ['midnight-mystery'], 95, 64, '/api/music/synth/mus_midnight_drone.wav', 'Licensed in-app tension bed'],
      ['mus_golden_strings', 'Marble Dusk', ['epic strings calm', 'reverent acoustic'], ['stoic-wisdom', 'scripture-reflections'], 95, 76, '/api/music/synth/mus_golden_strings.wav', 'Licensed in-app string pad'],
      ['mus_warm_pulse', 'Evening Coffee', ['minimal ambient', 'conversational'], ['human-relationships'], 95, 92, '/api/music/synth/mus_warm_pulse.wav', 'Licensed in-app minimal groove'],
      ['mus_storybook', 'Sunlit Bridge', ['uplifting adventure', 'warm'], ['character-fables', 'scripture-reflections'], 95, 104, '/api/music/synth/mus_storybook.wav', 'Licensed in-app fable score'],
    ];
    for (const m of tracks) {
      insertMusic.run(m[0], m[1], JSON.stringify(m[2]), JSON.stringify(m[3]), m[4], m[5], m[6], m[7]);
    }
  }

  // Showcase reels for public landing page
  const showcaseCount = (db.prepare('SELECT COUNT(*) as c FROM showcase_reels').get() as { c: number }).c;
  if (showcaseCount === 0) {
    const insertShowcase = db.prepare(`
      INSERT INTO showcase_reels (id, title, niche_label, style_label, language_label, duration_s, cover_url, hook_line, captions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertShowcase.run(
      'show_1',
      'Silent Discipline',
      'Motivation & Discipline',
      'Cinematic Film',
      'English',
      60,
      '/src/assets/images/reel_sample_motivation_1795353526355.jpg',
      'Nobody is coming to save your year.',
      JSON.stringify(['Nobody is coming', 'to save your year.', 'Start before sunrise.', 'Keep the promise.'])
    );
    insertShowcase.run(
      'show_2',
      'The Corridor Lantern',
      'Midnight Mystery',
      'Graphic Comic',
      'English',
      60,
      '/src/assets/images/reel_sample_horror_1795353526303.jpg',
      'The footsteps stopped when I locked the door.',
      JSON.stringify(['The footsteps stopped', 'when I locked', 'the wooden door.', 'Then the lantern', 'lit by itself.'])
    );
    insertShowcase.run(
      'show_3',
      'Last Train Home',
      'Emotional Storytelling',
      'Japanese Anime',
      'French',
      60,
      '/src/assets/images/reel_sample_anime_1795353526457.jpg',
      'Tu gardes toujours son dernier message.',
      JSON.stringify(['Tu gardes toujours', 'son dernier message', 'tout en haut', 'de ton écran.'])
    );
    insertShowcase.run(
      'show_4',
      'Bridge Above the Mist',
      'Character Fables',
      'Ink & Gold Epic',
      'English',
      60,
      '/src/assets/images/reel_sample_chinese_epic_1795353526462.jpg',
      'He crossed the bridge with an empty compass.',
      JSON.stringify(['He crossed the bridge', 'above the mist', 'with nothing left', 'but patience.'])
    );
  }

  // Upgrade show_1 cover to rich 35mm psychology scene still for immediate preview fidelity
  db.prepare(`UPDATE showcase_reels SET cover_url = ? WHERE id = 'show_1'`).run(
    '/src/assets/images/psych_scene_window_1795356673101.jpg'
  );
}

export function ensureDemoPsychologyProjectForUser(userId: string) {
  const flagKey = `demo_psych_seeded:${userId}`;
  const already = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(flagKey);
  if (already) return;

  const existingCount = (
    db.prepare('SELECT COUNT(*) as c FROM projects WHERE user_id = ?').get(userId) as { c: number }
  ).c;

  if (existingCount > 0) {
    db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(flagKey, '1');
    return;
  }

  const now = new Date().toISOString();
  const projectId = `demo_psych_${userId.slice(0, 8)}_${crypto.randomUUID().slice(0, 6)}`;

  db.prepare(
    `INSERT INTO projects (
      id, user_id, title, niche_id, sub_niche_id, recipe_version, reel_language, topic,
      style_id, character_id, voice_id, voice_speed, music_track_id, caption_preset,
      length_tier, status, credits_quoted, credits_final, thumbnail_url, is_free_watermarked,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'niche_psych', 'sub_emotional', 1, 'en', ?, 'style_cinematic', NULL, 'v_en_1', 1.0, 'mus_glass_rain', 'cinematic', 30, 'ready', 0, 0, ?, 0, ?, ?)`
  ).run(
    projectId,
    userId,
    'The Quiet Psychology of Overthinking',
    'Why your mind replays old conversations at midnight — and how quiet detachment restores clarity.',
    '/src/assets/images/psych_scene_window_1795356673101.jpg',
    now,
    now
  );

  const demoScenes = [
    {
      idx: 0,
      narration: 'Your brain does not replay the past to hurt you. It loops unfinished moments looking for closure.',
      imageUrl: '/src/assets/images/psych_scene_window_1795356673101.jpg',
      motion: 'shake_subtle',
      transition: 'crossfade',
      onScreen: 'Searching for closure',
      durationMs: 4200,
      noiseIntensity: 48,
      noiseAtmosphere: 58,
      noiseOpacity: 44,
      shakeIntensity: 42,
    },
    {
      idx: 1,
      narration: 'Notice how every corridor of thought feels loudest right after the house goes completely still.',
      imageUrl: '/src/assets/images/psych_scene_hallway_1795356671218.jpg',
      motion: 'shake_subtle',
      transition: 'dip_to_black',
      onScreen: 'When the noise stops',
      durationMs: 4200,
      noiseIntensity: 52,
      noiseAtmosphere: 65,
      noiseOpacity: 46,
      shakeIntensity: 38,
    },
    {
      idx: 2,
      narration: 'In psychology, rumination convinces you that worrying equals control — even while you stand still.',
      imageUrl: '/src/assets/images/psych_scene_street_1795356671382.jpg',
      motion: 'slow_zoom_in',
      transition: 'crossfade',
      onScreen: 'Illusion of control',
      durationMs: 4400,
      noiseIntensity: 45,
      noiseAtmosphere: 60,
      noiseOpacity: 40,
      shakeIntensity: 32,
    },
    {
      idx: 3,
      narration: 'The shift begins when you put one honest sentence onto paper instead of carrying ten in your head.',
      imageUrl: '/src/assets/images/psych_scene_desk_1795356670980.jpg',
      motion: 'push_in',
      transition: 'crossfade',
      onScreen: 'One honest line',
      durationMs: 4400,
      noiseIntensity: 38,
      noiseAtmosphere: 50,
      noiseOpacity: 36,
      shakeIntensity: 30,
    },
    {
      idx: 4,
      narration: 'Peace rarely arrives with all the answers. It begins the moment you stop rehearsing what already passed.',
      imageUrl: '/src/assets/images/psych_scene_horizon_1795356671733.jpg',
      motion: 'shake_subtle',
      transition: 'crossfade',
      onScreen: 'Let the loop end',
      durationMs: 4600,
      noiseIntensity: 34,
      noiseAtmosphere: 42,
      noiseOpacity: 34,
      shakeIntensity: 26,
    },
  ];

  const insertScene = db.prepare(`
    INSERT INTO scenes (
      id, project_id, idx, narration_text, delivery_tags_json, pause_after_ms,
      image_prompt, image_url, motion_preset, transition_preset, on_screen_text,
      audio_url, duration_ms, noise_intensity, noise_atmosphere, noise_opacity, shake_intensity, status
    ) VALUES (?, ?, ?, ?, '[]', 450, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'ready')
  `);

  for (const s of demoScenes) {
    insertScene.run(
      crypto.randomUUID(),
      projectId,
      s.idx,
      s.narration,
      `${s.onScreen} - atmospheric 35mm psychology film still`,
      s.imageUrl,
      s.motion,
      s.transition,
      s.onScreen,
      s.durationMs,
      s.noiseIntensity,
      s.noiseAtmosphere,
      s.noiseOpacity,
      s.shakeIntensity
    );
  }

  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run(flagKey, '1');
}

export function getPriceMap(): Record<string, number> {
  const rows = db.prepare('SELECT key, credits_value FROM price_table WHERE active = 1').all() as Array<{
    key: string;
    credits_value: number;
  }>;
  const map: Record<string, number> = {};
  for (const r of rows) {
    map[r.key] = r.credits_value;
  }
  return map;
}

export function getUserCreditBalance(userId: string): CreditBalance {
  const now = new Date().toISOString();
  const lots = db
    .prepare(
      `SELECT source, remaining, expires_at FROM credit_lots
       WHERE user_id = ? AND remaining > 0 AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY expires_at ASC`
    )
    .all(userId, now) as Array<{ source: string; remaining: number; expires_at: string | null }>;

  let plan_credits = 0;
  let topup_credits = 0;
  let free_credits = 0;
  let plan_expires_at: string | null = null;
  let topup_expires_at: string | null = null;

  for (const lot of lots) {
    if (lot.source === 'plan') {
      plan_credits += lot.remaining;
      if (lot.expires_at && (!plan_expires_at || lot.expires_at < plan_expires_at)) {
        plan_expires_at = lot.expires_at;
      }
    } else if (lot.source === 'topup' || lot.source === 'admin') {
      topup_credits += lot.remaining;
      if (lot.expires_at && (!topup_expires_at || lot.expires_at < topup_expires_at)) {
        topup_expires_at = lot.expires_at;
      }
    } else if (lot.source === 'free') {
      free_credits += lot.remaining;
    }
  }

  const sub = db
    .prepare(
      `SELECT s.current_period_end, p.code, p.name
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = ? AND s.status = 'active'
       ORDER BY s.current_period_end DESC LIMIT 1`
    )
    .get(userId) as { current_period_end: string; code: string; name: string } | undefined;

  let renewal_due_soon = false;
  if (sub?.current_period_end) {
    const msLeft = new Date(sub.current_period_end).getTime() - Date.now();
    renewal_due_soon = msLeft > 0 && msLeft <= 3 * 24 * 60 * 60 * 1000;
  }

  return {
    total: plan_credits + topup_credits + free_credits,
    plan_credits,
    topup_credits,
    free_credits,
    plan_expires_at,
    topup_expires_at,
    active_plan_code: sub?.code ?? null,
    active_plan_name: sub?.name ?? null,
    renewal_due_soon,
  };
}

/**
 * Atomically reserve credits spending expiring lots first.
 * Never allows a negative balance.
 */
export function reserveCredits(
  userId: string,
  amount: number,
  projectId: string,
  jobId: string
): { ok: true; balanceAfter: number } | { ok: false; available: number } {
  const tx = db.transaction(() => {
    const bal = getUserCreditBalance(userId);
    if (bal.total < amount) {
      return { ok: false as const, available: bal.total };
    }
    const now = new Date().toISOString();
    // Order: expiring earliest first, non-expiring (NULL) last
    const lots = db
      .prepare(
        `SELECT id, remaining, expires_at FROM credit_lots
         WHERE user_id = ? AND remaining > 0 AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END ASC, expires_at ASC, created_at ASC`
      )
      .all(userId, now) as Array<{ id: string; remaining: number; expires_at: string | null }>;

    let needed = amount;
    const updateLot = db.prepare('UPDATE credit_lots SET remaining = remaining - ? WHERE id = ?');
    for (const lot of lots) {
      if (needed <= 0) break;
      const take = Math.min(needed, lot.remaining);
      updateLot.run(take, lot.id);
      needed -= take;
    }

    const newBal = getUserCreditBalance(userId).total;
    db.prepare(
      `INSERT INTO credit_ledger (id, user_id, delta, reason, project_id, job_id, balance_after, meta_json, created_at)
       VALUES (?, ?, ?, 'reserve', ?, ?, ?, '{}', ?)`
    ).run(crypto.randomUUID(), userId, -amount, projectId, jobId, newBal, now);

    return { ok: true as const, balanceAfter: newBal };
  });

  return tx();
}

export function grantCredits(params: {
  userId: string;
  amount: number;
  source: 'plan' | 'topup' | 'free' | 'admin';
  reason: 'plan_grant' | 'topup' | 'free_grant' | 'refund' | 'admin_adjust';
  expiresAt: string | null;
  projectId?: string | null;
  jobId?: string | null;
  meta?: Record<string, unknown>;
}): number {
  const tx = db.transaction(() => {
    const now = new Date().toISOString();
    if (params.amount >= 0) {
      db.prepare(
        `INSERT INTO credit_lots (id, user_id, source, amount, remaining, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        params.userId,
        params.source,
        params.amount,
        params.amount,
        params.expiresAt,
        now
      );
    } else {
      // Negative admin adjustment: deduct down to zero safely
      const current = getUserCreditBalance(params.userId).total;
      const deduct = Math.min(current, Math.abs(params.amount));
      const lots = db
        .prepare(
          `SELECT id, remaining FROM credit_lots
           WHERE user_id = ? AND remaining > 0
           ORDER BY CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END ASC, expires_at ASC`
        )
        .all(params.userId) as Array<{ id: string; remaining: number }>;
      let left = deduct;
      const updateLot = db.prepare('UPDATE credit_lots SET remaining = remaining - ? WHERE id = ?');
      for (const lot of lots) {
        if (left <= 0) break;
        const take = Math.min(left, lot.remaining);
        updateLot.run(take, lot.id);
        left -= take;
      }
    }

    const balanceAfter = getUserCreditBalance(params.userId).total;
    db.prepare(
      `INSERT INTO credit_ledger (id, user_id, delta, reason, project_id, job_id, balance_after, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.userId,
      params.amount,
      params.reason,
      params.projectId ?? null,
      params.jobId ?? null,
      balanceAfter,
      JSON.stringify(params.meta ?? {}),
      now
    );

    return balanceAfter;
  });

  return tx();
}
