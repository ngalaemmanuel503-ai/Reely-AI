import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { MotionPreset, RecipeConfig, TransitionPreset } from '../src/shared/types.ts';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const VALID_MOTIONS: MotionPreset[] = [
  'slow_zoom_in',
  'slow_zoom_out',
  'pan_left',
  'pan_right',
  'pan_up',
  'pan_down',
  'push_in',
  'handheld_float',
  'shake_subtle',
];

const VALID_TRANSITIONS: TransitionPreset[] = [
  'crossfade',
  'dip_to_black',
  'slide',
  'whip_pan',
  'light_leak',
  'glitch_cut',
];

export interface ModerationResult {
  decision: 'allow' | 'refuse';
  reasonKey: string;
}

export async function moderateTopic(
  topic: string,
  subNicheSlug: string
): Promise<ModerationResult> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: `Classify this short vertical video topic for safety.
Topic: "${topic}"
Sub-niche: "${subNicheSlug}"
Check against: sexual content, minors in danger, graphic violence, hate speech, self-harm or suicide, deepfakes of real people, medical/legal diagnosis presented as fact, illegal activity.
Return JSON with decision ("allow" or "refuse") and category ("safe", "self_harm", "unsafe").`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          decision: { type: Type.STRING },
          category: { type: Type.STRING },
        },
        required: ['decision', 'category'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    decision?: string;
    category?: string;
  };

  if (parsed.decision === 'refuse') {
    if (parsed.category === 'self_harm') {
      return { decision: 'refuse', reasonKey: 'pipeline.errorSelfHarmSupport' };
    }
    return { decision: 'refuse', reasonKey: 'pipeline.errorModeration' };
  }
  return { decision: 'allow', reasonKey: '' };
}

export interface SurpriseIdeaResult {
  titleSuggestion: string;
  concept: string;
  combined: string;
}

async function generateWithFreeModelFallback(
  contents: string,
  options?: {
    models?: readonly string[];
    timeoutMs?: number;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  }
) {
  const ai = getClient();
  const models = options?.models ?? ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  const timeoutMs = options?.timeoutMs ?? 20_000;
  let lastError: unknown;

  for (const model of models) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: {
          abortSignal: AbortSignal.timeout(timeoutMs),
          ...(model === 'gemini-4-hydrogen'
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          ...(options?.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
          ...(options?.responseSchema ? { responseSchema: options.responseSchema } : {}),
        },
      });
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('TimeoutError') ||
        msg.includes('AbortError') ||
        msg.includes('aborted');
      if (!isTransient) {
        throw err;
      }
      console.warn(`[gemini] model ${model} transient failure, trying fallback:`, msg.slice(0, 160));
    }
  }
  throw lastError;
}

