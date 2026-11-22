import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import { calculateCreditQuote } from './src/shared/credits.ts';
import type { LengthTier, RecipeConfig, VoiceTier } from './src/shared/types.ts';
import {
  db,
  ensureDemoPsychologyProjectForUser,
  GENERATED_DIR,
  getPriceMap,
  getUserCreditBalance,
  grantCredits,
  initDatabase,
  reserveCredits,
} from './server/db.ts';
import { generateBestHook, generateSurpriseTopic, runRetentionEditor, splitScriptIntoScenes, synthesizeSceneVoiceWav, writeNativeScript } from './server/gemini.ts';
import { getPaymentProvider, processPaymentWebhook } from './server/payments.ts';
import { regenerateSingleScene, runGenerateReelJob } from './server/pipeline.ts';
import { buildAmbientMusicWav, renderCharacterPortraitSvg } from './server/visuals.ts';

initDatabase();

const app = express();
const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json({ limit: '25mb' }));

// Simple per-IP / per-user in-memory rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxPerMin: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    if (bucket.count >= maxPerMin) {
      return res.status(429).json({ errorKey: 'auth.errorGeneric' });
    }
    bucket.count += 1;
    next();
  };
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hashHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = decodeURIComponent(pair.slice(idx + 1).trim());
      out[k] = v;
    }
  }
  return out;
}

function setSessionCookie(res: Response, req: Request, token: string) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    `reely_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Max-Age=2592000',
    isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res: Response, req: Request) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const attrs = [
    'reely_session=',
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

interface AuthedUser {
  id: string;
  email: string;
  display_name: string;
  role: 'user' | 'admin';
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

function getAuthedUser(req: Request): AuthedUser | null {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies.reely_session;
  }
  if (!token) return null;

  const now = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, now) as Record<string, unknown> | undefined;

  if (!row || Number(row.suspended) === 1) return null;

  return {
    id: String(row.id),
    email: String(row.email),
    display_name: String(row.display_name),
    role: row.role === 'admin' ? 'admin' : 'user',
    default_reel_language: String(row.default_reel_language),
    phone: row.phone ? String(row.phone) : null,
    phone_verified: Boolean(row.phone_verified),
    free_credits_granted: Boolean(row.free_credits_granted),
    country: String(row.country),
    onboarding_completed: Boolean(row.onboarding_completed),
    interested_niches: JSON.parse(String(row.interested_niches_json || '[]')) as string[],
    suspended: Boolean(row.suspended),
    created_at: String(row.created_at),
  };
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const hasBearer = req.headers.authorization?.startsWith('Bearer ');
    const hasXhr = req.headers['x-requested-with'] === 'ReelyAI';
    if (!hasBearer && !hasXhr) {
      return res.status(403).json({ errorKey: 'auth.errorGeneric' });
    }
  }
  const user = getAuthedUser(req);
  if (!user) {
    return res.status(401).json({ errorKey: 'auth.errorGeneric' });
  }
  (req as Request & { user: AuthedUser }).user = user;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    const user = (req as Request & { user: AuthedUser }).user;
    if (user.role !== 'admin') {
      return res.status(403).json({ errorKey: 'auth.errorGeneric' });
    }
    next();
  });
}

function writeAudit(actorId: string, action: string, targetType: string, targetId: string, reason: string, meta: Record<string, unknown> = {}) {
  db.prepare(
    `INSERT INTO audit_log (id, actor_user_id, action, target_type, target_id, reason, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), actorId, action, targetType, targetId, reason, JSON.stringify(meta), new Date().toISOString());
}

// Serve generated media files safely with path confinement
app.get('/generated/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const resolved = path.resolve(GENERATED_DIR, filename);
  if (!resolved.startsWith(GENERATED_DIR + path.sep) || !fs.existsSync(resolved)) {
    return res.status(404).end();
  }
  if (filename.endsWith('.svg')) res.type('image/svg+xml');
  else if (filename.endsWith('.wav')) res.type('audio/wav');
  else if (filename.endsWith('.mp3')) res.type('audio/mpeg');
  else if (filename.endsWith('.png')) res.type('image/png');
  else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) res.type('image/jpeg');
  res.sendFile(resolved);
});

// Serve synthesized ambient music tracks cleanly
app.get('/api/music/synth/:file', (req, res) => {
  const id = path.basename(req.params.file, '.wav');
  const wav = buildAmbientMusicWav(id);
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(wav);
});

// Public landing & catalog data
app.get('/api/public/landing', (_req, res) => {
  const showcase = db.prepare('SELECT * FROM showcase_reels').all().map((r) => {
    const row = r as Record<string, unknown>;
    return {
      ...row,
      captions: JSON.parse(String(row.captions_json || '[]')),
    };
  });
  const niches = db.prepare('SELECT * FROM niches WHERE active = 1 ORDER BY sort ASC').all();
  const styles = db.prepare('SELECT * FROM styles WHERE active = 1').all();
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY sort ASC').all();
  const whatsappSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'whatsapp_support_url'").get() as { value: string } | undefined;
  res.json({
    showcase,
    niches,
    styles,
    plans,
    whatsappSupportUrl: whatsappSetting?.value || 'https://wa.me/237600000000',
  });
});

