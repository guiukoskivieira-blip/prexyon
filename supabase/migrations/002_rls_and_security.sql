-- ==============================================================================
-- PREXYON PORTAL — MIGRATION 002: ROW LEVEL SECURITY & POLÍTICAS DE PROTEÇÃO
-- ==============================================================================

-- 1. Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_product_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_product_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- 2. Funções Helper com SECURITY DEFINER (Previne recursão em RLS policies)

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND user_id = p_user_id
          AND status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin_or_owner(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = p_org_id
          AND user_id = p_user_id
          AND membership_role IN ('owner', 'admin')
          AND status = 'active'
    );
$$;

-- 3. Trigger de Proteção do Dono da Conta (Impede remover ou desativar o último Owner)
CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_active_owners_count INT;
BEGIN
    IF (TG_OP = 'DELETE' AND OLD.membership_role = 'owner') OR 
       (TG_OP = 'UPDATE' AND OLD.membership_role = 'owner' AND (NEW.membership_role != 'owner' OR NEW.status != 'active')) THEN
        
        SELECT COUNT(*)
        INTO v_active_owners_count
        FROM public.organization_members
        WHERE organization_id = OLD.organization_id
          AND membership_role = 'owner'
          AND status = 'active'
          AND id != OLD.id;

        IF v_active_owners_count = 0 THEN
            RAISE EXCEPTION 'Operação negada: A organização precisa ter pelo menos um Proprietário (Owner) ativo.';
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_last_owner ON public.organization_members;
CREATE TRIGGER trg_protect_last_owner
BEFORE UPDATE OR DELETE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.prevent_last_owner_removal();

-- 4. Políticas de Acesso (RLS Policies)

-- PROFILES
CREATE POLICY "Profiles: Usuário visualiza seu próprio perfil ou membros da mesma org"
ON public.profiles FOR SELECT
TO authenticated
USING (
    id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.organization_members om1
        JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.user_id = auth.uid() AND om2.user_id = profiles.id AND om1.status = 'active'
    )
);

CREATE POLICY "Profiles: Usuário atualiza seu próprio perfil"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Profiles: Usuário insere seu próprio perfil"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- ORGANIZATIONS
CREATE POLICY "Organizations: Membro visualiza sua organização"
ON public.organizations FOR SELECT
TO authenticated
USING (public.is_org_member(id, auth.uid()));

CREATE POLICY "Organizations: Admin/Owner atualiza dados da organização"
ON public.organizations FOR UPDATE
TO authenticated
USING (public.is_org_admin_or_owner(id, auth.uid()));

-- ORGANIZATION_MEMBERS
CREATE POLICY "OrgMembers: Membro visualiza colegas da organização"
ON public.organization_members FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "OrgMembers: Admin/Owner gerencia membros"
ON public.organization_members FOR ALL
TO authenticated
USING (public.is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.is_org_admin_or_owner(organization_id, auth.uid()));

-- PRODUCTS & PERMISSION_DEFINITIONS (Catálogo Público para Usuários Autenticados)
CREATE POLICY "Products: Leitura para usuários autenticados"
ON public.products FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "PermissionDefinitions: Leitura para usuários autenticados"
ON public.permission_definitions FOR SELECT
TO authenticated
USING (true);

-- SUBSCRIPTIONS & SUBSCRIPTION_PRODUCTS
CREATE POLICY "Subscriptions: Leitura para membros da organização"
ON public.subscriptions FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "SubscriptionProducts: Leitura para membros da organização"
ON public.subscription_products FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.id = subscription_products.subscription_id
          AND public.is_org_member(s.organization_id, auth.uid())
    )
);

-- USER_PRODUCT_ACCESS
CREATE POLICY "UserProductAccess: Leitura para membros da organização"
ON public.user_product_access FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "UserProductAccess: Admin/Owner gerencia acessos"
ON public.user_product_access FOR ALL
TO authenticated
USING (public.is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.is_org_admin_or_owner(organization_id, auth.uid()));

-- ROLES & ROLE_PERMISSIONS
CREATE POLICY "Roles: Leitura de papéis do sistema ou da organização"
ON public.roles FOR SELECT
TO authenticated
USING (
    is_system = true OR
    (organization_id IS NOT NULL AND public.is_org_member(organization_id, auth.uid()))
);

CREATE POLICY "Roles: Admin gerencia papéis customizados da organização"
ON public.roles FOR ALL
TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (organization_id IS NOT NULL AND public.is_org_admin_or_owner(organization_id, auth.uid()));

CREATE POLICY "RolePermissions: Leitura para usuários autenticados"
ON public.role_permissions FOR SELECT
TO authenticated
USING (true);

-- USER_PRODUCT_ROLES & USER_PERMISSION_OVERRIDES
CREATE POLICY "UserProductRoles: Leitura para membros da organização"
ON public.user_product_roles FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "UserProductRoles: Admin/Owner gerencia atribuições de papéis"
ON public.user_product_roles FOR ALL
TO authenticated
USING (public.is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.is_org_admin_or_owner(organization_id, auth.uid()));

CREATE POLICY "UserPermissionOverrides: Leitura para membros da organização"
ON public.user_permission_overrides FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "UserPermissionOverrides: Admin/Owner gerencia overrides"
ON public.user_permission_overrides FOR ALL
TO authenticated
USING (public.is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.is_org_admin_or_owner(organization_id, auth.uid()));

-- ORGANIZATION_INVITES
CREATE POLICY "OrgInvites: Admin/Owner gerencia convites"
ON public.organization_invites FOR ALL
TO authenticated
USING (public.is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.is_org_admin_or_owner(organization_id, auth.uid()));