export async function generateSurpriseTopic(
  nicheContextName: string,
  languageName: string,
  options?: { description?: string; previousTopic?: string }
): Promise<SurpriseIdeaResult> {
  const avoidClause = options?.previousTopic
    ? `\nDo NOT repeat or closely paraphrase this previous idea:\n"${options.previousTopic.slice(0, 240)}"`
    : '';
  const descClause = options?.description ? `\nNiche guidance: ${options.description}` : '';

  const response = await generateWithFreeModelFallback(
    `Create one original, high-retention short vertical video (9:16 reel) script idea in ${languageName} for the niche "${nicheContextName}".${descClause}${avoidClause}

Return JSON with:
- topic: a sharp 6-to-12-word topic hook/title in ${languageName}
- concept: a vivid 1-to-2-sentence story concept (under 35 words) in ${languageName} explaining the opening scene, narrative turn, and ending payoff.`,
    {
      models: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
      timeoutMs: 12_000,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          concept: { type: Type.STRING },
        },
        required: ['topic', 'concept'],
      },
    }
  );

  const rawText = (response.text ?? '').trim();
  const cleanedJson = rawText.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  let parsed: { topic?: string; concept?: string } = {};
  try {
    parsed = JSON.parse(cleanedJson || '{}') as { topic?: string; concept?: string };
  } catch {
    if (cleanedJson) {
      return {
        titleSuggestion: cleanedJson.split('\n')[0].slice(0, 80),
        concept: cleanedJson,
        combined: cleanedJson.slice(0, 480),
      };
    }
  }
  const cleanTopic = (parsed.topic ?? '').trim().replace(/^["']|["']$/g, '');
  const cleanConcept = (parsed.concept ?? '').trim().replace(/^["']|["']$/g, '');

  if (!cleanTopic && !cleanConcept) {
    throw new Error('GEMINI_EMPTY_RESPONSE');
  }

  const combined =
    cleanTopic && cleanConcept
      ? `Topic: ${cleanTopic}\nConcept: ${cleanConcept}`.slice(0, 480)
      : (cleanTopic || cleanConcept).slice(0, 480);

  return {
    titleSuggestion: cleanTopic || cleanConcept.slice(0, 60),
    concept: cleanConcept || cleanTopic,
    combined,
  };
}

export async function generateBestHook(params: {
  topic: string;
  subNicheName: string;
  languageName: string;
  recipe: RecipeConfig;
}): Promise<{ bestHook: string; candidates: Array<{ text: string; style: string; score: number }> }> {
  const ai = getClient();
  const hookStylesText = params.recipe.hook_styles
    .map((h) => `${h.name}: ${h.pattern} (Examples: ${h.examples.join(' / ')})`)
    .join('; ');

  const genResp = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: `You write opening lines for short vertical videos.
Niche: ${params.subNicheName}
Language: ${params.languageName}
Topic: ${params.topic}
Allowed hook styles: ${hookStylesText}
Write 5 different hooks of 12 words or fewer, in natural spoken ${params.languageName}, each creating a question the viewer must have answered. No greetings, no clichés, no "Did you know".
Return JSON array of objects with text, style, and why.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            style: { type: Type.STRING },
            why: { type: Type.STRING },
          },
          required: ['text', 'style', 'why'],
        },
      },
    },
  });

  const candidates = JSON.parse((genResp.text ?? '[]').trim()) as Array<{
    text: string;
    style: string;
    why: string;
  }>;

  if (!candidates.length) {
    return { bestHook: params.topic, candidates: [] };
  }

  const scoreResp = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: `Score each of these ${params.languageName} video hooks from 1 to 10 for curiosity, clarity, and brevity (must be <= 12 words). Return JSON array with index and score.
Hooks:
${candidates.map((c, i) => `${i}: ${c.text}`).join('\n')}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            index: { type: Type.INTEGER },
            score: { type: Type.NUMBER },
          },
          required: ['index', 'score'],
        },
      },
    },
  });

  const scores = JSON.parse((scoreResp.text ?? '[]').trim()) as Array<{
    index: number;
    score: number;
  }>;

  const merged = candidates.map((c, idx) => {
    const found = scores.find((s) => s.index === idx);
    return { text: c.text, style: c.style, score: found?.score ?? 7 };
  });
  merged.sort((a, b) => b.score - a.score);

  return {
    bestHook: merged[0]?.text ?? candidates[0].text,
    candidates: merged,
  };
}

