-- ==============================================================================
-- PREXYON — ETAPA 6: GESTÃO DE USUÁRIOS, ACESSOS E PERMISSÕES POR SOFTWARE
-- Migration oficial de tabelas, RLS e RPCs transacionais
-- ==============================================================================

-- 1. Tabela de Acesso por Produto (user_product_access)
CREATE TABLE IF NOT EXISTS public.organization_member_product_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_key text NOT NULL CHECK (product_key IN ('orcagraf', 'arteflow', 'artecheck')),
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_member_product UNIQUE (organization_id, user_id, product_key)
);

-- 2. Tabela de Permissões Granulares Normalizadas
CREATE TABLE IF NOT EXISTS public.product_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_key text NOT NULL CHECK (product_key IN ('orcagraf', 'arteflow', 'artecheck')),
  permission_key text NOT NULL,
  is_granted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_user_product_permission UNIQUE (organization_id, user_id, product_key, permission_key)
);

-- 3. Tabela de Convites Organizacionais
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  product_access jsonb NOT NULL DEFAULT '[]'::jsonb,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Tabela de Logs de Auditoria Transacional
CREATE TABLE IF NOT EXISTS public.prexyon_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_ompa_org_user ON public.organization_member_product_access(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_prod_perm_org_user ON public.product_permissions(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_org_email ON public.organization_invitations(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON public.organization_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_prexyon_audit_org ON public.prexyon_audit_logs(organization_id, created_at DESC);

-- Habilitar RLS
ALTER TABLE public.organization_member_product_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Admins e Owners visualizam logs de auditoria" ON public.prexyon_audit_logs;
CREATE POLICY "Admins e Owners visualizam logs de auditoria"
  ON public.prexyon_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.is_active = true AND om.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Membros visualizam acessos da mesma organização" ON public.organization_member_product_access;
CREATE POLICY "Membros visualizam acessos da mesma organização"
  ON public.organization_member_product_access
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.is_active = true
    )
  );

DROP POLICY IF EXISTS "Membros visualizam permissões da mesma organização" ON public.product_permissions;
CREATE POLICY "Membros visualizam permissões da mesma organização"
  ON public.product_permissions
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.is_active = true
    )
  );

DROP POLICY IF EXISTS "Membros autorizados visualizam convites da organização" ON public.organization_invitations;
CREATE POLICY "Membros autorizados visualizam convites da organização"
  ON public.organization_invitations
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.is_active = true AND om.role IN ('owner', 'admin')
    )
  );

