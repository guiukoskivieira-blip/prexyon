-- =============================================================================
-- PREXYON PORTAL — MIGRATION: 003_prexyon_plans_and_entitlements.sql
-- Description: Catálogo Central de Planos, Assinaturas, Entitlements e Eventos
-- Project: Prexyon Ecosystem Central Backend
-- =============================================================================

-- 1. TABELA DE CATÁLOGO DE PLANOS (Valores em Centavos)
CREATE TABLE IF NOT EXISTS public.prexyon_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    billing_interval_default TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_interval_default IN ('monthly', 'annual')),
    monthly_price_cents INTEGER NOT NULL,
    annual_price_cents INTEGER NOT NULL,
    included_users INTEGER NOT NULL DEFAULT 3,
    extra_user_price_cents INTEGER NOT NULL DEFAULT 1290,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. RELACIONAMENTO PLANO x SOFTWARES INCLUÍDOS
CREATE TABLE IF NOT EXISTS public.prexyon_plan_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.prexyon_plans(id) ON DELETE CASCADE,
    product_code TEXT NOT NULL REFERENCES public.prexyon_products(code) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE(plan_id, product_code)
);

-- 3. TABELA CENTRAL DE ASSINATURAS POR ORGANIZAÇÃO
CREATE TABLE IF NOT EXISTS public.prexyon_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.prexyon_plans(id),
    status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired', 'suspended')),
    billing_interval TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'annual')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + INTERVAL '30 days'),
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    pending_downgrade_plan_id UUID REFERENCES public.prexyon_plans(id),
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. HISTÓRICO APPEND-ONLY DE EVENTOS DE ASSINATURA
CREATE TABLE IF NOT EXISTS public.prexyon_subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.prexyon_subscriptions(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    old_plan_id UUID REFERENCES public.prexyon_plans(id),
    new_plan_id UUID REFERENCES public.prexyon_plans(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_prexyon_plans_order ON public.prexyon_plans(display_order);
CREATE INDEX IF NOT EXISTS idx_prexyon_plan_prods ON public.prexyon_plan_products(plan_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_subs_org ON public.prexyon_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_sub_events_org ON public.prexyon_subscription_events(organization_id, created_at DESC);

-- =============================================================================
-- 5. RLS (ROW LEVEL SECURITY)
-- =============================================================================
ALTER TABLE public.prexyon_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_plan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_subscription_events ENABLE ROW LEVEL SECURITY;

-- Planos e Produtos são públicos para leitura por usuários autenticados
CREATE POLICY "prexyon_plans_select_auth"
ON public.prexyon_plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "prexyon_plan_products_select_auth"
ON public.prexyon_plan_products FOR SELECT TO authenticated USING (true);

-- Assinatura visível para membros da organização
CREATE POLICY "prexyon_subscriptions_select_member"
ON public.prexyon_subscriptions FOR SELECT TO authenticated
USING (public.prexyon_is_org_member(organization_id, auth.uid()));

-- Assinatura editável apenas por Admins/Owners ou service_role
CREATE POLICY "prexyon_subscriptions_write_admin"
ON public.prexyon_subscriptions FOR ALL TO authenticated
USING (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()));

-- Eventos visíveis para membros da organização
CREATE POLICY "prexyon_sub_events_select_member"
ON public.prexyon_subscription_events FOR SELECT TO authenticated
USING (public.prexyon_is_org_member(organization_id, auth.uid()));

-- =============================================================================
-- 6. SEED DOS 5 PLANOS OFICIAIS (Valores em Centavos)
-- =============================================================================
INSERT INTO public.prexyon_plans (
    code, name, description, billing_interval_default,
    monthly_price_cents, annual_price_cents, included_users, extra_user_price_cents,
    is_active, is_featured, display_order
) VALUES
(
    'orcagraf',
    'OrçaGraf',
    'Orçamentos, formação de preços e gestão comercial para gráficas e comunicação visual.',
    'monthly',
    5990,   -- R$ 59,90/mês
    59900,  -- R$ 599,00/ano (~16% desconto / 10 meses)
    3,
    1290,   -- R$ 12,90/usuário adicional
    true,
    false,
    1
),
(
    'arteflow',
    'ArteFlow',
    'Gestão de produção gráfica, PCP, pedidos, fluxo de trabalho e financeiro operacional.',
    'monthly',
    7990,   -- R$ 79,90/mês
    79900,  -- R$ 799,00/ano
    3,
    1290,
    true,
    false,
    2
),
(
    'artecheck',
    'ArteCheck',
    'Análise técnica automatizada de arquivos gráficos, pré-impressão e verificação de gabaritos.',
    'monthly',
    6990,   -- R$ 69,90/mês
    69900,  -- R$ 699,00/ano
    3,
    1290,
    true,
    false,
    3
),
(
    'orcagraf_arteflow',
    'OrçaGraf + ArteFlow',
    'Pacote integrado de vendas e produção: da proposta comercial ao chão de fábrica.',
    'monthly',
    11990,  -- R$ 119,90/mês
    119900, -- R$ 1.199,00/ano
    3,
    1290,
    true,
    false,
    4
),
(
    'prexyon_complete',
    'Prexyon Completo',
    'Ecossistema integrado com todas as ferramentas: OrçaGraf, ArteFlow e ArteCheck.',
    'monthly',
    15990,  -- R$ 159,90/mês
    159900, -- R$ 1.599,00/ano (~16% desconto)
    3,
    1290,
    true,
    true,   -- Destaque Melhor Custo-Benefício
    5
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    monthly_price_cents = EXCLUDED.monthly_price_cents,
    annual_price_cents = EXCLUDED.annual_price_cents,
    included_users = EXCLUDED.included_users,
    extra_user_price_cents = EXCLUDED.extra_user_price_cents,
    is_featured = EXCLUDED.is_featured,
    display_order = EXCLUDED.display_order;

-- Mapeamento Plano x Produtos
DO $$
DECLARE
    v_orcagraf_id UUID;
    v_arteflow_id UUID;
    v_artecheck_id UUID;
    v_combo_id UUID;
    v_complete_id UUID;
BEGIN
    SELECT id INTO v_orcagraf_id FROM public.prexyon_plans WHERE code = 'orcagraf';
    SELECT id INTO v_arteflow_id FROM public.prexyon_plans WHERE code = 'arteflow';
    SELECT id INTO v_artecheck_id FROM public.prexyon_plans WHERE code = 'artecheck';
    SELECT id INTO v_combo_id FROM public.prexyon_plans WHERE code = 'orcagraf_arteflow';
    SELECT id INTO v_complete_id FROM public.prexyon_plans WHERE code = 'prexyon_complete';

    -- Plano 1: OrçaGraf
    INSERT INTO public.prexyon_plan_products (plan_id, product_code) VALUES (v_orcagraf_id, 'orcagraf') ON CONFLICT DO NOTHING;

    -- Plano 2: ArteFlow
    INSERT INTO public.prexyon_plan_products (plan_id, product_code) VALUES (v_arteflow_id, 'arteflow') ON CONFLICT DO NOTHING;

    -- Plano 3: ArteCheck
    INSERT INTO public.prexyon_plan_products (plan_id, product_code) VALUES (v_artecheck_id, 'artecheck') ON CONFLICT DO NOTHING;

    -- Plano 4: OrçaGraf + ArteFlow
    INSERT INTO public.prexyon_plan_products (plan_id, product_code) VALUES 
        (v_combo_id, 'orcagraf'),
        (v_combo_id, 'arteflow')
    ON CONFLICT DO NOTHING;

    -- Plano 5: Prexyon Completo
    INSERT INTO public.prexyon_plan_products (plan_id, product_code) VALUES 
        (v_complete_id, 'orcagraf'),
        (v_complete_id, 'arteflow'),
        (v_complete_id, 'artecheck')
    ON CONFLICT DO NOTHING;
END $$;

-- =============================================================================
-- 7. TRIGGER DE SINCRONIZAÇÃO COMPATÍVEL COM product_subscriptions (OrçaGraf)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.prexyon_sync_subscription_projections()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prod RECORD;
    v_is_active BOOLEAN;
BEGIN
    -- Determina se a assinatura é considerada ativa para entitlements
    v_is_active := (NEW.status IN ('active', 'trialing') OR (NEW.status = 'canceled' AND NEW.current_period_end > timezone('utc', now())));

    -- Sincroniza cada produto do plano em public.product_subscriptions
    FOR v_prod IN 
        SELECT product_code FROM public.prexyon_plan_products WHERE plan_id = NEW.plan_id
    LOOP
        INSERT INTO public.product_subscriptions (
            organization_id,
            product_code,
            status,
            current_period_end,
            updated_at
        ) VALUES (
            NEW.organization_id,
            v_prod.product_code::public.subscription_product_code,
            CASE WHEN v_is_active THEN 'active'::public.subscription_status ELSE 'canceled'::public.subscription_status END,
            NEW.current_period_end,
            timezone('utc', now())
        )
        ON CONFLICT (organization_id, product_code) DO UPDATE SET
            status = EXCLUDED.status,
            current_period_end = EXCLUDED.current_period_end,
            updated_at = timezone('utc', now());
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prexyon_sync_sub_projections ON public.prexyon_subscriptions;
CREATE TRIGGER trg_prexyon_sync_sub_projections
AFTER INSERT OR UPDATE ON public.prexyon_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.prexyon_sync_subscription_projections();

-- =============================================================================
-- 8. RPC CENTRAL: prexyon_get_organization_entitlements
-- =============================================================================
CREATE OR REPLACE FUNCTION public.prexyon_get_organization_entitlements(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
    v_products JSONB;
    v_active_members_count INT;
    v_is_entitled BOOLEAN;
    v_extra_users INT;
BEGIN
    -- 1. Buscar assinatura da organização
    SELECT * INTO v_sub
    FROM public.prexyon_subscriptions
    WHERE organization_id = p_org_id;

    -- Se não houver registro formal, verifica se existe OrçaGraf legado
    IF v_sub.id IS NULL THEN
        RETURN jsonb_build_object(
            'has_subscription', false,
            'status', 'none',
            'plan_code', 'none',
            'plan_name', 'Nenhum plano contratado',
            'included_products', '[]'::jsonb,
            'active_members_count', 0,
            'included_users', 0,
            'extra_users', 0
        );
    END IF;

    -- 2. Buscar detalhes do plano
    SELECT * INTO v_plan FROM public.prexyon_plans WHERE id = v_sub.plan_id;

    -- 3. Buscar produtos incluídos
    SELECT COALESCE(jsonb_agg(product_code), '[]'::jsonb) INTO v_products
    FROM public.prexyon_plan_products
    WHERE plan_id = v_sub.plan_id;

    -- 4. Contar membros ativos na organização
    SELECT count(*) INTO v_active_members_count
    FROM public.organization_members
    WHERE organization_id = p_org_id AND is_active = true;

    -- 5. Calcular se entitlement está ativo (inclusive durante cancelamento até current_period_end)
    v_is_entitled := (v_sub.status IN ('active', 'trialing') OR (v_sub.status = 'canceled' AND v_sub.current_period_end > timezone('utc', now())));

    -- 6. Calcular usuários extras
    v_extra_users := GREATEST(0, v_active_members_count - v_plan.included_users);

    RETURN jsonb_build_object(
        'has_subscription', true,
        'subscription_id', v_sub.id,
        'status', v_sub.status,
        'is_entitled', v_is_entitled,
        'billing_interval', v_sub.billing_interval,
        'plan_id', v_plan.id,
        'plan_code', v_plan.code,
        'plan_name', v_plan.name,
        'monthly_price_cents', v_plan.monthly_price_cents,
        'annual_price_cents', v_plan.annual_price_cents,
        'current_period_start', v_sub.current_period_start,
        'current_period_end', v_sub.current_period_end,
        'cancel_at_period_end', v_sub.cancel_at_period_end,
        'pending_downgrade_plan_id', v_sub.pending_downgrade_plan_id,
        'included_products', v_products,
        'active_members_count', v_active_members_count,
        'included_users', v_plan.included_users,
        'extra_users', v_extra_users,
        'extra_user_price_cents', v_plan.extra_user_price_cents
    );
END;
$$;
