import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Flag, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import {
  clampEffectPct,
  DEFAULT_SCENE_EFFECTS,
  getAtmosphereImageFilter,
  getAtmosphereVignetteBackground,
  renderBlackNoiseToCanvas,
  type SceneEffectValues,
} from '../lib/sceneEffects.ts';
import type {
  CaptionPreset,
  CreditBalance,
  MotionPreset,
  MusicTrack,
  ProjectItem,
  TransitionPreset,
} from '../shared/types.ts';
import { ReelPlayer } from './ReelPlayer.tsx';
import {
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  SelectField,
  TextInput,
} from './ui/Primitives.tsx';

const MOTIONS: MotionPreset[] = [
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

const TRANSITIONS: TransitionPreset[] = [
  'crossfade',
  'dip_to_black',
  'slide',
  'whip_pan',
  'light_leak',
  'glitch_cut',
];

const SceneEffectThumb: React.FC<{
  imageUrl: string;
  alt: string;
  effects: SceneEffectValues;
}> = ({ imageUrl, alt, effects }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderBlackNoiseToCanvas(ctx, canvas.width, canvas.height, effects.noise_intensity, 17);
  }, [effects.noise_intensity]);

  const filterCss = getAtmosphereImageFilter(effects.noise_atmosphere);
  const vignetteCss = getAtmosphereVignetteBackground(effects.noise_atmosphere);

  return (
    <div className="relative w-24 aspect-[9/16] rounded-xl overflow-hidden bg-[#1C1917] border border-[#EAE7E3] shrink-0">
      <img
        src={imageUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover"
        style={{ filter: filterCss }}
      />
      {vignetteCss !== 'none' && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: vignetteCss }}
        />
      )}
      <canvas
        ref={canvasRef}
        width={72}
        height={128}
        className="pointer-events-none absolute inset-0 w-full h-full"
        style={{ opacity: effects.noise_opacity / 100 }}
      />
    </div>
  );
};

interface EffectSlidersProps {
  idPrefix: string;
  effects: SceneEffectValues;
  onChange: (next: SceneEffectValues) => void;
}

