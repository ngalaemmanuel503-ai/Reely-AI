import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { calculateCreditQuote, getSceneCountForLength } from '../src/shared/credits.ts';
import type { LengthTier, RecipeConfig, VoiceTier } from '../src/shared/types.ts';
import {
  db,
  GENERATED_DIR,
  getPriceMap,
  getUserCreditBalance,
  grantCredits,
  reserveCredits,
} from './db.ts';
import {
  generateBestHook,
  moderateTopic,
  runRetentionEditor,
  splitScriptIntoScenes,
  synthesizeSceneVoiceWav,
  writeNativeScript,
} from './gemini.ts';
import { renderSceneArtworkSvg } from './visuals.ts';

function buildOfflineFallbackSplit(params: {
  topic: string;
  subNicheName: string;
  sceneCount: number;
  styleCard: string;
  isPsychOrHorror: boolean;
}) {
  const cleanTopic = params.topic.replace(/\s+/g, ' ').trim();
  const shortTitle = cleanTopic.split(/\s+/).slice(0, 5).join(' ') || `${params.subNicheName} Story`;
  const beats = [
    {
      narration: `${cleanTopic.slice(0, 95)} — most people never notice the pattern until it repeats.`,
      motif: 'rainy window evening silhouette',
      motion: params.isPsychOrHorror ? ('shake_subtle' as const) : ('slow_zoom_in' as const),
    },
    {
      narration: 'In quiet moments after midnight, unfinished thoughts feel louder than they ever did at noon.',
      motif: 'dimly lit hallway doorway',
      motion: 'push_in' as const,
    },
    {
      narration: 'Psychology reminds us that awareness breaks the automatic loop faster than forcing control.',
      motif: 'lonely night street wet asphalt',
      motion: params.isPsychOrHorror ? ('shake_subtle' as const) : ('pan_right' as const),
    },
    {
      narration: 'Write one clear truth down, slow your breathing, and let your attention return to what stands in front of you.',
      motif: 'warm desk lamp open notebook',
      motion: 'slow_zoom_out' as const,
    },
    {
      narration: 'Everything changes the moment you observe the thought instead of becoming it.',
      motif: 'sunrise horizon calm silhouette',
      motion: params.isPsychOrHorror ? ('shake_subtle' as const) : ('pan_up' as const),
    },
  ];
  const scenes = Array.from({ length: params.sceneCount }, (_, idx) => {
    const b = beats[idx % beats.length];
    return {
      narration_text: b.narration,
      delivery_tags: ['[calmly]'],
      pause_after_ms: 450,
      image_prompt: `${b.motif}, ${params.styleCard}`,
      motion_preset: b.motion,
      transition_preset: 'crossfade' as const,
      on_screen_text: shortTitle,
    };
  });
  return { title: shortTitle, scenes };
}

function recordJobEvent(
  jobId: string,
  step: string,
  messageKey: string,
  status: 'running' | 'completed' | 'failed',
  progressPct: number,
  errorKey: string | null = null
) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE jobs SET current_step = ?, message_key = ?, status = ?, progress_pct = ?, error_key = ?, updated_at = ?
     WHERE id = ?`
  ).run(step, messageKey, status === 'failed' ? 'failed' : step === 'finish' && status === 'completed' ? 'completed' : 'running', progressPct, errorKey, now, jobId);

  db.prepare(
    `INSERT INTO job_events (id, job_id, step, message_key, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), jobId, step, messageKey, status, now);
}

