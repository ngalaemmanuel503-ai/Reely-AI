import React from 'react';
import { ArrowRight, Film, Phone, Plus } from 'lucide-react';
import { t } from '../lib/i18n.ts';
import type { CreditBalance, Niche, ProjectItem, UserProfile } from '../shared/types.ts';
import { EmptyState, PrimaryButton, SecondaryButton } from './ui/Primitives.tsx';

export const HomeView: React.FC<{
  user: UserProfile;
  balance: CreditBalance;
  niches: Niche[];
  projects: ProjectItem[];
  onStartCreate: (nicheId?: string) => void;
  onOpenProject: (project: ProjectItem) => void;
  onGoCredits: () => void;
  onGoLibrary: () => void;
  onVerifyPhone: () => void;
}> = ({
  user,
  balance,
  niches,
  projects,
  onStartCreate,
  onOpenProject,
  onGoCredits,
  onGoLibrary,
  onVerifyPhone,
}) => {
  const recent = projects.slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Banners */}
      {!user.phone_verified && (
        <div className="p-4 rounded-2xl bg-[#FFF4EC] border border-[#FFE4D1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white text-[#E5540A] flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4" />
            </div>
            <p className="text-sm font-medium text-[#1C1917]">{t('home.verifyPhoneBanner')}</p>
          </div>
          <PrimaryButton onClick={onVerifyPhone}>{t('home.verifyPhoneAction')}</PrimaryButton>
        </div>
      )}

      {balance.renewal_due_soon && balance.active_plan_name && (
        <div className="p-4 rounded-2xl bg-white border border-[#FFB27A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm font-medium text-[#1C1917]">
            {t('home.renewalBanner', { plan: balance.active_plan_name })}
          </p>
          <SecondaryButton onClick={onGoCredits}>{t('home.renewNow')}</SecondaryButton>
        </div>
      )}

      {/* Top Grid: Balance + Quick Create */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 p-6 rounded-2xl bg-white border border-[#EAE7E3] flex flex-col justify-between space-y-5">
          <div>
            <p className="text-sm font-medium text-[#6B6560]">{t('home.balanceLabel')}</p>
            <p className="mt-2 font-display text-4xl font-bold tabular-nums text-[#1C1917]">
              {balance.total.toLocaleString('en-US')}
            </p>
            <p className="mt-1 text-xs text-[#6B6560] tabular-nums">
              {t('billing.planCredits')}: {balance.plan_credits} · {t('billing.topupCredits')}:{' '}
              {balance.topup_credits + balance.free_credits}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PrimaryButton onClick={() => onStartCreate()} className="flex-1">
              <Plus className="w-4 h-4" />
              <span>{t('nav.create')}</span>
            </PrimaryButton>
            <SecondaryButton onClick={onGoCredits}>{t('home.buyCredits')}</SecondaryButton>
          </div>
        </div>

        <div className="lg:col-span-8 p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#1C1917]">
              {t('home.quickCreateTitle')}
            </h2>
            <p className="text-sm text-[#6B6560]">{t('home.quickCreateSubtitle')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {niches.slice(0, 4).map((niche) => (
              <button
                key={niche.id}
                type="button"
                onClick={() => onStartCreate(niche.id)}
                className="p-4 rounded-xl border border-[#EAE7E3] bg-[#FAFAF9] hover:border-[#FFB27A] hover:bg-[#FFF4EC] text-left transition-all flex items-center justify-between gap-3 min-h-[60px]"
              >
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-[#1C1917] truncate">
                    {niche.name}
                  </p>
                  <p className="text-xs text-[#6B6560] truncate mt-0.5">{niche.description}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#E5540A] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Reels */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-[#1C1917]">
            {t('home.recentReelsTitle')}
          </h2>
          {projects.length > 0 && (
            <button
              type="button"
              onClick={onGoLibrary}
              className="text-sm font-semibold text-[#B8420A] hover:underline min-h-[44px]"
            >
              {t('home.viewAll')}
            </button>
          )}
        </div>

        {recent.length === 0 ? (
          <EmptyState
            icon={<Film className="w-6 h-6" />}
            title={t('home.emptyTitle')}
            body={t('home.emptyBody')}
            action={
              <PrimaryButton onClick={() => onStartCreate()}>
                {t('home.emptyAction')}
              </PrimaryButton>
            }
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {recent.map((proj) => (
              <button
                key={proj.id}
                type="button"
                onClick={() => onOpenProject(proj)}
                className="group text-left rounded-2xl bg-white border border-[#EAE7E3] overflow-hidden hover:border-[#FFB27A] transition-all"
              >
                <div className="aspect-[9/14] bg-[#1C1917] overflow-hidden relative">
                  {proj.thumbnail_url ? (
                    <img
                      src={proj.thumbnail_url}
                      alt={proj.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/60">
                      <Film className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <div className="p-3.5 space-y-1">
                  <p className="font-display text-sm font-semibold text-[#1C1917] truncate">
                    {proj.title}
                  </p>
                  <p className="text-xs text-[#6B6560] truncate">
                    {proj.length_tier}s · {proj.status}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
