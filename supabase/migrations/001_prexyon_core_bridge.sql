-- =============================================================================
-- PREXYON PORTAL — MIGRATION: 001_prexyon_core_bridge.sql
-- Description: Infraestrutura Central Prexyon Aditiva & Segura sobre Supabase Unificado
-- Project: Prexyon Ecosystem Central Backend (Coexistência com OrçaGraf)
-- =============================================================================

-- 1. Extensões Essenciais
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enriquecimento Aditivo e Seguro de public.organizations (Se já existir, não quebra nada)
DO $$
BEGIN
    -- Adiciona coluna slug se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'slug'
    ) THEN
        ALTER TABLE public.organizations ADD COLUMN slug TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_slug ON public.organizations(slug) WHERE slug IS NOT NULL;
    END IF;

    -- Adiciona coluna owner_user_id se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'owner_user_id'
    ) THEN
        ALTER TABLE public.organizations ADD COLUMN owner_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- 3. Catálogo Oficial de Softwares do Ecossistema Prexyon
-- NOTA CRÍTICA: Nomeado 'prexyon_products' para evitar colisão com a tabela 'products' de itens comerciais da gráfica
CREATE TABLE IF NOT EXISTS public.prexyon_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL CHECK (code IN ('orcagraf', 'arteflow', 'artecheck')),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'coming_soon', 'maintenance', 'deprecated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 4. Habilitação Individual de Usuários aos Softwares Prexyon
CREATE TABLE IF NOT EXISTS public.prexyon_user_product_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_code TEXT NOT NULL REFERENCES public.prexyon_products(code) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_prexyon_user_prod_access UNIQUE (organization_id, user_id, product_code)
);

-- 5. Definições Granulares de Permissões por Software e Módulo
CREATE TABLE IF NOT EXISTS public.prexyon_permission_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code TEXT NOT NULL REFERENCES public.prexyon_products(code) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    permission_key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 6. Papéis (Roles) por Software do Ecossistema
CREATE TABLE IF NOT EXISTS public.prexyon_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE, -- NULL para papéis globais de sistema
    product_code TEXT NOT NULL REFERENCES public.prexyon_products(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_prexyon_role_name UNIQUE (organization_id, product_code, name)
);

-- 7. Permissões Vinculadas a Cada Papel
CREATE TABLE IF NOT EXISTS public.prexyon_role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.prexyon_roles(id) ON DELETE CASCADE,
    permission_definition_id UUID NOT NULL REFERENCES public.prexyon_permission_definitions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_prexyon_role_perm UNIQUE (role_id, permission_definition_id)
);

-- 8. Atribuição de Papel ao Usuário por Software
CREATE TABLE IF NOT EXISTS public.prexyon_user_product_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_code TEXT NOT NULL REFERENCES public.prexyon_products(code) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.prexyon_roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_prexyon_user_product_role UNIQUE (organization_id, user_id, product_code)
);

-- 9. Overrides Individuais de Permissão (Allow / Deny)
CREATE TABLE IF NOT EXISTS public.prexyon_user_permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    permission_definition_id UUID NOT NULL REFERENCES public.prexyon_permission_definitions(id) ON DELETE CASCADE,
    effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_prexyon_user_perm_override UNIQUE (organization_id, user_id, permission_definition_id)
);

-- 10. Convites de Membros para a Organização Prexyon
CREATE TABLE IF NOT EXISTS public.prexyon_organization_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    assigned_products JSONB NOT NULL DEFAULT '["orcagraf"]'::jsonb,
    membership_role TEXT NOT NULL DEFAULT 'member' CHECK (membership_role IN ('admin', 'member', 'guest')),
    token_hash TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Índices de Performance
