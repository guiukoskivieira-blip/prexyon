-- =============================================================================
-- PREXYON PORTAL — MIGRATION: 002_prexyon_sso_codes.sql
-- Description: Tabela e Funções Criptográficas para SSO Seguro (Authorization Code)
-- Project: Prexyon Ecosystem Central Backend
-- =============================================================================

-- 1. Tabela de Códigos de Autorização SSO (Uso Único e Alta Entropia)
CREATE TABLE IF NOT EXISTS public.prexyon_sso_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_code TEXT NOT NULL REFERENCES public.prexyon_products(code) ON DELETE CASCADE,
    audience TEXT NOT NULL CHECK (audience IN ('orcagraf', 'arteflow', 'artecheck')),
    redirect_uri TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Índices de Alta Performance para Busca e Expiração
CREATE INDEX IF NOT EXISTS idx_prexyon_sso_hash ON public.prexyon_sso_codes(code_hash);
CREATE INDEX IF NOT EXISTS idx_prexyon_sso_user ON public.prexyon_sso_codes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prexyon_sso_expires ON public.prexyon_sso_codes(expires_at) WHERE used_at IS NULL;

-- 2. Habilitação de RLS Estrita (Sem SELECT público direto)
ALTER TABLE public.prexyon_sso_codes ENABLE ROW LEVEL SECURITY;

-- Nenhum SELECT público direto permitido para usuários comuns.
-- O acesso ocorre exclusivamente via funções SECURITY DEFINER.
CREATE POLICY "prexyon_sso_codes_deny_direct_select"
ON public.prexyon_sso_codes
FOR SELECT TO authenticated, anon
USING (false);

-- =============================================================================
-- 3. FUNÇÃO SERVER-SIDE: GERAÇÃO SEGURA DE AUTHORIZATION CODE
-- =============================================================================
CREATE OR REPLACE FUNCTION public.prexyon_generate_sso_code(
    p_organization_id UUID,
    p_product_code TEXT,
    p_code_hash TEXT,
    p_redirect_uri TEXT,
    p_ttl_seconds INT DEFAULT 45
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_is_member BOOLEAN;
    v_is_subscribed BOOLEAN;
    v_has_access BOOLEAN;
    v_user_role public.user_role;
    v_expires_at TIMESTAMPTZ;
    v_recent_codes_count INT;
BEGIN
    -- 1. Identificar usuário autenticado
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Operação negada: usuário não autenticado no Supabase.';
    END IF;

    -- 2. Validar se o produto existe
    IF NOT EXISTS (SELECT 1 FROM public.prexyon_products WHERE code = p_product_code AND status = 'active') THEN
        RAISE EXCEPTION 'Operação negada: produto "%" não encontrado ou inativo no ecossistema.', p_product_code;
    END IF;

    -- 3. Validar Membresia Ativa na Organização
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = p_organization_id
          AND user_id = v_user_id
          AND is_active = true
          AND is_locked = false
    ), role
    INTO v_is_member, v_user_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id AND user_id = v_user_id;

    IF NOT COALESCE(v_is_member, false) THEN
        RAISE EXCEPTION 'Operação negada: usuário não é membro ativo desta organização.';
    END IF;

    -- 4. Validar Assinatura do Produto pela Organização (product_subscriptions)
    SELECT EXISTS (
        SELECT 1 FROM public.product_subscriptions
        WHERE organization_id = p_organization_id
          AND product_code = p_product_code::public.subscription_product_code
          AND status IN ('active'::public.subscription_status, 'trial'::public.subscription_status)
    ) INTO v_is_subscribed;

    -- Se não houver registro formal em product_subscriptions, verificar se é OrçaGraf e org ativa
    IF NOT v_is_subscribed THEN
        IF p_product_code = 'orcagraf' THEN
            -- Se a org existe e está ativa, considera OrçaGraf disponível
            SELECT is_active INTO v_is_subscribed FROM public.organizations WHERE id = p_organization_id;
        END IF;
    END IF;

    IF NOT COALESCE(v_is_subscribed, false) THEN
        RAISE EXCEPTION 'Operação negada: a organização não possui assinatura ativa para o software "%".', p_product_code;
    END IF;

    -- 5. Validar Acesso do Usuário ao Produto (Owner tem bypass ou verificação em prexyon_user_product_access)
    IF v_user_role = 'owner'::public.user_role THEN
        v_has_access := true;
    ELSE
        SELECT COALESCE(enabled, false) INTO v_has_access
        FROM public.prexyon_user_product_access
        WHERE organization_id = p_organization_id
          AND user_id = v_user_id
          AND product_code = p_product_code;

        -- Fallback: Se for OrçaGraf e membro ativo sem bloqueio explícito
        IF v_has_access IS NULL AND p_product_code = 'orcagraf' THEN
            v_has_access := true;
        END IF;
    END IF;

    IF NOT COALESCE(v_has_access, false) THEN
        RAISE EXCEPTION 'Operação negada: usuário não possui acesso liberado ao software "%".', p_product_code;
    END IF;

    -- 6. Rate Limiting: Máximo de 10 códigos gerados nos últimos 60 segundos por usuário
    SELECT count(*) INTO v_recent_codes_count
    FROM public.prexyon_sso_codes
    WHERE user_id = v_user_id
      AND created_at > (timezone('utc', now()) - INTERVAL '60 seconds');

    IF v_recent_codes_count >= 10 THEN
        RAISE EXCEPTION 'Operação negada: limite de solicitações de SSO excedido. Aguarde alguns instantes.';
    END IF;

    -- 7. Calcular expiração (TTL de 30 a 60 segundos)
    v_expires_at := timezone('utc', now()) + (GREATEST(15, LEAST(p_ttl_seconds, 60)) || ' seconds')::INTERVAL;

    -- 8. Inserir hash seguro
    INSERT INTO public.prexyon_sso_codes (
        code_hash,
        user_id,
        organization_id,
        product_code,
        audience,
        redirect_uri,
        expires_at
    ) VALUES (
        p_code_hash,
        v_user_id,
        p_organization_id,
        p_product_code,
        p_product_code,
        p_redirect_uri,
        v_expires_at
    );

    RETURN jsonb_build_object(
        'success', true,
        'product_code', p_product_code,
        'expires_at', v_expires_at
    );
