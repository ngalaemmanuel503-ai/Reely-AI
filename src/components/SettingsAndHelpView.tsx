import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, LogOut, MessageCircle, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import type { Language, UserProfile } from '../shared/types.ts';
import {
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  TextInput,
} from './ui/Primitives.tsx';

export const SettingsView: React.FC<{
  user: UserProfile;
  languages: Language[];
  onUpdated: (u: UserProfile) => void;
  onVerifyPhone: () => void;
  onSignedOut: () => void;
  onOpenAdmin: () => void;
  onOpenHelp: () => void;
}> = ({
  user,
  languages,
  onUpdated,
  onVerifyPhone,
  onSignedOut,
  onOpenAdmin,
  onOpenHelp,
}) => {
  const [name, setName] = useState(user.display_name);
  const [lang, setLang] = useState(user.default_reel_language);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ display_name: name, default_reel_language: lang }),
      });
      onUpdated(res.user);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    onSignedOut();
  };

  const handleDeleteAccount = async () => {
    await apiFetch('/api/auth/account', { method: 'DELETE' });
    onSignedOut();
  };

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-[#1C1917]">{t('settings.title')}</h1>

      <form
        onSubmit={handleSave}
        className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-4"
      >
        <h2 className="font-display text-lg font-semibold text-[#1C1917]">
          {t('settings.profileHeading')}
        </h2>

        <TextInput
          id="set-name"
          label={t('settings.displayName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <SelectField
          id="set-lang"
          label={t('settings.defaultLanguage')}
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name} ({l.native_name})
            </option>
          ))}
        </SelectField>

        <div className="pt-2 flex items-center justify-between gap-4 border-t border-[#EAE7E3]">
          <div>
            <p className="text-sm font-medium text-[#1C1917]">{t('settings.phoneStatus')}</p>
            <p className="text-xs text-[#6B6560]">
              {user.phone_verified
                ? `${t('settings.verified')} (${user.phone})`
                : t('settings.unverified')}
            </p>
          </div>
          {!user.phone_verified && (
            <SecondaryButton onClick={onVerifyPhone}>{t('home.verifyPhoneAction')}</SecondaryButton>
          )}
        </div>

        {saved && (
          <p className="text-xs font-medium text-[#16A34A] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>{t('settings.savedToast')}</span>
          </p>
        )}

        <PrimaryButton type="submit" loading={saving}>
          {t('settings.saveProfile')}
        </PrimaryButton>
      </form>

      {/* Mobile links to Help & Admin */}
      <div className="p-4 rounded-2xl bg-white border border-[#EAE7E3] flex flex-wrap gap-3">
        <SecondaryButton onClick={onOpenHelp}>{t('nav.help')}</SecondaryButton>
        <SecondaryButton onClick={onOpenAdmin}>{t('nav.admin')}</SecondaryButton>
        <SecondaryButton onClick={() => void handleSignOut()}>
          <LogOut className="w-4 h-4" />
          <span>{t('nav.signOut')}</span>
        </SecondaryButton>
      </div>

      {/* Danger Zone */}
      <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-3">
        <h2 className="font-display text-base font-semibold text-[#DC2626]">
          {t('settings.dangerHeading')}
        </h2>
        <p className="text-sm text-[#6B6560]">{t('settings.dangerDesc')}</p>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-[#DC2626]/40 text-sm font-semibold text-[#DC2626] hover:bg-[#DC2626]/5"
        >
          <Trash2 className="w-4 h-4" />
          <span>{t('settings.deleteAccount')}</span>
        </button>
      </div>

      <ModalSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('settings.deleteAccount')}
      >
        <div className="space-y-4">
          <p className="text-sm text-[#6B6560]">{t('settings.deleteConfirmPrompt')}</p>
          <div className="flex gap-3">
            <SecondaryButton onClick={() => setDeleteOpen(false)} className="flex-1">
              {t('common.cancel')}
            </SecondaryButton>
            <button
              type="button"
              onClick={() => void handleDeleteAccount()}
              className="flex-1 min-h-[44px] rounded-xl bg-[#DC2626] text-white text-sm font-semibold"
            >
              {t('settings.deleteAccount')}
            </button>
          </div>
        </div>
      </ModalSheet>
    </div>
  );
};

export const HelpView: React.FC<{ whatsappUrl: string }> = ({ whatsappUrl }) => {
  const faqs = [
    { q: t('landing.faq1Q'), a: t('landing.faq1A') },
    { q: t('landing.faq2Q'), a: t('landing.faq2A') },
    { q: t('landing.faq3Q'), a: t('landing.faq3A') },
    { q: t('landing.faq4Q'), a: t('landing.faq4A') },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1C1917]">{t('help.title')}</h1>
        <p className="text-sm text-[#6B6560] mt-1">{t('help.subtitle')}</p>
      </div>

      <div className="p-6 rounded-2xl bg-[#FFF4EC] border border-[#FFE4D1] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white text-[#E5540A] flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-semibold text-[#1C1917]">
              {t('help.whatsappTitle')}
            </h2>
            <p className="text-sm text-[#6B6560] mt-0.5">{t('help.whatsappDesc')}</p>
          </div>
        </div>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#E5540A] text-white text-sm font-semibold hover:bg-[#B8420A] whitespace-nowrap shrink-0"
        >
          <span>{t('help.whatsappButton')}</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] divide-y divide-[#EAE7E3]">
        {faqs.map((item) => (
          <div key={item.q} className="py-4 first:pt-0 last:pb-0">
            <h3 className="font-display text-sm font-semibold text-[#1C1917]">{item.q}</h3>
            <p className="text-sm text-[#6B6560] mt-1">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
