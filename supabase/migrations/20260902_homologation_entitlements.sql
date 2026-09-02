-- ==============================================================================
-- PREXYON — ETAPA 7: ENTITLEMENT CONTROLADO DE HOMOLOGAÇÃO
-- Migration: 20260902_homologation_entitlements.sql
-- Descrição:
--   Cria infraestrutura estritamente isolada para homologação de múltiplos
--   usuários e produtos sem contaminar prexyon_subscriptions nem o catálogo.
-- ==============================================================================

-- 1. TABELA DE ENTITLEMENTS DE HOMOLOGAÇÃO (AUDITORIA ESTATAL EXPLÍCITA)
CREATE TABLE IF NOT EXISTS public.prexyon_homologation_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    granted_by_actor_type TEXT NOT NULL DEFAULT 'system',
    granted_by_user_id UUID NULL REFERENCES auth.users(id),
    reason TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by_actor_type TEXT NULL,
    revoked_by_user_id UUID NULL REFERENCES auth.users(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT chk_homolog_product_code CHECK (product_code IN ('orcagraf', 'arteflow', 'artecheck')),
    CONSTRAINT chk_homolog_expires_after_created CHECK (expires_at > created_at),
    CONSTRAINT chk_granted_actor_type CHECK (granted_by_actor_type IN ('system', 'admin_service', 'admin_user', 'support_operator')),
    CONSTRAINT chk_revoked_actor_type CHECK (revoked_by_actor_type IS NULL OR revoked_by_actor_type IN ('system', 'admin_service', 'admin_user', 'support_operator'))
);

-- Suporte a upgrade limpo se a tabela já existia
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='prexyon_homologation_entitlements' AND column_name='granted_by_actor_type') THEN
        ALTER TABLE public.prexyon_homologation_entitlements ADD COLUMN granted_by_actor_type TEXT NOT NULL DEFAULT 'system';
        ALTER TABLE public.prexyon_homologation_entitlements ADD COLUMN granted_by_user_id UUID NULL REFERENCES auth.users(id);
        ALTER TABLE public.prexyon_homologation_entitlements ADD COLUMN revoked_by_actor_type TEXT NULL;
        ALTER TABLE public.prexyon_homologation_entitlements ADD COLUMN revoked_by_user_id UUID NULL REFERENCES auth.users(id);
        ALTER TABLE public.prexyon_homologation_entitlements DROP COLUMN IF EXISTS created_by;
        ALTER TABLE public.prexyon_homologation_entitlements DROP COLUMN IF EXISTS revoked_by;
    END IF;
END $$;

-- Índices otimizados
CREATE INDEX IF NOT EXISTS idx_homolog_entitlements_org 
ON public.prexyon_homologation_entitlements(organization_id);

CREATE INDEX IF NOT EXISTS idx_homolog_entitlements_active 
ON public.prexyon_homologation_entitlements(organization_id, product_code) 
WHERE revoked_at IS NULL;

-- 2. POLÍTICAS RLS & PERMISSÕES DE TABELA (FAIL-CLOSED)
ALTER TABLE public.prexyon_homologation_entitlements ENABLE ROW LEVEL SECURITY;

-- Bloqueio total de acesso direto a clientes (anon e authenticated)
-- Somente o backend confiável (service_role e superuser postgres) pode consultar ou manipular registros brutos
REVOKE ALL ON TABLE public.prexyon_homologation_entitlements FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.prexyon_homologation_entitlements TO service_role, postgres;

DROP POLICY IF EXISTS "homolog_entitlements_select_policy" ON public.prexyon_homologation_entitlements;

