import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { t } from '../lib/i18n.ts';
import {
  computeCombinedSceneTransform,
  DEFAULT_SCENE_EFFECTS,
  getAtmosphereImageFilter,
  getAtmosphereVignetteBackground,
  getCapCutShakeOffsets,
  getEffectiveEffects,
  renderBlackNoiseToCanvas,
  type LiveEffectOverride,
} from '../lib/sceneEffects.ts';
import { formatDurationSeconds } from '../shared/credits.ts';
import type { CaptionPreset, SceneItem } from '../shared/types.ts';
import { PrimaryButton, SecondaryButton } from './ui/Primitives.tsx';

interface ReelPlayerProps {
  title: string;
  scenes: SceneItem[];
  captionPreset: CaptionPreset;
  musicAudioUrl?: string | null;
  isFreeWatermarked?: boolean;
  showExportButtons?: boolean;
  liveEffectOverride?: LiveEffectOverride | null;
  selectedSceneId?: string | null;
  onActiveSceneChange?: (sceneIdx: number, sceneId: string) => void;
}

interface CaptionChunk {
  words: string[];
  startMs: number;
  endMs: number;
}

function buildSceneChunks(scene: SceneItem, sceneStartMs: number): CaptionChunk[] {
  const words = scene.narration_text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const activeMs = Math.max(800, scene.duration_ms - scene.pause_after_ms);
  const chunks: CaptionChunk[] = [];
  const groupSize = words.length <= 4 ? words.length : 3;
  const totalGroups = Math.ceil(words.length / groupSize);
  const msPerGroup = activeMs / totalGroups;

  for (let i = 0; i < words.length; i += groupSize) {
    const groupIdx = Math.floor(i / groupSize);
    chunks.push({
      words: words.slice(i, i + groupSize),
      startMs: sceneStartMs + groupIdx * msPerGroup,
      endMs: sceneStartMs + (groupIdx + 1) * msPerGroup,
    });
  }
  return chunks;
}