-- ==============================================================================
-- RPC: Convidar Usuário (prexyon_invite_user)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prexyon_invite_user(
  p_organization_id uuid,
  p_email text,
  p_role text,
  p_product_access text[],
  p_permissions jsonb DEFAULT '{}'::jsonb,
  p_token_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_clean_email text;
  v_token_hash text;
  v_invitation_id uuid;
  v_entitlements jsonb;
  v_prod text;
  v_current_users_count int;
  v_max_users int;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- 1. Validar papel do ator na organização
  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_actor_id AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only owners or admins can invite users' USING ERRCODE = '42501';
  END IF;

  -- 2. Validar papel a ser atribuído (não permitir convidar como owner)
  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'INVALID_ROLE: Role must be admin or member' USING ERRCODE = '22023';
  END IF;

  -- 3. Limpar email
  v_clean_email := LOWER(TRIM(p_email));
  IF v_clean_email IS NULL OR v_clean_email = '' OR v_clean_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'INVALID_EMAIL' USING ERRCODE = '22023';
  END IF;

  -- 4. Validar se a organização possui entitlement para cada produto solicitado
  v_entitlements := public.prexyon_get_organization_entitlements(p_organization_id);
  
  IF p_product_access IS NOT NULL AND array_length(p_product_access, 1) > 0 THEN
    FOREACH v_prod IN ARRAY p_product_access LOOP
      IF v_prod NOT IN ('orcagraf', 'arteflow', 'artecheck') THEN
        RAISE EXCEPTION 'INVALID_PRODUCT_KEY: %', v_prod USING ERRCODE = '22023';
      END IF;

      -- Verificar se o produto está nos included_products da assinatura ativa da organização
      IF NOT ((v_entitlements->>'has_subscription')::boolean = true AND (v_entitlements->'included_products') @> to_jsonb(v_prod)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have an active subscription for product %', v_prod USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  -- 5. Verificar limite de assentos/usuários do plano
  SELECT COUNT(*) INTO v_current_users_count
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND is_active = true;

  -- Se houver plano ativo, obter max_users (fallback padrão 100 se não definido)
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
    'organization_invitation',
    v_invitation_id::text,
    jsonb_build_object(
      'email', v_clean_email,
      'role', p_role,
      'products', p_product_access
    ),
    now()
  );

  RETURN jsonb_build_object(
    'id', v_invitation_id,
    'email', v_clean_email,
    'role', p_role,
    'tokenHash', v_token_hash,
    'expiresAt', (now() + interval '7 days')
  );
END;
$$;

-- ==============================================================================
-- RPC: Aceitar Convite (prexyon_accept_invitation)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prexyon_accept_invitation(
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_invitation record;
  v_prod text;
  v_prod_key text;
  v_perm_key text;
  v_perm_array jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- 1. Buscar convite
  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE token_hash = p_token_hash;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Validar se já foi aceito
  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVITATION_ALREADY_USED' USING ERRCODE = 'P0003';
  END IF;

  -- 3. Validar se expirou
  IF v_invitation.expires_at < now() THEN
    RAISE EXCEPTION 'INVITATION_EXPIRED' USING ERRCODE = 'P0004';
  END IF;

  -- 4. Validar e-mail
  IF LOWER(TRIM(v_user_email)) <> LOWER(TRIM(v_invitation.email)) THEN
    RAISE EXCEPTION 'EMAIL_MISMATCH: Invitation is for %', v_invitation.email USING ERRCODE = '42501';
  END IF;

  -- 5. Inserir ou atualizar membership
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

  -- 6. Inserir acessos a produtos
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

  -- 7. Inserir permissões granulares
  IF v_invitation.permissions IS NOT NULL THEN
    FOR v_prod_key, v_perm_array IN SELECT * FROM jsonb_each(v_invitation.permissions) LOOP
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
    END LOOP;
  END IF;

  -- 8. Marcar convite como utilizado
  UPDATE public.organization_invitations
  SET accepted_at = now()
  WHERE id = v_invitation.id;

  -- 9. Auditoria
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
    'organization_invitation',
    v_invitation.id::text,
    jsonb_build_object(
      'email', v_user_email,
      'role', v_invitation.role
    ),
    now()
  );

  RETURN jsonb_build_object(
    'organizationId', v_invitation.organization_id,
    'role', v_invitation.role,
    'accepted', true
  );
END;
$$;

-- ==============================================================================
-- RPC: Atualizar Papel do Membro (prexyon_update_member_role)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prexyon_update_member_role(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_target_current_role text;
  v_owner_count int;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- 1. Validar ator
  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_actor_id AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only owner or admin can update roles' USING ERRCODE = '42501';
  END IF;

  -- 2. Obter papel atual do alvo
  SELECT role INTO v_target_current_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = p_target_user_id AND is_active = true;

  IF v_target_current_role IS NULL THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Regra de segurança: admin não pode alterar nem remover owner
  IF v_actor_role = 'admin' AND v_target_current_role = 'owner' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Admins cannot modify owners' USING ERRCODE = '42501';
  END IF;

  -- 4. Regra de segurança: admin não pode promover ninguém a owner
  IF v_actor_role = 'admin' AND p_new_role = 'owner' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Admins cannot promote users to owner' USING ERRCODE = '42501';
  END IF;

  -- 5. Regra: Membro não pode alterar seu próprio papel
  IF v_actor_id = p_target_user_id AND v_actor_role = 'member' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Members cannot change their own role' USING ERRCODE = '42501';
  END IF;

  -- 6. Regra: Não deixar organização sem owner
  IF v_target_current_role = 'owner' AND p_new_role <> 'owner' THEN
    SELECT COUNT(*) INTO v_owner_count
    FROM public.organization_members
    WHERE organization_id = p_organization_id AND role = 'owner' AND is_active = true;

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'CANNOT_REMOVE_LAST_OWNER: Organization must have at least one owner' USING ERRCODE = 'P0003';
    END IF;
  END IF;

  -- 7. Executar atualização
  UPDATE public.organization_members
  SET role = p_new_role::public.user_role, updated_at = now()
  WHERE organization_id = p_organization_id AND user_id = p_target_user_id;

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
    'member_role_updated',
    'organization_member',
    p_target_user_id::text,
    jsonb_build_object(
      'oldRole', v_target_current_role,
      'newRole', p_new_role
    ),
    now()
  );

  RETURN jsonb_build_object('success', true, 'userId', p_target_user_id, 'newRole', p_new_role);
END;
$$;

-- ==============================================================================
-- RPC: Atualizar Status do Membro (prexyon_update_member_status)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prexyon_update_member_status(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_target_role text;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_actor_id AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_target_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = p_target_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Admin não pode desativar Owner
  IF v_actor_role = 'admin' AND v_target_role = 'owner' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Admins cannot deactivate owners' USING ERRCODE = '42501';
  END IF;

  -- Não desativar o próprio único owner
  IF v_target_role = 'owner' AND p_is_active = false THEN
    RAISE EXCEPTION 'CANNOT_DEACTIVATE_OWNER' USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.organization_members
  SET is_active = p_is_active, updated_at = now()
  WHERE organization_id = p_organization_id AND user_id = p_target_user_id;

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
    CASE WHEN p_is_active THEN 'member_activated' ELSE 'member_deactivated' END,
    'organization_member',
    p_target_user_id::text,
    jsonb_build_object('isActive', p_is_active),
    now()
  );

  RETURN jsonb_build_object('success', true, 'userId', p_target_user_id, 'isActive', p_is_active);
END;
$$;

-- ==============================================================================
-- RPC: Atualizar Acessos e Permissões do Membro
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prexyon_update_member_access_and_permissions(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_products text[],
  p_permissions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_entitlements jsonb;
  v_prod text;
  v_prod_key text;
  v_perm_key text;
  v_perm_val boolean;
  v_perm_obj jsonb;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_actor_id AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  -- 1. Validar se a organização possui entitlement para cada produto
  v_entitlements := public.prexyon_get_organization_entitlements(p_organization_id);

  IF p_products IS NOT NULL AND array_length(p_products, 1) > 0 THEN
    FOREACH v_prod IN ARRAY p_products LOOP
      IF NOT ((v_entitlements->>'has_subscription')::boolean = true AND (v_entitlements->'included_products') @> to_jsonb(v_prod)) THEN
        RAISE EXCEPTION 'PRODUCT_NOT_IN_SUBSCRIPTION: Organization does not have subscription for %', v_prod USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  -- 2. Atualizar tabela de acessos por produto
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

  -- 3. Atualizar permissões granulares se fornecidas
  IF p_permissions IS NOT NULL THEN
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

  -- 4. Auditoria
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
    'organization_member',
    p_target_user_id::text,
    jsonb_build_object('products', p_products),
    now()
  );

  RETURN jsonb_build_object('success', true, 'userId', p_target_user_id, 'products', p_products);
END;
$$;

-- ==============================================================================
-- RPC: Listar Membros Completos da Organização
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prexyon_get_organization_members_full(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_result jsonb;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- Validar pertencimento
  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id AND user_id = v_actor_id AND is_active = true;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User does not belong to organization' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', om.user_id,
      'userId', om.user_id,
      'email', COALESCE(p.email, u.email),
      'fullName', COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', p.email, u.email),
      'role', om.role,
      'isActive', om.is_active,
      'isLocked', om.is_locked,
      'createdAt', om.created_at,
      'products', (
        SELECT COALESCE(jsonb_agg(pa.product_key), '[]'::jsonb)
        FROM public.organization_member_product_access pa
        WHERE pa.organization_id = p_organization_id AND pa.user_id = om.user_id AND pa.is_enabled = true
      ),
      'permissions', (
        SELECT COALESCE(jsonb_object_agg(
          pp.product_key,
          (
            SELECT COALESCE(jsonb_object_agg(pp2.permission_key, pp2.is_granted), '{}'::jsonb)
            FROM public.product_permissions pp2
            WHERE pp2.organization_id = p_organization_id AND pp2.user_id = om.user_id AND pp2.product_key = pp.product_key
          )
        ), '{}'::jsonb)
        FROM public.product_permissions pp
        WHERE pp.organization_id = p_organization_id AND pp.user_id = om.user_id
        GROUP BY pp.organization_id, pp.user_id
      )
    ) ORDER BY (CASE WHEN om.role = 'owner' THEN 1 WHEN om.role = 'admin' THEN 2 ELSE 3 END), om.created_at ASC
  ), '[]'::jsonb) INTO v_result
  FROM public.organization_members om
  LEFT JOIN public.profiles p ON p.id = om.user_id
  LEFT JOIN auth.users u ON u.id = om.user_id
  WHERE om.organization_id = p_organization_id;

  RETURN v_result;