// Auth endpoints
app.post('/api/auth/register', rateLimit(15), (req, res) => {
  const schema = z.object({
    email: z.string().email().max(160),
    password: z.string().min(6).max(128),
    display_name: z.string().min(1).max(80),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errorKey: 'auth.errorGeneric' });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    return res.status(409).json({ errorKey: 'auth.errorEmailExists' });
  }

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(parsed.data.password);

  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, role, default_reel_language, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'user', 'en', ?, ?)`
  ).run(userId, email, passwordHash, parsed.data.display_name.trim(), now, now);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    expiresAt,
    now
  );

  setSessionCookie(res, req, token);
  ensureDemoPsychologyProjectForUser(userId);
  const user = getAuthedUser({ ...req, headers: { ...req.headers, authorization: `Bearer ${token}` } } as Request);
  res.json({ token, user, balance: getUserCreditBalance(userId) });
});

app.post('/api/auth/login', rateLimit(20), (req, res) => {
  const schema = z.object({
    email: z.string().email().max(160),
    password: z.string().min(1).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errorKey: 'auth.errorInvalidCredentials' });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as {
    id: string;
    password_hash: string;
    suspended: number;
  } | undefined;

  if (!row || !verifyPassword(parsed.data.password, row.password_hash) || row.suspended) {
    return res.status(401).json({ errorKey: 'auth.errorInvalidCredentials' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    row.id,
    expiresAt,
    now
  );

  setSessionCookie(res, req, token);
  ensureDemoPsychologyProjectForUser(row.id);
  const user = getAuthedUser({ ...req, headers: { ...req.headers, authorization: `Bearer ${token}` } } as Request);
  res.json({ token, user, balance: getUserCreditBalance(row.id) });
});

app.post('/api/auth/reset-password', rateLimit(10), (req, res) => {
  const schema = z.object({
    email: z.string().email().max(160),
    new_password: z.string().min(6).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errorKey: 'auth.errorGeneric' });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
  if (row) {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(parsed.data.new_password),
      new Date().toISOString(),
      row.id
    );
  }
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : undefined;
  const tok = bearer || cookies.reely_session;
  if (tok) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(tok);
  }
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getAuthedUser(req);
  if (!user) {
    return res.json({ user: null, balance: null });
  }
  res.json({ user, balance: getUserCreditBalance(user.id) });
});

app.post('/api/auth/phone/send-otp', requireAuth, rateLimit(10), (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    country: z.string().min(2).max(4),
    phone: z.string().min(6).max(20),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errorKey: 'auth.errorGeneric' });
  }

  const cleanPhone = parsed.data.phone.replace(/[^\d+]/g, '');
  const alreadyUsed = db
    .prepare('SELECT id FROM users WHERE phone = ? AND phone_verified = 1 AND id != ?')
    .get(cleanPhone, user.id);
  if (alreadyUsed) {
    return res.status(409).json({ errorKey: 'auth.errorPhoneAlreadyClaimed' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO phone_otps (id, user_id, phone, code, expires_at, used) VALUES (?, ?, ?, ?, ?, 0)').run(
    crypto.randomUUID(),
    user.id,
    cleanPhone,
    code,
    expiresAt
  );
  db.prepare('UPDATE users SET country = ?, phone = ?, updated_at = ? WHERE id = ?').run(
    parsed.data.country,
    cleanPhone,
    new Date().toISOString(),
    user.id
  );

  // Return devPreviewCode only in non-production for preview testing
  res.json({
    ok: true,
    devPreviewCode: isProd ? undefined : code,
  });
});

app.post('/api/auth/phone/verify-otp', requireAuth, rateLimit(10), (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    phone: z.string().min(6).max(20),
    code: z.string().length(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errorKey: 'auth.errorGeneric' });
  }

  const cleanPhone = parsed.data.phone.replace(/[^\d+]/g, '');
  const now = new Date().toISOString();
  const otp = db
    .prepare(
      `SELECT * FROM phone_otps WHERE user_id = ? AND phone = ? AND code = ? AND used = 0 AND expires_at > ?
       ORDER BY rowid DESC LIMIT 1`
    )
    .get(user.id, cleanPhone, parsed.data.code, now) as { id: string } | undefined;

  if (!otp) {
    return res.status(400).json({ errorKey: 'auth.errorGeneric' });
  }

  const alreadyUsed = db
    .prepare('SELECT id FROM users WHERE phone = ? AND free_credits_granted = 1 AND id != ?')
    .get(cleanPhone, user.id);
  if (alreadyUsed) {
    return res.status(409).json({ errorKey: 'auth.errorPhoneAlreadyClaimed' });
  }

  db.prepare('UPDATE phone_otps SET used = 1 WHERE id = ?').run(otp.id);

  let granted = false;
  if (!user.free_credits_granted) {
    const grantRow = db.prepare("SELECT value FROM app_settings WHERE key = 'free_grant_amount'").get() as { value: string } | undefined;
    const freeAmount = Number(grantRow?.value ?? '120');
    grantCredits({
      userId: user.id,
      amount: freeAmount,
      source: 'free',
      reason: 'free_grant',
      expiresAt: null,
      meta: { phone: cleanPhone },
    });
    granted = true;
  }

  db.prepare(
    'UPDATE users SET phone = ?, phone_verified = 1, free_credits_granted = 1, updated_at = ? WHERE id = ?'
  ).run(cleanPhone, now, user.id);

  const updated = getAuthedUser(req);
  res.json({
    ok: true,
    granted,
    user: updated,
    balance: getUserCreditBalance(user.id),
  });
});

app.post('/api/auth/onboarding', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    default_reel_language: z.string().min(2).max(5).optional(),
    interested_niches: z.array(z.string()).max(3).optional(),
    completed: z.boolean(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'auth.errorGeneric' });

  db.prepare(
    `UPDATE users SET
      default_reel_language = COALESCE(?, default_reel_language),
      interested_niches_json = COALESCE(?, interested_niches_json),
      onboarding_completed = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(
    parsed.data.default_reel_language ?? null,
    parsed.data.interested_niches ? JSON.stringify(parsed.data.interested_niches) : null,
    parsed.data.completed ? 1 : 0,
    new Date().toISOString(),
    user.id
  );

  res.json({ user: getAuthedUser(req) });
});

app.patch('/api/auth/profile', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    display_name: z.string().min(1).max(80),
    default_reel_language: z.string().min(2).max(5),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'auth.errorGeneric' });

  db.prepare(
    'UPDATE users SET display_name = ?, default_reel_language = ?, updated_at = ? WHERE id = ?'
  ).run(parsed.data.display_name.trim(), parsed.data.default_reel_language, new Date().toISOString(), user.id);

  res.json({ user: getAuthedUser(req) });
});

