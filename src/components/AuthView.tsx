import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Phone } from 'lucide-react';
import { ApiError, apiFetch, setAuthToken } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import type { CreditBalance, UserProfile } from '../shared/types.ts';
import { BrandMark } from './BrandMark.tsx';
import { PrimaryButton, SecondaryButton, SelectField, TextInput } from './ui/Primitives.tsx';

export const AuthView: React.FC<{
  initialMode?: 'login' | 'signup' | 'phone';
  onBack?: () => void;
  onAuthenticated: (user: UserProfile, balance: CreditBalance) => void;
  onPhoneDone?: (user: UserProfile, balance: CreditBalance) => void;
}> = ({ initialMode = 'signup', onBack, onAuthenticated, onPhoneDone }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'phone'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [country, setCountry] = useState('CM');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await apiFetch<{ token: string; user: UserProfile; balance: CreditBalance }>(
          '/api/auth/login',
          {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          }
        );
        setAuthToken(res.token);
        onAuthenticated(res.user, res.balance);
      } else if (mode === 'signup') {
        const res = await apiFetch<{ token: string; user: UserProfile; balance: CreditBalance }>(
          '/api/auth/register',
          {
            method: 'POST',
            body: JSON.stringify({ email, password, display_name: displayName }),
          }
        );
        setAuthToken(res.token);
        setMode('phone');
        onAuthenticated(res.user, res.balance);
      } else if (mode === 'reset') {
        await apiFetch('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email, new_password: password }),
        });
        setResetSuccess(true);
        setMode('login');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorKey(err.errorKey);
      } else {
        setErrorKey('auth.errorGeneric');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setErrorKey(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; devPreviewCode?: string }>(
        '/api/auth/phone/send-otp',
        {
          method: 'POST',
          body: JSON.stringify({ country, phone }),
        }
      );
      setOtpSent(true);
      setDevCode(res.devPreviewCode ?? null);
    } catch (err) {
      setErrorKey(err instanceof ApiError ? err.errorKey : 'auth.errorGeneric');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorKey(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ user: UserProfile; balance: CreditBalance }>(
        '/api/auth/phone/verify-otp',
        {
          method: 'POST',
          body: JSON.stringify({ phone, code: otpCode }),
        }
      );
      onPhoneDone?.(res.user, res.balance);
    } catch (err) {
      setErrorKey(err instanceof ApiError ? err.errorKey : 'auth.errorGeneric');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col justify-center px-4 py-10">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-medium text-[#6B6560] hover:text-[#1C1917]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('common.back')}</span>
            </button>
          ) : (
            <span />
          )}
          <BrandMark />
          <span className="w-12" />
        </div>

        <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#EAE7E3] shadow-xs space-y-6">
          {mode === 'phone' ? (
            <>
              <div className="space-y-1.5">
                <div className="w-10 h-10 rounded-xl bg-[#FFF4EC] text-[#FF6A1A] flex items-center justify-center mb-3">
                  <Phone className="w-5 h-5" />
                </div>
                <h1 className="font-display text-2xl font-bold text-[#1C1917]">
                  {t('auth.phoneVerifyTitle')}
                </h1>
                <p className="text-sm text-[#6B6560]">{t('auth.phoneVerifySubtitle')}</p>
              </div>

              {errorKey && (
                <div className="p-3 rounded-xl bg-[#DC2626]/10 text-[#DC2626] text-sm font-medium">
                  {t(errorKey)}
                </div>
              )}

              {!otpSent ? (
                <div className="space-y-4">
                  <SelectField
                    id="country"
                    label={t('auth.countryLabel')}
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  >
                    <option value="CM">Cameroon (+237)</option>
                    <option value="CI">Côte d&apos;Ivoire (+225)</option>
                    <option value="SN">Senegal (+221)</option>
                    <option value="NG">Nigeria (+234)</option>
                    <option value="GH">Ghana (+233)</option>
                    <option value="FR">France (+33)</option>
                    <option value="US">United States (+1)</option>
                  </SelectField>
                  <TextInput
                    id="phone"
                    type="tel"
                    label={t('auth.phoneLabel')}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+237 6..."
                    required
                  />
                  <PrimaryButton onClick={handleSendOtp} loading={loading} className="w-full">
                    {t('auth.sendCode')}
                  </PrimaryButton>
                </div>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  {devCode && (
                    <div className="p-3 rounded-xl bg-[#FFF4EC] border border-[#FFE4D1] text-sm text-[#B8420A]">
                      {t('auth.devCodeHint')} <strong className="font-mono">{devCode}</strong>
                    </div>
                  )}
                  <TextInput
                    id="otp"
                    label={t('auth.otpLabel')}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    maxLength={6}
                    required
                  />
                  <PrimaryButton type="submit" loading={loading} className="w-full">
                    {t('auth.verifyCode')}
                  </PrimaryButton>
                </form>
              )}

              {onPhoneDone && (
                <button
                  type="button"
                  onClick={() => {
                    void apiFetch<{ user: UserProfile; balance: CreditBalance }>('/api/auth/me').then(
                      (me) => onPhoneDone(me.user, me.balance)
                    );
                  }}
                  className="w-full min-h-[44px] text-sm font-medium text-[#6B6560] hover:text-[#1C1917]"
                >
                  {t('auth.skipPhone')}
                </button>
              )}
            </>
          ) : (
            <>
              <div>
                <h1 className="font-display text-2xl font-bold text-[#1C1917]">
                  {mode === 'login'
                    ? t('auth.signInTitle')
                    : mode === 'signup'
                    ? t('auth.signUpTitle')
                    : t('auth.resetTitle')}
                </h1>
                <p className="mt-1 text-sm text-[#6B6560]">
                  {mode === 'login'
                    ? t('auth.signInSubtitle')
                    : mode === 'signup'
                    ? t('auth.signUpSubtitle')
                    : t('auth.resetSubtitle')}
                </p>
              </div>

              {resetSuccess && (
                <div className="p-3 rounded-xl bg-[#16A34A]/10 text-[#16A34A] text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{t('settings.savedToast')}</span>
                </div>
              )}

              {errorKey && (
                <div className="p-3 rounded-xl bg-[#DC2626]/10 text-[#DC2626] text-sm font-medium">
                  {t(errorKey)}
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <TextInput
                    id="display-name"
                    label={t('auth.nameLabel')}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                )}
                <TextInput
                  id="email"
                  type="email"
                  label={t('auth.emailLabel')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <TextInput
                  id="password"
                  type="password"
                  label={mode === 'reset' ? t('auth.newPasswordLabel') : t('auth.passwordLabel')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />

                {mode === 'login' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorKey(null);
                        setMode('reset');
                      }}
                      className="text-xs font-medium text-[#B8420A] hover:underline"
                    >
                      {t('auth.forgotLink')}
                    </button>
                  </div>
                )}

                <PrimaryButton type="submit" loading={loading} className="w-full">
                  {mode === 'login'
                    ? t('auth.signInButton')
                    : mode === 'signup'
                    ? t('auth.signUpButton')
                    : t('auth.resetButton')}
                </PrimaryButton>
              </form>

              <div className="pt-2 border-t border-[#EAE7E3] text-center">
                {mode === 'signup' ? (
                  <SecondaryButton onClick={() => setMode('login')} className="w-full">
                    {t('auth.switchToSignIn')}
                  </SecondaryButton>
                ) : (
                  <SecondaryButton onClick={() => setMode('signup')} className="w-full">
                    {t('auth.switchToSignUp')}
                  </SecondaryButton>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