export async function writeNativeScript(params: {
  hook: string;
  topic: string;
  durationSeconds: number;
  languageName: string;
  recipe: RecipeConfig;
}): Promise<string> {
  const wordTarget = Math.round(params.durationSeconds * params.recipe.pacing.words_per_second);
  const beats = params.recipe.structure_beats
    .map((b) => `${b.name} (${b.share_pct}%): ${b.purpose}`)
    .join(' -> ');

  const response = await generateWithFreeModelFallback(
    `You are a professional short-form storyteller.
Write the spoken narration for a ${params.durationSeconds}-second vertical reel (about ${wordTarget} words) natively in ${params.languageName}, never as a translation.
Topic: ${params.topic}
Start with this exact opening hook: ${params.hook}
Follow these story beats: ${beats}
Narrator tone: ${params.recipe.narrator.tone}
Rules:
- First sentence must work with zero prior context.
- Sentences of ${params.recipe.pacing.sentence_length_min} to ${params.recipe.pacing.sentence_length_max} words.
- One clear idea per sentence; concrete images over abstractions.
- Open a question early and answer it only near the end.
- Vary sentence rhythm; zero filler, no greetings, no "in this video".
- Echo the opening hook at the end so the reel loops cleanly.
- Ending style: ${params.recipe.ending_types[0] ?? 'loop-back'}.
- Never include stage directions or speaker labels.
- Never include: ${params.recipe.forbidden.join(', ')}.
Return ONLY the narration text.`,
    { models: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'], timeoutMs: 25_000 }
  );

  return (response.text ?? '').trim();
}

export async function runRetentionEditor(params: {
  script: string;
  languageName: string;
  recipe: RecipeConfig;
}): Promise<{ script: string; changes: string; hook_score: number; ending_score: number }> {
  const editOnce = async (draft: string) => {
    const resp = await generateWithFreeModelFallback(
      `You are a ruthless short-video retention editor.
Edit this ${params.languageName} script to eliminate slow openings, repeated lines, vague wording, or sentences over 14 words.
Ensure the hook takes under 3 seconds spoken, the ending echoes the opening hook, and nothing violates: ${params.recipe.forbidden.join(', ')}.
Draft script:
${draft}`,
      {
        models: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
        timeoutMs: 25_000,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            script: { type: Type.STRING },
            changes: { type: Type.STRING },
            hook_score: { type: Type.NUMBER },
            ending_score: { type: Type.NUMBER },
          },
          required: ['script', 'changes', 'hook_score', 'ending_score'],
        },
      }
    );
    return JSON.parse((resp.text ?? '{}').trim()) as {
      script: string;
      changes: string;
      hook_score: number;
      ending_score: number;
    };
  };

  let result = await editOnce(params.script);
  if ((result.hook_score ?? 8) < 8 || (result.ending_score ?? 8) < 8) {
    result = await editOnce(result.script || params.script);
  }
  return result;
}

export interface SplitSceneOutput {
  narration_text: string;
  delivery_tags: string[];
  pause_after_ms: number;
  image_prompt: string;
  motion_preset: MotionPreset;
  transition_preset: TransitionPreset;
  on_screen_text: string;
}

