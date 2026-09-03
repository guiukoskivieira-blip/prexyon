-- ==============================================================================
-- PREXYON — HOTFIX DE SEPARAÇÃO ARQUITETURAL: SSO (AUTENTICAÇÃO) x ENTITLEMENT (AUTORIZAÇÃO)
-- 1. Emissor SSO central: Valida autenticação (auth.uid()), status da organização,
--    membership do usuário, integridade anti-bloqueio, audience válida do catálogo
-- 2. Remoção da checagem de subscription/entitlement comercial do emissor de código
-- 3. Validação de entitlement, product_access e permissions transferida para o
--    bootstrap do produto consumidor
-- ==============================================================================

-- 1. RPC Canônica para Emissão de Código SSO
CREATE OR REPLACE FUNCTION public.prexyon_generate_sso_code(
  p_organization_id uuid,
  p_product_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_code text;
  v_expires_at timestamptz;
  v_org_status boolean;
  v_member_active boolean;
  v_member_locked boolean;
  v_user_role text;
BEGIN
  -- 1. Identificar usuário autenticado obrigatório (Zero Impersonação)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- 2. Validar que o product_code pertence ao catálogo oficial suportado
  IF p_product_code IS NULL OR p_product_code NOT IN ('orcagraf', 'arteflow', 'artecheck') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_CODE: Produto inválido ou não suportado: %', p_product_code USING ERRCODE = '42501';
  END IF;

  -- 3. Validar status da Organização
  SELECT is_active INTO v_org_status
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_status IS NULL OR v_org_status = false THEN
    RAISE EXCEPTION 'ORGANIZATION_INACTIVE: Organization is suspended or inactive' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Validar Membership Ativo do próprio auth.uid() na Organização
  SELECT is_active, is_locked, role INTO v_member_active, v_member_locked, v_user_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_user_id;

  IF v_member_active IS NULL OR v_member_active = false OR v_member_locked = true THEN
    RAISE EXCEPTION 'MEMBERSHIP_INACTIVE: User is not active or is locked in organization' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Gerar Código Seguro (UUIDv4) com TTL estrito de 60 segundos
  v_code := gen_random_uuid()::text;
  v_expires_at := now() + interval '60 seconds';

  -- 6. Persistir Código
  INSERT INTO public.prexyon_sso_codes (
    code_hash,
    organization_id,
    user_id,
    product_code,
    audience,
    redirect_uri,
    expires_at,
    created_at
  ) VALUES (
    v_code,
    p_organization_id,
    v_user_id,
    p_product_code,
    p_product_code,
    '/' || p_product_code,
    v_expires_at,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'code', v_code,
    'product_code', p_product_code,
    'expires_at', v_expires_at
  );
END;
$$;

-- Permissões da RPC Canônica: Authenticated e Service Role
REVOKE ALL ON FUNCTION public.prexyon_generate_sso_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prexyon_generate_sso_code(uuid, text) TO authenticated, service_role;

-- Sobrecarga legada que recebe p_user_id:
-- Bloquear terminantemente de PUBLIC, anon e authenticated (Apenas backend confiável / service_role)
REVOKE ALL ON FUNCTION public.prexyon_generate_sso_code(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prexyon_generate_sso_code(uuid, uuid, text) TO service_role, postgres;
