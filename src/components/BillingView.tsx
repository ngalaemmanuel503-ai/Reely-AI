import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Receipt, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { t } from '../lib/i18n.ts';
import {
  calculateCheckoutTotal,
  calculateCreditQuote,
  DEFAULT_PRICE_TABLE,
  formatXaf,
  getSceneCountForLength,
} from '../shared/credits.ts';
import type { CreditBalance, LengthTier, PaymentMethod, Plan } from '../shared/types.ts';
import {
  ModalSheet,
  PrimaryButton,
  SecondaryButton,
  SegmentedControl,
  TextInput,
} from './ui/Primitives.tsx';

interface LedgerRow {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  created_at: string;
}

interface PaymentRow {
  id: string;
  provider_ref: string;
  method: string;
  amount_base_xaf: number;
  fee_xaf: number;
  total_xaf: number;
  status: string;
  plan_name: string;
  plan_credits: number;
  created_at: string;
}

interface PriceRateRow {
  key: string;
  label: string;
  credits_value: number;
  unit: string;
  notes: string;
}

export const BillingView: React.FC<{
  onBalanceUpdate: (b: CreditBalance) => void;
}> = ({ onBalanceUpdate }) => {
  const [tab, setTab] = useState<'overview' | 'pricing'>('overview');
  const [loadError, setLoadError] = useState(false);
  const [summary, setSummary] = useState<{
    balance: CreditBalance;
    plans: Plan[];
    ledger: LedgerRow[];
    payments: PaymentRow[];
    priceTable?: PriceRateRow[];
  } | null>(null);

  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('mtn_momo');
  const [phone, setPhone] = useState('+2376');
  const [pendingSession, setPendingSession] = useState<{
    paymentId: string;
    totalXaf: number;
    isMockMode: boolean;
  } | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<'paid' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoadError(false);
    try {
      const data = await apiFetch<{
        balance: CreditBalance;
        plans: Plan[];
        ledger: LedgerRow[];
        payments: PaymentRow[];
        priceTable?: PriceRateRow[];
      }>('/api/billing/summary');
      setSummary(data);
      onBalanceUpdate(data.balance);
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const priceMap = useMemo(() => {
    const map: Record<string, number> = { ...DEFAULT_PRICE_TABLE };
    for (const row of summary?.priceTable ?? []) {
      map[row.key] = row.credits_value;
    }
    return map;
  }, [summary?.priceTable]);

  const handleStartCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan) return;
    setBusy(true);
    try {
      const idempKey = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const res = await apiFetch<{
        paymentId: string;
        totalXaf: number;
        isMockMode: boolean;
      }>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({
          plan_id: checkoutPlan.id,
          method,
          phone_number: phone,
          idempotency_key: idempKey,
        }),
      });
      setPendingSession(res);
    } finally {
      setBusy(false);
    }
  };

  const handleMockConfirm = async (outcome: 'paid' | 'failed') => {
    if (!pendingSession) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ balance: CreditBalance }>(
        `/api/billing/payments/${pendingSession.paymentId}/confirm-mock`,
        {
          method: 'POST',
          body: JSON.stringify({ outcome }),
        }
      );
      setCheckoutResult(outcome);
      onBalanceUpdate(res.balance);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const REASON_LABELS: Record<string, string> = {
    plan_grant: t('billing.reason_plan_grant'),
    topup: t('billing.reason_topup'),
    free_grant: t('billing.reason_free_grant'),
    reserve: t('billing.reason_reserve'),
    settle: t('billing.reason_settle'),
    refund: t('billing.reason_refund'),
    admin_adjust: t('billing.reason_admin_adjust'),
    expiry: t('billing.reason_expiry'),
  };

  if (loadError && !summary) {
    return (
      <div className="py-12 max-w-md mx-auto text-center space-y-4">
        <p className="text-sm text-[#6B6560]">{t('billing.loadError')}</p>
        <PrimaryButton onClick={() => void load()}>{t('common.retry')}</PrimaryButton>
      </div>
    );
  }

  if (!summary) {
    return <div className="py-12 text-center text-sm text-[#6B6560]">{t('common.loading')}</div>;
  }

  const paidPlans = summary.plans.filter((p) => p.code !== 'free' && p.code !== 'topup');
  const purchasablePlans = summary.plans.filter((p) => p.code !== 'free');
  const topupPlan = summary.plans.find((p) => p.code === 'topup');
  const checkoutTotals = checkoutPlan ? calculateCheckoutTotal(checkoutPlan.price_xaf) : null;
  const lengthTiers: LengthTier[] = [30, 60, 90];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-[#1C1917]">{t('billing.title')}</h1>
        <SegmentedControl<'overview' | 'pricing'>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: t('billing.tabOverview') },
            { value: 'pricing', label: t('billing.tabPricing') },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <>
          {/* Balance Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-[#EAE7E3]">
              <p className="text-xs font-medium text-[#6B6560]">{t('billing.planCredits')}</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-[#1C1917]">
                {summary.balance.plan_credits.toLocaleString('en-US')}
              </p>
              <p className="mt-1 text-xs text-[#6B6560]">
                {summary.balance.plan_expires_at
                  ? t('billing.expiresOn', {
                      date: new Date(summary.balance.plan_expires_at).toLocaleDateString(),
                    })
                  : t('billing.noExpiry')}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-[#EAE7E3]">
              <p className="text-xs font-medium text-[#6B6560]">{t('billing.topupCredits')}</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-[#1C1917]">
                {summary.balance.topup_credits.toLocaleString('en-US')}
              </p>
              <p className="mt-1 text-xs text-[#6B6560]">
                {summary.balance.topup_expires_at
                  ? t('billing.expiresOn', {
                      date: new Date(summary.balance.topup_expires_at).toLocaleDateString(),
                    })
                  : t('billing.noExpiry')}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-[#EAE7E3]">
              <p className="text-xs font-medium text-[#6B6560]">{t('billing.freeCredits')}</p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-[#B8420A]">
                {summary.balance.free_credits.toLocaleString('en-US')}
              </p>
              <p className="mt-1 text-xs text-[#6B6560]">{t('billing.noExpiry')}</p>
            </div>
          </div>

          {/* Plans */}
          <section className="space-y-4">
            <h2 className="font-display text-lg font-bold text-[#1C1917]">
              {t('billing.plansHeading')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {paidPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-6 rounded-2xl bg-white border border-[#EAE7E3] flex flex-col justify-between space-y-5"
                >
                  <div>
                    <h3 className="font-display text-lg font-bold text-[#1C1917]">{plan.name}</h3>
                    <p className="mt-2 font-display text-2xl font-bold tabular-nums text-[#1C1917]">
                      {formatXaf(plan.price_xaf)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#B8420A] tabular-nums">
                      {plan.credits.toLocaleString('en-US')} {t('common.creditsSuffix')}
                    </p>
                  </div>
                  <PrimaryButton
                    onClick={() => {
                      setCheckoutPlan(plan);
                      setPendingSession(null);
                      setCheckoutResult(null);
                    }}
                  >
                    {t('billing.buyPlan')}
                  </PrimaryButton>
                </div>
              ))}
            </div>
          </section>

          {/* Top-up */}
          {topupPlan && (
            <section className="space-y-4">
              <h2 className="font-display text-lg font-bold text-[#1C1917]">
                {t('billing.topupHeading')}
              </h2>
              <div className="p-6 rounded-2xl bg-[#FFF4EC] border border-[#FFE4D1] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-[#1C1917]">{topupPlan.name}</h3>
                  <p className="text-sm text-[#6B6560] tabular-nums">
                    {topupPlan.credits.toLocaleString('en-US')} {t('common.creditsSuffix')} ·{' '}
                    {formatXaf(topupPlan.price_xaf)}
                  </p>
                </div>
                <PrimaryButton
                  onClick={() => {
                    setCheckoutPlan(topupPlan);
                    setPendingSession(null);
                    setCheckoutResult(null);
                  }}
                >
                  {t('billing.buyTopup')}
                </PrimaryButton>
              </div>
            </section>
          )}

          {/* Ledger & Receipts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-4">
              <h2 className="font-display text-lg font-semibold text-[#1C1917]">
                {t('billing.ledgerHeading')}
              </h2>
              {summary.ledger.length === 0 ? (
                <p className="text-sm text-[#6B6560]">{t('billing.noLedger')}</p>
              ) : (
                <div className="divide-y divide-[#EAE7E3]">
                  {summary.ledger.map((row) => (
                    <div key={row.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-[#1C1917] truncate">
                          {REASON_LABELS[row.reason] ?? row.reason}
                        </p>
                        <p className="text-xs text-[#6B6560]">
                          {new Date(row.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`font-mono font-semibold tabular-nums ${
                            row.delta >= 0 ? 'text-[#16A34A]' : 'text-[#1C1917]'
                          }`}
                        >
                          {row.delta > 0 ? `+${row.delta}` : row.delta}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-[#6B6560]">
                          {row.balance_after}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="p-6 rounded-2xl bg-white border border-[#EAE7E3] space-y-4">
              <h2 className="font-display text-lg font-semibold text-[#1C1917]">
                {t('billing.receiptsHeading')}
              </h2>
              {summary.payments.length === 0 ? (
                <p className="text-sm text-[#6B6560]">{t('billing.noReceipts')}</p>
              ) : (
                <div className="divide-y divide-[#EAE7E3]">
                  {summary.payments.map((pay) => (
                    <div key={pay.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <Receipt className="w-4 h-4 text-[#6B6560] shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-[#1C1917] truncate">
                            {pay.plan_name} · {pay.status}
                          </p>
                          <p className="text-xs text-[#6B6560]">
                            {new Date(pay.created_at).toLocaleDateString()} ·{' '}
                            {pay.method === 'mtn_momo' ? t('billing.mtnShort') : t('billing.orangeShort')}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono font-semibold tabular-nums text-[#1C1917] shrink-0">
                        {formatXaf(pay.total_xaf)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {tab === 'pricing' && (
        <div className="space-y-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-xl font-bold text-[#1C1917]">
              {t('billing.pricingHeading')}
            </h2>
            <p className="mt-1 text-sm text-[#6B6560]">{t('billing.pricingSubheading')}</p>
          </div>

          {/* Plans & Top-up XAF Table */}
          <section className="space-y-3">
            <h3 className="font-display text-base font-semibold text-[#1C1917]">
              {t('billing.planRatesHeading')}
            </h3>
            <div className="rounded-2xl bg-white border border-[#EAE7E3] overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-[#EAE7E3] text-xs text-[#6B6560]">
                  <tr>
                    <th className="p-4">{t('billing.colPlanName')}</th>
                    <th className="p-4 text-right">{t('billing.colIncluded')}</th>
                    <th className="p-4 text-right">{t('billing.colApproxReels')}</th>
                    <th className="p-4 text-right">{t('billing.colBasePrice')}</th>
                    <th className="p-4 text-right">{t('billing.colFee')}</th>
                    <th className="p-4 text-right">{t('billing.colTotalPay')}</th>
                    <th className="p-4 text-right">{t('admin.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE7E3]">
                  {purchasablePlans.map((plan) => {
                    const totals = calculateCheckoutTotal(plan.price_xaf);
                    const approxReels = Math.max(1, Math.floor(plan.credits / 180));
                    return (
                      <tr key={plan.id}>
                        <td className="p-4 font-semibold text-[#1C1917]">{plan.name}</td>
                        <td className="p-4 text-right font-mono tabular-nums text-[#B8420A] font-semibold">
                          {plan.credits.toLocaleString('en-US')}
                        </td>
                        <td className="p-4 text-right font-mono tabular-nums text-[#6B6560]">
                          ~{approxReels}
                        </td>
                        <td className="p-4 text-right font-mono tabular-nums text-[#1C1917]">
                          {formatXaf(totals.base_xaf)}
                        </td>
                        <td className="p-4 text-right font-mono tabular-nums text-[#6B6560]">
                          {formatXaf(totals.fee_xaf)}
                        </td>
                        <td className="p-4 text-right font-mono tabular-nums font-bold text-[#1C1917]">
                          {formatXaf(totals.total_xaf)}
                        </td>
                        <td className="p-4 text-right">
                          <SecondaryButton
                            onClick={() => {
                              setCheckoutPlan(plan);
                              setPendingSession(null);
                              setCheckoutResult(null);
                            }}
                          >
                            {plan.code === 'topup' ? t('billing.buyTopup') : t('billing.buyPlan')}
                          </SecondaryButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Reel Cost Calculator Table */}
          <section className="space-y-3">
            <h3 className="font-display text-base font-semibold text-[#1C1917]">
              {t('billing.reelEstimatesHeading')}
            </h3>
            <div className="rounded-2xl bg-white border border-[#EAE7E3] overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-[#EAE7E3] text-xs text-[#6B6560]">
                  <tr>
                    <th className="p-4">{t('billing.colLength')}</th>
                    <th className="p-4 text-right">{t('billing.colScenes')}</th>
                    <th className="p-4 text-right">{t('billing.estimateStandardVoice')}</th>
                    <th className="p-4 text-right">{t('billing.estimatePremiumVoice')}</th>
                    <th className="p-4 text-right">{t('billing.estimateWithCharacter')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE7E3]">
                  {lengthTiers.map((len) => {
                    const stdQuote = calculateCreditQuote({
                      lengthTier: len,
                      hasCharacter: false,
                      voiceTier: 'standard',
                      prices: priceMap,
                    });
                    const premQuote = calculateCreditQuote({
                      lengthTier: len,
                      hasCharacter: false,
                      voiceTier: 'premium',
                      prices: priceMap,
                    });
                    const charQuote = calculateCreditQuote({
                      lengthTier: len,
                      hasCharacter: true,
                      voiceTier: 'premium',
                      prices: priceMap,
                    });
                    return (
                      <tr key={len}>
                        <td className="p-4 font-semibold text-[#1C1917] tabular-nums">{len}s</td>
                        <td className="p-4 text-right font-mono tabular-nums text-[#6B6560]">
                          {getSceneCountForLength(len)}
                        </td>
                        <td className="p-4 text-right font-mono tabular-nums text-[#1C1917]">
                          {stdQuote.total} {t('common.creditsSuffix')}
                        </td>
                        <td className="p-4 text-right font-mono tabular-nums text-[#1C1917]">
                          {premQuote.total} {t('common.creditsSuffix')}
                        </td>
                        <td className="p-4 text-right font-mono tabular-nums font-semibold text-[#B8420A]">
                          {charQuote.total} {t('common.creditsSuffix')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Per-feature Price Table */}
          <section className="space-y-3">
            <h3 className="font-display text-base font-semibold text-[#1C1917]">
              {t('billing.featureRatesHeading')}
            </h3>
            <div className="rounded-2xl bg-white border border-[#EAE7E3] overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-[#EAE7E3] text-xs text-[#6B6560]">
                  <tr>
                    <th className="p-4">{t('billing.colFeature')}</th>
                    <th className="p-4">{t('billing.colUnit')}</th>
                    <th className="p-4 text-right">{t('billing.colRate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE7E3]">
                  {(summary.priceTable ?? []).map((row) => (
                    <tr key={row.key}>
                      <td className="p-4">
                        <p className="font-semibold text-[#1C1917]">{row.label}</p>
                        {row.notes && <p className="text-xs text-[#6B6560]">{row.notes}</p>}
                      </td>
                      <td className="p-4 text-[#6B6560]">{row.unit}</td>
                      <td className="p-4 text-right font-mono font-semibold tabular-nums text-[#1C1917]">
                        {row.credits_value} {t('common.creditsSuffix')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* Checkout Modal */}
      <ModalSheet
        open={checkoutPlan !== null}
        onClose={() => setCheckoutPlan(null)}
        title={t('billing.checkoutTitle')}
      >
        {checkoutPlan && checkoutTotals && (
          <div className="space-y-5">
            {checkoutResult === 'paid' ? (
              <div className="text-center py-4 space-y-4">
                <CheckCircle2 className="w-10 h-10 text-[#16A34A] mx-auto" />
                <p className="text-sm font-medium text-[#1C1917]">{t('billing.paymentPaid')}</p>
                <PrimaryButton onClick={() => setCheckoutPlan(null)} className="w-full">
                  {t('common.close')}
                </PrimaryButton>
              </div>
            ) : checkoutResult === 'failed' ? (
              <div className="text-center py-4 space-y-4">
                <XCircle className="w-10 h-10 text-[#DC2626] mx-auto" />
                <p className="text-sm font-medium text-[#1C1917]">{t('billing.paymentFailed')}</p>
                <SecondaryButton onClick={() => setCheckoutResult(null)} className="w-full">
                  {t('common.retry')}
                </SecondaryButton>
              </div>
            ) : pendingSession ? (
              <div className="space-y-4">
                <p className="text-sm text-[#6B6560]">{t('billing.paymentPending')}</p>
                {pendingSession.isMockMode && (
                  <div className="flex flex-col gap-2.5">
                    <PrimaryButton
                      onClick={() => void handleMockConfirm('paid')}
                      loading={busy}
                      className="w-full"
                    >
                      {t('billing.simulateSuccess')}
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() => void handleMockConfirm('failed')}
                      disabled={busy}
                      className="w-full"
                    >
                      {t('billing.simulateFail')}
                    </SecondaryButton>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleStartCheckout} className="space-y-4">
                <div className="space-y-2">
                  <span className="block text-sm font-medium text-[#1C1917]">
                    {t('billing.methodLabel')}
                  </span>
                  <SegmentedControl<PaymentMethod>
                    value={method}
                    onChange={setMethod}
                    options={[
                      { value: 'mtn_momo', label: t('billing.mtnLabel') },
                      { value: 'orange_money', label: t('billing.orangeLabel') },
                    ]}
                  />
                </div>

                <TextInput
                  id="checkout-phone"
                  type="tel"
                  label={t('billing.phoneNumberLabel')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />

                <div className="p-4 rounded-xl bg-[#FAFAF9] border border-[#EAE7E3] space-y-2 text-sm">
                  <div className="flex justify-between text-[#6B6560]">
                    <span>{t('billing.basePriceLabel')}</span>
                    <span className="font-mono tabular-nums">
                      {formatXaf(checkoutTotals.base_xaf)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#6B6560]">
                    <span>{t('billing.feeLabel')}</span>
                    <span className="font-mono tabular-nums">
                      {formatXaf(checkoutTotals.fee_xaf)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-[#EAE7E3] flex justify-between font-display font-bold text-[#1C1917]">
                    <span>{t('billing.totalLabel')}</span>
                    <span className="font-mono tabular-nums text-[#B8420A]">
                      {formatXaf(checkoutTotals.total_xaf)}
                    </span>
                  </div>
                </div>

                <PrimaryButton type="submit" loading={busy} className="w-full">
                  {t('billing.payNow', { total: formatXaf(checkoutTotals.total_xaf) })}
                </PrimaryButton>
              </form>
            )}
          </div>
        )}
      </ModalSheet>
    </div>
  );
};
