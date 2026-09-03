-- ==============================================================================
-- PREXYON — HOTFIX CENTRAL SSO V2: EXCHANGE ATÔMICO & HARDENING RPC
-- 1. Hardening de prexyon_exchange_sso_code com SECURITY DEFINER e search_path vazio
-- 2. Restrição estrita de EXECUTE para service_role e postgres (Zero browser direto)
-- 3. Função compensatória prexyon_rollback_sso_code para falhas de emissão server-side
-- ==============================================================================

-- 1. RPC de Troca Atômica de Código SSO (Consumo One-Time com Isolamento de Identidade)
CREATE OR REPLACE FUNCTION public.prexyon_exchange_sso_code(
    p_code_hash text,
    p_audience text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_record RECORD;
    v_user_email text;
    v_user_name text;
    v_target_hash text;
BEGIN
    -- Validação de entrada
    IF p_code_hash IS NULL OR pg_catalog.length(pg_catalog.btrim(p_code_hash)) = 0 THEN
        RAISE EXCEPTION 'INVALID_CODE: Código de autorização não fornecido' USING ERRCODE = '42501';
    END IF;

    IF p_audience IS NULL OR p_audience NOT IN ('orcagraf', 'arteflow', 'artecheck') THEN
        RAISE EXCEPTION 'INVALID_AUDIENCE: Audience inválida' USING ERRCODE = '42501';
    END IF;

    v_target_hash := pg_catalog.btrim(p_code_hash);

    -- 1. Consumo Atômico: verifica não utilizado, não expirado e audience correta
    UPDATE public.prexyon_sso_codes
    SET used_at = pg_catalog.timezone('utc', pg_catalog.now())
    WHERE (code_hash = v_target_hash OR code_hash = pg_catalog.encode(extensions.digest(v_target_hash::bytea, 'sha256'), 'hex'))
      AND used_at IS NULL
      AND expires_at > pg_catalog.timezone('utc', pg_catalog.now())
      AND audience = p_audience
    RETURNING id, user_id, organization_id, product_code, redirect_uri, created_at, expires_at
    INTO v_record;

    IF v_record.id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.prexyon_sso_codes 
            WHERE (code_hash = v_target_hash OR code_hash = pg_catalog.encode(extensions.digest(v_target_hash::bytea, 'sha256'), 'hex')) 
              AND used_at IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'REPLAY_BLOCKED: este código de autorização já foi utilizado' USING ERRCODE = 'P0003';
        ELSIF EXISTS (
            SELECT 1 FROM public.prexyon_sso_codes 
            WHERE (code_hash = v_target_hash OR code_hash = pg_catalog.encode(extensions.digest(v_target_hash::bytea, 'sha256'), 'hex')) 
              AND expires_at <= pg_catalog.timezone('utc', pg_catalog.now())
        ) THEN
            RAISE EXCEPTION 'CODE_EXPIRED: este código de autorização expirou' USING ERRCODE = 'P0004';
        ELSIF EXISTS (
            SELECT 1 FROM public.prexyon_sso_codes 
            WHERE (code_hash = v_target_hash OR code_hash = pg_catalog.encode(extensions.digest(v_target_hash::bytea, 'sha256'), 'hex')) 
              AND audience <> p_audience
        ) THEN
            RAISE EXCEPTION 'INVALID_AUDIENCE: audience do código é inválida para este produto' USING ERRCODE = '42501';
        ELSE
            RAISE EXCEPTION 'INVALID_CODE: código de autorização não encontrado ou inválido' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- 2. Buscar e-mail autoritativo em auth.users
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = v_record.user_id;

    IF v_user_email IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: Usuário vinculado ao código SSO não existe em auth.users' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Buscar Nome no perfil
    SELECT full_name INTO v_user_name
    FROM public.profiles
    WHERE id = v_record.user_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'user_id', v_record.user_id,
        'email', v_user_email,
        'full_name', COALESCE(v_user_name, 'Usuário Prexyon'),
        'organization_id', v_record.organization_id,
        'product_code', v_record.product_code,
        'redirect_uri', v_record.redirect_uri,
        'authenticated_at', pg_catalog.timezone('utc', pg_catalog.now())
    );
END;
$$;

-- Permissões: Somente backend / service_role e postgres (Zero acesso direto de frontend anon/authenticated)
REVOKE ALL ON FUNCTION public.prexyon_exchange_sso_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prexyon_exchange_sso_code(text, text) TO service_role, postgres;


-- 2. RPC Compensatória para Falha de Emissão Auth (Reset atômico seguro apenas se dentro da validade)
CREATE OR REPLACE FUNCTION public.prexyon_rollback_sso_code(
    p_code_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_target_hash text;
BEGIN
    IF p_code_hash IS NULL OR pg_catalog.length(pg_catalog.btrim(p_code_hash)) = 0 THEN
        RETURN false;
    END IF;

    v_target_hash := pg_catalog.btrim(p_code_hash);

    UPDATE public.prexyon_sso_codes
    SET used_at = NULL
    WHERE (code_hash = v_target_hash OR code_hash = pg_catalog.encode(extensions.digest(v_target_hash::bytea, 'sha256'), 'hex'))
      AND expires_at > pg_catalog.timezone('utc', pg_catalog.now());

    RETURN FOUND;
END;
$$;

-- Permissões: Somente service_role e postgres
REVOKE ALL ON FUNCTION public.prexyon_rollback_sso_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prexyon_rollback_sso_code(text) TO service_role, postgres;