export async function splitScriptIntoScenes(params: {
  script: string;
  sceneCount: number;
  styleCard: string;
  characterCard: string | null;
  characterLabel: string | null;
  isHorror: boolean;
  isPsychology?: boolean;
  recipe: RecipeConfig;
}): Promise<{ title: string; scenes: SplitSceneOutput[] }> {
  const allowedMotions =
    params.isHorror || params.isPsychology
      ? VALID_MOTIONS
      : VALID_MOTIONS.filter((m) => m !== 'shake_subtle');
  const allowedTransitions = params.isHorror
    ? VALID_TRANSITIONS
    : VALID_TRANSITIONS.filter((t) => t !== 'glitch_cut');

  const prompt = `Split this narration script into exactly ${params.sceneCount} sequential scenes and provide a concise 3-to-5-word reel title.
Script:
${params.script}

Visual style anchor: ${params.styleCard}
${params.characterCard ? `Recurring character (${params.characterLabel}): ${params.characterCard}` : 'No recurring character.'}
Allowed delivery_tags: ${params.recipe.voice_tags.join(', ')}
Pause guidelines (ms): after hook=${params.recipe.narrator.pause_map.after_hook_ms}, after emotional=${params.recipe.narrator.pause_map.after_emotional_line_ms}, before reveal=${params.recipe.narrator.pause_map.before_reveal_ms}, final=${params.recipe.narrator.pause_map.final_beat_ms}.
Allowed motion_preset values: ${allowedMotions.join(', ')} (NEVER use the same motion_preset twice in a row).
Allowed transition_preset values: ${allowedTransitions.join(', ')}.

Rules for each scene:
- narration_text: spoken text in the script's original language.
- image_prompt: MUST be in English, describing concrete subject, action, setting, lighting, camera angle, and mood, ending with the style anchor. No text inside image, no real people or brands.
- on_screen_text: short 2-to-4-word highlight text matching the narration.`;

  const resp = await generateWithFreeModelFallback(prompt, {
    models: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
    timeoutMs: 25_000,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        scenes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              narration_text: { type: Type.STRING },
              delivery_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              pause_after_ms: { type: Type.INTEGER },
              image_prompt: { type: Type.STRING },
              motion_preset: { type: Type.STRING },
              transition_preset: { type: Type.STRING },
              on_screen_text: { type: Type.STRING },
            },
            required: [
              'narration_text',
              'delivery_tags',
              'pause_after_ms',
              'image_prompt',
              'motion_preset',
              'transition_preset',
              'on_screen_text',
            ],
          },
        },
      },
      required: ['title', 'scenes'],
    },
  });

  const parsed = JSON.parse((resp.text ?? '{}').trim()) as {
    title?: string;
    scenes?: Array<Partial<SplitSceneOutput>>;
  };

  const rawScenes = parsed.scenes ?? [];
  let prevMotion: MotionPreset | null = null;

  const normalized: SplitSceneOutput[] = rawScenes.map((s, idx) => {
    let motion = (allowedMotions.includes(s.motion_preset as MotionPreset)
      ? s.motion_preset
      : allowedMotions[idx % allowedMotions.length]) as MotionPreset;

    if (motion === prevMotion) {
      const alt = allowedMotions.find((m) => m !== prevMotion) ?? 'slow_zoom_in';
      motion = alt;
    }
    prevMotion = motion;

    const transition = (allowedTransitions.includes(s.transition_preset as TransitionPreset)
      ? s.transition_preset
      : 'crossfade') as TransitionPreset;

    return {
      narration_text: (s.narration_text ?? '').trim() || '...',
      delivery_tags: Array.isArray(s.delivery_tags) ? s.delivery_tags.slice(0, 2) : [],
      pause_after_ms: Math.min(1400, Math.max(200, Number(s.pause_after_ms ?? 450))),
      image_prompt: (s.image_prompt ?? '').trim() || params.styleCard,
      motion_preset: motion,
      transition_preset: transition,
      on_screen_text: (s.on_screen_text ?? '').trim(),
    };
  });

  return {
    title: (parsed.title ?? '').trim() || 'Untitled Story',
    scenes: normalized,
  };
}

/**
 * Generates real WAV voiceover audio via Gemini 3.8 Flash Lite TTS.
 * Returns raw WAV Buffer and exact audio duration in milliseconds.
 */
export async function synthesizeSceneVoiceWav(params: {
  text: string;
  prebuiltVoiceName: string;
  narratorStyle: string;
}): Promise<{ wavBuffer: Buffer; durationMs: number }> {
  const ai = getClient();
  const cleanText = params.text.replace(/\[[^\]]+\]/g, '').trim();

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: cleanText,
            speechMetadata: {
              style: params.narratorStyle || 'Clear, expressive storyteller',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: params.prebuiltVoiceName || 'Kore',
          },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('TTS_NO_AUDIO');
  }

  const wavBuffer = Buffer.from(base64Audio, 'base64');
  // Parse WAV header byteRate (bytes 28..31) & data size (bytes 40..43)
  let durationMs = Math.max(2000, Math.round((cleanText.split(/\s+/).length / 2.4) * 1000));
  if (wavBuffer.length > 44 && wavBuffer.toString('ascii', 0, 4) === 'RIFF') {
    const byteRate = wavBuffer.readUInt32LE(28);
    const dataSize = wavBuffer.length - 44;
    if (byteRate > 0) {
      durationMs = Math.max(1200, Math.round((dataSize / byteRate) * 1000));
    }
  }

  return { wavBuffer, durationMs };
}