END;
$$;

-- =============================================================================
-- 4. FUNÇÃO SERVER-SIDE: TROCA ATÔMICA (EXCHANGE) COM PROTEÇÃO CONTRA REPLAY
-- =============================================================================
CREATE OR REPLACE FUNCTION public.prexyon_exchange_sso_code(
    p_code_hash TEXT,
    p_audience TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record RECORD;
    v_user_email TEXT;
    v_user_name TEXT;
BEGIN
    -- 1. Consumo Atômico com verificação de não utilizado, não expirado e audience correta
    UPDATE public.prexyon_sso_codes
    SET used_at = timezone('utc', now())
    WHERE code_hash = p_code_hash
      AND used_at IS NULL
      AND expires_at > timezone('utc', now())
      AND audience = p_audience
    RETURNING id, user_id, organization_id, product_code, redirect_uri, created_at, expires_at
    INTO v_record;

    IF v_record.id IS NULL THEN
        -- Verificar motivo da falha para auditoria
        IF EXISTS (SELECT 1 FROM public.prexyon_sso_codes WHERE code_hash = p_code_hash AND used_at IS NOT NULL) THEN
            RAISE EXCEPTION 'REPLAY_BLOCKED: este código de autorização já foi utilizado.';
        ELSIF EXISTS (SELECT 1 FROM public.prexyon_sso_codes WHERE code_hash = p_code_hash AND expires_at <= timezone('utc', now())) THEN
            RAISE EXCEPTION 'CODE_EXPIRED: este código de autorização expirou.';
        ELSIF EXISTS (SELECT 1 FROM public.prexyon_sso_codes WHERE code_hash = p_code_hash AND audience <> p_audience) THEN
            RAISE EXCEPTION 'INVALID_AUDIENCE: audience do código é inválida para este produto.';
        ELSE
            RAISE EXCEPTION 'INVALID_CODE: código de autorização não encontrado ou inválido.';
        END IF;
    END IF;

    -- 2. Buscar metadados do usuário para transferência de contexto
    SELECT email, full_name INTO v_user_email, v_user_name
    FROM public.profiles
    WHERE id = v_record.user_id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_record.user_id,
        'email', v_user_email,
        'full_name', v_user_name,
        'organization_id', v_record.organization_id,
        'product_code', v_record.product_code,
        'redirect_uri', v_record.redirect_uri,
        'authenticated_at', timezone('utc', now())
    );
END;
$$;
