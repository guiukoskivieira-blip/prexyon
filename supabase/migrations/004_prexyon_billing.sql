-- =============================================================================
-- PREXYON PORTAL — MIGRATION: 004_prexyon_billing.sql
-- Description: Tabelas de Cobrança, Clientes de Gateway, Transações e Webhooks
-- Project: Prexyon Ecosystem Central Backend
-- =============================================================================

-- 1. TABELA DE CLIENTES DE COBRANÇA (Gateway Customer)
CREATE TABLE IF NOT EXISTS public.prexyon_billing_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'mercadopago',
    provider_customer_id TEXT NOT NULL,
    billing_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. TABELA DE ASSINATURAS NO GATEWAY
CREATE TABLE IF NOT EXISTS public.prexyon_payment_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.prexyon_subscriptions(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'mercadopago',
    provider_subscription_id TEXT UNIQUE NOT NULL,
    provider_plan_reference TEXT,
    status TEXT NOT NULL, -- authorized, paused, cancelled, pending
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    next_payment_at TIMESTAMPTZ,
    last_payment_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 3. TABELA DE TRANSAÇÕES E PAGAMENTOS
CREATE TABLE IF NOT EXISTS public.prexyon_payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.prexyon_subscriptions(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'mercadopago',
    provider_payment_id TEXT UNIQUE NOT NULL,
    provider_event_id TEXT,
    status TEXT NOT NULL, -- approved, pending, in_process, rejected, refunded, cancelled
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
    payment_method_type TEXT, -- credit_card, ticket, bank_transfer, pix
    paid_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. TABELA DE LOG DE WEBHOOKS COM IDEMPOTÊNCIA
CREATE TABLE IF NOT EXISTS public.prexyon_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'mercadopago',
    provider_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    processed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
    processing_error TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE(provider, provider_event_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_prexyon_billing_cust_org ON public.prexyon_billing_customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_pay_sub_org ON public.prexyon_payment_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_pay_sub_prov_id ON public.prexyon_payment_subscriptions(provider_subscription_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_pay_tx_org ON public.prexyon_payment_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_pay_tx_prov_id ON public.prexyon_payment_transactions(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_webhooks_prov_ev ON public.prexyon_webhook_events(provider, provider_event_id);

-- =============================================================================
-- 5. RLS (ROW LEVEL SECURITY)
-- =============================================================================
ALTER TABLE public.prexyon_billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_payment_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_webhook_events ENABLE ROW LEVEL SECURITY;

-- Billing customers: visualizável por membros, editável por admin/owner
CREATE POLICY "prexyon_billing_cust_select"
ON public.prexyon_billing_customers FOR SELECT TO authenticated
USING (public.prexyon_is_org_member(organization_id, auth.uid()));

CREATE POLICY "prexyon_billing_cust_admin"
ON public.prexyon_billing_customers FOR ALL TO authenticated
USING (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()));

-- Payment subscriptions: visualizável por membros
CREATE POLICY "prexyon_pay_sub_select"
ON public.prexyon_payment_subscriptions FOR SELECT TO authenticated
USING (public.prexyon_is_org_member(organization_id, auth.uid()));

CREATE POLICY "prexyon_pay_sub_admin"
ON public.prexyon_payment_subscriptions FOR ALL TO authenticated
USING (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()));

-- Payment transactions: visualizável por membros
CREATE POLICY "prexyon_pay_tx_select"
ON public.prexyon_payment_transactions FOR SELECT TO authenticated
USING (public.prexyon_is_org_member(organization_id, auth.uid()));

CREATE POLICY "prexyon_pay_tx_admin"
ON public.prexyon_payment_transactions FOR ALL TO authenticated
USING (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()));

-- Webhook events: Restrito a administradores do sistema / service_role
CREATE POLICY "prexyon_webhook_admin_only"
ON public.prexyon_webhook_events FOR ALL TO authenticated
USING (false); -- Apenas service_role
