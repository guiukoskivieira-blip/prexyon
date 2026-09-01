import { SubscriptionDetails } from '../types/subscription';

export const mockSubscription: SubscriptionDetails = {
  planId: 'plan_complete',
  planCode: 'prexyon_complete',
  planName: 'Prexyon Completo',
  status: 'active',
  statusLabel: 'Ativo',
  billingCycle: 'monthly',
  monthlyPriceCents: 15990,
  annualPriceCents: 159900,
  priceFormatted: 'R$ 159,90/mês',
  nextRenewalFormatted: '15 set. 2026',
  nextRenewalDate: '2026-09-15T00:00:00Z',
  cancelAtPeriodEnd: false,
  includedProducts: [
    {
      id: 'orcagraf',
      name: 'OrçaGraf',
      includedInPlan: true,
      status: 'active',
    },
    {
      id: 'arteflow',
      name: 'ArteFlow',
      includedInPlan: true,
      status: 'active',
    },
    {
      id: 'artecheck',
      name: 'ArteCheck',
      includedInPlan: true,
      status: 'active',
    },
  ],
  userSeats: {
    total: 3,
    used: 2,
    extra: 0,
    extraUserPriceCents: 1290,
  },
};