const EffectSlidersGrid: React.FC<EffectSlidersProps> = ({ idPrefix, effects, onChange }) => {
  const items: Array<{ key: keyof SceneEffectValues; label: string; value: number }> = [
    { key: 'noise_intensity', label: t('reel.noiseIntensity'), value: effects.noise_intensity },
    { key: 'noise_atmosphere', label: t('reel.noiseAtmosphere'), value: effects.noise_atmosphere },
    { key: 'noise_opacity', label: t('reel.noiseOpacity'), value: effects.noise_opacity },
    { key: 'shake_intensity', label: t('reel.shakeIntensity'), value: effects.shake_intensity },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
      {items.map((item) => {
        const inputId = `${idPrefix}-${item.key}`;
        return (
          <div key={item.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={inputId} className="font-medium text-[#1C1917]">
                {item.label}
              </label>
              <span className="font-mono tabular-nums text-[#6B6560]">{item.value}%</span>
            </div>
            <input
              id={inputId}
              type="range"
              min={0}
              max={100}
              value={item.value}
              onChange={(e) =>
                onChange({
                  ...effects,
                  [item.key]: Number(e.target.value),
                })
              }
              className="w-full h-2 accent-[#E5540A] cursor-pointer"
            />
          </div>
        );
      })}
    </div>
  );
};

export const ReelStudioView: React.FC<{
  projectId: string;
  musicTracks: MusicTrack[];
  prices: Record<string, number>;
  onBack: () => void;
  onDeleted: () => void;
  onBalanceChange: (b: CreditBalance) => void;
}> = ({ projectId, musicTracks, prices, onBack, onDeleted, onBalanceChange }) => {
  const [project, setProject] = useState<(ProjectItem & { music_audio_url?: string }) | null>(null);
  const [tab, setTab] = useState<'preview' | 'scenes' | 'details'>('preview');
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const [sceneEffects, setSceneEffects] = useState<Record<string, SceneEffectValues>>({});
  const [activeSceneId, setActiveSceneId] = useState<string>('');
  const [savingSceneId, setSavingSceneId] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [regenSceneId, setRegenSceneId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    const data = await apiFetch<ProjectItem & { music_audio_url?: string }>(
      `/api/projects/${projectId}`
    );
    setProject(data);
    const textMap: Record<string, string> = {};
    const effMap: Record<string, SceneEffectValues> = {};
    for (const sc of data.scenes ?? []) {
      textMap[sc.id] = sc.narration_text;
      effMap[sc.id] = {
        noise_intensity: clampEffectPct(sc.noise_intensity, DEFAULT_SCENE_EFFECTS.noise_intensity),
        noise_atmosphere: clampEffectPct(sc.noise_atmosphere, DEFAULT_SCENE_EFFECTS.noise_atmosphere),
        noise_opacity: clampEffectPct(sc.noise_opacity, DEFAULT_SCENE_EFFECTS.noise_opacity),
        shake_intensity: clampEffectPct(sc.shake_intensity, DEFAULT_SCENE_EFFECTS.shake_intensity),
      };
    }
    setEditingText(textMap);
    setSceneEffects(effMap);
    setActiveSceneId((prev) => {
      if (prev && (data.scenes ?? []).some((s) => s.id === prev)) return prev;
      return data.scenes?.[0]?.id ?? '';
    });
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const showNotice = (type: 'ok' | 'err', text: string) => {
    setStatusNotice({ type, text });
    window.setTimeout(() => {
      setStatusNotice((curr) => (curr?.text === text ? null : curr));
    }, 2800);
  };

  const activeScene = useMemo(() => {
    if (!project?.scenes?.length) return null;
    return project.scenes.find((s) => s.id === activeSceneId) ?? project.scenes[0];
  }, [project, activeSceneId]);

  const activeEffectsDraft: SceneEffectValues | null = useMemo(() => {
    if (!activeScene) return null;
    return (
      sceneEffects[activeScene.id] ?? {
        noise_intensity: clampEffectPct(activeScene.noise_intensity, DEFAULT_SCENE_EFFECTS.noise_intensity),
        noise_atmosphere: clampEffectPct(activeScene.noise_atmosphere, DEFAULT_SCENE_EFFECTS.noise_atmosphere),
        noise_opacity: clampEffectPct(activeScene.noise_opacity, DEFAULT_SCENE_EFFECTS.noise_opacity),
        shake_intensity: clampEffectPct(activeScene.shake_intensity, DEFAULT_SCENE_EFFECTS.shake_intensity),
      }
    );
  }, [activeScene, sceneEffects]);

  if (!project) {
    return (
      <div className="py-12 text-center text-sm text-[#6B6560]">{t('common.loading')}</div>
    );
  }

  const sceneVisualCost = project.character_id
    ? prices.image_character ?? 30
    : prices.image_standard ?? 15;

  const activeMusic =
    musicTracks.find((m) => m.id === project.music_track_id)?.audio_url ??
    project.music_audio_url ??
    null;

  const handleSaveScene = async (
    sceneId: string,
    motion?: MotionPreset,
    transition?: TransitionPreset
  ) => {
    setSavingSceneId(sceneId);
    const eff = sceneEffects[sceneId];
    try {
      await apiFetch(`/api/projects/${project.id}/scenes/${sceneId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          narration_text: editingText[sceneId],
          motion_preset: motion,
          transition_preset: transition,
          ...(eff ? eff : {}),
        }),
      });
      await load();
      showNotice('ok', t('reel.sceneSaved'));
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingSceneId(null);
    }
  };

  const handleApplyEffectsToAll = async (sourceSceneId: string) => {
    const eff = sceneEffects[sourceSceneId];
    if (!eff) return;
    setApplyingAll(true);
    try {
      await apiFetch(`/api/projects/${project.id}/scenes/apply-effects`, {
        method: 'POST',
        body: JSON.stringify(eff),
      });
      await load();
      showNotice('ok', t('reel.effectsAppliedAll'));
    } catch (err) {
      showNotice('err', err instanceof Error ? err.message : t('common.error'));
    } finally {
      setApplyingAll(false);
    }
  };

  const handleRegenerateVisual = async (sceneId: string) => {
    setRegenSceneId(sceneId);
    try {
      const res = await apiFetch<{ balance: CreditBalance }>(
        `/api/projects/${project.id}/scenes/${sceneId}/regenerate`,
        {
          method: 'POST',
          body: JSON.stringify({
            narration_text: editingText[sceneId],
            regenerate_visual: true,
            regenerate_voice: false,
          }),
        }
      );
      onBalanceChange(res.balance);
      await load();
    } finally {
      setRegenSceneId(null);
    }
  };

  const handleUpdateProjectMeta = async (patch: {
    music_track_id?: string | null;
    caption_preset?: CaptionPreset;
  }) => {
    await apiFetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await load();
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch(`/api/projects/${project.id}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason: reportReason, details: '' }),
    });
    setReportSent(true);
    setReportReason('');
  };

  const handleDelete = async () => {
    await apiFetch(`/api/projects/${project.id}`, { method: 'DELETE' });
    onDeleted();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-[#EAE7E3] bg-white flex items-center justify-center text-[#1C1917] hover:border-[#FFB27A]"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#1C1917] truncate">
              {project.title}
            </h1>
            <p className="text-xs text-[#6B6560]">
              {project.sub_niche_name} · {project.style_name} · {project.length_tier}s
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SecondaryButton onClick={() => setReportOpen(true)}>
            <Flag className="w-4 h-4" />
            <span>{t('reel.reportProblem')}</span>
          </SecondaryButton>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="min-h-[44px] min-w-[44px] rounded-xl border border-[#EAE7E3] bg-white flex items-center justify-center text-[#DC2626] hover:bg-[#DC2626]/5"
            aria-label={t('common.delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<'preview' | 'scenes' | 'details'>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'preview', label: t('reel.tabPreview') },
            { value: 'scenes', label: t('reel.tabScenes') },
            { value: 'details', label: t('reel.tabDetails') },
          ]}
        />
        {statusNotice && (
          <div
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              statusNotice.type === 'ok' ? 'text-[#16A34A]' : 'text-[#DC2626]'
            }`}
          >
            {statusNotice.type === 'ok' && <Check className="w-4 h-4" />}
            <span>{statusNotice.text}</span>
          </div>
        )}
      </div>

      {tab === 'preview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5">
            <ReelPlayer
              title={project.title}
              scenes={project.scenes ?? []}
              captionPreset={project.caption_preset}
              musicAudioUrl={activeMusic}
              isFreeWatermarked={project.is_free_watermarked}
              liveEffectOverride={
                activeScene && activeEffectsDraft
                  ? { sceneId: activeScene.id, ...activeEffectsDraft }
                  : null
              }
              selectedSceneId={activeScene?.id ?? null}
              onActiveSceneChange={(_idx, sceneId) => setActiveSceneId(sceneId)}
            />
          </div>

          <div className="lg:col-span-7 space-y-5">
            {/* Live Black Noise & Subtle Shake Controls for Active Scene */}
            {activeScene && activeEffectsDraft && (
              <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-[#E5540A]" />
                    <h2 className="font-display text-base font-semibold text-[#1C1917]">
                      {t('reel.effectsActiveScene', { num: activeScene.idx + 1 })}
                    </h2>
                  </div>
                  <span className="text-xs text-[#6B6560]">
                    {t('reel.effectsHeading')}
                  </span>
                </div>

                <EffectSlidersGrid
                  idPrefix="live"
                  effects={activeEffectsDraft}
                  onChange={(next) =>
                    setSceneEffects((prev) => ({
                      ...prev,
                      [activeScene.id]: next,
                    }))
                  }
                />

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <PrimaryButton
                    onClick={() => void handleSaveScene(activeScene.id)}
                    loading={savingSceneId === activeScene.id}
                  >
                    {t('reel.saveScene')}
                  </PrimaryButton>
                  <SecondaryButton
                    onClick={() => void handleApplyEffectsToAll(activeScene.id)}
                    disabled={applyingAll}
                  >
                    {applyingAll ? t('common.saving') : t('reel.applyEffectsAll')}
                  </SecondaryButton>
                </div>
              </div>
            )}

            <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-5">
              <h2 className="font-display text-lg font-semibold text-[#1C1917]">
                {t('reel.tabScenes')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField
                  id="studio-music"
                  label={t('reel.musicTrack')}
                  value={project.music_track_id ?? ''}
                  onChange={(e) =>
                    void handleUpdateProjectMeta({ music_track_id: e.target.value || null })
                  }
                >
                  {musicTracks.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  id="studio-caption"
                  label={t('reel.captionPreset')}
                  value={project.caption_preset}
                  onChange={(e) =>
                    void handleUpdateProjectMeta({
                      caption_preset: e.target.value as CaptionPreset,
                    })
                  }
                >
                  <option value="bold_pop">{t('wizard.captionBoldPop')}</option>
                  <option value="minimal">{t('wizard.captionMinimal')}</option>
                  <option value="karaoke">{t('wizard.captionKaraoke')}</option>
                  <option value="cinematic">{t('wizard.captionCinematic')}</option>
                </SelectField>
              </div>

              <div className="divide-y divide-[#EAE7E3]">
                {(project.scenes ?? []).map((sc) => {
                  const isActive = sc.id === activeScene?.id;
                  return (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setActiveSceneId(sc.id)}
                      className={`w-full text-left py-3 px-2 rounded-lg flex items-start gap-3 transition-colors ${
                        isActive ? 'bg-[#FFF4EC]' : 'hover:bg-[#FAF8F5]'
                      }`}
                    >
                      <span className="font-mono text-xs text-[#6B6560] pt-0.5 w-6 tabular-nums">
                        {sc.idx + 1}.
                      </span>
                      <p className="text-sm text-[#1C1917] leading-relaxed flex-1">
                        {sc.narration_text}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'scenes' && (
        <div className="space-y-4">
          {(project.scenes ?? []).map((sc) => {
            const eff = sceneEffects[sc.id] ?? {
              noise_intensity: clampEffectPct(sc.noise_intensity, DEFAULT_SCENE_EFFECTS.noise_intensity),
              noise_atmosphere: clampEffectPct(sc.noise_atmosphere, DEFAULT_SCENE_EFFECTS.noise_atmosphere),
              noise_opacity: clampEffectPct(sc.noise_opacity, DEFAULT_SCENE_EFFECTS.noise_opacity),
              shake_intensity: clampEffectPct(sc.shake_intensity, DEFAULT_SCENE_EFFECTS.shake_intensity),
            };
            return (
              <div
                key={sc.id}
                className="p-4 sm:p-5 rounded-2xl bg-white border border-[#EAE7E3] flex flex-col sm:flex-row gap-4"
              >
                <SceneEffectThumb
                  imageUrl={sc.image_url}
                  alt={sc.narration_text}
                  effects={eff}
                />
                <div className="flex-1 space-y-4">
                  <TextInput
                    id={`nar-${sc.id}`}
                    label={`${t('reel.sceneEditNarration')} #${sc.idx + 1}`}
                    value={editingText[sc.id] ?? sc.narration_text}
                    onChange={(e) =>
                      setEditingText((prev) => ({ ...prev, [sc.id]: e.target.value }))
                    }
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <SelectField
                      id={`mot-${sc.id}`}
                      label={t('reel.sceneMotion')}
                      value={sc.motion_preset}
                      onChange={(e) =>
                        void handleSaveScene(sc.id, e.target.value as MotionPreset, undefined)
                      }
                    >
                      {MOTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </SelectField>

                    <SelectField
                      id={`trn-${sc.id}`}
                      label={t('reel.sceneTransition')}
                      value={sc.transition_preset}
                      onChange={(e) =>
                        void handleSaveScene(sc.id, undefined, e.target.value as TransitionPreset)
                      }
                    >
                      {TRANSITIONS.map((tr) => (
                        <option key={tr} value={tr}>
                          {tr.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </SelectField>
                  </div>

                  <div className="pt-1 border-t border-[#EAE7E3]">
                    <p className="text-xs font-semibold text-[#6B6560] mb-2.5">
                      {t('reel.effectsHeading')}
                    </p>
                    <EffectSlidersGrid
                      idPrefix={`sc-${sc.id}`}
                      effects={eff}
                      onChange={(next) =>
                        setSceneEffects((prev) => ({
                          ...prev,
                          [sc.id]: next,
                        }))
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <PrimaryButton
                      onClick={() => void handleSaveScene(sc.id)}
                      loading={savingSceneId === sc.id}
                    >
                      {t('reel.saveScene')}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => void handleApplyEffectsToAll(sc.id)}
                      disabled={applyingAll}
                    >
                      {applyingAll ? t('common.saving') : t('reel.applyEffectsAll')}
                    </SecondaryButton>
                    <SecondaryButton
                      onClick={() => void handleRegenerateVisual(sc.id)}
                      disabled={regenSceneId === sc.id}
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>{t('reel.sceneRegenerate', { cost: sceneVisualCost })}</span>
                    </SecondaryButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'details' && (
        <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] max-w-lg space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-[#EAE7E3]">
            <span className="text-[#6B6560]">{t('reel.detailsNiche')}</span>
            <span className="font-medium text-[#1C1917]">{project.sub_niche_name}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[#EAE7E3]">
            <span className="text-[#6B6560]">{t('reel.detailsStyle')}</span>
            <span className="font-medium text-[#1C1917]">{project.style_name}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[#EAE7E3]">
            <span className="text-[#6B6560]">{t('reel.detailsLanguage')}</span>
            <span className="font-medium text-[#1C1917] uppercase">{project.reel_language}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[#EAE7E3]">
            <span className="text-[#6B6560]">{t('reel.detailsLength')}</span>
            <span className="font-mono tabular-nums text-[#1C1917]">{project.length_tier}s</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-[#6B6560]">{t('reel.detailsCredits')}</span>
            <span className="font-mono font-semibold tabular-nums text-[#B8420A]">
              {project.credits_final} {t('common.creditsSuffix')}
            </span>
          </div>
        </div>
      )}

      {/* Report Modal */}
      <ModalSheet
        open={reportOpen}
        onClose={() => {
          setReportOpen(false);
          setReportSent(false);
        }}
        title={t('reel.reportProblem')}
      >
        {reportSent ? (
          <p className="text-sm text-[#16A34A] font-medium">{t('reel.reportSent')}</p>
        ) : (
          <form onSubmit={handleReportSubmit} className="space-y-4">
            <TextInput
              id="report-reason"
              label={t('reel.reportReason')}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              required
            />
            <PrimaryButton type="submit" className="w-full">
              {t('reel.reportSubmit')}
            </PrimaryButton>
          </form>
        )}
      </ModalSheet>

      {/* Delete Confirm Modal */}
      <ModalSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('common.delete')}
      >
        <div className="space-y-4">
          <p className="text-sm text-[#6B6560]">{t('reel.deleteConfirm')}</p>
          <div className="flex gap-3">
            <SecondaryButton onClick={() => setDeleteOpen(false)} className="flex-1">
              {t('common.cancel')}
            </SecondaryButton>
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="flex-1 min-h-[44px] rounded-xl bg-[#DC2626] text-white text-sm font-semibold hover:opacity-90"
            >
              {t('common.delete')}
            </button>
          </div>
        </div>
      </ModalSheet>
    </div>
  );
};
