import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Film, Mic, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { t } from '../lib/i18n.ts';
import { formatXaf } from '../shared/credits.ts';
import { BrandMark } from './BrandMark.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { ModalSheet, PrimaryButton, SecondaryButton } from './ui/Primitives.tsx';

interface ShowcaseReel {
  id: string;
  title: string;
  niche_label: string;
  style_label: string;
  language_label: string;
  duration_s: number;
  cover_url: string;
  hook_line: string;
  captions: string[];
}

interface LandingData {
  showcase: ShowcaseReel[];
  niches: Array<{ id: string; name: string; description: string }>;
  styles: Array<{ id: string; name: string; difficulty: string; cover_asset_url: string }>;
  plans: Array<{ id: string; code: string; name: string; price_xaf: number; credits: number }>;
  whatsappSupportUrl: string;
}

export const LandingPage: React.FC<{
  onStartAuth: (mode: 'signup' | 'login') => void;
}> = ({ onStartAuth }) => {
  const [data, setData] = useState<LandingData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [activeShowcaseIdx, setActiveShowcaseIdx] = useState(0);
  const [captionIdx, setCaptionIdx] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  const fetchLanding = () => {
    setLoadFailed(false);
    void fetch('/api/public/landing')
      .then((r) => {
        if (!r.ok) throw new Error('Landing fetch failed');
        return r.json();
      })
      .then((d: LandingData) => setData(d))
      .catch(() => setLoadFailed(true));
  };

  useEffect(() => {
    fetchLanding();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCaptionIdx((prev) => prev + 1);
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  const showcaseList = data?.showcase ?? [];
  const activeReel = showcaseList[activeShowcaseIdx];
  const activeCaption =
    activeReel?.captions[captionIdx % Math.max(1, activeReel.captions.length)] ?? '';

  const faqs = [
    { q: t('landing.faq1Q'), a: t('landing.faq1A') },
    { q: t('landing.faq2Q'), a: t('landing.faq2A') },
    { q: t('landing.faq3Q'), a: t('landing.faq3A') },
    { q: t('landing.faq4Q'), a: t('landing.faq4A') },
    { q: t('landing.faq5Q'), a: t('landing.faq5A') },
    { q: t('landing.faq6Q'), a: t('landing.faq6A') },
    { q: t('landing.faq7Q'), a: t('landing.faq7A') },
    { q: t('landing.faq8Q'), a: t('landing.faq8A') },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-[#1C1917]">
      {/* Top Bar Contract: [Brand wordmark] — [4 nav links] — [1 primary CTA] */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#EAE7E3]">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="whitespace-nowrap shrink-0">
            <BrandMark />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#6B6560]">
            <a href="#how" className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0">
              {t('landing.navHow')}
            </a>
            <a href="#niches" className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0">
              {t('landing.navNiches')}
            </a>
            <a href="#styles" className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0">
              {t('landing.navStyles')}
            </a>
            <a href="#pricing" className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0">
              {t('landing.navPricing')}
            </a>
            <a href="#faq" className="hover:text-[#1C1917] transition-colors whitespace-nowrap shrink-0">
              {t('landing.navFaq')}
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton variant="ghost" />
            <button
              type="button"
              onClick={() => onStartAuth('login')}
              className="hidden sm:inline-flex min-h-[44px] px-3 items-center text-sm font-medium text-[#6B6560] hover:text-[#1C1917] whitespace-nowrap shrink-0"
            >
              {t('nav.signIn')}
            </button>
            <PrimaryButton onClick={() => onStartAuth('signup')}>
              {t('landing.heroCtaPrimary')}
            </PrimaryButton>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Split */}
        <section className="max-w-[1200px] mx-auto px-4 md:px-6 pt-12 pb-16 md:pt-20 md:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6">
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-[#1C1917] leading-[1.08] [text-wrap:balance]">
                {t('landing.heroTitle')}
              </h1>
              <p className="text-lg text-[#6B6560] max-w-xl leading-relaxed">
                {t('landing.heroSubtitle')}
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <PrimaryButton onClick={() => onStartAuth('signup')} className="px-6 py-3">
                  <span>{t('landing.heroCtaPrimary')}</span>
                  <ArrowRight className="w-4 h-4" />
                </PrimaryButton>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-white border border-[#EAE7E3] text-sm font-semibold text-[#1C1917] hover:border-[#FFB27A] hover:bg-[#FFF4EC] transition-colors whitespace-nowrap shrink-0"
                >
                  {t('landing.heroCtaSecondary')}
                </a>
              </div>
              <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#6B6560]">
                <span>{t('landing.metaSpecResolution')}</span>
                <span aria-hidden="true">·</span>
                <span>{t('landing.metaSpecLanguages')}</span>
                <span aria-hidden="true">·</span>
                <span>{t('landing.metaSpecPayment')}</span>
              </div>
            </div>

            {/* Interactive 9:16 Showcase Phone Frame */}
            <div className="lg:col-span-5 flex flex-col items-center">
              {activeReel ? (
                <div className="w-full max-w-[300px] space-y-4">
                  <div className="relative aspect-[9/16] rounded-3xl overflow-hidden bg-[#1C1917] border border-[#EAE7E3] shadow-xl">
                    <img
                      src={activeReel.cover_url}
                      alt={activeReel.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-700 scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/25" />

                    <div className="absolute top-4 inset-x-4 flex items-center justify-between text-xs text-white/90 font-medium">
                      <span>{activeReel.niche_label}</span>
                      <span className="font-mono tabular-nums">{activeReel.duration_s}s</span>
                    </div>

                    <div className="absolute inset-x-5 top-[64%] -translate-y-1/2 text-center">
                      <span className="inline-block px-3.5 py-2 rounded-xl bg-black/60 text-white font-display text-lg font-bold tracking-tight">
                        {activeCaption}
                      </span>
                    </div>

                    <div className="absolute bottom-4 inset-x-4 text-white">
                      <p className="font-display text-base font-semibold">{activeReel.title}</p>
                      <p className="text-xs text-white/75">
                        {activeReel.style_label} · {activeReel.language_label}
                      </p>
                    </div>
                  </div>

                  {/* Showcase Switcher */}
                  <div className="grid grid-cols-4 gap-2">
                    {showcaseList.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveShowcaseIdx(idx);
                          setCaptionIdx(0);
                        }}
                        className={`aspect-[9/14] rounded-xl overflow-hidden border-2 transition-all ${
                          idx === activeShowcaseIdx
                            ? 'border-[#FF6A1A] shadow-sm'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                        aria-label={item.title}
                      >
                        <img
                          src={item.cover_url}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-[300px] aspect-[9/16] rounded-3xl bg-[#EAE7E3]/60 animate-pulse" />
              )}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how" className="scroll-mt-20 bg-white border-y border-[#EAE7E3] py-16 md:py-20">
          <div className="max-w-[1200px] mx-auto px-4 md:px-6">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[#1C1917] [text-wrap:balance]">
              {t('landing.howHeading')}
            </h2>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="p-6 rounded-2xl bg-[#FAFAF9] border border-[#EAE7E3] space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFF4EC] text-[#FF6A1A] flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="font-display text-lg font-semibold text-[#1C1917]">
                  {t('landing.howStep1Title')}
                </h3>
                <p className="text-sm text-[#6B6560] leading-relaxed">{t('landing.howStep1Desc')}</p>
              </div>
              <div className="p-6 rounded-2xl bg-[#FAFAF9] border border-[#EAE7E3] space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFF4EC] text-[#FF6A1A] flex items-center justify-center">
                  <Mic className="w-5 h-5" />
                </div>
                <h3 className="font-display text-lg font-semibold text-[#1C1917]">
                  {t('landing.howStep2Title')}
                </h3>
                <p className="text-sm text-[#6B6560] leading-relaxed">{t('landing.howStep2Desc')}</p>
              </div>
              <div className="p-6 rounded-2xl bg-[#FAFAF9] border border-[#EAE7E3] space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFF4EC] text-[#FF6A1A] flex items-center justify-center">
                  <Film className="w-5 h-5" />
                </div>
                <h3 className="font-display text-lg font-semibold text-[#1C1917]">
                  {t('landing.howStep3Title')}
                </h3>
                <p className="text-sm text-[#6B6560] leading-relaxed">{t('landing.howStep3Desc')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Niches & Features */}
        <section id="niches" className="scroll-mt-20 max-w-[1200px] mx-auto px-4 md:px-6 py-16 md:py-20 space-y-16">
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[#1C1917]">
              {t('landing.nichesHeading')}
            </h2>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {(data?.niches ?? []).map((niche) => (
                <div
                  key={niche.id}
                  className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-2"
                >
                  <h3 className="font-display text-base font-semibold text-[#1C1917]">{niche.name}</h3>
                  <p className="text-sm text-[#6B6560] leading-relaxed">{niche.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#FFF4EC] text-[#FF6A1A] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-[#1C1917]">
                  {t('landing.feature1Title')}
                </h3>
                <p className="mt-1 text-sm text-[#6B6560]">{t('landing.feature1Desc')}</p>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#FFF4EC] text-[#FF6A1A] flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-[#1C1917]">
                  {t('landing.feature2Title')}
                </h3>
                <p className="mt-1 text-sm text-[#6B6560]">{t('landing.feature2Desc')}</p>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#FFF4EC] text-[#FF6A1A] flex items-center justify-center shrink-0">
                <Mic className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-[#1C1917]">
                  {t('landing.feature3Title')}
                </h3>
                <p className="mt-1 text-sm text-[#6B6560]">{t('landing.feature3Desc')}</p>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#FFF4EC] text-[#FF6A1A] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-[#1C1917]">
                  {t('landing.feature4Title')}
                </h3>
                <p className="mt-1 text-sm text-[#6B6560]">{t('landing.feature4Desc')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Visual Styles */}
        <section id="styles" className="scroll-mt-20 bg-white border-y border-[#EAE7E3] py-16 md:py-20">
          <div className="max-w-[1200px] mx-auto px-4 md:px-6">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[#1C1917]">
              {t('landing.stylesHeading')}
            </h2>
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(data?.styles ?? []).map((st) => (
                <div
                  key={st.id}
                  className="rounded-2xl overflow-hidden border border-[#EAE7E3] bg-[#FAFAF9]"
                >
                  <div className="aspect-[3/4] overflow-hidden bg-[#EAE7E3]">
                    <img
                      src={st.cover_asset_url}
                      alt={st.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3.5">
                    <p className="font-display text-sm font-semibold text-[#1C1917]">{st.name}</p>
                    <p className="text-xs text-[#6B6560] capitalize mt-0.5">{st.difficulty}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 max-w-[1200px] mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[#1C1917]">
              {t('landing.pricingHeading')}
            </h2>
            <p className="mt-2 text-sm text-[#6B6560]">{t('landing.pricingSubheading')}</p>
          </div>
          {!data && !loadFailed ? (
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[0, 1, 2, 3].map((k) => (
                <div
                  key={k}
                  className="h-64 rounded-2xl bg-[#EAE7E3]/60 animate-pulse border border-[#EAE7E3]"
                />
              ))}
            </div>
          ) : loadFailed ? (
            <div className="mt-8 p-6 rounded-2xl bg-white border border-[#EAE7E3] flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-[#6B6560]">{t('billing.loadError')}</p>
              <SecondaryButton onClick={fetchLanding}>{t('common.retry')}</SecondaryButton>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {(data?.plans ?? [])
                .filter((p) => p.code !== 'topup')
                .map((plan) => {
                  const approxReels = Math.max(1, Math.floor(plan.credits / 180));
                  const featured = plan.code === 'creator';
                  return (
                    <div
                      key={plan.id}
                      className={`p-6 rounded-2xl bg-white border flex flex-col justify-between space-y-6 ${
                        featured ? 'border-[#FF6A1A] ring-2 ring-[#FFE4D1]' : 'border-[#EAE7E3]'
                      }`}
                    >
                      <div>
                        <h3 className="font-display text-lg font-bold text-[#1C1917]">{plan.name}</h3>
                        <p className="mt-3 font-display text-2xl font-bold tabular-nums text-[#1C1917]">
                          {plan.price_xaf === 0 ? t('common.freeLabel') : formatXaf(plan.price_xaf)}
                        </p>
                        <p className="mt-1 text-sm text-[#B8420A] font-semibold tabular-nums">
                          {plan.credits.toLocaleString('en-US')} {t('common.creditsSuffix')}
                        </p>
                        <ul className="mt-4 space-y-2 text-xs text-[#6B6560]">
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                            <span>{t('landing.planApproxReels', { count: approxReels })}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                            <span>
                              {plan.code === 'free'
                                ? t('landing.planFreePerks')
                                : t('landing.planPaidPerks')}
                            </span>
                          </li>
                        </ul>
                      </div>
                      {featured ? (
                        <PrimaryButton onClick={() => onStartAuth('signup')} className="w-full">
                          {t('landing.pricingCta')}
                        </PrimaryButton>
                      ) : (
                        <SecondaryButton onClick={() => onStartAuth('signup')} className="w-full">
                          {t('landing.pricingCta')}
                        </SecondaryButton>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 bg-white border-t border-[#EAE7E3] py-16 md:py-20">
          <div className="max-w-[820px] mx-auto px-4 md:px-6">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-[#1C1917]">
              {t('landing.faqHeading')}
            </h2>
            <div className="mt-8 divide-y divide-[#EAE7E3] border-y border-[#EAE7E3]">
              {faqs.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="w-full min-h-[56px] py-4 flex items-center justify-between gap-4 text-left"
                    >
                      <span className="font-display text-base font-semibold text-[#1C1917]">
                        {item.q}
                      </span>
                      <ChevronDown
                        className={`w-5 h-5 text-[#6B6560] transition-transform shrink-0 ${
                          open ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {open && (
                      <p className="pb-4 text-sm text-[#6B6560] leading-relaxed">{item.a}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-14 p-8 rounded-2xl bg-[#FFF4EC] border border-[#FFE4D1] text-center space-y-4">
              <h3 className="font-display text-2xl font-bold text-[#1C1917]">
                {t('landing.finalCtaTitle')}
              </h3>
              <PrimaryButton onClick={() => onStartAuth('signup')}>
                {t('landing.finalCtaButton')}
              </PrimaryButton>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="bg-[#FAFAF9] border-t border-[#EAE7E3] py-8">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#6B6560]">
          <BrandMark />
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setLegalModal('terms')}
              className="hover:text-[#1C1917] min-h-[44px]"
            >
              {t('landing.footerTerms')}
            </button>
            <button
              type="button"
              onClick={() => setLegalModal('privacy')}
              className="hover:text-[#1C1917] min-h-[44px]"
            >
              {t('landing.footerPrivacy')}
            </button>
            <a
              href={data?.whatsappSupportUrl || 'https://wa.me/237600000000'}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#1C1917] min-h-[44px] inline-flex items-center"
            >
              {t('landing.footerContact')}
            </a>
          </div>
          <p className="text-xs">{t('landing.footerCopy')}</p>
        </div>
      </footer>

      <ModalSheet
        open={legalModal !== null}
        onClose={() => setLegalModal(null)}
        title={legalModal === 'terms' ? t('legal.termsTitle') : t('legal.privacyTitle')}
      >
        <p className="text-sm text-[#6B6560] leading-relaxed">
          {legalModal === 'terms' ? t('legal.termsBody') : t('legal.privacyBody')}
        </p>
      </ModalSheet>
    </div>
  );
};