app.delete('/api/auth/account', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const scenes = db
    .prepare(
      `SELECT s.image_url, s.audio_url FROM scenes s
       JOIN projects p ON p.id = s.project_id WHERE p.user_id = ?`
    )
    .all(user.id) as Array<{ image_url: string; audio_url: string | null }>;

  for (const sc of scenes) {
    for (const u of [sc.image_url, sc.audio_url]) {
      if (u && u.startsWith('/generated/')) {
        const target = path.resolve(GENERATED_DIR, path.basename(u));
        if (target.startsWith(GENERATED_DIR + path.sep) && fs.existsSync(target)) {
          fs.unlinkSync(target);
        }
      }
    }
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

// Authenticated studio catalog
app.get('/api/catalog', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const languages = db.prepare('SELECT * FROM languages WHERE active = 1').all();
  const niches = db.prepare('SELECT * FROM niches WHERE active = 1 ORDER BY sort ASC').all();
  const subNiches = db
    .prepare(
      `SELECT sn.*, r.config_json FROM sub_niches sn
       JOIN recipes r ON r.sub_niche_id = sn.id AND r.active = 1
       WHERE sn.active = 1`
    )
    .all()
    .map((s) => {
      const row = s as Record<string, unknown>;
      return {
        ...row,
        recipe: JSON.parse(String(row.config_json)) as RecipeConfig,
      };
    });

  const styles = db.prepare('SELECT * FROM styles WHERE active = 1').all();
  const characters = db
    .prepare('SELECT * FROM characters WHERE is_preset = 1 OR user_id = ? ORDER BY is_preset DESC, created_at DESC')
    .all(user.id)
    .map((c) => {
      const row = c as Record<string, unknown>;
      return { ...row, is_preset: Boolean(row.is_preset) };
    });
  const voices = db.prepare('SELECT * FROM voices WHERE active = 1').all().map((v) => {
    const row = v as Record<string, unknown>;
    return {
      ...row,
      tone_tags: JSON.parse(String(row.tone_tags_json || '[]')),
    };
  });
  const musicTracks = db
    .prepare("SELECT * FROM music_tracks WHERE active = 1 AND (source = 'library' OR user_id = ?) ORDER BY source DESC")
    .all(user.id)
    .map((m) => {
      const row = m as Record<string, unknown>;
      return {
        ...row,
        mood_tags: JSON.parse(String(row.mood_tags_json || '[]')),
        niche_tags: JSON.parse(String(row.niche_tags_json || '[]')),
      };
    });
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY sort ASC').all();
  const priceMap = getPriceMap();
  const whatsappSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'whatsapp_support_url'").get() as { value: string } | undefined;

  res.json({
    languages,
    niches: niches.map((n) => ({
      ...(n as Record<string, unknown>),
      sub_niches: subNiches.filter((sn) => (sn as Record<string, unknown>).niche_id === (n as Record<string, unknown>).id),
    })),
    styles,
    characters,
    voices,
    musicTracks,
    plans,
    prices: priceMap,
    whatsappSupportUrl: whatsappSetting?.value || 'https://wa.me/237600000000',
  });
});

// Surprise me topic
app.post('/api/ai/surprise-topic', requireAuth, rateLimit(20), async (req, res) => {
  const schema = z.object({
    sub_niche_id: z.string().optional(),
    niche_id: z.string().optional(),
    language_code: z.string().min(2).max(5).default('en'),
    previous_topic: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'wizard.surpriseError' });

  let sn: { name: string; description: string } | undefined;
  if (parsed.data.sub_niche_id) {
    sn = db
      .prepare('SELECT name, description FROM sub_niches WHERE id = ?')
      .get(parsed.data.sub_niche_id) as { name: string; description: string } | undefined;
  }
  if (!sn && parsed.data.niche_id) {
    sn = db
      .prepare('SELECT name, description FROM sub_niches WHERE niche_id = ? AND active = 1 LIMIT 1')
      .get(parsed.data.niche_id) as { name: string; description: string } | undefined;
    if (!sn) {
      sn = db
        .prepare('SELECT name, description FROM niches WHERE id = ?')
        .get(parsed.data.niche_id) as { name: string; description: string } | undefined;
    }
  }

  const lang =
    (db.prepare('SELECT name FROM languages WHERE code = ?').get(parsed.data.language_code) as {
      name: string;
    } | undefined) ?? { name: 'English' };

  const contextName = sn?.name ?? 'Short Motivational & Storytelling Reels';

  try {
    const idea = await generateSurpriseTopic(contextName, lang.name, {
      description: sn?.description,
      previousTopic: parsed.data.previous_topic,
    });
    res.json({
      topic: idea.combined,
      title_suggestion: idea.titleSuggestion,
      concept: idea.concept,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[surprise-topic]', message);
    if (message === 'GEMINI_API_KEY_MISSING') {
      return res.status(503).json({ errorKey: 'wizard.surpriseKeyMissing' });
    }
    res.status(502).json({ errorKey: 'wizard.surpriseError' });
  }
});

// Voice preview synthesis (cached per voice ID)
app.get('/api/voices/:id/preview', requireAuth, async (req, res) => {
  const voice = db.prepare('SELECT * FROM voices WHERE id = ?').get(req.params.id) as {
    id: string;
    language: string;
    prebuilt_gemini_voice: string;
    description: string;
  } | undefined;
  if (!voice) return res.status(404).end();

  const cachePath = path.resolve(GENERATED_DIR, `preview_${voice.id}.wav`);
  if (fs.existsSync(cachePath)) {
    res.type('audio/wav');
    return res.sendFile(cachePath);
  }

  const samples: Record<string, string> = {
    en: 'Nobody is coming to save your year, so start quietly before sunrise.',
    fr: 'Personne ne viendra sauver ton année, alors commence avant le lever du jour.',
    es: 'Nadie vendrá a salvar tu año, así que empieza en silencio antes del amanecer.',
    it: 'Nessuno verrà a salvare il tuo anno, quindi inizia prima dell’alba.',
    de: 'Niemand wird dein Jahr retten, also beginne still vor Sonnenaufgang.',
    pt: 'Ninguém virá salvar o seu ano, então comece em silêncio antes do amanhecer.',
  };

  try {
    const { wavBuffer } = await synthesizeSceneVoiceWav({
      text: samples[voice.language] ?? samples.en,
      prebuiltVoiceName: voice.prebuilt_gemini_voice,
      narratorStyle: voice.description,
    });
    fs.writeFileSync(cachePath, wavBuffer);
    res.type('audio/wav');
    res.send(wavBuffer);
  } catch {
    res.status(502).json({ errorKey: 'pipeline.errorGeneric' });
  }
});

// Characters CRUD
function serializeCharacterRow(row: Record<string, unknown>) {
  return {
    ...row,
    is_preset: Boolean(row.is_preset),
  };
}

app.get('/api/characters', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const rows = db
    .prepare('SELECT * FROM characters WHERE is_preset = 1 OR user_id = ? ORDER BY is_preset DESC, created_at DESC')
    .all(user.id)
    .map((r) => serializeCharacterRow(r as Record<string, unknown>));
  res.json(rows);
});

app.get('/api/characters/:id', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const row = db
    .prepare('SELECT * FROM characters WHERE id = ? AND (is_preset = 1 OR user_id = ?)')
    .get(req.params.id, user.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ errorKey: 'library.characterNotFound' });
  res.json(serializeCharacterRow(row));
});

