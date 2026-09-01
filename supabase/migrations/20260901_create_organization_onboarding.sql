-- ==============================================================================
-- PREXYON — ETAPA 5: ONBOARDING TRANSACTIONAL RPC
-- Criação atômica de organização + membership owner + atualização de perfil
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.prexyon_create_organization(
  p_trade_name text,
  p_corporate_name text DEFAULT NULL::text,
  p_document text DEFAULT NULL::text,
  p_full_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_clean_trade_name text;
  v_clean_corporate_name text;
  v_clean_document text;
  v_clean_full_name text;
  v_org_id uuid;
  v_slug text;
  v_result jsonb;
BEGIN
  -- 1. Obter usuário autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- Obter e-mail do usuário autenticado
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- 2. Sanitização e Validação dos Dados
  v_clean_trade_name := NULLIF(TRIM(p_trade_name), '');
  IF v_clean_trade_name IS NULL THEN
    RAISE EXCEPTION 'TRADE_NAME_REQUIRED' USING ERRCODE = '23502';
  END IF;

  v_clean_corporate_name := NULLIF(TRIM(p_corporate_name), '');
  IF v_clean_corporate_name IS NULL THEN
    v_clean_corporate_name := v_clean_trade_name;
  END IF;

  v_clean_document := NULLIF(TRIM(p_document), '');
  v_clean_full_name := NULLIF(TRIM(p_full_name), '');

  -- 3. Idempotência / Prevenção de Criação Dupla por Duplo Clique
  -- Se o usuário já possuir uma organização ativa, retorna a organização existente
  SELECT om.organization_id INTO v_org_id
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = v_user_id AND om.is_active = true AND o.is_active = true
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    -- Atualiza o perfil caso tenha sido passado o nome completo
    IF v_clean_full_name IS NOT NULL THEN
      INSERT INTO public.profiles (id, full_name, email, created_at, updated_at)
      VALUES (v_user_id, v_clean_full_name, v_user_email, now(), now())
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now();
    END IF;

    SELECT jsonb_build_object(
      'id', o.id,
      'name', COALESCE(o.trade_name, o.corporate_name),
      'tradeName', COALESCE(o.trade_name, o.corporate_name),
      'corporateName', o.corporate_name,
      'document', o.document,
      'status', CASE WHEN o.is_active THEN 'active' ELSE 'suspended' END,
      'alreadyExisted', true
    ) INTO v_result
    FROM public.organizations o
    WHERE o.id = v_org_id;

    RETURN v_result;
  END IF;

  -- 4. Gerar slug único
  v_slug := LOWER(REGEXP_REPLACE(v_clean_trade_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := TRIM(BOTH '-' FROM v_slug);
  IF v_slug = '' THEN
    v_slug := 'org';
  END IF;
  v_slug := v_slug || '-' || SUBSTRING(gen_random_uuid()::text, 1, 8);

  -- 5. Inserir Organização
  INSERT INTO public.organizations (
    trade_name,
    corporate_name,
    document,
    slug,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    v_clean_trade_name,
    v_clean_corporate_name,
    v_clean_document,
    v_slug,
    true,
    now(),
    now()
  )
  RETURNING id INTO v_org_id;

  -- 6. Atualizar / Inserir Profile do Usuário (garante integridade referencial antes de organization_members)
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    COALESCE(v_clean_full_name, v_user_email),
    v_user_email,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    updated_at = now();

  -- 7. Inserir Membership como OWNER
  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role,
    is_active,
    is_locked,
    created_at,
    updated_at
  ) VALUES (
    v_org_id,
    v_user_id,
    'owner',
    true,
    false,
    now(),
    now()
  );

  -- 8. Retornar dados da organização criada
  SELECT jsonb_build_object(
    'id', o.id,
    'name', COALESCE(o.trade_name, o.corporate_name),
    'tradeName', COALESCE(o.trade_name, o.corporate_name),
    'corporateName', o.corporate_name,
    'document', o.document,
    'status', 'active',
    'alreadyExisted', false
  ) INTO v_result
  FROM public.organizations o
  WHERE o.id = v_org_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prexyon_create_organization TO authenticated, service_role, anon, postgres;
