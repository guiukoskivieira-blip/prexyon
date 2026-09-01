import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { SubscriptionPlanCode, SubscriptionBillingCycle } from '../types/subscription';

export interface CheckoutResult {
  success: boolean;
  checkoutUrl?: string;
  initPoint?: string;
  preferenceId?: string;
  planName?: string;
  priceCents?: number;
  error?: string;
}

export interface PaymentTransaction {
  id: string;
  providerPaymentId: string;
  status: string;
  amountCents: number;
  billingInterval: string;
  paymentMethodType: string;
  paidAt: string | null;
  createdAt: string;
}

export const billingService = {
  async createCheckoutSession(
    organizationId: string,
    planCode: SubscriptionPlanCode,
    billingInterval: SubscriptionBillingCycle
  ): Promise<CheckoutResult> {
    if (!isSupabaseConfigured()) {
      return {
        success: true,
        checkoutUrl: '/app/assinatura/sucesso?mock=true',
        initPoint: '/app/assinatura/sucesso?mock=true',
        preferenceId: 'mock_pref_dev',
        planName: planCode,
        priceCents: 5990,
      };
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const { data, error } = await supabase.functions.invoke('prexyon-create-checkout', {
        body: {
          organization_id: organizationId,
          plan_code: planCode,
          billing_interval: billingInterval,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (error || !data || !data.success) {
        return {
          success: false,
          error: data?.error || error?.message || 'Falha ao iniciar sessão de pagamento.',
        };
      }

      return {
        success: true,
        checkoutUrl: data.checkout_url || data.init_point,
        initPoint: data.init_point,
        preferenceId: data.preference_id,
        planName: data.plan_name,
        priceCents: data.price_cents,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Erro de comunicação ao criar checkout.',
      };
    }
  },

  async fetchBillingTransactions(organizationId: string): Promise<PaymentTransaction[]> {
    if (!isSupabaseConfigured()) {
      return [
        {
          id: 'tx_1',
          providerPaymentId: 'mp_pay_94827419',
          status: 'approved',
          amountCents: 15990,
          billingInterval: 'monthly',
          paymentMethodType: 'credit_card',
          paidAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];
    }

    try {
      const { data, error } = await supabase
        .from('prexyon_payment_transactions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error || !data) {
        return [];
      }

      return data.map((t: any) => ({
        id: t.id,
        providerPaymentId: t.provider_payment_id,
        status: t.status,
        amountCents: t.amount_cents,
        billingInterval: t.billing_interval,
        paymentMethodType: t.payment_method_type || 'credit_card',
        paidAt: t.paid_at,
        createdAt: t.created_at,
      }));
    } catch {
      return [];
    }
  },
};
