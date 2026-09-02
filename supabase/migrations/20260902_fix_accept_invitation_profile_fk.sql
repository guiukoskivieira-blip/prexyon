-- ==============================================================================
-- PREXYON: FIX CRÍTICO FK organization_members_user_id_fkey NO ACEITE DE CONVITES
-- Garante a criação/sincronização do profile do usuário antes do insert em organization_members.
-- ==============================================================================

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
  v_user_meta jsonb;
  v_invitation record;
  v_prod text;
  v_prod_key text;
  v_perm_key text;
  v_perm_array jsonb;
  v_computed_hash text;
  v_full_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT email, raw_user_meta_data INTO v_user_email, v_user_meta FROM auth.users WHERE id = v_user_id;

  -- 1. Calcular o hash SHA-256 do token recebido
  v_computed_hash := encode(digest(p_token_hash::bytea, 'sha256'), 'hex');

  -- 2. Buscar convite pelo hash no banco (com fallback seguro para match direto caso fornecido o hash)
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

  -- 6. Validação de E-mail do Destinatário
  IF LOWER(TRIM(v_invitation.email)) <> LOWER(TRIM(v_user_email)) THEN
    RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH: Authenticated user email does not match invitation recipient' USING ERRCODE = '42501';
  END IF;

  -- 7. Sincronização / Criação Canônica do Profile do Usuário
  -- Garante integridade referencial com a FK organization_members_user_id_fkey -> public.profiles(id)
  v_full_name := COALESCE(
    v_user_meta->>'full_name',
    v_user_meta->>'name',
    split_part(v_user_email, '@', 1),
    'Usuário'
  );

  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_full_name,
    v_user_email,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(profiles.full_name, EXCLUDED.full_name),
    updated_at = now();

  -- 8. Inserir ou atualizar membership na organização convidada
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

  -- 9. Inserir acessos a produtos
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

  -- 10. Inserir permissões granulares
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

  -- 11. Marcar convite como aceito (Atomicamente)
  UPDATE public.organization_invitations
  SET accepted_at = now()
  WHERE id = v_invitation.id;

  -- 12. Trilha de Auditoria
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

GRANT EXECUTE ON FUNCTION public.prexyon_accept_invitation(text) TO authenticated, service_role;