app.post('/api/characters', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    name: z.string().trim().min(1).max(60),
    style_id: z.string().min(1),
    age_range: z.string().trim().min(1).max(30),
    gender: z.string().trim().min(1).max(30),
    hair: z.string().trim().min(1).max(80),
    outfit: z.string().trim().min(1).max(120),
    mood: z.string().trim().min(1).max(60),
    signature_item: z.string().trim().min(1).max(80),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'library.characterValidationError' });

  const id = crypto.randomUUID();
  const d = parsed.data;
  const descriptionCard = `${d.age_range} ${d.gender}, ${d.hair}, wearing ${d.outfit}, ${d.mood} expression, signature item: ${d.signature_item}.`;
  const masterUrl = renderCharacterPortraitSvg({
    id,
    name: d.name,
    styleId: d.style_id,
    outfit: d.outfit,
    hair: d.hair,
    mood: d.mood,
  });
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO characters (id, user_id, name, style_id, age_range, gender, hair, outfit, mood, signature_item, description_card, master_asset_url, is_preset, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, user.id, d.name, d.style_id, d.age_range, d.gender, d.hair, d.outfit, d.mood, d.signature_item, descriptionCard, masterUrl, now);

  const created = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as Record<string, unknown>;
  res.json(serializeCharacterRow(created));
});

app.patch('/api/characters/:id', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const existing = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id) as
    | {
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
        is_preset: number;
      }
    | undefined;

  if (!existing) return res.status(404).json({ errorKey: 'library.characterNotFound' });
  if (existing.is_preset || existing.user_id !== user.id) {
    return res.status(403).json({ errorKey: 'library.characterForbidden' });
  }

  const schema = z.object({
    name: z.string().trim().min(1).max(60).optional(),
    style_id: z.string().min(1).optional(),
    age_range: z.string().trim().min(1).max(30).optional(),
    gender: z.string().trim().min(1).max(30).optional(),
    hair: z.string().trim().min(1).max(80).optional(),
    outfit: z.string().trim().min(1).max(120).optional(),
    mood: z.string().trim().min(1).max(60).optional(),
    signature_item: z.string().trim().min(1).max(80).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'library.characterValidationError' });

  const d = parsed.data;
  const nextName = d.name ?? existing.name;
  const nextStyle = d.style_id ?? existing.style_id;
  const nextAge = d.age_range ?? existing.age_range;
  const nextGender = d.gender ?? existing.gender;
  const nextHair = d.hair ?? existing.hair;
  const nextOutfit = d.outfit ?? existing.outfit;
  const nextMood = d.mood ?? existing.mood;
  const nextSig = d.signature_item ?? existing.signature_item;

  const descriptionCard = `${nextAge} ${nextGender}, ${nextHair}, wearing ${nextOutfit}, ${nextMood} expression, signature item: ${nextSig}.`;
  const masterBaseUrl = renderCharacterPortraitSvg({
    id: existing.id,
    name: nextName,
    styleId: nextStyle,
    outfit: nextOutfit,
    hair: nextHair,
    mood: nextMood,
  });
  const masterUrl = `${masterBaseUrl}?v=${Date.now()}`;

  db.prepare(
    `UPDATE characters
     SET name = ?, style_id = ?, age_range = ?, gender = ?, hair = ?, outfit = ?, mood = ?, signature_item = ?, description_card = ?, master_asset_url = ?
     WHERE id = ? AND user_id = ? AND is_preset = 0`
  ).run(
    nextName,
    nextStyle,
    nextAge,
    nextGender,
    nextHair,
    nextOutfit,
    nextMood,
    nextSig,
    descriptionCard,
    masterUrl,
    existing.id,
    user.id
  );

  const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(existing.id) as Record<string, unknown>;
  res.json(serializeCharacterRow(updated));
});

app.delete('/api/characters/:id', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const existing = db.prepare('SELECT id, user_id, is_preset FROM characters WHERE id = ?').get(req.params.id) as
    | { id: string; user_id: string | null; is_preset: number }
    | undefined;

  if (!existing) return res.status(404).json({ errorKey: 'library.characterNotFound' });
  if (existing.is_preset || existing.user_id !== user.id) {
    return res.status(403).json({ errorKey: 'library.characterForbidden' });
  }

  db.prepare('UPDATE projects SET character_id = NULL WHERE character_id = ? AND user_id = ?').run(existing.id, user.id);
  db.prepare('DELETE FROM characters WHERE id = ? AND user_id = ? AND is_preset = 0').run(existing.id, user.id);

  const portraitPath = path.resolve(GENERATED_DIR, `char_${existing.id}.svg`);
  if (portraitPath.startsWith(GENERATED_DIR + path.sep) && fs.existsSync(portraitPath)) {
    fs.unlinkSync(portraitPath);
  }

  res.json({ ok: true, id: existing.id });
});

// User uploads (images, audio, voice) with rights confirmation & size validation
app.get('/api/uploads', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  res.json(db.prepare('SELECT * FROM uploads WHERE user_id = ? ORDER BY created_at DESC').all(user.id));
});