function logCost(projectId: string, provider: string, model: string, step: string, units: number, costUsd: number) {
  db.prepare(
    `INSERT INTO generation_costs (id, project_id, provider, model, step, units, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), projectId, provider, model, step, units, costUsd, new Date().toISOString());
}

export async function runGenerateReelJob(projectId: string, jobId: string) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as {
    id: string;
    user_id: string;
    title: string;
    niche_id: string;
    sub_niche_id: string;
    reel_language: string;
    topic: string;
    style_id: string;
    character_id: string | null;
    voice_id: string;
    voice_speed: number;
    music_track_id: string | null;
    caption_preset: string;
    length_tier: LengthTier;
    credits_quoted: number;
  } | undefined;

  if (!project) return;

  const subNiche = db
    .prepare(
      `SELECT sn.*, r.config_json FROM sub_niches sn
       JOIN recipes r ON r.sub_niche_id = sn.id AND r.active = 1
       WHERE sn.id = ? ORDER BY r.version DESC LIMIT 1`
    )
    .get(project.sub_niche_id) as { id: string; slug: string; name: string; config_json: string } | undefined;

  const style = db.prepare('SELECT * FROM styles WHERE id = ?').get(project.style_id) as {
    id: string;
    slug: string;
    style_card: string;
    image_cost_multiplier: number;
  } | undefined;

  const voice = db.prepare('SELECT * FROM voices WHERE id = ?').get(project.voice_id) as {
    id: string;
    tier: VoiceTier;
    prebuilt_gemini_voice: string;
    name: string;
  } | undefined;

  const lang = db.prepare('SELECT * FROM languages WHERE code = ?').get(project.reel_language) as {
    code: string;
    name: string;
  } | undefined;

  const character = project.character_id
    ? (db.prepare('SELECT * FROM characters WHERE id = ?').get(project.character_id) as {
        id: string;
        name: string;
        description_card: string;
      } | undefined)
    : undefined;

  if (!subNiche || !style || !voice || !lang) {
    recordJobEvent(jobId, 'validate', 'pipeline.errorGeneric', 'failed', 0, 'pipeline.errorGeneric');
    db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run('failed', new Date().toISOString(), projectId);
    return;
  }

  const recipe = JSON.parse(subNiche.config_json) as RecipeConfig;
  let creditsReserved = project.credits_quoted;

  try {
    // 1. Validate & Reserve (already reserved at creation if >0, otherwise reserve now)
    recordJobEvent(jobId, 'validate', 'pipeline.step_validate', 'running', 8);

    const isPsychOrHorror = project.niche_id === 'niche_psych' || project.niche_id === 'niche_horror';
    const sceneCount = getSceneCountForLength(project.length_tier);
    let split: { title: string; scenes: Awaited<ReturnType<typeof splitScriptIntoScenes>>['scenes'] };

    try {
      // 2. Moderate
      recordJobEvent(jobId, 'moderate', 'pipeline.step_moderate', 'running', 15);
      const mod = await moderateTopic(project.topic, subNiche.slug);
      logCost(projectId, 'gemini', 'gemini-3.1-flash-lite', 'moderate', 1, 0.0002);

      if (mod.decision === 'refuse') {
        // Refund reserved credits immediately
        if (creditsReserved > 0) {
          grantCredits({
            userId: project.user_id,
            amount: creditsReserved,
            source: 'topup',
            reason: 'refund',
            expiresAt: null,
            projectId,
            jobId,
            meta: { reason: mod.reasonKey },
          });
          creditsReserved = 0;
        }
        recordJobEvent(jobId, 'moderate', mod.reasonKey, 'failed', 15, mod.reasonKey);
        db.prepare('UPDATE projects SET status = ?, credits_final = 0, updated_at = ? WHERE id = ?').run(
          'failed',
          new Date().toISOString(),
          projectId
        );
        return;
      }

      // 3. Hooks
      recordJobEvent(jobId, 'hooks', 'pipeline.step_hooks', 'running', 25);
      const { bestHook } = await generateBestHook({
        topic: project.topic,
        subNicheName: subNiche.name,
        languageName: lang.name,
        recipe,
      });
      logCost(projectId, 'gemini', 'gemini-3.1-flash-lite', 'hooks', 2, 0.0005);

      // 4. Script
      recordJobEvent(jobId, 'script', 'pipeline.step_script', 'running', 38);
      const rawScript = await writeNativeScript({
        hook: bestHook,
        topic: project.topic,
        durationSeconds: project.length_tier,
        languageName: lang.name,
        recipe,
      });
      logCost(projectId, 'gemini', 'gemini-4-hydrogen', 'script', 1, 0.002);

      // 5. Retention Editor
      recordJobEvent(jobId, 'editor', 'pipeline.step_editor', 'running', 50);
      const edited = await runRetentionEditor({
        script: rawScript,
        languageName: lang.name,
        recipe,
      });
      logCost(projectId, 'gemini', 'gemini-4-hydrogen', 'editor', 1, 0.002);

      // 6. Scene Split
      recordJobEvent(jobId, 'scenes', 'pipeline.step_scenes', 'running', 60);
      split = await splitScriptIntoScenes({
        script: edited.script,
        sceneCount,
        styleCard: style.style_card,
        characterCard: character?.description_card ?? null,
        characterLabel: character?.name ?? null,
        isHorror: subNiche.slug === 'midnight-mystery',
        isPsychology: project.niche_id === 'niche_psych',
        recipe,
      });
      logCost(projectId, 'gemini', 'gemini-4-hydrogen', 'scene_split', 1, 0.0025);
    } catch (geminiErr) {
      if (geminiErr instanceof Error && geminiErr.message === 'GEMINI_API_KEY_MISSING') {
        recordJobEvent(jobId, 'scenes', 'pipeline.step_scenes', 'running', 60);
        split = buildOfflineFallbackSplit({
          topic: project.topic,
          subNicheName: subNiche.name,
          sceneCount,
          styleCard: style.style_card,
          isPsychOrHorror,
        });
      } else {
        throw geminiErr;
      }
    }

    const defaultNoiseIntensity = isPsychOrHorror ? 42 : 20;
    const defaultNoiseAtmosphere = isPsychOrHorror ? 52 : 25;
    const defaultNoiseOpacity = isPsychOrHorror ? 38 : 20;
    const defaultShakeIntensity = isPsychOrHorror ? 36 : 24;

    // Save scenes incrementally so Progress screen shows partial script & scenes!
    db.prepare('DELETE FROM scenes WHERE project_id = ?').run(projectId);
    const insertScene = db.prepare(`
      INSERT INTO scenes (
        id, project_id, idx, narration_text, delivery_tags_json, pause_after_ms,
        image_prompt, image_url, motion_preset, transition_preset, on_screen_text,
        audio_url, duration_ms, noise_intensity, noise_atmosphere, noise_opacity, shake_intensity, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'pending')
    `);

    const sceneRecords: Array<{
      id: string;
      idx: number;
      narration_text: string;
      delivery_tags: string[];
      pause_after_ms: number;
      image_prompt: string;
    }> = [];

    split.scenes.forEach((sc, idx) => {
      const sid = crypto.randomUUID();
      insertScene.run(
        sid,
        projectId,
        idx,
        sc.narration_text,
        JSON.stringify(sc.delivery_tags),
        sc.pause_after_ms,
        sc.image_prompt,
        '',
        sc.motion_preset,
        sc.transition_preset,
        sc.on_screen_text,
        Math.round((sc.narration_text.split(/\s+/).length / 2.3) * 1000) + sc.pause_after_ms,
        defaultNoiseIntensity,
        defaultNoiseAtmosphere,
        defaultNoiseOpacity,
        defaultShakeIntensity
      );
      sceneRecords.push({
        id: sid,
        idx,
        narration_text: sc.narration_text,
        delivery_tags: sc.delivery_tags,
        pause_after_ms: sc.pause_after_ms,
        image_prompt: sc.image_prompt,
      });
    });

    if (project.title === 'New Reel' && split.title) {
      db.prepare('UPDATE projects SET title = ?, updated_at = ? WHERE id = ?').run(
        split.title,
        new Date().toISOString(),
        projectId
      );
    }

    // 7. Visuals
    recordJobEvent(jobId, 'visuals', 'pipeline.step_visuals', 'running', 72);
    let firstThumb = '';
    for (const sc of sceneRecords) {
      const svgUrl = renderSceneArtworkSvg({
        fileId: sc.id,
        styleSlug: style.slug,
        imagePrompt: sc.image_prompt,
        sceneIdx: sc.idx,
        hasCharacter: Boolean(character),
        characterName: character?.name ?? null,
      });
      if (!firstThumb) firstThumb = svgUrl;
      db.prepare('UPDATE scenes SET image_url = ?, status = ? WHERE id = ?').run(svgUrl, 'ready', sc.id);
    }

    // 8. Voiceover (sentence-by-sentence via Gemini 3.8 Flash Lite TTS)
    recordJobEvent(jobId, 'voice', 'pipeline.step_voice', 'running', 84);
    let totalVoiceSeconds = 0;
    for (const sc of sceneRecords) {
      const stylePrompt = `${recipe.narrator.tone}. ${sc.delivery_tags.join(' ')}`.trim();
      try {
        const { wavBuffer, durationMs } = await synthesizeSceneVoiceWav({
          text: sc.narration_text,
          prebuiltVoiceName: voice.prebuilt_gemini_voice,
          narratorStyle: stylePrompt,
        });
        const wavName = `voice_${sc.id}.wav`;
        fs.writeFileSync(path.resolve(GENERATED_DIR, wavName), wavBuffer);
        const audioUrl = `/generated/${wavName}`;
        const totalDurationMs = Math.round(durationMs / Math.max(0.85, Math.min(1.15, project.voice_speed))) + sc.pause_after_ms;
        totalVoiceSeconds += durationMs / 1000;
        db.prepare('UPDATE scenes SET audio_url = ?, duration_ms = ? WHERE id = ?').run(
          audioUrl,
          totalDurationMs,
          sc.id
        );
        logCost(projectId, 'gemini', 'gemini-3.8-flash-lite-tts', 'voice', Math.ceil(durationMs / 1000), 0.0012);
      } catch (ttsErr) {
        // Fallback duration if TTS encounters a transient error on a single scene
        console.warn('TTS scene warning:', ttsErr instanceof Error ? ttsErr.message : 'TTS issue');
      }
    }

    // 9. Timeline & 10. Render prep
    recordJobEvent(jobId, 'timeline', 'pipeline.step_timeline', 'running', 92);
    recordJobEvent(jobId, 'render', 'pipeline.step_render', 'running', 96);

    // Compute final credit settlement (never exceeds quoted)
    const prices = getPriceMap();
    const actualQuote = calculateCreditQuote({
      lengthTier: project.length_tier,
      hasCharacter: Boolean(project.character_id),
      styleMultiplier: style.image_cost_multiplier,
      voiceTier: voice.tier,
      prices,
    });
    const actualCredits = Math.min(project.credits_quoted, actualQuote.total);
    const refundDiff = Math.max(0, project.credits_quoted - actualCredits);
    if (refundDiff > 0) {
      grantCredits({
        userId: project.user_id,
        amount: refundDiff,
        source: 'topup',
        reason: 'refund',
        expiresAt: null,
        projectId,
        jobId,
        meta: { settlement_refund: refundDiff },
      });
    } else {
      // Log settle entry of 0 delta for clear audit trail
      const bal = getUserCreditBalance(project.user_id).total;
      db.prepare(
        `INSERT INTO credit_ledger (id, user_id, delta, reason, project_id, job_id, balance_after, meta_json, created_at)
         VALUES (?, ?, 0, 'settle', ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        project.user_id,
        projectId,
        jobId,
        bal,
        JSON.stringify({ actual_credits: actualCredits, voice_seconds: Math.round(totalVoiceSeconds) }),
        new Date().toISOString()
      );
    }

    // 11. Finish
    db.prepare(
      `UPDATE projects SET status = 'ready', credits_final = ?, thumbnail_url = ?, updated_at = ? WHERE id = ?`
    ).run(actualCredits, firstThumb, new Date().toISOString(), projectId);

    recordJobEvent(jobId, 'finish', 'pipeline.step_finish', 'completed', 100);
  } catch (err) {
    console.error('Pipeline failure:', err);
    if (creditsReserved > 0) {
      grantCredits({
        userId: project.user_id,
        amount: creditsReserved,
        source: 'topup',
        reason: 'refund',
        expiresAt: null,
        projectId,
        jobId,
        meta: { reason: 'pipeline_failure' },
      });
    }
    recordJobEvent(jobId, 'failed', 'pipeline.errorGeneric', 'failed', 0, 'pipeline.errorGeneric');
    db.prepare('UPDATE projects SET status = ?, credits_final = 0, updated_at = ? WHERE id = ?').run(
      'failed',
      new Date().toISOString(),
      projectId
    );
  }
}

