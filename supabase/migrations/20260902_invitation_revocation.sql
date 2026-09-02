-- ==============================================================================
-- PREXYON: REVOGAÇÃO SEGURA DE CONVITES (MIGRATION)
-- ==============================================================================

-- 1. Adicionar colunas de revogação em public.organization_invitations
ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS revoked_by uuid NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revocation_reason text NULL;

-- 2. Atualizar public.prexyon_accept_invitation para rejeitar convites revogados
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

  -- 3. Validação de Revogação (Fail-Closed)
  IF v_invitation.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVITATION_REVOKED: This invitation was revoked and can no longer be used' USING ERRCODE = 'P0005';
  END IF;

  -- 4. Validação Anti-Replay
  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVITATION_ALREADY_USED: This invitation has already been accepted' USING ERRCODE = 'P0003';
  END IF;

  -- 5. Validação de Expiração
  IF v_invitation.expires_at < now() THEN
    RAISE EXCEPTION 'INVITATION_EXPIRED: This invitation has expired' USING ERRCODE = 'P0004';
  END IF;

  -- 6. Validação de E-mail
  IF LOWER(TRIM(v_invitation.email)) <> LOWER(TRIM(v_user_email)) THEN
    RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH: Authenticated user email does not match invitation recipient' USING ERRCODE = '42501';
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

  -- 10. Marcar convite como aceito (Atomicamente)
  UPDATE public.organization_invitations
  SET accepted_at = now()
  WHERE id = v_invitation.id;

  -- 11. Auditoria
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

-- 3. RPC DE REVOGAÇÃO SEGURA DE CONVITE
CREATE OR REPLACE FUNCTION public.prexyon_revoke_invitation(
  p_invitation_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_invitation record;
  v_actor_role text;
BEGIN
  -- 1. Validar autenticação
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- 2. Buscar convite existente
  SELECT id, organization_id, email, accepted_at, revoked_at
  INTO v_invitation
  FROM public.organization_invitations
  WHERE id = p_invitation_id;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND: Invitation does not exist' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Validar papel do emissor na organização do convite (Cross-tenant & Role check)
  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE organization_id = v_invitation.organization_id
    AND user_id = v_actor_id
    AND is_active = true;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only owners and admins can revoke invitations' USING ERRCODE = '42501';
  END IF;

  -- 4. Convite já aceito não pode ser revogado
  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'CANNOT_REVOKE_ACCEPTED_INVITATION: Invitation has already been accepted and cannot be revoked' USING ERRCODE = 'P0003';
  END IF;

  -- 5. Idempotência: Se já estiver revogado, retornar status consistente
  IF v_invitation.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_revoked', true,
      'invitation_id', p_invitation_id,
      'revoked_at', v_invitation.revoked_at
    );
  END IF;

  -- 6. Executar revogação lógica no banco (NUNCA deletar fisicamente)
  UPDATE public.organization_invitations
  SET
    revoked_at = now(),
    revoked_by = v_actor_id,
    revocation_reason = p_reason
  WHERE id = p_invitation_id;

  -- 7. Registrar trilha completa de auditoria com actor real
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
    v_actor_id,
    'invitation_revoked',
    'invitation',
    p_invitation_id::text,
    jsonb_build_object(
      'email', v_invitation.email,
      'reason', p_reason,
      'revoked_by', v_actor_id
    ),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'invitation_id', p_invitation_id,
    'revoked_at', now(),
    'revoked_by', v_actor_id
  );
END;
$$;

-- 4. Permissões e ACL da RPC de Revogação
REVOKE ALL ON FUNCTION public.prexyon_revoke_invitation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prexyon_revoke_invitation(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.prexyon_revoke_invitation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prexyon_revoke_invitation(uuid, text) TO service_role;