app.post('/api/uploads', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    kind: z.enum(['image', 'audio', 'voice']),
    filename: z.string().min(1).max(120),
    mime: z.string(),
    data_base64: z.string().min(10),
    rights_confirmed: z.literal(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'auth.errorGeneric' });

  const allowedMimes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'image/png',
    'image/jpeg',
    'image/webp',
  ];
  if (!allowedMimes.includes(parsed.data.mime)) {
    return res.status(400).json({ errorKey: 'auth.errorGeneric' });
  }

  const rawBuf = Buffer.from(parsed.data.data_base64, 'base64');
  if (rawBuf.length > 20 * 1024 * 1024) {
    return res.status(413).json({ errorKey: 'auth.errorGeneric' });
  }

  const extMap: Record<string, string> = {
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/mp4': '.m4a',
    'audio/m4a': '.m4a',
    'audio/x-m4a': '.m4a',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
  };
  const ext = extMap[parsed.data.mime] || '.bin';
  const id = crypto.randomUUID();
  const safeName = `upload_${id}${ext}`;
  const outPath = path.resolve(GENERATED_DIR, safeName);
  fs.writeFileSync(outPath, rawBuf);
  const url = `/generated/${safeName}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO uploads (id, user_id, kind, filename, mime, size, url, rights_confirmed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(id, user.id, parsed.data.kind, parsed.data.filename, parsed.data.mime, rawBuf.length, url, now);

  if (parsed.data.kind === 'audio') {
    db.prepare(
      `INSERT INTO music_tracks (id, title, mood_tags_json, niche_tags_json, duration_s, bpm, source, user_id, audio_url, license_note, active)
       VALUES (?, ?, '["uploaded"]', '[]', 120, 90, 'user', ?, ?, 'User uploaded audio (rights confirmed)', 1)`
    ).run(id, parsed.data.filename.replace(/\.[^/.]+$/, ''), user.id, url);
  }

  res.json(db.prepare('SELECT * FROM uploads WHERE id = ?').get(id));
});

app.delete('/api/uploads/:id', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const row = db.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(req.params.id, user.id) as { url: string } | undefined;
  if (row) {
    const resolved = path.resolve(GENERATED_DIR, path.basename(row.url));
    if (resolved.startsWith(GENERATED_DIR + path.sep) && fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
    db.prepare('DELETE FROM uploads WHERE id = ? AND user_id = ?').run(req.params.id, user.id);
    db.prepare('DELETE FROM music_tracks WHERE id = ? AND user_id = ?').run(req.params.id, user.id);
  }
  res.json({ ok: true });
});

// Projects & Generation
app.get('/api/projects', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const rows = db
    .prepare(
      `SELECT p.*, n.name as niche_name, sn.name as sub_niche_name, st.name as style_name, v.name as voice_name, c.name as character_name, m.title as music_title
       FROM projects p
       LEFT JOIN niches n ON n.id = p.niche_id
       LEFT JOIN sub_niches sn ON sn.id = p.sub_niche_id
       LEFT JOIN styles st ON st.id = p.style_id
       LEFT JOIN voices v ON v.id = p.voice_id
       LEFT JOIN characters c ON c.id = p.character_id
       LEFT JOIN music_tracks m ON m.id = p.music_track_id
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`
    )
    .all(user.id);
  res.json(rows);
});

app.get('/api/projects/:id', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const project = db
    .prepare(
      `SELECT p.*, n.name as niche_name, sn.name as sub_niche_name, st.name as style_name, v.name as voice_name, c.name as character_name, m.title as music_title, m.audio_url as music_audio_url
       FROM projects p
       LEFT JOIN niches n ON n.id = p.niche_id
       LEFT JOIN sub_niches sn ON sn.id = p.sub_niche_id
       LEFT JOIN styles st ON st.id = p.style_id
       LEFT JOIN voices v ON v.id = p.voice_id
       LEFT JOIN characters c ON c.id = p.character_id
       LEFT JOIN music_tracks m ON m.id = p.music_track_id
       WHERE p.id = ? AND p.user_id = ?`
    )
    .get(req.params.id, user.id) as Record<string, unknown> | undefined;

  if (!project) return res.status(404).json({ errorKey: 'pipeline.errorGeneric' });

  const scenes = db
    .prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY idx ASC')
    .all(req.params.id)
    .map((s) => {
      const r = s as Record<string, unknown>;
      return {
        ...r,
        delivery_tags: JSON.parse(String(r.delivery_tags_json || '[]')),
      };
    });

  const job = db.prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.id) as Record<string, unknown> | undefined;
  const events = job
    ? db.prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY created_at ASC').all(String(job.id))
    : [];

  res.json({
    ...project,
    is_free_watermarked: Boolean(project.is_free_watermarked),
    scenes,
    job: job ? { ...job, events } : null,
  });
});

app.post('/api/projects', requireAuth, rateLimit(10), (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    title: z.string().max(100).optional(),
    niche_id: z.string(),
    sub_niche_id: z.string(),
    reel_language: z.string().min(2).max(5),
    topic: z.string().min(3).max(500),
    style_id: z.string(),
    character_id: z.string().nullable().optional(),
    voice_id: z.string(),
    voice_speed: z.number().min(0.9).max(1.1).default(1.0),
    music_track_id: z.string().nullable().optional(),
    caption_preset: z.enum(['bold_pop', 'minimal', 'karaoke', 'cinematic']).default('bold_pop'),
    length_tier: z.union([z.literal(30), z.literal(60), z.literal(90)]),
    user_supplied_music: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'pipeline.errorGeneric' });

  const d = parsed.data;

  // Enforce max 2 simultaneous jobs per user
  const activeJobs = (
    db
      .prepare("SELECT COUNT(*) as c FROM jobs j JOIN projects p ON p.id = j.project_id WHERE p.user_id = ? AND j.status IN ('queued', 'running')")
      .get(user.id) as { c: number }
  ).c;
  if (activeJobs >= 2) {
    return res.status(429).json({ errorKey: 'pipeline.errorGeneric' });
  }

  const style = db.prepare('SELECT * FROM styles WHERE id = ?').get(d.style_id) as { image_cost_multiplier: number } | undefined;
  const voice = db.prepare('SELECT * FROM voices WHERE id = ?').get(d.voice_id) as { tier: VoiceTier } | undefined;
  if (!style || !voice) return res.status(400).json({ errorKey: 'pipeline.errorGeneric' });

  const bal = getUserCreditBalance(user.id);
  const onlyFree = bal.plan_credits === 0 && bal.topup_credits === 0 && bal.free_credits > 0;

  const quote = calculateCreditQuote({
    lengthTier: d.length_tier,
    hasCharacter: Boolean(d.character_id),
    styleMultiplier: style.image_cost_multiplier,
    voiceTier: voice.tier,
    userSuppliedMusic: d.user_supplied_music,
    prices: getPriceMap(),
  });

  const projectId = crypto.randomUUID();
  const jobId = crypto.randomUUID();

  const reserved = reserveCredits(user.id, quote.total, projectId, jobId);
  if (!reserved.ok) {
    return res.status(402).json({
      errorKey: 'wizard.insufficientTitle',
      needed: quote.total,
      available: reserved.available,
    });
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, user_id, title, niche_id, sub_niche_id, recipe_version, reel_language, topic, style_id, character_id, voice_id, voice_speed, music_track_id, caption_preset, length_tier, status, credits_quoted, credits_final, thumbnail_url, is_free_watermarked, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?, '', ?, ?, ?)`
  ).run(
    projectId,
    user.id,
    d.title?.trim() || 'New Reel',
    d.niche_id,
    d.sub_niche_id,
    d.reel_language,
    d.topic.trim(),
    d.style_id,
    d.character_id ?? null,
    d.voice_id,
    d.voice_speed,
    d.music_track_id ?? null,
    d.caption_preset,
    d.length_tier,
    quote.total,
    quote.total,
    onlyFree ? 1 : 0,
    now,
    now
  );

  db.prepare(
    `INSERT INTO jobs (id, project_id, kind, status, current_step, message_key, progress_pct, attempts, created_at, updated_at)
     VALUES (?, ?, 'generate_reel', 'queued', 'validate', 'pipeline.step_validate', 5, 1, ?, ?)`
  ).run(jobId, projectId, now, now);

  // Run pipeline asynchronously in background
  setImmediate(() => {
    void runGenerateReelJob(projectId, jobId);
  });

  res.json({
    projectId,
    jobId,
    balance: getUserCreditBalance(user.id),
  });
});

