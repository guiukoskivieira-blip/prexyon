-- ==============================================================================
-- PREXYON — HARDENING FINAL DO PIPELINE DE PERMISSÕES DE CONVITE
-- Garante validação server-side e persistência das permissões granulares
-- ==============================================================================

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
  v_perm_key text;
  v_perm_array jsonb;
  v_current_users_count integer;
  v_max_users integer;
  v_raw_token text;
  v_token_hash text;
  v_invitation_id uuid;
  v_clean_email text := LOWER(TRIM(p_email));
  v_valid_orcagraf text[] := ARRAY[
    'orcagraf.view', 'orcagraf.quotes.view', 'orcagraf.quotes.create',
    'orcagraf.quotes.edit', 'orcagraf.quotes.approve', 'orcagraf.quotes.delete',
    'orcagraf.clients.view', 'orcagraf.clients.manage', 'orcagraf.products.view',
    'orcagraf.products.manage', 'orcagraf.pricing.manage', 'orcagraf.settings.manage',
    'orcagraf.budgets.view', 'orcagraf.budgets.create', 'orcagraf.budgets.edit',
    'orcagraf.budgets.delete', 'orcagraf.budgets.apply_discount', 'orcagraf.config.manage'
  ];
  v_valid_arteflow text[] := ARRAY[
    'arteflow.view', 'arteflow.orders.view', 'arteflow.orders.create',
    'arteflow.orders.edit', 'arteflow.orders.delete', 'arteflow.kanban.view',
    'arteflow.kanban.move', 'arteflow.kanban.status_manage', 'arteflow.checkin.view',
    'arteflow.checkin.approve', 'arteflow.checkin.reprove', 'arteflow.reports.view',
    'arteflow.reports.export', 'arteflow.production.move_stages',
    'arteflow.production.reassign', 'arteflow.finance.view', 'arteflow.finance.manage'
  ];
  v_valid_artecheck text[] := ARRAY[
    'artecheck.view', 'artecheck.preflight.run', 'artecheck.preflight.view',
    'artecheck.reports.view', 'artecheck.reports.download', 'artecheck.profiles.view',
    'artecheck.profiles.manage', 'artecheck.rules.view', 'artecheck.rules.edit',
    'artecheck.settings.manage', 'artecheck.analysis.view', 'artecheck.analysis.create',
    'artecheck.analysis.override_warnings'
  ];
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

  -- Validação estrita de permissions (Fail-Closed)
  IF p_permissions IS NOT NULL AND p_permissions <> '{}'::jsonb THEN
    FOR v_prod_key IN SELECT key FROM jsonb_each(p_permissions) LOOP
      -- Validação 4.1: O produto da permissão deve constar no product_access do convite
      IF NOT (p_product_access @> ARRAY[v_prod_key]) THEN
        RAISE EXCEPTION 'PERMISSION_FOR_UNAUTHORIZED_PRODUCT: Cannot grant permissions for product % which is not in product_access', v_prod_key USING ERRCODE = 'P0001';
      END IF;

      -- Validação 4.2: O produto da permissão deve constar no entitlement efetivo da organização
      IF NOT ((v_entitlements->>'is_entitled')::boolean = true AND (v_entitlements->'effective_products') @> to_jsonb(v_prod_key)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription for product %', v_prod_key USING ERRCODE = 'P0001';
      END IF;

      -- Validação 4.3: Validar cada chave de permissão
      v_perm_array := p_permissions->v_prod_key;
      IF jsonb_typeof(v_perm_array) <> 'array' THEN
        RAISE EXCEPTION 'INVALID_PERMISSIONS_FORMAT: Permissions for % must be an array', v_prod_key USING ERRCODE = '22023';
      END IF;

      FOR v_perm_key IN SELECT jsonb_array_elements_text(v_perm_array) LOOP
        -- Prefixo correto
        IF NOT (v_perm_key LIKE (v_prod_key || '.%')) THEN
          RAISE EXCEPTION 'INVALID_PERMISSION_PREFIX: Permission % does not match product %', v_perm_key, v_prod_key USING ERRCODE = '22023';
        END IF;

        -- Conhecida na lista permitida
        IF v_prod_key = 'orcagraf' AND NOT (v_valid_orcagraf @> ARRAY[v_perm_key]) THEN
          RAISE EXCEPTION 'UNKNOWN_PERMISSION: Permission % is not valid for product %', v_perm_key, v_prod_key USING ERRCODE = '22023';
        ELSIF v_prod_key = 'arteflow' AND NOT (v_valid_arteflow @> ARRAY[v_perm_key]) THEN
          RAISE EXCEPTION 'UNKNOWN_PERMISSION: Permission % is not valid for product %', v_perm_key, v_prod_key USING ERRCODE = '22023';
        ELSIF v_prod_key = 'artecheck' AND NOT (v_valid_artecheck @> ARRAY[v_perm_key]) THEN
          RAISE EXCEPTION 'UNKNOWN_PERMISSION: Permission % is not valid for product %', v_perm_key, v_prod_key USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- 5. Validar limite de assentos/usuários (Fail-Closed Explícito)
  SELECT COUNT(*) INTO v_current_users_count
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND is_active = true;

  IF (v_entitlements->>'has_subscription')::boolean = true THEN
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
    v_max_users := 2;

    IF v_current_users_count >= v_max_users THEN
      RAISE EXCEPTION 'HOMOLOGATION_USER_LIMIT_REACHED: Limit of % users reached for homologation environment', v_max_users USING ERRCODE = 'P0002';
    END IF;

  ELSE
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
