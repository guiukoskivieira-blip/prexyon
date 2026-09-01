-- =============================================================================
-- PREXYON PORTAL — HOTFIX: FAIL-CLOSED PERMISSIONS & ACCESS ENFORCEMENT
-- Migration: 20260902_hotfix_permissions_fail_closed.sql
-- Description: Garante validação server-side estrita de entitlements na RPC
--              prexyon_update_member_access_and_permissions e prexyon_invite_user,
--              rejeitando qualquer concessão granular de produto não contratado.
-- =============================================================================

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

  -- 2. Validar Entitlement REAL da organização (Fail-Closed)
  v_entitlements := public.prexyon_get_organization_entitlements(p_organization_id);

  IF (v_entitlements->>'has_subscription')::boolean = false THEN
    IF (p_products IS NOT NULL AND array_length(p_products, 1) > 0) OR (p_permissions IS NOT NULL AND p_permissions <> '{}'::jsonb) THEN
      RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Validar que cada produto em p_products está incluído na assinatura ativa
  IF p_products IS NOT NULL AND array_length(p_products, 1) > 0 THEN
    FOREACH v_prod IN ARRAY p_products LOOP
      IF NOT ((v_entitlements->>'has_subscription')::boolean = true AND (v_entitlements->'included_products') @> to_jsonb(v_prod)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have subscription for %', v_prod USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  -- Validar que cada produto em p_permissions está incluído na assinatura ativa
  IF p_permissions IS NOT NULL AND p_permissions <> '{}'::jsonb THEN
    FOR v_prod_key IN SELECT key FROM jsonb_each(p_permissions) LOOP
      IF NOT ((v_entitlements->>'has_subscription')::boolean = true AND (v_entitlements->'included_products') @> to_jsonb(v_prod_key)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have subscription for %', v_prod_key USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  -- 3. Atualizar tabela de acessos por produto
  -- Desabilitar todos os produtos atuais do usuário nesta organização
  UPDATE public.organization_member_product_access
  SET is_enabled = false, updated_at = now()
  WHERE organization_id = p_organization_id AND user_id = p_target_user_id;

  -- Habilitar produtos selecionados
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
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_entitlements jsonb;
  v_prod text;
  v_prod_key text;
  v_current_users_count integer;
  v_max_users integer;
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

  -- 4. Validar Entitlement da Organização (Fail-Closed)
  v_entitlements := public.prexyon_get_organization_entitlements(p_organization_id);

  IF (v_entitlements->>'has_subscription')::boolean = false THEN
    IF (p_product_access IS NOT NULL AND array_length(p_product_access, 1) > 0) OR (p_permissions IS NOT NULL AND p_permissions <> '{}'::jsonb) THEN
      RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_product_access IS NOT NULL AND array_length(p_product_access, 1) > 0 THEN
    FOREACH v_prod IN ARRAY p_product_access LOOP
      IF NOT ((v_entitlements->>'has_subscription')::boolean = true AND (v_entitlements->'included_products') @> to_jsonb(v_prod)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription for product %', v_prod USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  IF p_permissions IS NOT NULL AND p_permissions <> '{}'::jsonb THEN
    FOR v_prod_key IN SELECT key FROM jsonb_each(p_permissions) LOOP
      IF NOT ((v_entitlements->>'has_subscription')::boolean = true AND (v_entitlements->'included_products') @> to_jsonb(v_prod_key)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription for product %', v_prod_key USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  -- 5. Verificar limite de assentos/usuários do plano
  SELECT COUNT(*) INTO v_current_users_count
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND is_active = true;

  SELECT COALESCE(p.included_users, 100) INTO v_max_users
  FROM public.prexyon_subscriptions s
  JOIN public.prexyon_plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_organization_id AND s.status IN ('active', 'trialing')
  LIMIT 1;

  IF v_max_users IS NOT NULL AND v_current_users_count >= v_max_users THEN
    RAISE EXCEPTION 'PLAN_USER_LIMIT_REACHED: Limit of % users reached for current plan', v_max_users USING ERRCODE = 'P0002';
  END IF;

  -- 6. Gerar ou receber token_hash
  IF p_token_hash IS NOT NULL AND p_token_hash <> '' THEN
    v_token_hash := p_token_hash;
  ELSE
    v_token_hash := encode(digest(gen_random_uuid()::text || now()::text, 'sha256'), 'hex');
  END IF;

  -- 7. Criar ou atualizar convite existente pendente
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

  RETURN jsonb_build_object(
    'id', v_invitation_id,
    'token_hash', v_token_hash,
    'email', v_clean_email,
    'role', p_role,
    'product_access', p_product_access,
    'permissions', p_permissions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.prexyon_update_member_access_and_permissions(uuid, uuid, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prexyon_invite_user(uuid, text, text, text[], jsonb, text) TO authenticated;