export async function regenerateSingleScene(params: {
  projectId: string;
  sceneId: string;
  userId: string;
  narrationText?: string;
  regenerateVisual?: boolean;
  regenerateVoice?: boolean;
}): Promise<{ ok: true } | { ok: false; errorKey: string; available?: number; needed?: number }> {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(params.projectId, params.userId) as {
    id: string;
    style_id: string;
    character_id: string | null;
    voice_id: string;
    voice_speed: number;
  } | undefined;
  const scene = db.prepare('SELECT * FROM scenes WHERE id = ? AND project_id = ?').get(params.sceneId, params.projectId) as {
    id: string;
    idx: number;
    narration_text: string;
    image_prompt: string;
    pause_after_ms: number;
  } | undefined;

  if (!project || !scene) {
    return { ok: false, errorKey: 'pipeline.errorGeneric' };
  }

  const style = db.prepare('SELECT * FROM styles WHERE id = ?').get(project.style_id) as {
    slug: string;
    image_cost_multiplier: number;
  };
  const voice = db.prepare('SELECT * FROM voices WHERE id = ?').get(project.voice_id) as {
    tier: VoiceTier;
    prebuilt_gemini_voice: string;
  };
  const prices = getPriceMap();

  let cost = 0;
  if (params.regenerateVisual) {
    const baseImg = project.character_id ? (prices.image_character ?? 30) : (prices.image_standard ?? 15);
    cost += Math.round(baseImg * (style?.image_cost_multiplier ?? 1));
  }
  if (params.regenerateVoice) {
    const rate = voice.tier === 'premium' ? (prices.voice_premium_per_sec ?? 1.2) : (prices.voice_standard_per_sec ?? 0.3);
    cost += Math.max(2, Math.round(4 * rate));
  }

  if (cost > 0) {
    const res = reserveCredits(params.userId, cost, params.projectId, `regen_${scene.id}`);
    if (!res.ok) {
      return { ok: false, errorKey: 'wizard.insufficientTitle', available: res.available, needed: cost };
    }
  }

  const nextNarration = params.narrationText?.trim() || scene.narration_text;
  db.prepare('UPDATE scenes SET narration_text = ? WHERE id = ?').run(nextNarration, scene.id);

  if (params.regenerateVisual) {
    const newId = `${scene.id}_${Date.now()}`;
    const newImg = renderSceneArtworkSvg({
      fileId: newId,
      styleSlug: style.slug,
      imagePrompt: scene.image_prompt,
      sceneIdx: scene.idx + Math.floor(Math.random() * 10),
      hasCharacter: Boolean(project.character_id),
    });
    db.prepare('UPDATE scenes SET image_url = ? WHERE id = ?').run(newImg, scene.id);
    if (scene.idx === 0) {
      db.prepare('UPDATE projects SET thumbnail_url = ? WHERE id = ?').run(newImg, params.projectId);
    }
  }

  if (params.regenerateVoice) {
    try {
      const { wavBuffer, durationMs } = await synthesizeSceneVoiceWav({
        text: nextNarration,
        prebuiltVoiceName: voice.prebuilt_gemini_voice,
        narratorStyle: 'Clear, natural storyteller',
      });
      const wavName = `voice_${scene.id}_${Date.now()}.wav`;
      fs.writeFileSync(path.resolve(GENERATED_DIR, wavName), wavBuffer);
      const totalDurationMs = Math.round(durationMs / Math.max(0.85, Math.min(1.15, project.voice_speed))) + scene.pause_after_ms;
      db.prepare('UPDATE scenes SET audio_url = ?, duration_ms = ? WHERE id = ?').run(
        `/generated/${wavName}`,
        totalDurationMs,
        scene.id
      );
    } catch (err) {
      if (cost > 0) {
        grantCredits({
          userId: params.userId,
          amount: cost,
          source: 'topup',
          reason: 'refund',
          expiresAt: null,
          projectId: params.projectId,
          meta: { reason: 'regen_voice_failed' },
        });
      }
      return { ok: false, errorKey: 'pipeline.errorGeneric' };
    }
  }

  return { ok: true };
}
