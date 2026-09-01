import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { PrexyonPlan, SubscriptionDetails, SubscriptionPlanCode, SubscriptionBillingCycle } from '../types/subscription';
import { ProductId } from '../types/product';

export const OFFICIAL_PLANS_FALLBACK: PrexyonPlan[] = [
  {
    id: 'plan_orcagraf',
    code: 'orcagraf',
    name: 'OrçaGraf',
    description: 'Orçamentos, formação de preços e gestão comercial para gráficas e comunicação visual.',
    billingIntervalDefault: 'monthly',
    monthlyPriceCents: 5990,
    annualPriceCents: 59900,
    includedUsers: 3,
    extraUserPriceCents: 1290,
    isActive: true,
    isFeatured: false,
    displayOrder: 1,
    includedProductCodes: ['orcagraf'],
  },
  {
    id: 'plan_arteflow',
    code: 'arteflow',
    name: 'ArteFlow',
    description: 'Gestão de produção gráfica, PCP, pedidos, fluxo de trabalho e financeiro operacional.',
    billingIntervalDefault: 'monthly',
    monthlyPriceCents: 7990,
    annualPriceCents: 79900,
    includedUsers: 3,
    extraUserPriceCents: 1290,
    isActive: true,
    isFeatured: false,
    displayOrder: 2,
    includedProductCodes: ['arteflow'],
  },
  {
    id: 'plan_artecheck',
    code: 'artecheck',
    name: 'ArteCheck',
    description: 'Análise técnica automatizada de arquivos gráficos, pré-impressão e verificação de gabaritos.',
    billingIntervalDefault: 'monthly',
    monthlyPriceCents: 6990,
    annualPriceCents: 69900,
    includedUsers: 3,
    extraUserPriceCents: 1290,
    isActive: true,
    isFeatured: false,
    displayOrder: 3,
    includedProductCodes: ['artecheck'],
  },
  {
    id: 'plan_combo',
    code: 'orcagraf_arteflow',
    name: 'OrçaGraf + ArteFlow',
    description: 'Pacote integrado de vendas e produção: da proposta comercial ao chão de fábrica.',
    billingIntervalDefault: 'monthly',
    monthlyPriceCents: 11990,
    annualPriceCents: 119900,
    includedUsers: 3,
    extraUserPriceCents: 1290,
    isActive: true,
    isFeatured: false,
    displayOrder: 4,
    includedProductCodes: ['orcagraf', 'arteflow'],
  },
  {
    id: 'plan_complete',
    code: 'prexyon_complete',
    name: 'Prexyon Completo',
    description: 'Ecossistema integrado com todas as ferramentas: OrçaGraf, ArteFlow e ArteCheck.',
    billingIntervalDefault: 'monthly',
    monthlyPriceCents: 15990,
    annualPriceCents: 159900,
    includedUsers: 3,
    extraUserPriceCents: 1290,
    isActive: true,
    isFeatured: true,
    displayOrder: 5,
    includedProductCodes: ['orcagraf', 'arteflow', 'artecheck'],
  },
];

