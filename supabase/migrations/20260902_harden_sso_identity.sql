-- ==============================================================================
-- PREXYON: HARDENING DE IDENTIDADE SSO E BLOQUEIO DE IMPERSONAÇÃO
-- 1. Nova RPC canônica prexyon_generate_sso_code(p_organization_id uuid, p_product_code text)
--    utilizada pelo browser, derivando obrigatoriamente user_id de auth.uid()
-- 2. Revogação de acesso de anon/authenticated/PUBLIC da sobrecarga legada com p_user_id
-- ==============================================================================

-- 1. RPC Canônica para Navegador (Deriva identidade de auth.uid())
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
  v_entitlements jsonb;
  v_user_has_product_access boolean;
  v_has_permission boolean;
BEGIN
  -- 1. Identificar usuário autenticado obrigatório (Zero Impersonação)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- 2. Validar status da Organização
  SELECT is_active INTO v_org_status
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_status IS NULL OR v_org_status = false THEN
    RAISE EXCEPTION 'ORGANIZATION_INACTIVE: Organization is suspended or inactive' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validar Membership Ativo do próprio auth.uid() na Organização
  SELECT is_active, is_locked, role INTO v_member_active, v_member_locked, v_user_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_user_id;

  IF v_member_active IS NULL OR v_member_active = false OR v_member_locked = true THEN
    RAISE EXCEPTION 'MEMBERSHIP_INACTIVE: User is not active or is locked in organization' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Validar Entitlement Efetivo da Organização para o Produto (Comercial OU Homologação)
  v_entitlements := public.prexyon_get_organization_entitlements(p_organization_id);

  IF (v_entitlements->>'is_entitled')::boolean = false OR NOT ((v_entitlements->'effective_products') @> to_jsonb(p_product_code)) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_SUBSCRIBED: Organization does not have active entitlement for product: %', p_product_code USING ERRCODE = 'P0001';
  END IF;

  -- 5. Validar Acesso Explícito do Usuário ao Produto
  SELECT is_enabled INTO v_user_has_product_access
  FROM public.organization_member_product_access
  WHERE organization_id = p_organization_id AND user_id = v_user_id AND product_key = p_product_code;

  IF v_user_has_product_access IS NULL THEN
    IF v_user_role = 'owner' THEN
      v_user_has_product_access := true;
    ELSE
      v_user_has_product_access := false;
    END IF;
  END IF;

  IF v_user_has_product_access = false THEN
    RAISE EXCEPTION 'USER_PRODUCT_ACCESS_DENIED: User does not have granted access to product: %', p_product_code USING ERRCODE = 'P0001';
  END IF;

  -- 6. Validação de Permissões Granulares (Se houver permissões cadastradas, exige ao menos uma concedida)
  IF v_user_role NOT IN ('owner', 'admin') THEN
    IF EXISTS (
      SELECT 1 FROM public.product_permissions
      WHERE organization_id = p_organization_id
        AND user_id = v_user_id
        AND product_key = p_product_code
    ) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.product_permissions
        WHERE organization_id = p_organization_id
          AND user_id = v_user_id
          AND product_key = p_product_code
          AND is_granted = true
      ) INTO v_has_permission;

      IF NOT v_has_permission THEN
        RAISE EXCEPTION 'USER_PRODUCT_PERMISSION_DENIED: User has no permissions granted for product: %', p_product_code USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- 7. Gerar Código Seguro (UUIDv4) com TTL estrito de 60 segundos
  v_code := gen_random_uuid()::text;
  v_expires_at := now() + interval '60 seconds';

  -- 8. Persistir Código
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

