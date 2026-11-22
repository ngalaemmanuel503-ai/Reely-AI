import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import type { Language, Niche, UserProfile } from '../shared/types.ts';
import { BrandMark } from './BrandMark.tsx';
import { PrimaryButton, SecondaryButton } from './ui/Primitives.tsx';

export const OnboardingView: React.FC<{
  languages: Language[];
  niches: Niche[];
  initialLang: string;
  onComplete: (updated: UserProfile, startCreate: boolean) => void;
}> = ({ languages, niches, initialLang, onComplete }) => {
  const [step, setStep] = useState(1);
  const [selectedLang, setSelectedLang] = useState(initialLang || 'en');
  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleNiche = (id: string) => {
    setSelectedNiches((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const finish = async (startCreate: boolean) => {
    setSaving(true);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          default_reel_language: selectedLang,
          interested_niches: selectedNiches,
          completed: true,
        }),
      });
      onComplete(res.user, startCreate);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col justify-center px-4 py-10">
      <div className="w-full max-w-lg mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <BrandMark />
          <button
            type="button"
            onClick={() => void finish(false)}
            className="min-h-[44px] text-sm font-medium text-[#6B6560] hover:text-[#1C1917]"
          >
            {t('onboarding.skip')}
          </button>
        </div>

        <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#EAE7E3] space-y-6">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full ${
                  n <= step ? 'bg-[#FF6A1A]' : 'bg-[#EAE7E3]'
                }`}
              />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#1C1917]">
                  {t('onboarding.step1Title')}
                </h1>
                <p className="mt-1 text-sm text-[#6B6560]">{t('onboarding.step1Desc')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {languages.map((lang) => {
                  const active = selectedLang === lang.code;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => setSelectedLang(lang.code)}
                      className={`p-4 rounded-xl border text-left transition-all min-h-[56px] ${
                        active
                          ? 'border-[#FF6A1A] bg-[#FFF4EC]'
                          : 'border-[#EAE7E3] bg-white hover:border-[#FFB27A]'
                      }`}
                    >
                      <p className="font-display text-sm font-semibold text-[#1C1917]">
                        {lang.name}
                      </p>
                      <p className="text-xs text-[#6B6560]">{lang.native_name}</p>
                    </button>
                  );
                })}
              </div>
              <div className="pt-2 flex justify-end">
                <PrimaryButton onClick={() => setStep(2)}>{t('common.next')}</PrimaryButton>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#1C1917]">
                  {t('onboarding.step2Title')}
                </h1>
                <p className="mt-1 text-sm text-[#6B6560]">{t('onboarding.step2Desc')}</p>
              </div>
              <div className="space-y-2.5">
                {niches.map((niche) => {
                  const selected = selectedNiches.includes(niche.id);
                  return (
                    <button
                      key={niche.id}
                      type="button"
                      onClick={() => toggleNiche(niche.id)}
                      className={`w-full p-4 rounded-xl border flex items-center justify-between gap-3 text-left transition-all min-h-[56px] ${
                        selected
                          ? 'border-[#FF6A1A] bg-[#FFF4EC]'
                          : 'border-[#EAE7E3] bg-white hover:border-[#FFB27A]'
                      }`}
                    >
                      <div>
                        <p className="font-display text-sm font-semibold text-[#1C1917]">
                          {niche.name}
                        </p>
                        <p className="text-xs text-[#6B6560] mt-0.5">{niche.description}</p>
                      </div>
                      {selected && (
                        <span className="w-6 h-6 rounded-full bg-[#FF6A1A] text-white flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="pt-2 flex justify-between">
                <SecondaryButton onClick={() => setStep(1)}>{t('common.back')}</SecondaryButton>
                <PrimaryButton onClick={() => setStep(3)}>{t('common.next')}</PrimaryButton>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 text-center py-4">
              <h1 className="font-display text-2xl font-bold text-[#1C1917]">
                {t('onboarding.step3Title')}
              </h1>
              <p className="text-sm text-[#6B6560]">{t('onboarding.step3Desc')}</p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <SecondaryButton
                  onClick={() => void finish(false)}
                  disabled={saving}
                  className="flex-1"
                >
                  {t('onboarding.goHome')}
                </SecondaryButton>
                <PrimaryButton
                  onClick={() => void finish(true)}
                  loading={saving}
                  className="flex-1"
                >
                  {t('onboarding.startFirstReel')}
                </PrimaryButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