END;
$$;

-- ==============================================================================
-- ATUALIZAÇÃO DO SSO CENTRAL COM VALIDAÇÃO DE ACESSO DO USUÁRIO
-- ==============================================================================
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

  -- 3. Validar Entitlement da Organização para o Produto
  v_entitlements := public.prexyon_get_organization_entitlements(p_organization_id);

  IF (v_entitlements->>'has_subscription')::boolean = false OR NOT ((v_entitlements->'included_products') @> to_jsonb(p_product_id)) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_SUBSCRIBED: Organization does not have an active subscription for product: %', p_product_id USING ERRCODE = 'P0001';
  END IF;

  -- 4. Validar Acesso Explícito do Usuário ao Produto
  -- Nota: Se for owner e ainda não tiver registro explícito em product_access, conceder acesso padrão.
  -- Para outros papéis (admin/member), verificar organization_member_product_access.
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

-- Conceder permissões
GRANT EXECUTE ON FUNCTION public.prexyon_invite_user(uuid, text, text, text[], jsonb, text) TO authenticated, service_role, anon, postgres, public;
GRANT EXECUTE ON FUNCTION public.prexyon_accept_invitation(text) TO authenticated, service_role, anon, postgres, public;
GRANT EXECUTE ON FUNCTION public.prexyon_update_member_role(uuid, uuid, text) TO authenticated, service_role, anon, postgres, public;
GRANT EXECUTE ON FUNCTION public.prexyon_update_member_status(uuid, uuid, boolean) TO authenticated, service_role, anon, postgres, public;
GRANT EXECUTE ON FUNCTION public.prexyon_update_member_access_and_permissions(uuid, uuid, text[], jsonb) TO authenticated, service_role, anon, postgres, public;
GRANT EXECUTE ON FUNCTION public.prexyon_get_organization_members_full(uuid) TO authenticated, service_role, anon, postgres, public;
GRANT EXECUTE ON FUNCTION public.prexyon_generate_sso_code(uuid, uuid, text) TO authenticated, service_role, anon, postgres, public;