-- 3. RPC: CONCEDER ENTITLEMENT DE HOMOLOGAÇÃO
CREATE OR REPLACE FUNCTION public.prexyon_grant_homologation_entitlement(
    p_organization_id UUID,
    p_product_code TEXT,
    p_expires_at TIMESTAMPTZ,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_user_id UUID;
    v_actor_type TEXT;
    v_grant_id UUID;
    v_org_exists BOOLEAN;
BEGIN
    -- Capturar identidade do autor (apenas se for usuário autenticado em contexto client; caso contrário system)
    IF auth.role() = 'authenticated' AND auth.uid() IS NOT NULL THEN
        v_actor_type := 'admin_user';
        v_actor_user_id := auth.uid();
    ELSE
        v_actor_type := 'system';
        v_actor_user_id := NULL;
    END IF;

    -- Validar existência da organização
    SELECT EXISTS(SELECT 1 FROM public.organizations WHERE id = p_organization_id) INTO v_org_exists;
    IF NOT v_org_exists THEN
        RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Validar product_code
    IF p_product_code NOT IN ('orcagraf', 'arteflow', 'artecheck') THEN
        RAISE EXCEPTION 'INVALID_PRODUCT_CODE: %', p_product_code USING ERRCODE = 'P0003';
    END IF;

    -- Validar expiração
    IF p_expires_at <= pg_catalog.now() THEN
        RAISE EXCEPTION 'EXPIRES_AT_MUST_BE_FUTURE' USING ERRCODE = 'P0004';
    END IF;

    -- Inserir concessão com atribuição estrita do autor verdadeiro
    INSERT INTO public.prexyon_homologation_entitlements (
        organization_id,
        product_code,
        granted_by_actor_type,
        granted_by_user_id,
        reason,
        expires_at
    ) VALUES (
        p_organization_id,
        p_product_code,
        v_actor_type,
        v_actor_user_id,
        p_reason,
        p_expires_at
    )
    RETURNING id INTO v_grant_id;

    -- Auditoria
    INSERT INTO public.prexyon_audit_logs (
        organization_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
    ) VALUES (
        p_organization_id,
        v_actor_user_id,
        'homologation_entitlement_granted',
        'prexyon_homologation_entitlements',
        v_grant_id::text,
        pg_catalog.jsonb_build_object(
            'product_code', p_product_code,
            'expires_at', p_expires_at,
            'reason', p_reason,
            'granted_by_actor_type', v_actor_type
        ),
        pg_catalog.now()
    );

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'grant_id', v_grant_id,
        'product_code', p_product_code,
        'expires_at', p_expires_at,
        'granted_by_actor_type', v_actor_type
    );
END;
$$;

-- 4. RPC: REVOGAR ENTITLEMENT DE HOMOLOGAÇÃO
CREATE OR REPLACE FUNCTION public.prexyon_revoke_homologation_entitlement(
    p_organization_id UUID,
    p_product_code TEXT,
    p_reason TEXT DEFAULT 'Revogado administrativamente'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_user_id UUID;
    v_actor_type TEXT;
    v_revoked_count INT;
BEGIN
    IF auth.role() = 'authenticated' AND auth.uid() IS NOT NULL THEN
        v_actor_type := 'admin_user';
        v_actor_user_id := auth.uid();
    ELSE
        v_actor_type := 'system';
        v_actor_user_id := NULL;
    END IF;

    UPDATE public.prexyon_homologation_entitlements
    SET revoked_at = pg_catalog.now(),
        revoked_by_actor_type = v_actor_type,
        revoked_by_user_id = v_actor_user_id,
        metadata = metadata || pg_catalog.jsonb_build_object('revoke_reason', p_reason, 'revoked_by_actor_type', v_actor_type)
    WHERE organization_id = p_organization_id
      AND product_code = p_product_code
      AND revoked_at IS NULL;

    GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

    IF v_revoked_count > 0 THEN
        INSERT INTO public.prexyon_audit_logs (
            organization_id,
            actor_user_id,
            action,
            entity_type,
            entity_id,
            metadata,
            created_at
        ) VALUES (
            p_organization_id,
            v_actor_user_id,
            'homologation_entitlement_revoked',
            'prexyon_homologation_entitlements',
            p_organization_id::text,
            pg_catalog.jsonb_build_object(
                'product_code', p_product_code,
                'revoked_count', v_revoked_count,
                'reason', p_reason,
                'revoked_by_actor_type', v_actor_type
            ),
            pg_catalog.now()
        );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'revoked_count', v_revoked_count,
        'product_code', p_product_code,
        'revoked_by_actor_type', v_actor_type
    );
END;
$$;