app.post('/api/projects/:id/retry', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, user.id) as {
    id: string;
    credits_quoted: number;
    status: string;
  } | undefined;
  if (!project || project.status === 'creating') return res.status(400).json({ errorKey: 'pipeline.errorGeneric' });

  const jobId = crypto.randomUUID();
  const reserved = reserveCredits(user.id, project.credits_quoted, project.id, jobId);
  if (!reserved.ok) {
    return res.status(402).json({
      errorKey: 'wizard.insufficientTitle',
      needed: project.credits_quoted,
      available: reserved.available,
    });
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE projects SET status = 'creating', updated_at = ? WHERE id = ?").run(now, project.id);
  db.prepare(
    `INSERT INTO jobs (id, project_id, kind, status, current_step, message_key, progress_pct, attempts, created_at, updated_at)
     VALUES (?, ?, 'generate_reel', 'queued', 'validate', 'pipeline.step_validate', 5, 1, ?, ?)`
  ).run(jobId, project.id, now, now);

  setImmediate(() => {
    void runGenerateReelJob(project.id, jobId);
  });
  res.json({ ok: true, jobId });
});

app.patch('/api/projects/:id', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    title: z.string().min(1).max(100).optional(),
    music_track_id: z.string().nullable().optional(),
    caption_preset: z.enum(['bold_pop', 'minimal', 'karaoke', 'cinematic']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'pipeline.errorGeneric' });

  db.prepare(
    `UPDATE projects SET
      title = COALESCE(?, title),
      music_track_id = COALESCE(?, music_track_id),
      caption_preset = COALESCE(?, caption_preset),
      updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    parsed.data.title?.trim() ?? null,
    parsed.data.music_track_id === undefined ? null : parsed.data.music_track_id,
    parsed.data.caption_preset ?? null,
    new Date().toISOString(),
    req.params.id,
    user.id
  );
  res.json({ ok: true });
});

app.patch('/api/projects/:id/scenes/:sceneId', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, user.id);
  if (!project) return res.status(404).json({ errorKey: 'pipeline.errorGeneric' });

  const schema = z.object({
    narration_text: z.string().min(1).max(500).optional(),
    motion_preset: z.string().optional(),
    transition_preset: z.string().optional(),
    noise_intensity: z.number().int().min(0).max(100).optional(),
    noise_atmosphere: z.number().int().min(0).max(100).optional(),
    noise_opacity: z.number().int().min(0).max(100).optional(),
    shake_intensity: z.number().int().min(0).max(100).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'pipeline.errorGeneric' });

  db.prepare(
    `UPDATE scenes SET
      narration_text = COALESCE(?, narration_text),
      motion_preset = COALESCE(?, motion_preset),
      transition_preset = COALESCE(?, transition_preset),
      noise_intensity = COALESCE(?, noise_intensity),
      noise_atmosphere = COALESCE(?, noise_atmosphere),
      noise_opacity = COALESCE(?, noise_opacity),
      shake_intensity = COALESCE(?, shake_intensity)
     WHERE id = ? AND project_id = ?`
  ).run(
    parsed.data.narration_text?.trim() ?? null,
    parsed.data.motion_preset ?? null,
    parsed.data.transition_preset ?? null,
    parsed.data.noise_intensity ?? null,
    parsed.data.noise_atmosphere ?? null,
    parsed.data.noise_opacity ?? null,
    parsed.data.shake_intensity ?? null,
    req.params.sceneId,
    req.params.id
  );

  res.json({ ok: true });
});

app.post('/api/projects/:id/scenes/apply-effects', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, user.id);
  if (!project) return res.status(404).json({ errorKey: 'pipeline.errorGeneric' });

  const schema = z.object({
    noise_intensity: z.number().int().min(0).max(100),
    noise_atmosphere: z.number().int().min(0).max(100),
    noise_opacity: z.number().int().min(0).max(100),
    shake_intensity: z.number().int().min(0).max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'pipeline.errorGeneric' });

  db.prepare(
    `UPDATE scenes SET
      noise_intensity = ?,
      noise_atmosphere = ?,
      noise_opacity = ?,
      shake_intensity = ?
     WHERE project_id = ?`
  ).run(
    parsed.data.noise_intensity,
    parsed.data.noise_atmosphere,
    parsed.data.noise_opacity,
    parsed.data.shake_intensity,
    req.params.id
  );

  res.json({ ok: true });
});

app.post('/api/projects/:id/scenes/:sceneId/regenerate', requireAuth, async (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    narration_text: z.string().optional(),
    regenerate_visual: z.boolean().default(true),
    regenerate_voice: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'pipeline.errorGeneric' });

  const result = await regenerateSingleScene({
    projectId: req.params.id,
    sceneId: req.params.sceneId,
    userId: user.id,
    narrationText: parsed.data.narration_text,
    regenerateVisual: parsed.data.regenerate_visual,
    regenerateVoice: parsed.data.regenerate_voice,
  });

  if (!result.ok) {
    return res.status(result.needed ? 402 : 400).json(result);
  }
  res.json({ ok: true, balance: getUserCreditBalance(user.id) });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, user.id);
  res.json({ ok: true });
});

app.post('/api/projects/:id/report', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    reason: z.string().min(2).max(120),
    details: z.string().max(1000).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'pipeline.errorGeneric' });

  db.prepare(
    'INSERT INTO reports (id, user_id, project_id, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), user.id, req.params.id, parsed.data.reason, parsed.data.details, 'open', new Date().toISOString());
  res.json({ ok: true });
});

// Billing & Payments
app.get('/api/billing/summary', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const balance = getUserCreditBalance(user.id);
  const plans = db.prepare('SELECT * FROM plans WHERE active = 1 ORDER BY sort ASC').all();
  const ledger = db
    .prepare('SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
    .all(user.id);
  const payments = db
    .prepare(
      `SELECT pay.*, pl.name as plan_name, pl.credits as plan_credits
       FROM payments pay
       LEFT JOIN plans pl ON pl.id = pay.plan_id
       WHERE pay.user_id = ?
       ORDER BY pay.created_at DESC LIMIT 30`
    )
    .all(user.id);
  const priceTable = db
    .prepare('SELECT key, label, credits_value, unit, notes FROM price_table WHERE active = 1 ORDER BY key ASC')
    .all();
  res.json({ balance, plans, ledger, payments, priceTable });
});

app.post('/api/billing/checkout', requireAuth, rateLimit(15), (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    plan_id: z.string(),
    method: z.enum(['mtn_momo', 'orange_money']),
    phone_number: z.string().min(6).max(20),
    idempotency_key: z.string().min(8).max(80),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'auth.errorGeneric' });

  try {
    const provider = getPaymentProvider();
    const session = provider.createCheckout({
      userId: user.id,
      planId: parsed.data.plan_id,
      method: parsed.data.method,
      phoneNumber: parsed.data.phone_number,
      idempotencyKey: parsed.data.idempotency_key,
    });
    res.json({
      ...session,
      isMockMode: !isProd && (process.env.PAYMENT_PROVIDER ?? 'mock') === 'mock',
    });
  } catch {
    res.status(400).json({ errorKey: 'auth.errorGeneric' });
  }
});

app.post('/api/billing/payments/:id/confirm-mock', requireAuth, (req, res) => {
  if (isProd || (process.env.PAYMENT_PROVIDER ?? 'mock') !== 'mock') {
    return res.status(404).end();
  }
  const user = (req as Request & { user: AuthedUser }).user;
  const pay = db.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(req.params.id, user.id) as {
    id: string;
    total_xaf: number;
  } | undefined;
  if (!pay) return res.status(404).end();

  const outcome = req.body?.outcome === 'failed' ? 'failed' : 'paid';
  const result = processPaymentWebhook({
    paymentId: pay.id,
    status: outcome,
    paidTotalXaf: outcome === 'paid' ? pay.total_xaf : undefined,
    rawPayload: { simulated: true, outcome },
  });
  res.json({ ...result, balance: getUserCreditBalance(user.id) });
});

app.post('/api/webhooks/payment', (req, res) => {
  const provider = getPaymentProvider();
  const sig = req.headers['x-webhook-signature'] as string | undefined;
  if (!provider.verifyWebhook(sig, JSON.stringify(req.body))) {
    return res.status(401).json({ ok: false });
  }
  const schema = z.object({
    provider_ref: z.string(),
    status: z.enum(['paid', 'failed', 'expired']),
    total_xaf: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false });

  const result = processPaymentWebhook({
    providerRef: parsed.data.provider_ref,
    status: parsed.data.status,
    paidTotalXaf: parsed.data.total_xaf,
    rawPayload: req.body,
  });
  res.json(result);
});

// Admin claim / unlock & console endpoints
app.get('/api/admin/status', requireAuth, (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  const stored = db.prepare("SELECT value FROM app_settings WHERE key = 'admin_passcode_hash'").get() as { value: string } | undefined;
  const isClaimed = Boolean(envPasscode || (stored?.value && stored.value.length > 0));
  res.json({
    isAdmin: user.role === 'admin',
    isClaimed,
  });
});

app.post('/api/admin/claim', requireAuth, rateLimit(10), (req, res) => {
  const user = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({ passcode: z.string().min(4).max(64) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'auth.errorGeneric' });

  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  const stored = db.prepare("SELECT value FROM app_settings WHERE key = 'admin_passcode_hash'").get() as { value: string } | undefined;

  if (envPasscode) {
    const a = Buffer.from(parsed.data.passcode);
    const b = Buffer.from(envPasscode);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ errorKey: 'auth.errorInvalidCredentials' });
    }
  } else if (stored?.value && stored.value.length > 0) {
    if (!verifyPassword(parsed.data.passcode, stored.value)) {
      return res.status(403).json({ errorKey: 'auth.errorInvalidCredentials' });
    }
  } else {
    // First-run atomic bootstrap: claim admin passcode
    const hashed = hashPassword(parsed.data.passcode);
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('admin_passcode_hash', ?)").run(hashed);
  }

  db.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?").run(new Date().toISOString(), user.id);
  writeAudit(user.id, 'admin_unlock', 'user', user.id, 'Unlocked admin console');
  res.json({ ok: true, user: getAuthedUser(req) });
});

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const totalRevenue = (db.prepare("SELECT COALESCE(SUM(amount_base_xaf), 0) as s FROM payments WHERE status = 'paid'").get() as { s: number }).s;
  const totalFees = (db.prepare("SELECT COALESCE(SUM(fee_xaf), 0) as s FROM payments WHERE status = 'paid'").get() as { s: number }).s;
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users WHERE suspended = 0').get() as { c: number }).c;
  const reelCount = (db.prepare("SELECT COUNT(*) as c FROM projects WHERE status = 'ready'").get() as { c: number }).c;
  const totalJobs = (db.prepare('SELECT COUNT(*) as c FROM jobs').get() as { c: number }).c;
  const failedJobs = (db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'failed'").get() as { c: number }).c;
  const providerCostUsd = (db.prepare('SELECT COALESCE(SUM(cost_usd), 0) as s FROM generation_costs').get() as { s: number }).s;

  const users = db.prepare('SELECT id, email, display_name, role, phone, phone_verified, suspended, created_at FROM users ORDER BY created_at DESC').all().map((u) => {
    const row = u as Record<string, unknown>;
    return {
      ...row,
      balance: getUserCreditBalance(String(row.id)),
    };
  });

  const payments = db
    .prepare(
      `SELECT pay.*, u.email as user_email, pl.name as plan_name
       FROM payments pay
       LEFT JOIN users u ON u.id = pay.user_id
       LEFT JOIN plans pl ON pl.id = pay.plan_id
       ORDER BY pay.created_at DESC LIMIT 50`
    )
    .all();

  const priceTable = db.prepare('SELECT * FROM price_table ORDER BY key ASC').all();
  const plans = db.prepare('SELECT * FROM plans ORDER BY sort ASC').all();
  const styles = db.prepare('SELECT * FROM styles').all();
  const voices = db.prepare('SELECT * FROM voices').all();
  const music = db.prepare("SELECT * FROM music_tracks WHERE source = 'library'").all();
  const jobs = db
    .prepare(
      `SELECT j.*, p.title as project_title, u.email as user_email
       FROM jobs j
       JOIN projects p ON p.id = j.project_id
       JOIN users u ON u.id = p.user_id
       ORDER BY j.created_at DESC LIMIT 50`
    )
    .all();
  const reports = db
    .prepare(
      `SELECT r.*, p.title as project_title, u.email as user_email
       FROM reports r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC`
    )
    .all();
  const settings = db.prepare("SELECT key, value FROM app_settings WHERE key != 'admin_passcode_hash'").all();
  const auditLog = db
    .prepare(
      `SELECT a.*, u.email as actor_email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.created_at DESC LIMIT 100`
    )
    .all();

  res.json({
    metrics: {
      totalRevenue,
      totalFees,
      userCount,
      reelCount,
      failRate: totalJobs > 0 ? Math.round((failedJobs / totalJobs) * 100) : 0,
      providerCostUsd: Number(providerCostUsd.toFixed(4)),
    },
    users,
    payments,
    priceTable,
    plans,
    styles,
    voices,
    music,
    jobs,
    reports,
    settings,
    auditLog,
  });
});

app.post('/api/admin/users/:id/adjust-credits', requireAdmin, (req, res) => {
  const actor = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    delta: z.number().int().min(-100000).max(100000),
    reason: z.string().min(3).max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'auth.errorGeneric' });

  const newBal = grantCredits({
    userId: req.params.id,
    amount: parsed.data.delta,
    source: 'admin',
    reason: 'admin_adjust',
    expiresAt: null,
    meta: { reason: parsed.data.reason, actor_id: actor.id },
  });
  writeAudit(actor.id, 'adjust_credits', 'user', req.params.id, parsed.data.reason, {
    delta: parsed.data.delta,
    balance_after: newBal,
  });
  res.json({ ok: true, balance: getUserCreditBalance(req.params.id) });
});

app.post('/api/admin/users/:id/suspend', requireAdmin, (req, res) => {
  const actor = (req as Request & { user: AuthedUser }).user;
  const suspended = Boolean(req.body?.suspended);
  db.prepare('UPDATE users SET suspended = ?, updated_at = ? WHERE id = ?').run(
    suspended ? 1 : 0,
    new Date().toISOString(),
    req.params.id
  );
  writeAudit(actor.id, suspended ? 'suspend_user' : 'unsuspend_user', 'user', req.params.id, 'Admin status toggle');
  res.json({ ok: true });
});

app.patch('/api/admin/pricing/:key', requireAdmin, (req, res) => {
  const actor = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({ credits_value: z.number().min(0).max(10000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'auth.errorGeneric' });

  db.prepare('UPDATE price_table SET credits_value = ?, updated_at = ? WHERE key = ?').run(
    parsed.data.credits_value,
    new Date().toISOString(),
    req.params.key
  );
  writeAudit(actor.id, 'update_price_table', 'price_table', req.params.key, `Set to ${parsed.data.credits_value}`);
  res.json({ ok: true });
});

app.patch('/api/admin/plans/:id', requireAdmin, (req, res) => {
  const actor = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    price_xaf: z.number().int().min(0).optional(),
    credits: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'auth.errorGeneric' });

  db.prepare(
    `UPDATE plans SET
      price_xaf = COALESCE(?, price_xaf),
      credits = COALESCE(?, credits),
      active = COALESCE(?, active)
     WHERE id = ?`
  ).run(
    parsed.data.price_xaf ?? null,
    parsed.data.credits ?? null,
    parsed.data.active === undefined ? null : parsed.data.active ? 1 : 0,
    req.params.id
  );
  writeAudit(actor.id, 'update_plan', 'plan', req.params.id, 'Updated plan settings');
  res.json({ ok: true });
});

app.post('/api/admin/payments/:id/refund', requireAdmin, (req, res) => {
  const actor = (req as Request & { user: AuthedUser }).user;
  const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as {
    id: string;
    user_id: string;
    plan_id: string;
    status: string;
  } | undefined;
  if (!pay || pay.status !== 'paid') return res.status(400).json({ errorKey: 'auth.errorGeneric' });

  const plan = db.prepare('SELECT credits FROM plans WHERE id = ?').get(pay.plan_id) as { credits: number } | undefined;
  if (plan) {
    grantCredits({
      userId: pay.user_id,
      amount: -plan.credits,
      source: 'admin',
      reason: 'admin_adjust',
      expiresAt: null,
      meta: { refund_payment_id: pay.id },
    });
  }
  db.prepare("UPDATE payments SET status = 'refunded', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    pay.id
  );
  writeAudit(actor.id, 'refund_payment', 'payment', pay.id, 'Admin refunded payment');
  res.json({ ok: true });
});

app.patch('/api/admin/styles/:id', requireAdmin, (req, res) => {
  const actor = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({
    active: z.boolean().optional(),
    image_cost_multiplier: z.number().min(0.5).max(5).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'auth.errorGeneric' });

  db.prepare(
    `UPDATE styles SET
      active = COALESCE(?, active),
      image_cost_multiplier = COALESCE(?, image_cost_multiplier)
     WHERE id = ?`
  ).run(
    parsed.data.active === undefined ? null : parsed.data.active ? 1 : 0,
    parsed.data.image_cost_multiplier ?? null,
    req.params.id
  );
  writeAudit(actor.id, 'update_style', 'style', req.params.id, 'Updated style configuration');
  res.json({ ok: true });
});

app.post('/api/admin/test-recipe', requireAdmin, async (req, res) => {
  const schema = z.object({
    sub_niche_id: z.string(),
    topic: z.string().min(3),
    language_code: z.string().min(2).max(5),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errorKey: 'pipeline.errorGeneric' });

  const sn = db
    .prepare(
      `SELECT sn.*, r.config_json FROM sub_niches sn
       JOIN recipes r ON r.sub_niche_id = sn.id AND r.active = 1
       WHERE sn.id = ? ORDER BY r.version DESC LIMIT 1`
    )
    .get(parsed.data.sub_niche_id) as { name: string; config_json: string } | undefined;
  const lang = db.prepare('SELECT name FROM languages WHERE code = ?').get(parsed.data.language_code) as { name: string } | undefined;
  if (!sn || !lang) return res.status(404).json({ errorKey: 'pipeline.errorGeneric' });

  const recipe = JSON.parse(sn.config_json) as RecipeConfig;
  try {
    const { bestHook, candidates } = await generateBestHook({
      topic: parsed.data.topic,
      subNicheName: sn.name,
      languageName: lang.name,
      recipe,
    });
    const draft = await writeNativeScript({
      hook: bestHook,
      topic: parsed.data.topic,
      durationSeconds: 30,
      languageName: lang.name,
      recipe,
    });
    const edited = await runRetentionEditor({
      script: draft,
      languageName: lang.name,
      recipe,
    });
    const split = await splitScriptIntoScenes({
      script: edited.script,
      sceneCount: 5,
      styleCard: 'Cinematic 35mm documentary still',
      characterCard: null,
      characterLabel: null,
      isHorror: false,
      recipe,
    });
    res.json({
      bestHook,
      candidates,
      edited,
      split,
    });
  } catch {
    res.status(502).json({ errorKey: 'pipeline.errorGeneric' });
  }
});

app.patch('/api/admin/settings', requireAdmin, (req, res) => {
  const actor = (req as Request & { user: AuthedUser }).user;
  const schema = z.object({ key: z.string(), value: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || parsed.data.key === 'admin_passcode_hash') {
    return res.status(400).json({ errorKey: 'auth.errorGeneric' });
  }
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
    parsed.data.key,
    parsed.data.value
  );
  writeAudit(actor.id, 'update_setting', 'app_settings', parsed.data.key, `Updated ${parsed.data.key}`);
  res.json({ ok: true });
});

async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Reely AI server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
