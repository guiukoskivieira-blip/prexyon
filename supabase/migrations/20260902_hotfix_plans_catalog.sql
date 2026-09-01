-- =============================================================================
-- PREXYON PORTAL — HOTFIX: OFFICIAL PLANS CATALOG & ENTITLEMENTS CLEANUP
-- Migration: 20260902_hotfix_plans_catalog.sql
-- Description: Garante os 5 planos oficiais do catálogo comercial Prexyon,
--              limpa planos residuais de teste e padroniza prexyon_plan_products.
-- =============================================================================

-- 1. Remover assinaturas e planos residuais de testes
DO $$
DECLARE
    v_test_plan_id UUID;
BEGIN
    FOR v_test_plan_id IN 
        SELECT id FROM public.prexyon_plans 
        WHERE code LIKE 'plano-duo-%' 
           OR code LIKE 'test-plan-%' 
           OR name ILIKE '%teste%' 
           OR name ILIKE '%duo%'
    LOOP
        -- Remover assinaturas de teste vinculadas
        DELETE FROM public.prexyon_subscriptions WHERE plan_id = v_test_plan_id;
        -- Remover produtos vinculados
        DELETE FROM public.prexyon_plan_products WHERE plan_id = v_test_plan_id;
        -- Remover o plano de teste
        DELETE FROM public.prexyon_plans WHERE id = v_test_plan_id;
    END LOOP;
END $$;

-- 2. Garantir os 5 Planos Comerciais Oficiais
INSERT INTO public.prexyon_plans (
    code,
    name,
    description,
    billing_interval_default,
    monthly_price_cents,
    annual_price_cents,
    included_users,
    extra_user_price_cents,
    is_active,
    is_featured,
    display_order
) VALUES 
(
    'orcagraf',
    'OrçaGraf',
    'Orçamentos, formação de preços e gestão comercial para gráficas e comunicação visual.',
    'monthly',
    5990,   -- R$ 59,90/mês
    59900,  -- R$ 599,00/ano
    3,
    1290,   -- R$ 12,90/mês por usuário adicional
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
    1290,   -- R$ 12,90/mês por usuário adicional
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
    1290,   -- R$ 12,90/mês por usuário adicional
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
    1290,   -- R$ 12,90/mês por usuário adicional
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
    1290,   -- R$ 12,90/mês por usuário adicional
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
    is_active = true,
    is_featured = EXCLUDED.is_featured,
    display_order = EXCLUDED.display_order;

-- 3. Garantir Mapeamento Estrito e Exclusivo de Produtos por Plano
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

    -- Limpar produtos atuais dos 5 planos para reassociar rigorosamente
    DELETE FROM public.prexyon_plan_products WHERE plan_id IN (
        v_orcagraf_id, v_arteflow_id, v_artecheck_id, v_combo_id, v_complete_id
    );

    -- Plano 1: OrçaGraf -> EXCLUSIVAMENTE 'orcagraf'
    INSERT INTO public.prexyon_plan_products (plan_id, product_code) VALUES (v_orcagraf_id, 'orcagraf');

    -- Plano 2: ArteFlow -> EXCLUSIVAMENTE 'arteflow'
    INSERT INTO public.prexyon_plan_products (plan_id, product_code) VALUES (v_arteflow_id, 'arteflow');

    -- Plano 3: ArteCheck -> EXCLUSIVAMENTE 'artecheck'
    INSERT INTO public.prexyon_plan_products (plan_id, product_code) VALUES (v_artecheck_id, 'artecheck');

    -- Plano 4: OrçaGraf + ArteFlow -> EXATAMENTE 'orcagraf' e 'arteflow'
    INSERT INTO public.prexyon_plan_products (plan_id, product_code) VALUES 
        (v_combo_id, 'orcagraf'),
        (v_combo_id, 'arteflow');

    -- Plano 5: Prexyon Completo -> EXATAMENTE 'orcagraf', 'arteflow' e 'artecheck'
    INSERT INTO public.prexyon_plan_products (plan_id, product_code) VALUES 
        (v_complete_id, 'orcagraf'),
        (v_complete_id, 'arteflow'),
        (v_complete_id, 'artecheck');
END $$;
