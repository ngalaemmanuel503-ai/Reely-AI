import React, { useEffect, useState } from 'react';
import { Play, Shield } from 'lucide-react';
import { ApiError, apiFetch } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import { formatXaf } from '../shared/credits.ts';
import type { Language, Niche, UserProfile } from '../shared/types.ts';
import {
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  TextInput,
} from './ui/Primitives.tsx';

type AdminTab =
  | 'overview'
  | 'users'
  | 'payments'
  | 'pricing'
  | 'recipes'
  | 'styles'
  | 'voices'
  | 'jobs'
  | 'reports'
  | 'settings'
  | 'audit';

interface AdminOverviewData {
  metrics: {
    totalRevenue: number;
    totalFees: number;
    userCount: number;
    reelCount: number;
    failRate: number;
    providerCostUsd: number;
  };
  users: Array<{
    id: string;
    email: string;
    display_name: string;
    role: string;
    phone_verified: number;
    suspended: number;
    balance: { total: number };
  }>;
  payments: Array<{
    id: string;
    user_email: string;
    plan_name: string;
    total_xaf: number;
    status: string;
    method: string;
    created_at: string;
  }>;
  priceTable: Array<{
    key: string;
    label: string;
    credits_value: number;
    unit: string;
  }>;
  plans: Array<{
    id: string;
    code: string;
    name: string;
    price_xaf: number;
    credits: number;
    active: number;
  }>;
  styles: Array<{
    id: string;
    name: string;
    difficulty: string;
    image_cost_multiplier: number;
    consistency_pass_rate: number;
    active: number;
  }>;
  voices: Array<{
    id: string;
    name: string;
    language: string;
    tier: string;
    active: number;
  }>;
  music: Array<{
    id: string;
    title: string;
    bpm: number;
    license_note: string;
  }>;
  jobs: Array<{
    id: string;
    project_title: string;
    user_email: string;
    status: string;
    current_step: string;
    progress_pct: number;
  }>;
  reports: Array<{
    id: string;
    project_title: string;
    user_email: string;
    reason: string;
    status: string;
    created_at: string;
  }>;
  settings: Array<{ key: string; value: string }>;
  auditLog: Array<{
    id: string;
    actor_email: string;
    action: string;
    target_type: string;
    reason: string;
    created_at: string;
  }>;
}

