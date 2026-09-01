import { ProductId } from './product';

export type SubscriptionPlanCode =
  | 'orcagraf'
  | 'arteflow'
  | 'artecheck'
  | 'orcagraf_arteflow'
  | 'prexyon_complete';

export type SubscriptionBillingCycle = 'monthly' | 'annual';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'suspended'
  | 'inactive';

export interface PrexyonPlan {
  id: string;
  code: SubscriptionPlanCode;
  name: string;
  description: string;
  billingIntervalDefault: SubscriptionBillingCycle;
  monthlyPriceCents: number;
  annualPriceCents: number;
  includedUsers: number;
  extraUserPriceCents: number;
  isActive: boolean;
  isFeatured: boolean;
  displayOrder: number;
  includedProductCodes: ProductId[];
}

export interface SubscriptionIncludedProduct {
  id: ProductId;
  name: string;
  includedInPlan: boolean;
  status: 'active' | 'trial' | 'coming_soon' | 'inactive';
}

export interface SubscriptionDetails {
  planId: string;
  planCode: SubscriptionPlanCode;
  planName: string;
  status: SubscriptionStatus;
  statusLabel: string;
  billingCycle: SubscriptionBillingCycle;
  monthlyPriceCents: number;
  annualPriceCents: number;
  priceFormatted: string;
  nextRenewalFormatted: string;
  nextRenewalDate: string;
  cancelAtPeriodEnd: boolean;
  pendingDowngradePlanId?: string;
  includedProducts: SubscriptionIncludedProduct[];
  userSeats: {
    total: number;
    used: number;
    extra: number;
    extraUserPriceCents: number;
  };
}