-- 5. EVOLUÇÃO DE prexyon_get_organization_entitlements (COM PROTEÇÃO CROSS-TENANT)
CREATE OR REPLACE FUNCTION public.prexyon_get_organization_entitlements(
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_sub record;
  v_plan record;
  v_comm_products text[] := ARRAY[]::text[];
  v_homolog_products text[] := ARRAY[]::text[];
  v_effective_products text[] := ARRAY[]::text[];
  v_is_entitled boolean := false;
  v_active_members_count int := 0;
  v_has_subscription boolean := false;
  v_subscription_status text := 'none';
  v_plan_code text := 'none';
  v_plan_name text := 'Nenhum plano contratado';
  v_included_users int := 0;
  v_extra_users int := 0;
  v_cancel_at_period_end boolean := false;
  v_current_period_end timestamptz := null;
BEGIN
  -- 0. Validação de Autorização / Multi-tenant do Chamador
  v_caller_id := auth.uid();
  v_caller_role := auth.role();

  IF v_caller_role = 'anon' THEN
    -- Usuário anônimo é estritamente bloqueado de enumerar entitlements de organizações
    RAISE EXCEPTION 'UNAUTHENTICATED: Anonymous enumeration is not permitted' USING ERRCODE = '42501';
  ELSIF v_caller_role = 'authenticated' THEN
    -- Usuário autenticado pelo client só pode consultar entitlements da própria organização onde é membro ativo
    IF v_caller_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_org_id AND user_id = v_caller_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: User does not have access to this organization' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- 1. Contagem de membros ativos
  SELECT COUNT(*) INTO v_active_members_count
  FROM public.organization_members
  WHERE organization_id = p_org_id AND is_active = true;

  -- 2. Consultar Assinatura Comercial Real
  SELECT * INTO v_sub
  FROM public.prexyon_subscriptions
  WHERE organization_id = p_org_id;

  IF FOUND THEN
    SELECT * INTO v_plan
    FROM public.prexyon_plans
    WHERE id = v_sub.plan_id;

    v_subscription_status := v_sub.status;
    v_cancel_at_period_end := COALESCE(v_sub.cancel_at_period_end, false);
    v_current_period_end := v_sub.current_period_end;

    IF v_plan.id IS NOT NULL THEN
      v_plan_code := v_plan.code;
      v_plan_name := v_plan.name;
      v_included_users := v_plan.included_users;

      -- Verificar se a assinatura comercial confere entitlement
      IF (v_sub.status IN ('active', 'trialing') AND (v_sub.current_period_end IS NULL OR v_sub.current_period_end > timezone('utc', now())))
         OR (v_sub.status = 'canceled' AND v_sub.current_period_end > timezone('utc', now())) THEN
        
        v_has_subscription := true;

        SELECT ARRAY_AGG(pp.product_code ORDER BY pp.product_code) INTO v_comm_products
        FROM public.prexyon_plan_products pp
        WHERE pp.plan_id = v_plan.id;

        v_comm_products := COALESCE(v_comm_products, ARRAY[]::text[]);
      END IF;
    END IF;
  END IF;

  -- 3. Consultar Entitlements de Homologação (Isolados e Server-side)
  SELECT ARRAY_AGG(DISTINCT product_code ORDER BY product_code) INTO v_homolog_products
  FROM public.prexyon_homologation_entitlements
  WHERE organization_id = p_org_id
    AND expires_at > timezone('utc', now())
    AND revoked_at IS NULL;

  v_homolog_products := COALESCE(v_homolog_products, ARRAY[]::text[]);

  -- 4. União dos produtos efetivos (Commercial + Homologation)
  SELECT ARRAY_AGG(DISTINCT p ORDER BY p) INTO v_effective_products
  FROM unnest(v_comm_products || v_homolog_products) AS p;

  v_effective_products := COALESCE(v_effective_products, ARRAY[]::text[]);
  v_is_entitled := COALESCE(cardinality(v_effective_products), 0) > 0;

  IF v_active_members_count > v_included_users AND v_included_users > 0 THEN
    v_extra_users := v_active_members_count - v_included_users;
  ELSE
    v_extra_users := 0;
  END IF;

  RETURN jsonb_build_object(
    'has_subscription', v_has_subscription,
    'subscription_status', v_subscription_status,
    'plan_code', v_plan_code,
    'plan_name', v_plan_name,
    'included_users', v_included_users,
    'active_members_count', v_active_members_count,
    'extra_users', v_extra_users,
    'cancel_at_period_end', v_cancel_at_period_end,
    'current_period_end', v_current_period_end,
    'commercial_products', to_jsonb(v_comm_products),
    'homologation_products', to_jsonb(v_homolog_products),
    'effective_products', to_jsonb(v_effective_products),
    'included_products', to_jsonb(v_effective_products),
    'is_entitled', v_is_entitled
  );
END;
$$;

-- 6. ATUALIZAÇÃO DO SSO CENTRAL PARA UTILIZAR OS EFFECTIVE_PRODUCTS
CREATE OR REPLACE FUNCTION public.prexyon_generate_sso_code(
  p_organization_id uuid,
  p_user_id uuid,
  p_product_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
BEGIN
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

  -- 5. Gerar Código Seguro (UUIDv4)
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

-- 7. ATUALIZAÇÃO DE prexyon_update_member_access_and_permissions (EFFECTIVE PRODUCTS)
CREATE OR REPLACE FUNCTION public.prexyon_update_member_access_and_permissions(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_products text[] DEFAULT NULL,
  p_permissions jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role public.user_role;
  v_entitlements jsonb;
  v_prod text;
  v_prod_key text;
  v_perm_obj jsonb;
  v_perm_key text;
  v_perm_val boolean;
BEGIN
  -- 1. Validar autenticação e autoridade (apenas owner ou admin da organização)
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_actor_id AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  -- 2. Validar Entitlement Efetivo da organização (Fail-Closed)
  v_entitlements := public.prexyon_get_organization_entitlements(p_organization_id);

  IF (v_entitlements->>'is_entitled')::boolean = false THEN
    IF (p_products IS NOT NULL AND array_length(p_products, 1) > 0) OR (p_permissions IS NOT NULL AND p_permissions <> '{}'::jsonb) THEN
      RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Validar que cada produto em p_products está incluído nos effective_products
  IF p_products IS NOT NULL AND array_length(p_products, 1) > 0 THEN
    FOREACH v_prod IN ARRAY p_products LOOP
      IF NOT ((v_entitlements->>'is_entitled')::boolean = true AND (v_entitlements->'effective_products') @> to_jsonb(v_prod)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have subscription for %', v_prod USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  -- Validar que cada produto em p_permissions está incluído nos effective_products
  IF p_permissions IS NOT NULL AND p_permissions <> '{}'::jsonb THEN
    FOR v_prod_key IN SELECT key FROM jsonb_each(p_permissions) LOOP
      IF NOT ((v_entitlements->>'is_entitled')::boolean = true AND (v_entitlements->'effective_products') @> to_jsonb(v_prod_key)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have subscription for %', v_prod_key USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  -- 3. Atualizar tabela de acessos por produto
  UPDATE public.organization_member_product_access
  SET is_enabled = false, updated_at = now()
  WHERE organization_id = p_organization_id AND user_id = p_target_user_id;

  IF p_products IS NOT NULL AND array_length(p_products, 1) > 0 THEN
    FOREACH v_prod IN ARRAY p_products LOOP
      INSERT INTO public.organization_member_product_access (
        organization_id,
        user_id,
        product_key,
        is_enabled,
        created_at,
        updated_at
      ) VALUES (
        p_organization_id,
        p_target_user_id,
        v_prod,
        true,
        now(),
        now()
      )
      ON CONFLICT (organization_id, user_id, product_key) DO UPDATE SET
        is_enabled = true,
        updated_at = now();
    END LOOP;
  END IF;

  -- 4. Atualizar permissões granulares se fornecidas
  IF p_permissions IS NOT NULL AND p_permissions <> '{}'::jsonb THEN
    FOR v_prod_key, v_perm_obj IN SELECT * FROM jsonb_each(p_permissions) LOOP
      IF jsonb_typeof(v_perm_obj) = 'array' THEN
        FOR v_perm_key IN SELECT jsonb_array_elements_text(v_perm_obj) LOOP
          INSERT INTO public.product_permissions (
            organization_id,
            user_id,
            product_key,
            permission_key,
            is_granted,
            created_at,
            updated_at
          ) VALUES (
            p_organization_id,
            p_target_user_id,
            v_prod_key,
            v_perm_key,
            true,
            now(),
            now()
          )
          ON CONFLICT (organization_id, user_id, product_key, permission_key) DO UPDATE SET
            is_granted = true,
            updated_at = now();
        END LOOP;
      ELSIF jsonb_typeof(v_perm_obj) = 'object' THEN
        FOR v_perm_key, v_perm_val IN SELECT key, value::boolean FROM jsonb_each(v_perm_obj) LOOP
          INSERT INTO public.product_permissions (
            organization_id,
            user_id,
            product_key,
            permission_key,
            is_granted,
            created_at,
            updated_at
          ) VALUES (
            p_organization_id,
            p_target_user_id,
            v_prod_key,
            v_perm_key,
            v_perm_val,
            now(),
            now()
          )
          ON CONFLICT (organization_id, user_id, product_key, permission_key) DO UPDATE SET
            is_granted = v_perm_val,
            updated_at = now();
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- 5. Auditoria
  INSERT INTO public.prexyon_audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'member_permissions_updated',
    'member',
    p_target_user_id::text,
    jsonb_build_object('products', p_products, 'permissions', p_permissions),
    now()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. ATUALIZAÇÃO DE prexyon_invite_user (EFFECTIVE PRODUCTS)
CREATE OR REPLACE FUNCTION public.prexyon_invite_user(
  p_organization_id uuid,
  p_email text,
  p_role text DEFAULT 'member',
  p_product_access text[] DEFAULT NULL,
  p_permissions jsonb DEFAULT NULL,
  p_token_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_entitlements jsonb;
  v_prod text;
  v_prod_key text;
  v_current_users_count integer;
  v_max_users integer;
  v_raw_token text;
  v_token_hash text;
  v_invitation_id uuid;
  v_clean_email text := LOWER(TRIM(p_email));
BEGIN
  -- 1. Validar autenticação
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- 2. Validar papel do emissor
  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_actor_id AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only owners and admins can invite users' USING ERRCODE = '42501';
  END IF;

  -- 3. Validar papel do convidado
  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'INVALID_ROLE: Role must be admin or member' USING ERRCODE = '22023';
  END IF;

  IF v_actor_role = 'admin' AND p_role = 'owner' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Admins cannot invite owners' USING ERRCODE = '42501';
  END IF;

  -- 4. Validar Entitlement Efetivo da Organização (Fail-Closed)
  v_entitlements := public.prexyon_get_organization_entitlements(p_organization_id);

  IF (v_entitlements->>'is_entitled')::boolean = false THEN
    RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription or entitlement' USING ERRCODE = 'P0001';
  END IF;

  IF p_product_access IS NOT NULL AND array_length(p_product_access, 1) > 0 THEN
    FOREACH v_prod IN ARRAY p_product_access LOOP
      IF NOT ((v_entitlements->>'is_entitled')::boolean = true AND (v_entitlements->'effective_products') @> to_jsonb(v_prod)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription for product %', v_prod USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  IF p_permissions IS NOT NULL AND p_permissions <> '{}'::jsonb THEN
    FOR v_prod_key IN SELECT key FROM jsonb_each(p_permissions) LOOP
      IF NOT ((v_entitlements->>'is_entitled')::boolean = true AND (v_entitlements->'effective_products') @> to_jsonb(v_prod_key)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription for product %', v_prod_key USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  -- 5. Validar limite de assentos/usuários (Fail-Closed Explícito)
  SELECT COUNT(*) INTO v_current_users_count
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND is_active = true;

  IF (v_entitlements->>'has_subscription')::boolean = true THEN
    -- Cenário A: Assinatura Comercial Ativa
    SELECT p.included_users INTO v_max_users
    FROM public.prexyon_subscriptions s
    JOIN public.prexyon_plans p ON p.id = s.plan_id
    WHERE s.organization_id = p_organization_id AND s.status IN ('active', 'trialing')
    LIMIT 1;

    v_max_users := COALESCE(v_max_users, 1);

    IF v_current_users_count >= v_max_users THEN
      RAISE EXCEPTION 'PLAN_USER_LIMIT_REACHED: Limit of % users reached for current plan', v_max_users USING ERRCODE = 'P0002';
    END IF;

  ELSIF (v_entitlements->>'is_entitled')::boolean = true THEN
    -- Cenário B: Sem Assinatura Comercial, MAS com Homologation Entitlement Ativo
    -- Teto seguro de homologação: exatamente 2 assentos (1 OWNER + 1 MEMBER)
    v_max_users := 2;

    IF v_current_users_count >= v_max_users THEN
      RAISE EXCEPTION 'HOMOLOGATION_USER_LIMIT_REACHED: Limit of % users reached for homologation environment', v_max_users USING ERRCODE = 'P0002';
    END IF;

  ELSE
    -- Cenário C: Sem Assinatura Comercial E sem Homologation Entitlement
    RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription or entitlement' USING ERRCODE = 'P0001';
  END IF;

  -- 6. Arquitetura Segura de Token: Raw Token (Bearer Secret) vs SHA-256 Hash (DB Storage)
  IF p_token_hash IS NOT NULL AND p_token_hash <> '' THEN
    v_raw_token := p_token_hash;
    v_token_hash := encode(digest(v_raw_token::bytea, 'sha256'), 'hex');
  ELSE
    v_raw_token := 'inv_' || replace(gen_random_uuid()::text, '-', '') || encode(digest((gen_random_uuid()::text || clock_timestamp()::text)::bytea, 'sha256'), 'hex');
    v_token_hash := encode(digest(v_raw_token::bytea, 'sha256'), 'hex');
  END IF;

  -- 7. Criar convite pendente armazenando EXCLUSIVAMENTE o hash SHA-256 no banco
  INSERT INTO public.organization_invitations (
    organization_id,
    email,
    role,
    token_hash,
    invited_by,
    product_access,
    permissions,
    expires_at,
    created_at
  ) VALUES (
    p_organization_id,
    v_clean_email,
    p_role,
    v_token_hash,
    v_actor_id,
    COALESCE(to_jsonb(p_product_access), '[]'::jsonb),
    COALESCE(p_permissions, '{}'::jsonb),
    now() + interval '7 days',
    now()
  )
  RETURNING id INTO v_invitation_id;

  -- 8. Auditoria
  INSERT INTO public.prexyon_audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) VALUES (
    p_organization_id,
    v_actor_id,
    'user_invited',
    'invitation',
    v_invitation_id::text,
    jsonb_build_object('email', v_clean_email, 'role', p_role, 'products', p_product_access),
    now()
  );

  -- Retorna o token raw para ser entregue ao convidado (o banco retém apenas o hash)
  RETURN jsonb_build_object(
    'id', v_invitation_id,
    'token', v_raw_token,
    'token_hash', v_token_hash,
    'email', v_clean_email,
    'role', p_role,
    'product_access', p_product_access,
    'permissions', p_permissions
  );
END;
$$;

-- 9. RPC DE ACEITE DE CONVITE COM VERIFICAÇÃO CRIPTOGRÁFICA DE HASH
CREATE OR REPLACE FUNCTION public.prexyon_accept_invitation(
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_invitation record;
  v_prod text;
  v_prod_key text;
  v_perm_key text;
  v_perm_array jsonb;
  v_computed_hash text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- 1. Calcular o hash SHA-256 do token recebido
  v_computed_hash := encode(digest(p_token_hash::bytea, 'sha256'), 'hex');

  -- 2. Buscar convite pelo hash no banco (com suporte a fallback caso tenha sido passado o hash diretamente)
  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE token_hash = v_computed_hash OR token_hash = p_token_hash;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Validar se já foi aceito (Anti-Replay)
  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVITATION_ALREADY_USED' USING ERRCODE = 'P0003';
  END IF;

  -- 4. Validar se expirou
  IF v_invitation.expires_at < now() THEN
    RAISE EXCEPTION 'INVITATION_EXPIRED' USING ERRCODE = 'P0004';
  END IF;

  -- 5. Validar e-mail do usuário autenticado
  IF LOWER(TRIM(v_user_email)) <> LOWER(TRIM(v_invitation.email)) THEN
    RAISE EXCEPTION 'EMAIL_MISMATCH: Invitation is for %', v_invitation.email USING ERRCODE = '42501';
  END IF;

  -- 6. Inserir ou atualizar membership
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role,
    is_active,
    is_locked,
    created_at,
    updated_at
  ) VALUES (
    v_invitation.organization_id,
    v_user_id,
    v_invitation.role::public.user_role,
    true,
    false,
    now(),
    now()
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = true,
    updated_at = now();

  -- 7. Inserir acessos a produtos
  IF v_invitation.product_access IS NOT NULL THEN
    FOR v_prod IN SELECT jsonb_array_elements_text(v_invitation.product_access) LOOP
      INSERT INTO public.organization_member_product_access (
        organization_id,
        user_id,
        product_key,
        is_enabled,
        created_at,
        updated_at
      ) VALUES (
        v_invitation.organization_id,
        v_user_id,
        v_prod,
        true,
        now(),
        now()
      )
      ON CONFLICT (organization_id, user_id, product_key) DO UPDATE SET
        is_enabled = true,
        updated_at = now();
    END LOOP;
  END IF;

  -- 8. Inserir permissões granulares
  IF v_invitation.permissions IS NOT NULL THEN
    FOR v_prod_key, v_perm_array IN SELECT * FROM jsonb_each(v_invitation.permissions) LOOP
      IF jsonb_typeof(v_perm_array) = 'array' THEN
        FOR v_perm_key IN SELECT jsonb_array_elements_text(v_perm_array) LOOP
          INSERT INTO public.product_permissions (
            organization_id,
            user_id,
            product_key,
            permission_key,
            is_granted,
            created_at,
            updated_at
          ) VALUES (
            v_invitation.organization_id,
            v_user_id,
            v_prod_key,
            v_perm_key,
            true,
            now(),
            now()
          )
          ON CONFLICT (organization_id, user_id, product_key, permission_key) DO UPDATE SET
            is_granted = true,
            updated_at = now();
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- 9. Marcar convite como utilizado (Anti-Replay)
  UPDATE public.organization_invitations
  SET accepted_at = now()
  WHERE id = v_invitation.id;

  -- 10. Auditoria
  INSERT INTO public.prexyon_audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  ) VALUES (
    v_invitation.organization_id,
    v_user_id,
    'invitation_accepted',
    'invitation',
    v_invitation.id::text,
    jsonb_build_object('email', v_user_email, 'role', v_invitation.role),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'accepted', true,
    'organization_id', v_invitation.organization_id,
    'organizationId', v_invitation.organization_id,
    'role', v_invitation.role,
    'email', v_user_email
  );
END;
$$;

-- 10. PERMISSÕES E ACL
REVOKE ALL ON FUNCTION public.prexyon_grant_homologation_entitlement(uuid, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prexyon_revoke_homologation_entitlement(uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prexyon_grant_homologation_entitlement(uuid, text, timestamptz, text) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.prexyon_revoke_homologation_entitlement(uuid, text, text) TO service_role, postgres;

GRANT EXECUTE ON FUNCTION public.prexyon_get_organization_entitlements(uuid) TO authenticated, service_role, anon, postgres, public;
GRANT EXECUTE ON FUNCTION public.prexyon_generate_sso_code(uuid, uuid, text) TO authenticated, service_role, anon, postgres, public;
GRANT EXECUTE ON FUNCTION public.prexyon_update_member_access_and_permissions(uuid, uuid, text[], jsonb) TO authenticated, service_role, anon, postgres, public;
GRANT EXECUTE ON FUNCTION public.prexyon_invite_user(uuid, text, text, text[], jsonb, text) TO authenticated, service_role, anon, postgres, public;
GRANT EXECUTE ON FUNCTION public.prexyon_accept_invitation(text) TO authenticated, service_role, anon, postgres, public;