export const AdminConsoleView: React.FC<{
  niches: Niche[];
  languages: Language[];
  onAdminClaimed: (u: UserProfile) => void;
  onCatalogMutated: () => void;
}> = ({ niches, languages, onAdminClaimed, onCatalogMutated }) => {
  const [status, setStatus] = useState<{ isAdmin: boolean; isClaimed: boolean } | null>(null);
  const [passcode, setPasscode] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<AdminOverviewData | null>(null);

  const [adjustUser, setAdjustUser] = useState<{ id: string; email: string } | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('100');
  const [adjustReason, setAdjustReason] = useState('');

  // Recipe script test state
  const allSubs = niches.flatMap((n) => n.sub_niches ?? []);
  const [testSubId, setTestSubId] = useState(allSubs[0]?.id ?? '');
  const [testLang, setTestLang] = useState(languages[0]?.code ?? 'en');
  const [testTopic, setTestTopic] = useState('Why silent discipline beats loud announcements');
  const [testResult, setTestResult] = useState<{
    bestHook: string;
    edited: { script: string; hook_score: number; ending_score: number };
    split: { title: string; scenes: Array<{ narration_text: string; image_prompt: string }> };
  } | null>(null);
  const [testingRecipe, setTestingRecipe] = useState(false);

  const [loadError, setLoadError] = useState(false);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [draftPlans, setDraftPlans] = useState<
    Record<string, { price_xaf: string; credits: string; active: boolean }>
  >({});
  const [savingPricingKey, setSavingPricingKey] = useState<string | null>(null);
  const [savedPricingKey, setSavedPricingKey] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoadError(false);
    try {
      const st = await apiFetch<{ isAdmin: boolean; isClaimed: boolean }>('/api/admin/status');
      setStatus(st);
      if (st.isAdmin) {
        const ov = await apiFetch<AdminOverviewData>('/api/admin/overview');
        setData(ov);
        const nextPrices: Record<string, string> = {};
        for (const r of ov.priceTable) nextPrices[r.key] = String(r.credits_value);
        setDraftPrices(nextPrices);

        const nextPlans: Record<string, { price_xaf: string; credits: string; active: boolean }> = {};
        for (const p of ov.plans) {
          nextPlans[p.id] = {
            price_xaf: String(p.price_xaf),
            credits: String(p.credits),
            active: Boolean(p.active),
          };
        }
        setDraftPlans(nextPlans);
      }
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/admin/claim', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      });
      onAdminClaimed(res.user);
      await loadStatus();
    } catch (err) {
      setUnlockError(err instanceof ApiError ? err.errorKey : 'auth.errorGeneric');
    }
  };

  const handleAdjustCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustUser) return;
    await apiFetch(`/api/admin/users/${adjustUser.id}/adjust-credits`, {
      method: 'POST',
      body: JSON.stringify({ delta: Number(adjustDelta), reason: adjustReason }),
    });
    setAdjustUser(null);
    setAdjustReason('');
    await loadStatus();
  };

  const handlePriceUpdate = async (key: string) => {
    const val = Number(draftPrices[key]);
    if (!Number.isFinite(val) || val < 0) {
      setPricingError(t('admin.saveFailed'));
      return;
    }
    setPricingError(null);
    setSavingPricingKey(key);
    try {
      await apiFetch(`/api/admin/pricing/${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ credits_value: val }),
      });
      onCatalogMutated();
      await loadStatus();
      setSavedPricingKey(key);
    } catch {
      setPricingError(t('admin.saveFailed'));
    } finally {
      setSavingPricingKey(null);
    }
  };

  const handlePlanUpdate = async (planId: string) => {
    const draft = draftPlans[planId];
    if (!draft) return;
    const priceXaf = Math.round(Number(draft.price_xaf));
    const credits = Math.round(Number(draft.credits));
    if (!Number.isFinite(priceXaf) || priceXaf < 0 || !Number.isFinite(credits) || credits < 0) {
      setPricingError(t('admin.saveFailed'));
      return;
    }
    setPricingError(null);
    setSavingPricingKey(planId);
    try {
      await apiFetch(`/api/admin/plans/${planId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          price_xaf: priceXaf,
          credits,
          active: draft.active,
        }),
      });
      onCatalogMutated();
      await loadStatus();
      setSavedPricingKey(planId);
    } catch {
      setPricingError(t('admin.saveFailed'));
    } finally {
      setSavingPricingKey(null);
    }
  };

  const handleStyleToggle = async (id: string, active: boolean) => {
    await apiFetch(`/api/admin/styles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
    onCatalogMutated();
    await loadStatus();
  };

  const handleRunRecipeTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingRecipe(true);
    try {
      const res = await apiFetch<typeof testResult>('/api/admin/test-recipe', {
        method: 'POST',
        body: JSON.stringify({
          sub_niche_id: testSubId,
          topic: testTopic,
          language_code: testLang,
        }),
      });
      setTestResult(res);
    } finally {
      setTestingRecipe(false);
    }
  };

  if (loadError && !status) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-sm text-[#6B6560]">{t('admin.loadFailed')}</p>
        <PrimaryButton onClick={() => void loadStatus()}>{t('common.retry')}</PrimaryButton>
      </div>
    );
  }

  if (!status) {
    return <div className="py-12 text-center text-sm text-[#6B6560]">{t('common.loading')}</div>;
  }

  if (!status.isAdmin) {
    return (
      <div className="max-w-md mx-auto py-10">
        <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-5">
          <div className="w-10 h-10 rounded-xl bg-[#FFF4EC] text-[#FF6A1A] flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-[#1C1917]">
              {t('admin.unlockTitle')}
            </h1>
            <p className="text-sm text-[#6B6560] mt-1">{t('admin.unlockDesc')}</p>
          </div>

          {unlockError && (
            <p className="text-sm text-[#DC2626] font-medium">{t(unlockError)}</p>
          )}

          <form onSubmit={handleClaim} className="space-y-4">
            <TextInput
              id="admin-passcode"
              type="password"
              label={t('admin.passcodeLabel')}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              minLength={4}
              required
            />
            <PrimaryButton type="submit" className="w-full">
              {status.isClaimed ? t('admin.unlockButton') : t('admin.claimButton')}
            </PrimaryButton>
          </form>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="py-12 text-center text-sm text-[#6B6560]">{t('common.loading')}</div>;
  }

  const tabs: Array<{ id: AdminTab; label: string }> = [
    { id: 'overview', label: t('admin.tabOverview') },
    { id: 'users', label: t('admin.tabUsers') },
    { id: 'payments', label: t('admin.tabPayments') },
    { id: 'pricing', label: t('admin.tabPricing') },
    { id: 'recipes', label: t('admin.tabRecipes') },
    { id: 'styles', label: t('admin.tabStyles') },
    { id: 'voices', label: t('admin.tabVoicesMusic') },
    { id: 'jobs', label: t('admin.tabJobs') },
    { id: 'reports', label: t('admin.tabReports') },
    { id: 'settings', label: t('admin.tabSettings') },
    { id: 'audit', label: t('admin.tabAudit') },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-[#1C1917]">{t('admin.title')}</h1>

      <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-white border border-[#EAE7E3]">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === tb.id ? 'bg-[#E5540A] text-white' : 'text-[#6B6560] hover:text-[#1C1917]'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-[#EAE7E3]">
            <p className="text-xs text-[#6B6560]">{t('admin.metricRevenue')}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums text-[#1C1917]">
              {formatXaf(data.metrics.totalRevenue)}
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-[#EAE7E3]">
            <p className="text-xs text-[#6B6560]">{t('admin.metricUsers')}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums text-[#1C1917]">
              {data.metrics.userCount}
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-[#EAE7E3]">
            <p className="text-xs text-[#6B6560]">{t('admin.metricReels')}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums text-[#1C1917]">
              {data.metrics.reelCount}
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-[#EAE7E3]">
            <p className="text-xs text-[#6B6560]">{t('admin.metricProviderCost')}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums text-[#1C1917]">
              ${data.metrics.providerCostUsd.toFixed(4)}
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-[#EAE7E3]">
            <p className="text-xs text-[#6B6560]">{t('admin.metricFailRate')}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums text-[#1C1917]">
              {data.metrics.failRate}%
            </p>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="rounded-2xl bg-white border border-[#EAE7E3] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-[#EAE7E3] text-xs text-[#6B6560]">
              <tr>
                <th className="p-4">{t('admin.colEmail')}</th>
                <th className="p-4">{t('admin.colRole')}</th>
                <th className="p-4 text-right">{t('admin.colCredits')}</th>
                <th className="p-4 text-right">{t('admin.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAE7E3]">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="p-4 font-medium text-[#1C1917]">{u.email}</td>
                  <td className="p-4 text-[#6B6560]">{u.role}</td>
                  <td className="p-4 text-right font-mono tabular-nums">{u.balance.total}</td>
                  <td className="p-4 text-right">
                    <SecondaryButton onClick={() => setAdjustUser({ id: u.id, email: u.email })}>
                      {t('admin.adjustCredits')}
                    </SecondaryButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payments' && (
        <div className="rounded-2xl bg-white border border-[#EAE7E3] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-[#EAE7E3] text-xs text-[#6B6560]">
              <tr>
                <th className="p-4">{t('admin.colUser')}</th>
                <th className="p-4">{t('admin.colPlan')}</th>
                <th className="p-4">{t('admin.colStatus')}</th>
                <th className="p-4 text-right">{t('admin.colTotal')}</th>
                <th className="p-4 text-right">{t('admin.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAE7E3]">
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <td className="p-4">{p.user_email}</td>
                  <td className="p-4">{p.plan_name}</td>
                  <td className="p-4">{p.status}</td>
                  <td className="p-4 text-right font-mono tabular-nums">
                    {formatXaf(p.total_xaf)}
                  </td>
                  <td className="p-4 text-right">
                    {p.status === 'paid' && (
                      <SecondaryButton
                        onClick={() =>
                          void apiFetch(`/api/admin/payments/${p.id}/refund`, {
                            method: 'POST',
                          }).then(() => loadStatus())
                        }
                      >
                        {t('admin.refundButton')}
                      </SecondaryButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pricing' && (
        <div className="space-y-6">
          {pricingError && (
            <div className="p-3.5 rounded-xl bg-[#DC2626]/10 text-[#DC2626] text-sm font-medium">
              {pricingError}
            </div>
          )}

          {/* Monthly Plans & Top-ups */}
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-[#1C1917]">
              {t('admin.pricingPlansHeading')}
            </h2>
            <div className="rounded-2xl bg-white border border-[#EAE7E3] overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-[#EAE7E3] text-xs text-[#6B6560]">
                  <tr>
                    <th className="p-4">{t('admin.colPlan')}</th>
                    <th className="p-4">{t('admin.colPriceXaf')}</th>
                    <th className="p-4">{t('admin.colPlanCredits')}</th>
                    <th className="p-4">{t('admin.colActive')}</th>
                    <th className="p-4 text-right">{t('admin.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE7E3]">
                  {data.plans.map((plan) => {
                    const draft = draftPlans[plan.id] ?? {
                      price_xaf: String(plan.price_xaf),
                      credits: String(plan.credits),
                      active: Boolean(plan.active),
                    };
                    const isSaving = savingPricingKey === plan.id;
                    const isSaved = savedPricingKey === plan.id;
                    return (
                      <tr key={plan.id}>
                        <td className="p-4 font-semibold text-[#1C1917]">{plan.name}</td>
                        <td className="p-4">
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={draft.price_xaf}
                            onChange={(e) => {
                              setSavedPricingKey(null);
                              setDraftPlans((prev) => ({
                                ...prev,
                                [plan.id]: { ...draft, price_xaf: e.target.value },
                              }));
                            }}
                            className="w-28 min-h-[38px] px-3 rounded-xl border border-[#EAE7E3] font-mono text-sm tabular-nums"
                          />
                        </td>
                        <td className="p-4">
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={draft.credits}
                            onChange={(e) => {
                              setSavedPricingKey(null);
                              setDraftPlans((prev) => ({
                                ...prev,
                                [plan.id]: { ...draft, credits: e.target.value },
                              }));
                            }}
                            className="w-28 min-h-[38px] px-3 rounded-xl border border-[#EAE7E3] font-mono text-sm tabular-nums"
                          />
                        </td>
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={draft.active}
                            onChange={(e) => {
                              setSavedPricingKey(null);
                              setDraftPlans((prev) => ({
                                ...prev,
                                [plan.id]: { ...draft, active: e.target.checked },
                              }));
                            }}
                            className="w-5 h-5 accent-[#E5540A]"
                          />
                        </td>
                        <td className="p-4 text-right">
                          <div className="inline-flex items-center gap-2.5">
                            {isSaved && (
                              <span className="text-xs font-semibold text-[#16A34A]">
                                {t('admin.savedBadge')}
                              </span>
                            )}
                            <SecondaryButton
                              disabled={isSaving}
                              onClick={() => void handlePlanUpdate(plan.id)}
                            >
                              {isSaving ? t('common.loading') : t('common.save')}
                            </SecondaryButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Per-Feature Credit Costs */}
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-[#1C1917]">
              {t('admin.pricingRatesHeading')}
            </h2>
            {data.priceTable.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] text-sm text-[#6B6560]">
                {t('admin.noPricingRows')}
              </div>
            ) : (
              <div className="rounded-2xl bg-white border border-[#EAE7E3] divide-y divide-[#EAE7E3]">
                {data.priceTable.map((row) => {
                  const val = draftPrices[row.key] ?? String(row.credits_value);
                  const isSaving = savingPricingKey === row.key;
                  const isSaved = savedPricingKey === row.key;
                  return (
                    <div
                      key={row.key}
                      className="p-4 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#1C1917]">{row.label}</p>
                        <p className="text-xs text-[#6B6560]">{row.unit}</p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          value={val}
                          onChange={(e) => {
                            setSavedPricingKey(null);
                            setDraftPrices((prev) => ({ ...prev, [row.key]: e.target.value }));
                          }}
                          className="w-24 min-h-[40px] px-3 rounded-xl border border-[#EAE7E3] font-mono text-sm tabular-nums"
                        />
                        <span className="text-xs text-[#6B6560]">{t('common.creditsSuffix')}</span>
                        {isSaved && (
                          <span className="text-xs font-semibold text-[#16A34A]">
                            {t('admin.savedBadge')}
                          </span>
                        )}
                        <SecondaryButton
                          disabled={isSaving}
                          onClick={() => void handlePriceUpdate(row.key)}
                        >
                          {isSaving ? t('common.loading') : t('common.save')}
                        </SecondaryButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'recipes' && (
        <div className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-5">
          <h2 className="font-display text-lg font-semibold text-[#1C1917]">
            {t('admin.testScriptEngine')}
          </h2>
          <form onSubmit={handleRunRecipeTest} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SelectField
              id="test-sub"
              label={t('wizard.subNicheHeading')}
              value={testSubId}
              onChange={(e) => setTestSubId(e.target.value)}
            >
              {allSubs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="test-lang"
              label={t('wizard.languageLabel')}
              value={testLang}
              onChange={(e) => setTestLang(e.target.value)}
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </SelectField>
            <TextInput
              id="test-topic"
              label={t('wizard.topicLabel')}
              value={testTopic}
              onChange={(e) => setTestTopic(e.target.value)}
              required
            />
            <div className="sm:col-span-3">
              <PrimaryButton type="submit" loading={testingRecipe}>
                <Play className="w-4 h-4" />
                <span>{t('admin.runScriptTest')}</span>
              </PrimaryButton>
            </div>
          </form>

          {testResult && (
            <div className="p-4 rounded-xl bg-[#FAFAF9] border border-[#EAE7E3] space-y-3 text-sm">
              <p>
                <strong>{t('admin.hookLabel')}</strong> {testResult.bestHook}
              </p>
              <p className="font-medium text-[#1C1917]">
                {t('admin.scoresSummary', {
                  hook: testResult.edited.hook_score,
                  ending: testResult.edited.ending_score,
                })}
              </p>
              <p className="whitespace-pre-line text-[#1C1917]">{testResult.edited.script}</p>
              <div className="pt-2 border-t border-[#EAE7E3] space-y-1.5">
                {testResult.split.scenes.map((sc, i) => (
                  <p key={i} className="text-xs text-[#6B6560]">
                    {i + 1}. {sc.narration_text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'styles' && (
        <div className="rounded-2xl bg-white border border-[#EAE7E3] divide-y divide-[#EAE7E3]">
          {data.styles.map((st) => (
            <div key={st.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#1C1917]">{st.name}</p>
                <p className="text-xs text-[#6B6560] capitalize">
                  {st.difficulty} · {st.image_cost_multiplier}x · {st.consistency_pass_rate}%{' '}
                  {t('admin.passRateSuffix')}
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(st.active)}
                onChange={(e) => void handleStyleToggle(st.id, e.target.checked)}
                className="w-5 h-5 accent-[#E5540A]"
              />
            </div>
          ))}
        </div>
      )}

      {tab === 'voices' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white border border-[#EAE7E3] divide-y divide-[#EAE7E3]">
            {data.voices.slice(0, 12).map((v) => (
              <div key={v.id} className="p-3.5 flex justify-between text-sm">
                <span className="font-medium text-[#1C1917]">{v.name}</span>
                <span className="text-xs text-[#6B6560] uppercase">
                  {v.language} · {v.tier}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-white border border-[#EAE7E3] divide-y divide-[#EAE7E3]">
            {data.music.map((m) => (
              <div key={m.id} className="p-3.5 flex justify-between text-sm">
                <span className="font-medium text-[#1C1917]">{m.title}</span>
                <span className="text-xs text-[#6B6560]">{m.bpm} BPM</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'jobs' && (
        <div className="rounded-2xl bg-white border border-[#EAE7E3] divide-y divide-[#EAE7E3]">
          {data.jobs.map((j) => (
            <div key={j.id} className="p-4 flex items-center justify-between text-sm">
              <div>
                <p className="font-semibold text-[#1C1917]">{j.project_title}</p>
                <p className="text-xs text-[#6B6560]">
                  {j.user_email} · {j.current_step}
                </p>
              </div>
              <span className="font-mono text-xs tabular-nums">
                {j.status} ({j.progress_pct}%)
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'reports' && (
        <div className="rounded-2xl bg-white border border-[#EAE7E3] divide-y divide-[#EAE7E3]">
          {data.reports.length === 0 ? (
            <p className="p-6 text-sm text-[#6B6560]">{t('admin.noReports')}</p>
          ) : (
            data.reports.map((r) => (
              <div key={r.id} className="p-4 text-sm">
                <p className="font-semibold text-[#1C1917]">{r.project_title}</p>
                <p className="text-xs text-[#6B6560]">
                  {r.user_email} · {r.reason}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="rounded-2xl bg-white border border-[#EAE7E3] divide-y divide-[#EAE7E3]">
          {data.settings.map((s) => (
            <div key={s.key} className="p-4 flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-[#1C1917]">{s.key}</span>
              <input
                type="text"
                defaultValue={s.value}
                onBlur={(e) =>
                  void apiFetch('/api/admin/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({ key: s.key, value: e.target.value }),
                  })
                }
                className="w-64 min-h-[40px] px-3 rounded-xl border border-[#EAE7E3] text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div className="rounded-2xl bg-white border border-[#EAE7E3] divide-y divide-[#EAE7E3]">
          {data.auditLog.map((a) => (
            <div key={a.id} className="p-4 flex items-center justify-between gap-4 text-sm">
              <div>
                <p className="font-medium text-[#1C1917]">
                  {a.action} · {a.target_type}
                </p>
                <p className="text-xs text-[#6B6560]">
                  {a.actor_email} · {a.reason}
                </p>
              </div>
              <span className="text-xs text-[#6B6560]">
                {new Date(a.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <ModalSheet
        open={adjustUser !== null}
        onClose={() => setAdjustUser(null)}
        title={t('admin.adjustCredits')}
      >
        <form onSubmit={handleAdjustCredits} className="space-y-4">
          <p className="text-sm text-[#6B6560]">{adjustUser?.email}</p>
          <TextInput
            id="adj-delta"
            type="number"
            label={t('admin.adjustDelta')}
            value={adjustDelta}
            onChange={(e) => setAdjustDelta(e.target.value)}
            required
          />
          <TextInput
            id="adj-reason"
            label={t('admin.adjustReason')}
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            minLength={3}
            required
          />
          <PrimaryButton type="submit" className="w-full">
            {t('common.save')}
          </PrimaryButton>
        </form>
      </ModalSheet>
    </div>
  );
};