CREATE INDEX IF NOT EXISTS idx_prexyon_upa_org_user ON public.prexyon_user_product_access(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_upr_org_user ON public.prexyon_user_product_roles(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_upo_org_user ON public.prexyon_user_permission_overrides(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_invites_org ON public.prexyon_organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_prexyon_invites_email ON public.prexyon_organization_invites(email);

-- =============================================================================
-- 11. FUNÇÕES HELPER COM NAMESPACE PREXYON (SECURITY DEFINER)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prexyon_is_org_member(p_org_id UUID, p_user_id UUID)
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
          AND is_active = true
          AND is_locked = false
    );
$$;

CREATE OR REPLACE FUNCTION public.prexyon_is_org_admin_or_owner(p_org_id UUID, p_user_id UUID)
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
          AND role IN ('owner'::public.user_role, 'admin'::public.user_role)
          AND is_active = true
          AND is_locked = false
    );
$$;

-- =============================================================================
-- 12. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE public.prexyon_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_user_product_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_permission_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_user_product_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prexyon_organization_invites ENABLE ROW LEVEL SECURITY;

-- Catálogo de Produtos e Definições de Permissões: Leitura para todos autenticados
CREATE POLICY "prexyon_products_select_auth" ON public.prexyon_products
FOR SELECT TO authenticated USING (true);

CREATE POLICY "prexyon_perm_defs_select_auth" ON public.prexyon_permission_definitions
FOR SELECT TO authenticated USING (true);

-- User Product Access
CREATE POLICY "prexyon_upa_select_member" ON public.prexyon_user_product_access
FOR SELECT TO authenticated USING (public.prexyon_is_org_member(organization_id, auth.uid()));

CREATE POLICY "prexyon_upa_write_admin" ON public.prexyon_user_product_access
FOR ALL TO authenticated
USING (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()));

-- Roles & Role Permissions
CREATE POLICY "prexyon_roles_select_auth" ON public.prexyon_roles
FOR SELECT TO authenticated
USING (
    is_system = true OR
    (organization_id IS NOT NULL AND public.prexyon_is_org_member(organization_id, auth.uid()))
);

CREATE POLICY "prexyon_roles_write_admin" ON public.prexyon_roles
FOR ALL TO authenticated
USING (organization_id IS NOT NULL AND public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (organization_id IS NOT NULL AND public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()));

CREATE POLICY "prexyon_role_perms_select_auth" ON public.prexyon_role_permissions
FOR SELECT TO authenticated USING (true);

-- User Product Roles
CREATE POLICY "prexyon_upr_select_member" ON public.prexyon_user_product_roles
FOR SELECT TO authenticated USING (public.prexyon_is_org_member(organization_id, auth.uid()));

CREATE POLICY "prexyon_upr_write_admin" ON public.prexyon_user_product_roles
FOR ALL TO authenticated
USING (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()));

-- User Permission Overrides
CREATE POLICY "prexyon_upo_select_member" ON public.prexyon_user_permission_overrides
FOR SELECT TO authenticated USING (public.prexyon_is_org_member(organization_id, auth.uid()));

CREATE POLICY "prexyon_upo_write_admin" ON public.prexyon_user_permission_overrides
FOR ALL TO authenticated
USING (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()));

-- Organization Invites
CREATE POLICY "prexyon_invites_admin" ON public.prexyon_organization_invites
FOR ALL TO authenticated
USING (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()))
WITH CHECK (public.prexyon_is_org_admin_or_owner(organization_id, auth.uid()));

-- =============================================================================
-- 13. SEED IDEMPOTENTE DO ECOSSISTEMA PREXYON
-- =============================================================================

-- Produtos Oficiais
INSERT INTO public.prexyon_products (code, name, description, status) VALUES
    ('orcagraf', 'OrçaGraf', 'Orçamentos, formação de preços e gestão comercial', 'active'),
    ('arteflow', 'ArteFlow', 'Gestão de produção, PCP, pedidos e financeiro operacional', 'active'),
    ('artecheck', 'ArteCheck', 'Análise técnica de arquivos gráficos e pré-impressão', 'active')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status;