export function formatCentsToBrl(cents: number): string {
  const value = cents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export const subscriptionService = {
  async fetchPlans(): Promise<PrexyonPlan[]> {
    if (!isSupabaseConfigured()) {
      return OFFICIAL_PLANS_FALLBACK;
    }

    try {
      const { data: plansData, error: plansError } = await supabase
        .from('prexyon_plans')
        .select(`
          id, code, name, description, billing_interval_default,
          monthly_price_cents, annual_price_cents, included_users,
          extra_user_price_cents, is_active, is_featured, display_order,
          prexyon_plan_products ( product_code )
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (plansError || !plansData) {
        return OFFICIAL_PLANS_FALLBACK;
      }

      return plansData.map((p: any) => ({
        id: p.id,
        code: p.code as SubscriptionPlanCode,
        name: p.name,
        description: p.description,
        billingIntervalDefault: p.billing_interval_default as SubscriptionBillingCycle,
        monthlyPriceCents: p.monthly_price_cents,
        annualPriceCents: p.annual_price_cents,
        includedUsers: p.included_users,
        extraUserPriceCents: p.extra_user_price_cents,
        isActive: p.is_active,
        isFeatured: p.is_featured,
        displayOrder: p.display_order,
        includedProductCodes: (p.prexyon_plan_products || []).map((pp: any) => pp.product_code as ProductId),
      }));
    } catch {
      return OFFICIAL_PLANS_FALLBACK;
    }
  },

  async fetchOrganizationSubscription(organizationId: string): Promise<SubscriptionDetails> {
    if (!isSupabaseConfigured()) {
      // Mock de desenvolvimento
      const defaultPlan = OFFICIAL_PLANS_FALLBACK[4]; // Prexyon Completo
      return {
        planId: defaultPlan.id,
        planCode: defaultPlan.code,
        planName: defaultPlan.name,
        status: 'active',
        statusLabel: 'Ativo',
        billingCycle: 'monthly',
        monthlyPriceCents: defaultPlan.monthlyPriceCents,
        annualPriceCents: defaultPlan.annualPriceCents,
        priceFormatted: formatCentsToBrl(defaultPlan.monthlyPriceCents),
        nextRenewalFormatted: '15 set. 2026',
        nextRenewalDate: '2026-09-15T00:00:00Z',
        cancelAtPeriodEnd: false,
        includedProducts: [
          { id: 'orcagraf', name: 'OrçaGraf', includedInPlan: true, status: 'active' },
          { id: 'arteflow', name: 'ArteFlow', includedInPlan: true, status: 'active' },
          { id: 'artecheck', name: 'ArteCheck', includedInPlan: true, status: 'active' },
        ],
        userSeats: {
          total: 3,
          used: 2,
          extra: 0,
          extraUserPriceCents: 1290,
        },
      };
    }

    try {
      const { data, error } = await (supabase.rpc as any)('prexyon_get_organization_entitlements', {
        p_org_id: organizationId,
      });

      if (error || !data || !data.has_subscription) {
        // Fallback default para OrçaGraf ativo
        const orcagrafPlan = OFFICIAL_PLANS_FALLBACK[0];
        return {
          planId: orcagrafPlan.id,
          planCode: orcagrafPlan.code,
          planName: orcagrafPlan.name,
          status: 'active',
          statusLabel: 'Ativo',
          billingCycle: 'monthly',
          monthlyPriceCents: orcagrafPlan.monthlyPriceCents,
          annualPriceCents: orcagrafPlan.annualPriceCents,
          priceFormatted: formatCentsToBrl(orcagrafPlan.monthlyPriceCents),
          nextRenewalFormatted: '30 dias',
          nextRenewalDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          cancelAtPeriodEnd: false,
          includedProducts: [
            { id: 'orcagraf', name: 'OrçaGraf', includedInPlan: true, status: 'active' },
            { id: 'arteflow', name: 'ArteFlow', includedInPlan: false, status: 'inactive' },
            { id: 'artecheck', name: 'ArteCheck', includedInPlan: false, status: 'inactive' },
          ],
          userSeats: {
            total: 3,
            used: 1,
            extra: 0,
            extraUserPriceCents: 1290,
          },
        };
      }

      const includedProds: ProductId[] = data.included_products || [];
      const currentPriceCents = data.billing_interval === 'annual' ? data.annual_price_cents : data.monthly_price_cents;

      return {
        planId: data.plan_id,
        planCode: data.plan_code as SubscriptionPlanCode,
        planName: data.plan_name,
        status: data.status,
        statusLabel: data.status === 'active' ? 'Ativo' : data.status === 'trialing' ? 'Período de Teste' : 'Cancelado',
        billingCycle: data.billing_interval as SubscriptionBillingCycle,
        monthlyPriceCents: data.monthly_price_cents,
        annualPriceCents: data.annual_price_cents,
        priceFormatted: `${formatCentsToBrl(currentPriceCents)}/${data.billing_interval === 'annual' ? 'ano' : 'mês'}`,
        nextRenewalFormatted: new Date(data.current_period_end).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        nextRenewalDate: data.current_period_end,
        cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
        pendingDowngradePlanId: data.pending_downgrade_plan_id,
        includedProducts: [
          {
            id: 'orcagraf',
            name: 'OrçaGraf',
            includedInPlan: includedProds.includes('orcagraf'),
            status: includedProds.includes('orcagraf') ? 'active' : 'inactive',
          },
          {
            id: 'arteflow',
            name: 'ArteFlow',
            includedInPlan: includedProds.includes('arteflow'),
            status: includedProds.includes('arteflow') ? 'active' : 'inactive',
          },
          {
            id: 'artecheck',
            name: 'ArteCheck',
            includedInPlan: includedProds.includes('artecheck'),
            status: includedProds.includes('artecheck') ? 'active' : 'inactive',
          },
        ],
        userSeats: {
          total: data.included_users,
          used: data.active_members_count,
          extra: data.extra_users,
          extraUserPriceCents: data.extra_user_price_cents,
        },
      };
    } catch {
      const fallback = OFFICIAL_PLANS_FALLBACK[4];
      return {
        planId: fallback.id,
        planCode: fallback.code,
        planName: fallback.name,
        status: 'active',
        statusLabel: 'Ativo',
        billingCycle: 'monthly',
        monthlyPriceCents: fallback.monthlyPriceCents,
        annualPriceCents: fallback.annualPriceCents,
        priceFormatted: formatCentsToBrl(fallback.monthlyPriceCents),
        nextRenewalFormatted: '15 set. 2026',
        nextRenewalDate: '2026-09-15T00:00:00Z',
        cancelAtPeriodEnd: false,
        includedProducts: [
          { id: 'orcagraf', name: 'OrçaGraf', includedInPlan: true, status: 'active' },
          { id: 'arteflow', name: 'ArteFlow', includedInPlan: true, status: 'active' },
          { id: 'artecheck', name: 'ArteCheck', includedInPlan: true, status: 'active' },
        ],
        userSeats: {
          total: 3,
          used: 2,
          extra: 0,
          extraUserPriceCents: 1290,
        },
      };
    }
  },
};
