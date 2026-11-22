import crypto from 'node:crypto';
import { calculateCheckoutTotal } from '../src/shared/credits.ts';
import type { PaymentMethod } from '../src/shared/types.ts';
import { db, grantCredits } from './db.ts';

export interface CheckoutSession {
  paymentId: string;
  providerRef: string;
  baseXaf: number;
  feeXaf: number;
  totalXaf: number;
  status: 'pending';
}

export interface PaymentProvider {
  name: string;
  createCheckout(params: {
    userId: string;
    planId: string;
    method: PaymentMethod;
    phoneNumber: string;
    idempotencyKey: string;
  }): CheckoutSession;
  verifyWebhook(signature: string | undefined, payload: string): boolean;
}

class MockPaymentProvider implements PaymentProvider {
  name = 'mock';

  createCheckout(params: {
    userId: string;
    planId: string;
    method: PaymentMethod;
    phoneNumber: string;
    idempotencyKey: string;
  }): CheckoutSession {
    const existing = db
      .prepare('SELECT * FROM payments WHERE idempotency_key = ?')
      .get(params.idempotencyKey) as {
      id: string;
      provider_ref: string;
      amount_base_xaf: number;
      fee_xaf: number;
      total_xaf: number;
      status: string;
    } | undefined;

    if (existing) {
      return {
        paymentId: existing.id,
        providerRef: existing.provider_ref,
        baseXaf: existing.amount_base_xaf,
        feeXaf: existing.fee_xaf,
        totalXaf: existing.total_xaf,
        status: 'pending',
      };
    }

    const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND active = 1').get(params.planId) as {
      id: string;
      code: string;
      price_xaf: number;
      credits: number;
    } | undefined;

    if (!plan || plan.price_xaf <= 0) {
      throw new Error('INVALID_PLAN');
    }

    const totals = calculateCheckoutTotal(plan.price_xaf);
    const paymentId = crypto.randomUUID();
    const providerRef = `MOCK_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO payments (id, user_id, provider, provider_ref, method, phone_number, amount_base_xaf, fee_xaf, total_xaf, status, purpose, plan_id, idempotency_key, raw_payload_json, created_at, updated_at)
       VALUES (?, ?, 'mock', ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, '{}', ?, ?)`
    ).run(
      paymentId,
      params.userId,
      providerRef,
      params.method,
      params.phoneNumber,
      totals.base_xaf,
      totals.fee_xaf,
      totals.total_xaf,
      plan.code === 'topup' ? 'topup' : 'plan',
      plan.id,
      params.idempotencyKey,
      now,
      now
    );

    return {
      paymentId,
      providerRef,
      baseXaf: totals.base_xaf,
      feeXaf: totals.fee_xaf,
      totalXaf: totals.total_xaf,
      status: 'pending',
    };
  }

  verifyWebhook(_signature: string | undefined, _payload: string): boolean {
    // Only enabled in non-production when PAYMENT_PROVIDER=mock
    return process.env.NODE_ENV !== 'production' && (process.env.PAYMENT_PROVIDER ?? 'mock') === 'mock';
  }
}

export function getPaymentProvider(): PaymentProvider {
  const mode = process.env.PAYMENT_PROVIDER ?? 'mock';
  if (process.env.NODE_ENV === 'production' && mode === 'mock') {
    throw new Error('MOCK_PAYMENT_FORBIDDEN_IN_PROD');
  }
  return new MockPaymentProvider();
}

/**
 * Idempotent payment confirmation transaction.
 * Duplicate webhooks or repeated calls never double-grant credits.
 * Rejects amount mismatches.
 */
export function processPaymentWebhook(params: {
  paymentId?: string;
  providerRef?: string;
  status: 'paid' | 'failed' | 'expired';
  paidTotalXaf?: number;
  rawPayload?: Record<string, unknown>;
}): { ok: boolean; status: string; alreadyProcessed?: boolean } {
  const tx = db.transaction(() => {
    const payment = params.paymentId
      ? (db.prepare('SELECT * FROM payments WHERE id = ?').get(params.paymentId) as Record<string, unknown> | undefined)
      : (db.prepare('SELECT * FROM payments WHERE provider_ref = ?').get(params.providerRef ?? '') as Record<string, unknown> | undefined);

    if (!payment) {
      return { ok: false, status: 'not_found' };
    }

    if (payment.status === 'paid' || payment.status === 'refunded') {
      return { ok: true, status: String(payment.status), alreadyProcessed: true };
    }

    const now = new Date().toISOString();
    if (params.status !== 'paid') {
      db.prepare('UPDATE payments SET status = ?, raw_payload_json = ?, updated_at = ? WHERE id = ?').run(
        params.status,
        JSON.stringify(params.rawPayload ?? {}),
        now,
        String(payment.id)
      );
      return { ok: true, status: params.status };
    }

    if (
      typeof params.paidTotalXaf === 'number' &&
      Math.round(params.paidTotalXaf) !== Number(payment.total_xaf)
    ) {
      db.prepare('UPDATE payments SET status = ?, raw_payload_json = ?, updated_at = ? WHERE id = ?').run(
        'failed',
        JSON.stringify({ ...(params.rawPayload ?? {}), mismatch: true }),
        now,
        String(payment.id)
      );
      return { ok: false, status: 'amount_mismatch' };
    }

    const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(String(payment.plan_id)) as {
      id: string;
      code: string;
      credits: number;
    } | undefined;

    if (!plan) {
      return { ok: false, status: 'plan_missing' };
    }

    db.prepare('UPDATE payments SET status = ?, raw_payload_json = ?, updated_at = ? WHERE id = ?').run(
      'paid',
      JSON.stringify(params.rawPayload ?? {}),
      now,
      String(payment.id)
    );

    const isTopup = payment.purpose === 'topup';
    const topupDaysSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'topup_expiry_days'").get() as {
      value: string;
    } | undefined;
    const topupDays = Number(topupDaysSetting?.value ?? '90');

    const expiresAt = isTopup
      ? new Date(Date.now() + topupDays * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    grantCredits({
      userId: String(payment.user_id),
      amount: plan.credits,
      source: isTopup ? 'topup' : 'plan',
      reason: isTopup ? 'topup' : 'plan_grant',
      expiresAt,
      meta: { payment_id: payment.id, plan_code: plan.code },
    });

    if (!isTopup) {
      db.prepare("UPDATE subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'").run(
        String(payment.user_id)
      );
      db.prepare(
        `INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, created_at)
         VALUES (?, ?, ?, 'active', ?, ?, ?)`
      ).run(crypto.randomUUID(), String(payment.user_id), plan.id, now, expiresAt, now);
    }

    return { ok: true, status: 'paid' };
  });

  return tx();
}