export const ReelPlayer: React.FC<ReelPlayerProps> = ({
  title,
  scenes,
  captionPreset,
  musicAudioUrl,
  isFreeWatermarked = false,
  showExportButtons = true,
  liveEffectOverride = null,
  selectedSceneId = null,
  onActiveSceneChange,
}) => {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [ambientTimeSec, setAmbientTimeSec] = useState(0);
  const [exporting, setExporting] = useState(false);

  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScenePlayedRef = useRef<number>(-1);
  const lastReportedSceneIdRef = useRef<string>('');
  const lastNoiseTickRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const timeline = useMemo(() => {
    let cursor = 0;
    return scenes.map((sc) => {
      const start = cursor;
      const dur = Math.max(2000, sc.duration_ms || 3500);
      cursor += dur;
      return {
        scene: sc,
        startMs: start,
        endMs: cursor,
        chunks: buildSceneChunks(sc, start),
      };
    });
  }, [scenes]);

  const totalMs = timeline.length ? timeline[timeline.length - 1].endMs : 0;

  const activeEntry = useMemo(() => {
    return (
      timeline.find((item) => currentMs >= item.startMs && currentMs < item.endMs) ??
      timeline[timeline.length - 1]
    );
  }, [timeline, currentMs]);

  const activeIdx = activeEntry ? activeEntry.scene.idx : 0;
  const activeSceneId = activeEntry?.scene.id ?? '';
  const sceneProgress = activeEntry
    ? (currentMs - activeEntry.startMs) / Math.max(1, activeEntry.endMs - activeEntry.startMs)
    : 0;

  const activeEffects = activeEntry
    ? getEffectiveEffects(activeEntry.scene, liveEffectOverride)
    : DEFAULT_SCENE_EFFECTS;

  const activeChunk = activeEntry?.chunks.find(
    (c) => currentMs >= c.startMs && currentMs < c.endMs
  );

  // Report active scene index/id to parent Studio when scrubbing or playing
  useEffect(() => {
    if (activeSceneId && activeSceneId !== lastReportedSceneIdRef.current) {
      lastReportedSceneIdRef.current = activeSceneId;
      onActiveSceneChange?.(activeIdx, activeSceneId);
    }
  }, [activeIdx, activeSceneId, onActiveSceneChange]);

  // Jump timeline to selectedSceneId when clicked in parent storyboard list
  useEffect(() => {
    if (!selectedSceneId || selectedSceneId === lastReportedSceneIdRef.current) return;
    const target = timeline.find((tItem) => tItem.scene.id === selectedSceneId);
    if (target) {
      lastReportedSceneIdRef.current = selectedSceneId;
      lastScenePlayedRef.current = -1;
      setCurrentMs(target.startMs);
    }
  }, [selectedSceneId, timeline]);

  // Continuous subtle shake loop so CapCut motion is visibly alive both while playing and during slider preview
  useEffect(() => {
    const hasShake =
      !prefersReducedMotion &&
      (activeEffects.shake_intensity > 0 || activeEntry?.scene.motion_preset === 'shake_subtle');

    if (playing && totalMs > 0) {
      lastTickRef.current = performance.now();
      const step = (now: number) => {
        const dt = now - lastTickRef.current;
        lastTickRef.current = now;
        setCurrentMs((prev) => {
          const next = prev + dt;
          return next >= totalMs ? 0 : next;
        });
        setAmbientTimeSec((prev) => prev + dt / 1000);
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);

      if (musicAudioRef.current && musicAudioUrl && !muted) {
        musicAudioRef.current.volume = 0.14;
        musicAudioRef.current.loop = true;
        void musicAudioRef.current.play().catch(() => {});
      }

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    voiceAudioRef.current?.pause();
    musicAudioRef.current?.pause();

    if (!hasShake) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    lastTickRef.current = performance.now();
    const idleStep = (now: number) => {
      const dt = Math.min(80, now - lastTickRef.current);
      lastTickRef.current = now;
      setAmbientTimeSec((prev) => prev + dt / 1000);
      rafRef.current = requestAnimationFrame(idleStep);
    };
    rafRef.current = requestAnimationFrame(idleStep);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    playing,
    totalMs,
    musicAudioUrl,
    muted,
    prefersReducedMotion,
    activeEffects.shake_intensity,
    activeEntry?.scene.motion_preset,
  ]);

  // Trigger scene voiceover when entering a new scene
  useEffect(() => {
    if (!playing || !activeEntry) return;
    if (lastScenePlayedRef.current !== activeEntry.scene.idx) {
      lastScenePlayedRef.current = activeEntry.scene.idx;
      if (voiceAudioRef.current && activeEntry.scene.audio_url && !muted) {
        voiceAudioRef.current.src = activeEntry.scene.audio_url;
        voiceAudioRef.current.currentTime = 0;
        voiceAudioRef.current.volume = 1;
        void voiceAudioRef.current.play().catch(() => {});
      }
    }
  }, [playing, activeEntry, muted]);

  useEffect(() => {
    if (voiceAudioRef.current) voiceAudioRef.current.muted = muted;
    if (musicAudioRef.current) musicAudioRef.current.muted = muted;
  }, [muted]);

  // Render procedural black film noise grain onto overlay canvas (~16fps when playing, immediate when sliders change)
  useEffect(() => {
    const canvas = noiseCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = performance.now();
    if (playing && now - lastNoiseTickRef.current < 62) {
      return;
    }
    lastNoiseTickRef.current = now;
    const seed = playing ? Math.floor(ambientTimeSec * 16) : Math.floor(ambientTimeSec * 4) + activeIdx * 17;
    renderBlackNoiseToCanvas(ctx, canvas.width, canvas.height, activeEffects.noise_intensity, seed);
  }, [activeEffects.noise_intensity, activeIdx, ambientTimeSec, playing]);

  const togglePlay = () => {
    if (!playing) {
      lastScenePlayedRef.current = -1;
    }
    setPlaying((p) => !p);
  };

  const handleDownloadThumbnail = async () => {
    const first = scenes[0];
    if (!first?.image_url) return;
    const effects = getEffectiveEffects(first, liveEffectOverride);
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = first.image_url;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });

    ctx.save();
    ctx.filter = getAtmosphereImageFilter(effects.noise_atmosphere);
    ctx.drawImage(img, 0, 0, 1080, 1920);
    ctx.restore();

    if (effects.noise_atmosphere > 0) {
      const a = effects.noise_atmosphere / 100;
      const rad = ctx.createRadialGradient(540, 960, 260, 540, 960, 1180);
      rad.addColorStop(0, `rgba(0,0,0,${(a * 0.12).toFixed(3)})`);
      rad.addColorStop(0.65, `rgba(0,0,0,${(a * 0.36).toFixed(3)})`);
      rad.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, 0.25 + a * 0.62).toFixed(3)})`);
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, 1080, 1920);
    }

    if (effects.noise_intensity > 0 && effects.noise_opacity > 0) {
      const nCan = document.createElement('canvas');
      nCan.width = 180;
      nCan.height = 320;
      const nCtx = nCan.getContext('2d');
      if (nCtx) {
        renderBlackNoiseToCanvas(nCtx, 180, 320, effects.noise_intensity, 42);
        ctx.save();
        ctx.globalAlpha = effects.noise_opacity / 100;
        ctx.drawImage(nCan, 0, 0, 1080, 1920);
        ctx.restore();
      }
    }

    const grad = ctx.createLinearGradient(0, 1200, 0, 1920);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 1200, 1080, 720);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 56px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title.slice(0, 32), 540, 1660);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-thumb.png`;
    a.click();
  };

  const handleDownloadVideo = async () => {
    if (exporting || !timeline.length) return;
    setExporting(true);
    setPlaying(false);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const noiseCanvas = document.createElement('canvas');
      noiseCanvas.width = 144;
      noiseCanvas.height = 256;
      const noiseCtx = noiseCanvas.getContext('2d');

      // Preload scene images
      const loadedImgs = await Promise.all(
        timeline.map(async (item) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = item.scene.image_url;
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          });
          return img;
        })
      );

      const stream = canvas.captureStream(30);
      const chunks: BlobPart[] = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const donePromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      recorder.start();

      // Render frames cleanly at 30fps with WYSIWYG motion + shake + atmosphere + black noise
      const fps = 30;
      const stepMs = 1000 / fps;
      let frameIdx = 0;

      for (let tMs = 0; tMs < totalMs; tMs += stepMs) {
        const idx = timeline.findIndex((x) => tMs >= x.startMs && tMs < x.endMs);
        const entry = timeline[idx >= 0 ? idx : 0];
        const img = loadedImgs[idx >= 0 ? idx : 0];
        const prog = (tMs - entry.startMs) / Math.max(1, entry.endMs - entry.startMs);
        const effects = getEffectiveEffects(entry.scene, liveEffectOverride);
        const timeSec = tMs / 1000;
        const shake = getCapCutShakeOffsets(timeSec, effects.shake_intensity, entry.scene.motion_preset);

        let baseScale = 1 + prog * 0.1;
        let baseX = 0;
        let baseY = 0;
        if (entry.scene.motion_preset === 'slow_zoom_out') baseScale = 1.13 - prog * 0.12;
        else if (entry.scene.motion_preset === 'push_in') baseScale = 1.02 + prog * 0.13;
        else if (entry.scene.motion_preset === 'pan_left') {
          baseScale = 1.12;
          baseX = 3 - prog * 6;
        } else if (entry.scene.motion_preset === 'pan_right') {
          baseScale = 1.12;
          baseX = -3 + prog * 6;
        } else if (entry.scene.motion_preset === 'pan_up') {
          baseScale = 1.12;
          baseY = 3 - prog * 6;
        } else if (entry.scene.motion_preset === 'pan_down') {
          baseScale = 1.12;
          baseY = -3 + prog * 6;
        } else if (entry.scene.motion_preset === 'shake_subtle') {
          baseScale = 1.04 + prog * 0.06;
        }

        ctx.fillStyle = '#09090B';
        ctx.fillRect(0, 0, 720, 1280);

        ctx.save();
        ctx.filter = getAtmosphereImageFilter(effects.noise_atmosphere);
        const totalScale = baseScale * shake.extraScale;
        ctx.translate(
          360 + ((baseX + shake.dxPct) / 100) * 720,
          640 + ((baseY + shake.dyPct) / 100) * 1280
        );
        ctx.rotate((shake.rotDeg * Math.PI) / 180);
        ctx.scale(totalScale, totalScale);
        ctx.drawImage(img, -360, -640, 720, 1280);
        ctx.restore();

        // Dark atmosphere vignette overlay
        if (effects.noise_atmosphere > 0) {
          const a = effects.noise_atmosphere / 100;
          const rad = ctx.createRadialGradient(360, 640, 175, 360, 640, 790);
          rad.addColorStop(0, `rgba(0,0,0,${(a * 0.12).toFixed(3)})`);
          rad.addColorStop(0.65, `rgba(0,0,0,${(a * 0.36).toFixed(3)})`);
          rad.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, 0.25 + a * 0.62).toFixed(3)})`);
          ctx.fillStyle = rad;
          ctx.fillRect(0, 0, 720, 1280);
        }

        // Animated black analog noise overlay
        if (noiseCtx && effects.noise_intensity > 0 && effects.noise_opacity > 0) {
          if (frameIdx % 2 === 0) {
            renderBlackNoiseToCanvas(noiseCtx, 144, 256, effects.noise_intensity, frameIdx + 1);
          }
          ctx.save();
          ctx.globalAlpha = effects.noise_opacity / 100;
          ctx.drawImage(noiseCanvas, 0, 0, 720, 1280);
          ctx.restore();
        }

        // Caption readability bottom gradient
        const scrim = ctx.createLinearGradient(0, 820, 0, 1280);
        scrim.addColorStop(0, 'rgba(0,0,0,0)');
        scrim.addColorStop(1, 'rgba(0,0,0,0.68)');
        ctx.fillStyle = scrim;
        ctx.fillRect(0, 820, 720, 460);

        // Subtle caption scrim & text
        const chunk = entry.chunks.find((c) => tMs >= c.startMs && tMs < c.endMs);
        if (chunk) {
          const text = chunk.words.join(' ');
          ctx.fillStyle = 'rgba(0,0,0,0.52)';
          ctx.fillRect(60, 820, 600, 90);
          ctx.fillStyle = captionPreset === 'bold_pop' ? '#FF6A1A' : '#FFFFFF';
          ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(text, 360, 878);
        }

        if (isFreeWatermarked) {
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('Reely AI', 676, 1140);
        }

        frameIdx += 1;
        await new Promise((r) => setTimeout(r, 16));
      }

      recorder.stop();
      const blob = await donePromise;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (!scenes.length) return null;

  const transformCss = activeEntry
    ? computeCombinedSceneTransform({
        preset: activeEntry.scene.motion_preset,
        progress: sceneProgress,
        timeSec: ambientTimeSec,
        shakeIntensity: activeEffects.shake_intensity,
        reducedMotion: prefersReducedMotion,
      })
    : undefined;

  const atmosphereFilter = getAtmosphereImageFilter(activeEffects.noise_atmosphere);
  const vignetteBg = getAtmosphereVignetteBackground(activeEffects.noise_atmosphere);

  return (
    <div className="flex flex-col items-center gap-4">
      <audio ref={voiceAudioRef} preload="auto" />
      {musicAudioUrl && <audio ref={musicAudioRef} src={musicAudioUrl} preload="auto" />}

      {/* 9:16 Vertical Viewport */}
      <div className="relative w-full max-w-[330px] aspect-[9/16] rounded-3xl overflow-hidden bg-[#1C1917] border border-[#EAE7E3] shadow-lg select-none">
        {activeEntry?.scene.image_url ? (
          <img
            src={activeEntry.scene.image_url}
            alt={activeEntry.scene.narration_text}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover will-change-transform transition-opacity duration-300"
            style={{
              transform: transformCss,
              filter: atmosphereFilter,
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-[#292524] to-[#1C1917]" />
        )}

        {/* Atmosphere Vignette Overlay */}
        {vignetteBg !== 'none' && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: vignetteBg }}
          />
        )}

        {/* Procedural Black Film Noise Grain Overlay */}
        <canvas
          ref={noiseCanvasRef}
          width={144}
          height={256}
          className="pointer-events-none absolute inset-0 w-full h-full"
          style={{
            opacity: activeEffects.noise_opacity / 100,
            imageRendering: 'auto',
          }}
        />

        {/* Scrim for caption readability */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />

        {/* Watermark inside safe area for free tier */}
        {isFreeWatermarked && (
          <div className="pointer-events-none absolute bottom-[22%] right-5 px-2 py-0.5 rounded bg-black/35 text-[11px] font-semibold text-white/85">
            {t('brand.name')}
          </div>
        )}

        {/* Safe-zone animated captions (62% - 70% screen height) */}
        {activeChunk && (
          <div className="pointer-events-none absolute inset-x-4 top-[64%] -translate-y-1/2 flex justify-center text-center">
            <div
              className={`px-3.5 py-2 rounded-xl max-w-[92%] leading-snug ${
                captionPreset === 'minimal'
                  ? 'bg-black/45 text-white text-lg font-medium'
                  : captionPreset === 'cinematic'
                  ? 'text-white text-xl font-serif tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]'
                  : 'bg-black/55 text-white text-xl font-extrabold tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]'
              }`}
            >
              {activeChunk.words.map((word, wIdx) => {
                const chunkDur = activeChunk.endMs - activeChunk.startMs;
                const wordSlot = chunkDur / activeChunk.words.length;
                const isCurrentWord =
                  currentMs >= activeChunk.startMs + wIdx * wordSlot &&
                  currentMs < activeChunk.startMs + (wIdx + 1) * wordSlot;

                const highlight =
                  (captionPreset === 'bold_pop' || captionPreset === 'karaoke') && isCurrentWord;

                return (
                  <span
                    key={`${wIdx}-${word}`}
                    className={`inline-block mx-1 transition-colors duration-100 ${
                      highlight ? 'text-[#FF6A1A] scale-105' : 'text-white'
                    }`}
                  >
                    {word}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Top scene indicator */}
        <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-black/45 text-[11px] font-mono tabular-nums text-white">
            {activeIdx + 1}/{scenes.length}
          </span>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-black/45 text-white hover:bg-black/65"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Bottom scrub bar & play button */}
        <div className="absolute bottom-3 inset-x-3 space-y-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={togglePlay}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#E5540A] text-white shadow-md hover:bg-[#B8420A] transition-colors"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={totalMs}
                value={currentMs}
                onChange={(e) => {
                  lastScenePlayedRef.current = -1;
                  setCurrentMs(Number(e.target.value));
                }}
                className="w-full accent-[#FF6A1A] cursor-pointer"
                aria-label="Timeline"
              />
            </div>
            <span className="text-xs font-mono tabular-nums text-white bg-black/45 px-2 py-1 rounded-lg">
              {formatDurationSeconds(currentMs)} / {formatDurationSeconds(totalMs)}
            </span>
          </div>
        </div>
      </div>

      {/* Export Controls */}
      {showExportButtons && (
        <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-[330px]">
          <PrimaryButton
            onClick={handleDownloadVideo}
            disabled={exporting}
            className="flex-1"
          >
            <Download className="w-4 h-4" />
            <span>{exporting ? t('reel.downloadPreparing') : t('reel.downloadVideo')}</span>
          </PrimaryButton>
          <SecondaryButton onClick={handleDownloadThumbnail}>
            <ImageIcon className="w-4 h-4" />
            <span>{t('reel.downloadThumb')}</span>
          </SecondaryButton>
        </div>
      )}
    </div>
  );
};

