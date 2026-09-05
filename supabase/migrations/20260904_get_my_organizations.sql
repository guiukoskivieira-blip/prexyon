-- ==============================================================================
-- PREXYON — HOTFIX P1: TENANT DISCOVERY & MULTI-TENANT SWITCHING
-- Function: prexyon_get_my_organizations()
-- Identifica com segurança todas as organizações ativas às quais o usuário
-- autenticado (auth.uid()) pertence com membership ativo e desbloqueado.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.prexyon_get_my_organizations()
RETURNS TABLE (
  organization_id uuid,
  name text,
  trade_name text,
  corporate_name text,
  slug text,
  document text,
  role text,
  is_active boolean,
  is_locked boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- 1. Identificar usuário autenticado (Zero Impersonação)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Retornar apenas organizações ativas com membership ativo e não-bloqueado
  RETURN QUERY
  SELECT 
    o.id AS organization_id,
    COALESCE(o.trade_name, o.corporate_name, 'Organização')::text AS name,
    o.trade_name::text,
    o.corporate_name::text,
    o.slug::text,
    o.document::text,
    om.role::text AS role,
    o.is_active,
    COALESCE(om.is_locked, false) AS is_locked,
    o.created_at,
    o.updated_at
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = v_user_id
    AND om.is_active = true
    AND (om.is_locked IS NULL OR om.is_locked = false)
    AND o.is_active = true
  ORDER BY om.created_at ASC;
END;
$$;

-- Permissões de execução estritas
GRANT EXECUTE ON FUNCTION public.prexyon_get_my_organizations() TO authenticated, service_role;
