-- ==============================================================================
-- PREXYON — RPC PARA VISUALIZAÇÃO E VALIDAÇÃO SEGURA DE CONVITE (PREVIEW)
-- Permite que o frontend consulte os detalhes essenciais de um convite
-- a partir do token raw sem expor token_hash nem burlar RLS.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.prexyon_get_invitation_preview(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_computed_hash text;
  v_invitation record;
  v_org_name text;
  v_caller_id uuid := auth.uid();
  v_caller_email text;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TOKEN');
  END IF;

  -- 1. Calcular o SHA-256 do token
  v_computed_hash := encode(digest(p_token::bytea, 'sha256'), 'hex');

  -- 2. Localizar o convite pelo hash
  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE token_hash = v_computed_hash OR token_hash = p_token;

  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVITATION_NOT_FOUND');
  END IF;

  -- 3. Validação de Revogação
  IF v_invitation.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVITATION_REVOKED', 'revoked_at', v_invitation.revoked_at);
  END IF;

  -- 4. Validação Anti-Replay (Já aceito)
  IF v_invitation.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVITATION_ALREADY_USED', 'accepted_at', v_invitation.accepted_at);
  END IF;

  -- 5. Validação de Expiração
  IF v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVITATION_EXPIRED', 'expires_at', v_invitation.expires_at);
  END IF;

  -- 6. Validação de E-mail do Chamador (se autenticado)
  IF v_caller_id IS NOT NULL THEN
    SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;
    IF v_caller_email IS NOT NULL AND LOWER(TRIM(v_invitation.email)) <> LOWER(TRIM(v_caller_email)) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INVITATION_EMAIL_MISMATCH',
        'invitation_email', v_invitation.email,
        'caller_email', v_caller_email
      );
    END IF;
  END IF;

  -- 7. Buscar nome da organização
  SELECT COALESCE(trade_name, corporate_name, 'Organização') INTO v_org_name
  FROM public.organizations
  WHERE id = v_invitation.organization_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_invitation.id,
    'organization_id', v_invitation.organization_id,
    'organization_name', COALESCE(v_org_name, 'Prexyon'),
    'email', v_invitation.email,
    'role', v_invitation.role,
    'product_access', v_invitation.product_access,
    'permissions', v_invitation.permissions,
    'expires_at', v_invitation.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.prexyon_get_invitation_preview(text) TO authenticated, anon, service_role;
