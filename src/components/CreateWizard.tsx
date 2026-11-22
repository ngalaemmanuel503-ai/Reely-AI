import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Pencil, Play, Sparkles, Trash2, Upload, UserPlus } from 'lucide-react';
import { ApiError, apiFetch } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import { calculateCreditQuote } from '../shared/credits.ts';
import type {
  CaptionPreset,
  CharacterItem,
  CreditBalance,
  Language,
  LengthTier,
  MusicTrack,
  Niche,
  StyleItem,
  VoiceItem,
} from '../shared/types.ts';
import {
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  SelectField,
  TextInput,
} from './ui/Primitives.tsx';

export interface CatalogBundle {
  languages: Language[];
  niches: Niche[];
  styles: StyleItem[];
  characters: CharacterItem[];
  voices: VoiceItem[];
  musicTracks: MusicTrack[];
  prices: Record<string, number>;
}

export const CreateWizard: React.FC<{
  catalog: CatalogBundle;
  balance: CreditBalance;
  defaultLanguage: string;
  initialNicheId?: string;
  onCancel: () => void;
  onGoBilling: () => void;
  onCreated: (projectId: string, balance: CreditBalance) => void;
  onCharacterAdded: (c: CharacterItem) => void;
  onCharacterUpdated?: (c: CharacterItem) => void;
  onCharacterDeleted?: (id: string) => void;
  onMusicUploaded: (track: MusicTrack) => void;
}> = ({
  catalog,
  balance,
  defaultLanguage,
  initialNicheId,
  onCancel,
  onGoBilling,
  onCreated,
  onCharacterAdded,
  onCharacterUpdated,
  onCharacterDeleted,
  onMusicUploaded,
}) => {
  const [step, setStep] = useState(1);

  const firstNiche =
    catalog.niches.find((n) => n.id === initialNicheId) ?? catalog.niches[0];
  const [nicheId, setNicheId] = useState(firstNiche?.id ?? '');
  const activeNiche = catalog.niches.find((n) => n.id === nicheId) ?? catalog.niches[0];
  const [subNicheId, setSubNicheId] = useState(activeNiche?.sub_niches?.[0]?.id ?? '');

  const activeSubNiche =
    activeNiche?.sub_niches?.find((s) => s.id === subNicheId) ?? activeNiche?.sub_niches?.[0];
  const recipe = activeSubNiche?.recipe;

  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState(defaultLanguage || 'en');
  const [surpriseLoading, setSurpriseLoading] = useState(false);

  const [styleId, setStyleId] = useState(catalog.styles[0]?.id ?? '');
  const [useCharacter, setUseCharacter] = useState(Boolean(recipe?.character_required));
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [charModalOpen, setCharModalOpen] = useState(false);

  // Character builder form (Create + Edit/Update + Delete)
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [charName, setCharName] = useState('');
  const [charStyle, setCharStyle] = useState(catalog.styles[0]?.id ?? '');
  const [charAge, setCharAge] = useState('25-32');
  const [charGender, setCharGender] = useState('Female');
  const [charHair, setCharHair] = useState('Braided dark hair');
  const [charOutfit, setCharOutfit] = useState('Terracotta jacket over dark shirt');
  const [charMood, setCharMood] = useState('Focused and calm');
  const [charSignature, setCharSignature] = useState('Brass pocket compass');
  const [charSaving, setCharSaving] = useState(false);
  const [charErrorKey, setCharErrorKey] = useState<string | null>(null);
  const [charNoticeKey, setCharNoticeKey] = useState<string | null>(null);

  const voicesForLang = useMemo(
    () => catalog.voices.filter((v) => v.language === language),
    [catalog.voices, language]
  );
  const [voiceId, setVoiceId] = useState(voicesForLang[0]?.id ?? catalog.voices[0]?.id ?? '');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [musicId, setMusicId] = useState<string | null>(catalog.musicTracks[0]?.id ?? null);
  const [showAllMusic, setShowAllMusic] = useState(false);
  const [musicRightsChecked, setMusicRightsChecked] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);

  const [captionPreset, setCaptionPreset] = useState<CaptionPreset>(
    recipe?.caption_style ?? 'bold_pop'
  );
  const [lengthTier, setLengthTier] = useState<LengthTier>(recipe?.length_defaults ?? 60);
  const [title, setTitle] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsgKey, setErrorMsgKey] = useState<string | null>(null);
  const [shortfallModal, setShortfallModal] = useState<{ needed: number; available: number } | null>(
    null
  );

  const selectedStyle = catalog.styles.find((s) => s.id === styleId) ?? catalog.styles[0];
  const selectedVoice =
    voicesForLang.find((v) => v.id === voiceId) ?? voicesForLang[0] ?? catalog.voices[0];
  const selectedMusic = catalog.musicTracks.find((m) => m.id === musicId) ?? null;

  const onlyFreeCredits =
    balance.plan_credits === 0 && balance.topup_credits === 0 && balance.free_credits > 0;

  const effectiveLength: LengthTier = onlyFreeCredits ? 30 : lengthTier;
  const effectiveVoiceTier = onlyFreeCredits ? 'standard' : selectedVoice?.tier ?? 'standard';

  const quote = useMemo(
    () =>
      calculateCreditQuote({
        lengthTier: effectiveLength,
        hasCharacter: useCharacter && Boolean(characterId),
        styleMultiplier: selectedStyle?.image_cost_multiplier ?? 1,
        voiceTier: effectiveVoiceTier,
        userSuppliedMusic: selectedMusic?.source === 'user',
        prices: catalog.prices,
      }),
    [effectiveLength, useCharacter, characterId, selectedStyle, effectiveVoiceTier, selectedMusic, catalog.prices]
  );

  const handleSelectNiche = (n: Niche) => {
    setNicheId(n.id);
    const firstSub = n.sub_niches?.[0];
    if (firstSub) {
      setSubNicheId(firstSub.id);
      if (firstSub.recipe) {
        setUseCharacter(firstSub.recipe.character_required);
        setCaptionPreset(firstSub.recipe.caption_style);
        setLengthTier(firstSub.recipe.length_defaults);
      }
    }
  };

  const handleSurprise = async () => {
    setErrorMsgKey(null);
    setSurpriseLoading(true);
    try {
      const res = await apiFetch<{
        topic: string;
        title_suggestion?: string;
        concept?: string;
      }>('/api/ai/surprise-topic', {
        method: 'POST',
        body: JSON.stringify({
          sub_niche_id: activeSubNiche?.id,
          niche_id: activeNiche?.id,
          language_code: language,
          previous_topic: topic.trim() || undefined,
        }),
      });
      if (res.topic) {
        setTopic(res.topic);
      }
      if (!title.trim() && res.title_suggestion) {
        setTitle(res.title_suggestion.slice(0, 80));
      }
    } catch (err) {
      setErrorMsgKey(err instanceof ApiError ? err.errorKey : 'wizard.surpriseError');
    } finally {
      setSurpriseLoading(false);
    }
  };

  const openNewCharacterModal = () => {
    setEditingCharacterId(null);
    setCharName('');
    setCharStyle(styleId || catalog.styles[0]?.id || '');
    setCharAge('25-32');
    setCharGender('Female');
    setCharHair('Braided dark hair');
    setCharOutfit('Terracotta jacket over dark shirt');
    setCharMood('Focused and calm');
    setCharSignature('Brass pocket compass');
    setCharErrorKey(null);
    setCharModalOpen(true);
  };

  const openEditCharacterModal = (ch: CharacterItem) => {
    setEditingCharacterId(ch.id);
    setCharName(ch.name);
    setCharStyle(ch.style_id || styleId || catalog.styles[0]?.id || '');
    setCharAge(ch.age_range);
    setCharGender(ch.gender);
    setCharHair(ch.hair);
    setCharOutfit(ch.outfit);
    setCharMood(ch.mood);
    setCharSignature(ch.signature_item);
    setCharErrorKey(null);
    setCharModalOpen(true);
  };

  const handleSaveCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    setCharErrorKey(null);
    setCharSaving(true);
    try {
      const payload = {
        name: charName.trim(),
        style_id: charStyle || styleId,
        age_range: charAge.trim(),
        gender: charGender.trim(),
        hair: charHair.trim(),
        outfit: charOutfit.trim(),
        mood: charMood.trim(),
        signature_item: charSignature.trim(),
      };
      if (editingCharacterId) {
        const updated = await apiFetch<CharacterItem>(`/api/characters/${editingCharacterId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onCharacterUpdated?.(updated);
        setCharacterId(updated.id);
        setCharNoticeKey('wizard.characterUpdated');
      } else {
        const created = await apiFetch<CharacterItem>('/api/characters', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onCharacterAdded(created);
        setCharacterId(created.id);
        setCharNoticeKey('wizard.characterSaved');
      }
      setUseCharacter(true);
      setCharModalOpen(false);
    } catch (err) {
      setCharErrorKey(err instanceof ApiError ? err.errorKey : 'wizard.characterError');
    } finally {
      setCharSaving(false);
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    setCharErrorKey(null);
    setCharSaving(true);
    try {
      await apiFetch(`/api/characters/${id}`, { method: 'DELETE' });
      onCharacterDeleted?.(id);
      if (characterId === id) {
        const nextChar = catalog.characters.find((c) => c.id !== id) ?? null;
        setCharacterId(nextChar?.id ?? null);
      }
      setCharModalOpen(false);
      setCharNoticeKey('wizard.characterDeleted');
    } catch (err) {
      setCharErrorKey(err instanceof ApiError ? err.errorKey : 'wizard.characterError');
    } finally {
      setCharSaving(false);
    }
  };

  const handlePlayVoicePreview = (vId: string) => {
    if (!previewAudioRef.current) return;
    if (previewPlayingId === vId) {
      previewAudioRef.current.pause();
      setPreviewPlayingId(null);
      return;
    }
    setPreviewPlayingId(vId);
    previewAudioRef.current.src = `/api/voices/${vId}/preview`;
    void previewAudioRef.current.play().catch(() => setPreviewPlayingId(null));
  };

  const handleUploadMusic = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !musicRightsChecked) return;
    if (file.size > 20 * 1024 * 1024) return;

    setUploadingMusic(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          resolve(result.split(',')[1] || '');
        };
        reader.readAsDataURL(file);
      });

      const uploaded = await apiFetch<{ id: string; url: string; filename: string }>('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'audio',
          filename: file.name,
          mime: file.type || 'audio/mpeg',
          data_base64: base64,
          rights_confirmed: true,
        }),
      });

      const newTrack: MusicTrack = {
        id: uploaded.id,
        title: file.name.replace(/\.[^/.]+$/, ''),
        mood_tags: ['uploaded'],
        niche_tags: [],
        duration_s: 120,
        bpm: 90,
        source: 'user',
        user_id: null,
        audio_url: uploaded.url,
        license_note: 'User uploaded audio',
        active: true,
      };
      onMusicUploaded(newTrack);
      setMusicId(newTrack.id);
    } finally {
      setUploadingMusic(false);
    }
  };

  const handleGenerate = async () => {
    setErrorMsgKey(null);
    if (balance.total < quote.total) {
      setShortfallModal({ needed: quote.total, available: balance.total });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ projectId: string; balance: CreditBalance }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || undefined,
          niche_id: activeNiche?.id,
          sub_niche_id: activeSubNiche?.id,
          reel_language: language,
          topic: topic.trim(),
          style_id: selectedStyle?.id,
          character_id: useCharacter ? characterId : null,
          voice_id: selectedVoice?.id,
          voice_speed: voiceSpeed,
          music_track_id: musicId,
          caption_preset: captionPreset,
          length_tier: effectiveLength,
          user_supplied_music: selectedMusic?.source === 'user',
        }),
      });
      onCreated(res.projectId, res.balance);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setShortfallModal({
          needed: Number(err.data.needed ?? quote.total),
          available: Number(err.data.available ?? balance.total),
        });
      } else {
        setErrorMsgKey(err instanceof ApiError ? err.errorKey : 'pipeline.errorGeneric');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const stepLabels = [
    t('wizard.step1'),
    t('wizard.step2'),
    t('wizard.step3'),
    t('wizard.step4'),
    t('wizard.step5'),
  ];

  const suggestedTracks = catalog.musicTracks.slice(0, 3);
  const displayedTracks = showAllMusic ? catalog.musicTracks : suggestedTracks;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <audio
        ref={previewAudioRef}
        onEnded={() => setPreviewPlayingId(null)}
        onError={() => setPreviewPlayingId(null)}
      />

      {/* Stepper Header */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={step === 1 ? onCancel : () => setStep((s) => s - 1)}
          className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-medium text-[#6B6560] hover:text-[#1C1917]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>

        <div className="flex items-center gap-2 overflow-x-auto">
          {stepLabels.map((lbl, idx) => {
            const n = idx + 1;
            const active = step === n;
            const done = step > n;
            return (
              <button
                key={lbl}
                type="button"
                onClick={() => n < step && setStep(n)}
                disabled={n > step}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  active
                    ? 'bg-[#FF6A1A] text-white'
                    : done
                    ? 'bg-[#FFF4EC] text-[#B8420A]'
                    : 'text-[#6B6560]'
                }`}
              >
                {n}. {lbl}
              </button>
            );
          })}
        </div>
      </div>

      {errorMsgKey && (
        <div className="p-3.5 rounded-xl bg-[#DC2626]/10 text-[#DC2626] text-sm font-medium">
          {t(errorMsgKey)}
        </div>
      )}

      {/* Step 1: Niche */}
      {step === 1 && (
        <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-6">
          <h1 className="font-display text-2xl font-bold text-[#1C1917]">
            {t('wizard.nicheHeading')}
          </h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {catalog.niches.map((n) => {
              const active = n.id === activeNiche?.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleSelectNiche(n)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    active
                      ? 'border-[#FF6A1A] bg-[#FFF4EC]'
                      : 'border-[#EAE7E3] bg-[#FAFAF9] hover:border-[#FFB27A]'
                  }`}
                >
                  <p className="font-display text-sm font-semibold text-[#1C1917]">{n.name}</p>
                  <p className="text-xs text-[#6B6560] mt-1">{n.description}</p>
                </button>
              );
            })}
          </div>

          {activeNiche?.sub_niches && activeNiche.sub_niches.length > 0 && (
            <div className="space-y-2.5">
              <h2 className="text-sm font-semibold text-[#1C1917]">
                {t('wizard.subNicheHeading')}
              </h2>
              <div className="flex flex-wrap gap-2">
                {activeNiche.sub_niches.map((sn) => {
                  const active = sn.id === activeSubNiche?.id;
                  return (
                    <button
                      key={sn.id}
                      type="button"
                      onClick={() => {
                        setSubNicheId(sn.id);
                        if (sn.recipe) {
                          setUseCharacter(sn.recipe.character_required);
                          setCaptionPreset(sn.recipe.caption_style);
                        }
                      }}
                      className={`min-h-[44px] px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        active
                          ? 'border-[#FF6A1A] bg-[#E5540A] text-white'
                          : 'border-[#EAE7E3] bg-white text-[#1C1917] hover:border-[#FFB27A]'
                      }`}
                    >
                      {sn.name}
                    </button>
                  );
                })}
              </div>
              {activeSubNiche && (
                <p className="text-xs text-[#6B6560]">{activeSubNiche.description}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Idea & Language */}
      {step === 2 && (
        <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-5">
          <h1 className="font-display text-2xl font-bold text-[#1C1917]">
            {t('wizard.ideaHeading')}
          </h1>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="topic-input" className="text-sm font-medium text-[#1C1917]">
                {t('wizard.topicLabel')}
              </label>
              <button
                type="button"
                onClick={handleSurprise}
                disabled={surpriseLoading}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-[#FFF4EC] text-xs font-semibold text-[#B8420A] hover:bg-[#FFE4D1] disabled:opacity-60"
              >
                <Sparkles className={`w-3.5 h-3.5 ${surpriseLoading ? 'animate-spin' : ''}`} />
                <span>
                  {surpriseLoading ? t('wizard.surpriseGenerating') : t('wizard.surpriseMe')}
                </span>
              </button>
            </div>
            <textarea
              id="topic-input"
              rows={5}
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                if (errorMsgKey) setErrorMsgKey(null);
              }}
              placeholder={t('wizard.topicPlaceholder')}
              className="w-full p-3.5 rounded-xl bg-white border border-[#EAE7E3] text-sm text-[#1C1917] placeholder:text-[#6B6560]/60 focus:outline-none focus:border-[#E5540A] focus:ring-2 focus:ring-[#FFE4D1]"
            />
          </div>

          <SelectField
            id="reel-lang"
            label={t('wizard.languageLabel')}
            value={language}
            onChange={(e) => {
              const nextLang = e.target.value;
              setLanguage(nextLang);
              const matchingVoice = catalog.voices.find((v) => v.language === nextLang);
              if (matchingVoice) setVoiceId(matchingVoice.id);
            }}
          >
            {catalog.languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.native_name})
              </option>
            ))}
          </SelectField>
        </div>
      )}

      {/* Step 3: Look & Character */}
      {step === 3 && (
        <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-6">
          <h1 className="font-display text-2xl font-bold text-[#1C1917]">
            {t('wizard.lookHeading')}
          </h1>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {catalog.styles.map((st) => {
              const active = st.id === selectedStyle?.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStyleId(st.id)}
                  className={`rounded-xl overflow-hidden border text-left transition-all ${
                    active
                      ? 'border-[#FF6A1A] ring-2 ring-[#FFE4D1]'
                      : 'border-[#EAE7E3] hover:border-[#FFB27A]'
                  }`}
                >
                  <div className="aspect-[3/4] bg-[#EAE7E3] overflow-hidden">
                    <img
                      src={st.cover_asset_url}
                      alt={st.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2.5 bg-white">
                    <p className="font-display text-xs font-semibold text-[#1C1917] truncate">
                      {st.name}
                    </p>
                    <p className="text-[11px] text-[#6B6560] capitalize">
                      {st.difficulty} · {st.image_cost_multiplier}x
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-[#EAE7E3] space-y-4">
            <label className="flex items-center justify-between gap-3 cursor-pointer min-h-[44px]">
              <div>
                <span className="text-sm font-semibold text-[#1C1917]">
                  {t('wizard.characterToggle')}
                </span>
                {recipe?.character_required && (
                  <p className="text-xs text-[#6B6560]">{t('wizard.characterRequiredNote')}</p>
                )}
              </div>
              <input
                type="checkbox"
                checked={useCharacter}
                onChange={(e) => {
                  setUseCharacter(e.target.checked);
                  if (e.target.checked && !characterId && catalog.characters[0]) {
                    setCharacterId(catalog.characters[0].id);
                  }
                }}
                className="w-5 h-5 accent-[#E5540A]"
              />
            </label>

            {useCharacter && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#6B6560]">
                    {t('wizard.characterSelect')}
                  </span>
                  <SecondaryButton onClick={openNewCharacterModal}>
                    <UserPlus className="w-4 h-4" />
                    <span>{t('wizard.characterCreate')}</span>
                  </SecondaryButton>
                </div>

                {charNoticeKey && (
                  <div className="p-3 rounded-xl bg-[#16A34A]/10 text-[#16A34A] text-xs font-medium flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      {t(charNoticeKey)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCharNoticeKey(null)}
                      className="font-semibold hover:underline"
                    >
                      {t('common.close')}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {catalog.characters.map((ch) => {
                    const active = ch.id === characterId;
                    return (
                      <div
                        key={ch.id}
                        className={`rounded-xl overflow-hidden border flex flex-col justify-between bg-white ${
                          active ? 'border-[#FF6A1A] ring-2 ring-[#FFE4D1]' : 'border-[#EAE7E3]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setCharacterId(ch.id)}
                          className="text-left flex-1"
                        >
                          <div className="aspect-[3/4] bg-[#FAFAF9]">
                            <img
                              src={ch.master_asset_url}
                              alt={ch.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="p-2 bg-white">
                            <p className="text-xs font-semibold text-[#1C1917] truncate">{ch.name}</p>
                            <p className="text-[11px] text-[#6B6560] truncate">{ch.mood}</p>
                          </div>
                        </button>
                        {!ch.is_preset && (
                          <div className="px-2 pb-2 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditCharacterModal(ch)}
                              className="flex-1 min-h-[30px] rounded-lg bg-[#FAFAF9] border border-[#EAE7E3] text-[11px] font-semibold text-[#1C1917] hover:border-[#FFB27A] inline-flex items-center justify-center gap-1"
                            >
                              <Pencil className="w-3 h-3 text-[#E5540A]" />
                              <span>{t('library.editCharacter')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteCharacter(ch.id)}
                              className="min-h-[30px] min-w-[30px] rounded-lg border border-[#EAE7E3] text-[#DC2626] hover:bg-[#DC2626]/5 inline-flex items-center justify-center"
                              aria-label={t('common.delete')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Sound & Captions */}
      {step === 4 && (
        <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-6">
          <h1 className="font-display text-2xl font-bold text-[#1C1917]">
            {t('wizard.soundHeading')}
          </h1>

          {/* Voices */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-[#1C1917]">
              {t('wizard.voiceLabel')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {voicesForLang.map((v) => {
                const active = v.id === selectedVoice?.id;
                const lockedPremium = onlyFreeCredits && v.tier === 'premium';
                return (
                  <div
                    key={v.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                      active ? 'border-[#FF6A1A] bg-[#FFF4EC]' : 'border-[#EAE7E3] bg-[#FAFAF9]'
                    } ${lockedPremium ? 'opacity-60' : ''}`}
                  >
                    <button
                      type="button"
                      disabled={lockedPremium}
                      onClick={() => setVoiceId(v.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-semibold text-[#1C1917] truncate">{v.name}</p>
                      <p className="text-xs text-[#6B6560] truncate">
                        {v.gender} · {v.tier} · {v.tone_tags.join(', ')}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePlayVoicePreview(v.id)}
                      className="min-h-[40px] min-w-[40px] rounded-xl bg-white border border-[#EAE7E3] flex items-center justify-center text-[#E5540A] hover:border-[#FFB27A]"
                      aria-label={t('wizard.previewVoice')}
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-[#1C1917]">{t('wizard.speedLabel')}</span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0.9}
                  max={1.1}
                  step={0.05}
                  value={voiceSpeed}
                  onChange={(e) => setVoiceSpeed(Number(e.target.value))}
                  className="accent-[#E5540A]"
                />
                <span className="text-xs font-mono tabular-nums text-[#6B6560]">
                  {voiceSpeed.toFixed(2)}x
                </span>
              </div>
            </div>
          </div>

          {/* Music */}
          <div className="pt-4 border-t border-[#EAE7E3] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1C1917]">
                {t('wizard.suggestedTracks')}
              </span>
              <button
                type="button"
                onClick={() => setShowAllMusic((s) => !s)}
                className="text-xs font-semibold text-[#B8420A] hover:underline min-h-[36px]"
              >
                {t('wizard.browseLibrary')}
              </button>
            </div>
            <div className="space-y-2">
              {displayedTracks.map((track) => {
                const active = track.id === musicId;
                return (
                  <div
                    key={track.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      active ? 'border-[#FF6A1A] bg-[#FFF4EC]' : 'border-[#EAE7E3] bg-[#FAFAF9]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setMusicId(track.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-semibold text-[#1C1917] truncate">{track.title}</p>
                      <p className="text-xs text-[#6B6560]">
                        {track.bpm} BPM · {track.mood_tags.join(', ')}
                      </p>
                    </button>
                    <audio controls src={track.audio_url} className="h-8 max-w-[160px]" />
                  </div>
                );
              })}
            </div>

            {/* Upload custom audio */}
            <div className="p-4 rounded-xl bg-[#FAFAF9] border border-[#EAE7E3] space-y-3">
              <label className="flex items-start gap-2.5 text-xs text-[#6B6560] cursor-pointer">
                <input
                  type="checkbox"
                  checked={musicRightsChecked}
                  onChange={(e) => setMusicRightsChecked(e.target.checked)}
                  className="mt-0.5 accent-[#E5540A]"
                />
                <span>{t('wizard.rightsCheckbox')}</span>
              </label>
              <label
                className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-[#EAE7E3] bg-white text-xs font-semibold text-[#1C1917] ${
                  musicRightsChecked ? 'cursor-pointer hover:border-[#FFB27A]' : 'opacity-50 pointer-events-none'
                }`}
              >
                <Upload className="w-4 h-4 text-[#E5540A]" />
                <span>{uploadingMusic ? t('common.loading') : t('wizard.uploadMusic')}</span>
                <input
                  type="file"
                  accept="audio/mp3,audio/mpeg,audio/wav,audio/m4a"
                  disabled={!musicRightsChecked || uploadingMusic}
                  onChange={handleUploadMusic}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Captions */}
          <div className="pt-4 border-t border-[#EAE7E3] space-y-2.5">
            <span className="block text-sm font-semibold text-[#1C1917]">
              {t('wizard.captionStyleLabel')}
            </span>
            <SegmentedControl<CaptionPreset>
              value={captionPreset}
              onChange={setCaptionPreset}
              options={[
                { value: 'bold_pop', label: t('wizard.captionBoldPop') },
                { value: 'minimal', label: t('wizard.captionMinimal') },
                { value: 'karaoke', label: t('wizard.captionKaraoke') },
                { value: 'cinematic', label: t('wizard.captionCinematic') },
              ]}
            />
          </div>
        </div>
      )}

      {/* Step 5: Length & Review */}
      {step === 5 && (
        <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-6">
          <h1 className="font-display text-2xl font-bold text-[#1C1917]">
            {t('wizard.reviewHeading')}
          </h1>

          <TextInput
            id="project-title"
            label={t('wizard.titleLabel')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={topic.slice(0, 40)}
          />

          <div className="space-y-2">
            <span className="block text-sm font-medium text-[#1C1917]">
              {t('wizard.lengthLabel')}
            </span>
            <SegmentedControl<LengthTier>
              value={effectiveLength}
              onChange={(v) => {
                if (!onlyFreeCredits || v === 30) setLengthTier(v);
              }}
              options={[
                { value: 30, label: t('wizard.length30') },
                { value: 60, label: t('wizard.length60') },
                { value: 90, label: t('wizard.length90') },
              ]}
            />
            {onlyFreeCredits && (
              <p className="text-xs text-[#B8420A]">{t('wizard.freeLimitNote')}</p>
            )}
          </div>

          {/* Credit Breakdown */}
          <div className="p-4 rounded-xl bg-[#FAFAF9] border border-[#EAE7E3] space-y-2.5 text-sm">
            <p className="font-display font-semibold text-[#1C1917]">
              {t('wizard.breakdownTitle')}
            </p>
            <div className="flex justify-between text-[#6B6560]">
              <span>{t('wizard.breakdownScript')}</span>
              <span className="font-mono tabular-nums">{quote.script}</span>
            </div>
            <div className="flex justify-between text-[#6B6560]">
              <span>{t('wizard.breakdownImages', { count: quote.scene_count })}</span>
              <span className="font-mono tabular-nums">{quote.images}</span>
            </div>
            <div className="flex justify-between text-[#6B6560]">
              <span>{t('wizard.breakdownVoice', { seconds: effectiveLength })}</span>
              <span className="font-mono tabular-nums">{quote.voice}</span>
            </div>
            <div className="flex justify-between text-[#6B6560]">
              <span>{t('wizard.breakdownExport')}</span>
              <span className="font-mono tabular-nums">{quote.export}</span>
            </div>
            <div className="flex justify-between text-[#6B6560]">
              <span>{t('wizard.breakdownCaptions')}</span>
              <span className="font-mono tabular-nums">{quote.captions}</span>
            </div>
            <div className="flex justify-between text-[#6B6560]">
              <span>{t('wizard.breakdownMusic')}</span>
              <span className="font-mono tabular-nums">{quote.music}</span>
            </div>
            <div className="pt-2.5 border-t border-[#EAE7E3] flex justify-between font-display font-bold text-base text-[#1C1917]">
              <span>{t('wizard.breakdownTotal')}</span>
              <span className="font-mono tabular-nums text-[#B8420A]">
                {quote.total} {t('common.creditsSuffix')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Live Quote Bottom Bar */}
      <div className="fixed bottom-0 inset-x-0 md:left-[240px] z-30 bg-white/95 backdrop-blur-md border-t border-[#EAE7E3] px-4 md:px-8 py-3 pb-safe">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="text-xs text-[#6B6560]">{t('wizard.quoteFooter')} </span>
            <span className="font-mono text-base font-bold tabular-nums text-[#1C1917]">
              {quote.total} {t('common.creditsSuffix')}
            </span>
          </div>

          {step < 5 ? (
            <PrimaryButton
              disabled={step === 2 && topic.trim().length < 3}
              onClick={() => setStep((s) => s + 1)}
            >
              {t('common.next')}
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={handleGenerate} loading={submitting}>
              {t('wizard.generateButton')}
            </PrimaryButton>
          )}
        </div>
      </div>

      {/* Create / Edit Character Modal */}
      <ModalSheet
        open={charModalOpen}
        onClose={() => setCharModalOpen(false)}
        title={editingCharacterId ? t('wizard.characterEdit') : t('wizard.characterCreate')}
      >
        <form onSubmit={handleSaveCharacter} className="space-y-3.5">
          {charErrorKey && (
            <div className="p-3 rounded-xl bg-[#DC2626]/10 text-[#DC2626] text-xs font-medium">
              {t(charErrorKey)}
            </div>
          )}

          <TextInput
            id="char-name"
            label={t('wizard.characterName')}
            value={charName}
            onChange={(e) => setCharName(e.target.value)}
            required
          />
          <SelectField
            id="char-style"
            label={t('wizard.lookHeading')}
            value={charStyle}
            onChange={(e) => setCharStyle(e.target.value)}
          >
            {catalog.styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              id="char-age"
              label={t('wizard.characterAge')}
              value={charAge}
              onChange={(e) => setCharAge(e.target.value)}
              required
            />
            <TextInput
              id="char-gender"
              label={t('wizard.characterGender')}
              value={charGender}
              onChange={(e) => setCharGender(e.target.value)}
              required
            />
          </div>
          <TextInput
            id="char-hair"
            label={t('wizard.characterHair')}
            value={charHair}
            onChange={(e) => setCharHair(e.target.value)}
            required
          />
          <TextInput
            id="char-outfit"
            label={t('wizard.characterOutfit')}
            value={charOutfit}
            onChange={(e) => setCharOutfit(e.target.value)}
            required
          />
          <TextInput
            id="char-mood"
            label={t('wizard.characterMood')}
            value={charMood}
            onChange={(e) => setCharMood(e.target.value)}
            required
          />
          <TextInput
            id="char-sig"
            label={t('wizard.characterSignature')}
            value={charSignature}
            onChange={(e) => setCharSignature(e.target.value)}
            required
          />
          <div className="flex gap-2.5 pt-1">
            {editingCharacterId && (
              <SecondaryButton
                type="button"
                disabled={charSaving}
                onClick={() => void handleDeleteCharacter(editingCharacterId)}
                className="text-[#DC2626] border-[#DC2626]/30 hover:bg-[#DC2626]/5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('common.delete')}</span>
              </SecondaryButton>
            )}
            <PrimaryButton type="submit" loading={charSaving} className="flex-1">
              <Check className="w-4 h-4" />
              <span>
                {charSaving
                  ? t('wizard.characterSaving')
                  : editingCharacterId
                  ? t('wizard.characterUpdate')
                  : t('wizard.characterSave')}
              </span>
            </PrimaryButton>
          </div>
        </form>
      </ModalSheet>

      {/* Insufficient Credits Sheet */}
      <ModalSheet
        open={shortfallModal !== null}
        onClose={() => setShortfallModal(null)}
        title={t('wizard.insufficientTitle')}
      >
        <div className="space-y-5">
          <p className="text-sm text-[#6B6560]">
            {shortfallModal
              ? t('wizard.insufficientBody', {
                  needed: shortfallModal.needed,
                  available: shortfallModal.available,
                })
              : ''}
          </p>
          <div className="flex gap-3">
            <SecondaryButton onClick={() => setShortfallModal(null)} className="flex-1">
              {t('common.cancel')}
            </SecondaryButton>
            <PrimaryButton
              onClick={() => {
                setShortfallModal(null);
                onGoBilling();
              }}
              className="flex-1"
            >
              {t('wizard.buyShortfall')}
            </PrimaryButton>
          </div>
        </div>
      </ModalSheet>
    </div>
  );
};