-- Definições de Permissão - OrçaGraf
INSERT INTO public.prexyon_permission_definitions (product_code, module_key, permission_key, label, description) VALUES
    ('orcagraf', 'budgets', 'orcagraf.budgets.view', 'Visualizar orçamentos', 'Consulta propostas comerciais'),
    ('orcagraf', 'budgets', 'orcagraf.budgets.create', 'Criar orçamentos', 'Elabora novos orçamentos'),
    ('orcagraf', 'budgets', 'orcagraf.budgets.edit', 'Editar orçamentos', 'Altera orçamentos abertos'),
    ('orcagraf', 'budgets', 'orcagraf.budgets.delete', 'Excluir orçamentos', 'Remove propostas'),
    ('orcagraf', 'budgets', 'orcagraf.budgets.apply_discount', 'Aplicar descontos', 'Concede margens especiais'),
    ('orcagraf', 'clients', 'orcagraf.clients.view', 'Visualizar clientes', 'Consulta clientes cadastrados'),
    ('orcagraf', 'clients', 'orcagraf.clients.manage', 'Gerenciar clientes', 'Cadastra e edita clientes'),
    ('orcagraf', 'config', 'orcagraf.config.manage', 'Gerenciar custos', 'Altera tabelas de custo e markups')
ON CONFLICT (permission_key) DO NOTHING;

-- Definições de Permissão - ArteFlow
INSERT INTO public.prexyon_permission_definitions (product_code, module_key, permission_key, label, description) VALUES
    ('arteflow', 'orders', 'arteflow.orders.view', 'Visualizar ordens de serviço', 'Consulta fila geral de OS'),
    ('arteflow', 'orders', 'arteflow.orders.create', 'Criar ordens', 'Abre novos pedidos de produção'),
    ('arteflow', 'production', 'arteflow.production.move_stages', 'Avançar etapas', 'Move cartões no Kanban de produção'),
    ('arteflow', 'production', 'arteflow.production.reassign', 'Reatribuir operadores', 'Altera responsável pela máquina'),
    ('arteflow', 'finance', 'arteflow.finance.view', 'Visualizar financeiro', 'Consulta faturamento e títulos'),
    ('arteflow', 'finance', 'arteflow.finance.manage', 'Gerenciar pagamentos', 'Baixa títulos e conciliação')
ON CONFLICT (permission_key) DO NOTHING;

-- Definições de Permissão - ArteCheck
INSERT INTO public.prexyon_permission_definitions (product_code, module_key, permission_key, label, description) VALUES
    ('artecheck', 'analysis', 'artecheck.analysis.view', 'Visualizar laudos', 'Inspeciona conferência de arquivos'),
    ('artecheck', 'analysis', 'artecheck.analysis.create', 'Submeter arquivos', 'Executa pré-flight automático'),
    ('artecheck', 'analysis', 'artecheck.analysis.override_warnings', 'Aprovar com ressalvas', 'Libera impressão com avisos'),
    ('artecheck', 'reports', 'artecheck.reports.download', 'Baixar laudo em PDF', 'Gera laudo técnico certificado')
ON CONFLICT (permission_key) DO NOTHING;

-- Papéis Globais de Sistema (System Roles)
INSERT INTO public.prexyon_roles (product_code, name, description, is_system) VALUES
    ('orcagraf', 'Administrador Comercial', 'Acesso total a orçamentos, clientes e tabelas de custo', true),
    ('orcagraf', 'Vendedor / Comercial', 'Criação e edição de propostas, consulta a clientes', true),
    ('orcagraf', 'Consulta / Somente Leitura', 'Apenas visualização de propostas existentes', true),
    ('arteflow', 'Gerente de Produção & PCP', 'Controle da esteira de produção e financeiro', true),
    ('arteflow', 'Operador de Máquinas', 'Movimentação no Kanban e apontamento de produção', true),
    ('artecheck', 'Auditor de Pré-impressão', 'Aprovações técnicas com ressalvas e emissão de laudos', true),
    ('artecheck', 'Conferente Básico', 'Apenas upload e visualização de relatórios', true)
ON CONFLICT (organization_id, product_code, name) DO NOTHING;