-- 2. Sobrecarga legada que recebe p_user_id:
-- Bloquear terminantemente de PUBLIC, anon e authenticated (Apenas backend confiável / service_role)
REVOKE ALL ON FUNCTION public.prexyon_generate_sso_code(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prexyon_generate_sso_code(uuid, uuid, text) TO service_role, postgres;

-- 3. Sobrecarga legada com code_hash: revogar anon e PUBLIC
REVOKE ALL ON FUNCTION public.prexyon_generate_sso_code(uuid, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prexyon_generate_sso_code(uuid, text, text, text, integer) TO authenticated, service_role, postgres;

-- Adicionar defesa em profundidade na sobrecarga legada: se chamada com contexto JWT de usuário, bloqueia se tentar impersonar
CREATE OR REPLACE FUNCTION public.prexyon_generate_sso_code(
  p_organization_id uuid,
  p_user_id uuid,
  p_product_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_code text;
  v_expires_at timestamptz;
  v_org_status boolean;
  v_member_active boolean;
  v_member_locked boolean;
  v_entitlements jsonb;
  v_user_has_product_access boolean;
  v_user_role text;
  v_has_permission boolean;
BEGIN
  -- Defesa em profundidade: Se chamada com JWT de usuário, impedir impersonação
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Identity impersonation blocked' USING ERRCODE = '42501';
  END IF;

  -- 1. Validar status da Organização
  SELECT is_active INTO v_org_status
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_status IS NULL OR v_org_status = false THEN
    RAISE EXCEPTION 'ORGANIZATION_INACTIVE: Organization is suspended or inactive' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Validar Membership do Usuário na Organização
  SELECT is_active, is_locked, role INTO v_member_active, v_member_locked, v_user_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = p_user_id;

  IF v_member_active IS NULL OR v_member_active = false OR v_member_locked = true THEN
    RAISE EXCEPTION 'MEMBERSHIP_INACTIVE: User is not active or is locked in organization' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validar Entitlement Efetivo da Organização para o Produto (Comercial OU Homologação)
  v_entitlements := public.prexyon_get_organization_entitlements(p_organization_id);

  IF (v_entitlements->>'is_entitled')::boolean = false OR NOT ((v_entitlements->'effective_products') @> to_jsonb(p_product_id)) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_SUBSCRIBED: Organization does not have active entitlement for product: %', p_product_id USING ERRCODE = 'P0001';
  END IF;

  -- 4. Validar Acesso Explícito do Usuário ao Produto
  SELECT is_enabled INTO v_user_has_product_access
  FROM public.organization_member_product_access
  WHERE organization_id = p_organization_id AND user_id = p_user_id AND product_key = p_product_id;

  IF v_user_has_product_access IS NULL THEN
    IF v_user_role = 'owner' THEN
      v_user_has_product_access := true;
    ELSE
      v_user_has_product_access := false;
    END IF;
  END IF;

  IF v_user_has_product_access = false THEN
    RAISE EXCEPTION 'USER_PRODUCT_ACCESS_DENIED: User does not have granted access to product: %', p_product_id USING ERRCODE = 'P0001';
  END IF;

  -- 5. Validação de Permissões Granulares (Se houver permissões cadastradas, exige ao menos uma concedida)
  IF v_user_role NOT IN ('owner', 'admin') THEN
    IF EXISTS (
      SELECT 1 FROM public.product_permissions
      WHERE organization_id = p_organization_id
        AND user_id = p_user_id
        AND product_key = p_product_id
    ) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.product_permissions
        WHERE organization_id = p_organization_id
          AND user_id = p_user_id
          AND product_key = p_product_id
          AND is_granted = true
      ) INTO v_has_permission;

      IF NOT v_has_permission THEN
        RAISE EXCEPTION 'USER_PRODUCT_PERMISSION_DENIED: User has no permissions granted for product: %', p_product_id USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- 6. Gerar Código Seguro (UUIDv4)
  v_code := gen_random_uuid()::text;
  v_expires_at := now() + interval '60 seconds';

  -- 7. Persistir Código
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
    p_user_id,
    p_product_id,
    p_product_id,
    '/' || p_product_id,
    v_expires_at,
    now()
  );

  RETURN jsonb_build_object(
    'code', v_code,
    'expires_at', v_expires_at
  );
END;
$$;
