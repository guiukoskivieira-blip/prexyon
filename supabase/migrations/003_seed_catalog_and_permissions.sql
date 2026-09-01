-- ==============================================================================
-- PREXYON PORTAL — MIGRATION 003: SEED DE PRODUTOS, PERMISSÕES & ROLES NATIVOS
-- ==============================================================================

-- 1. Inserção de Produtos Oficiais
INSERT INTO public.products (id, code, name, status) VALUES
    ('11111111-1111-1111-1111-111111111111', 'orcagraf', 'OrçaGraf', 'active'),
    ('22222222-2222-2222-2222-222222222222', 'arteflow', 'ArteFlow', 'active'),
    ('33333333-3333-3333-3333-333333333333', 'artecheck', 'ArteCheck', 'active')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

-- 2. Inserção das Definições Granulares de Permissão

-- 2.1 OrçaGraf
INSERT INTO public.permission_definitions (id, product_id, module_key, permission_key, label, description) VALUES
    ('a0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'budgets', 'orcagraf.budgets.view', 'Visualizar orçamentos', 'Permite consultar o histórico e detalhes dos orçamentos comerciais'),
    ('a0000001-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'budgets', 'orcagraf.budgets.create', 'Criar orçamentos', 'Permite formular novos orçamentos com base na tabela de custos'),
    ('a0000001-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'budgets', 'orcagraf.budgets.edit', 'Editar orçamentos', 'Permite alterar valores e parâmetros de orçamentos em aberto'),
    ('a0000001-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'budgets', 'orcagraf.budgets.delete', 'Excluir orçamentos', 'Permite excluir propostas e orçamentos do sistema'),
    ('a0000001-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'budgets', 'orcagraf.budgets.apply_discount', 'Aplicar descontos', 'Permite conceder margens especiais e descontos na proposta'),
    ('a0000001-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'clients', 'orcagraf.clients.view', 'Visualizar clientes', 'Permite consultar carteira de clientes e histórico de compras'),
    ('a0000001-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'clients', 'orcagraf.clients.manage', 'Gerenciar clientes', 'Permite cadastrar, atualizar e inativar registros de clientes'),
    ('a0000001-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'config', 'orcagraf.config.manage', 'Configurar tabelas de custo', 'Permite modificar markups, custos de papéis, chapas e tintas')
ON CONFLICT (permission_key) DO NOTHING;

-- 2.2 ArteFlow
INSERT INTO public.permission_definitions (id, product_id, module_key, permission_key, label, description) VALUES
    ('b0000001-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'orders', 'arteflow.orders.view', 'Visualizar ordens de serviço', 'Permite consultar a fila geral de OS e prazos de entrega'),
    ('b0000001-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'orders', 'arteflow.orders.create', 'Criar novas ordens', 'Permite dar entrada em pedidos de produção na fábrica'),
    ('b0000001-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'production', 'arteflow.production.move_stages', 'Avançar etapas no Kanban', 'Permite mover cartões nas colunas de corte, impressão e acabamento'),
    ('b0000001-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'production', 'arteflow.production.reassign', 'Reatribuir operadores', 'Permite alterar operador de máquina ou responsável técnico'),
    ('b0000001-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'finance', 'arteflow.finance.view', 'Visualizar financeiro', 'Permite consultar relatórios de contas a receber e faturamento'),
    ('b0000001-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'finance', 'arteflow.finance.manage', 'Gerenciar pagamentos', 'Permite dar baixa em títulos, estornos e conciliação bancária')
ON CONFLICT (permission_key) DO NOTHING;

-- 2.3 ArteCheck
INSERT INTO public.permission_definitions (id, product_id, module_key, permission_key, label, description) VALUES
    ('c0000001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'analysis', 'artecheck.analysis.view', 'Visualizar análises de arquivos', 'Permite inspecionar relatórios técnicos de PDF e artes enviadas'),
    ('c0000001-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'analysis', 'artecheck.analysis.create', 'Submeter arquivos para pré-flight', 'Permite fazer upload de arquivos e rodar conferência automática'),
    ('c0000001-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'analysis', 'artecheck.analysis.override_warnings', 'Aprovar com ressalvas', 'Permite autorizar impressão mesmo com avisos técnicos não impeditivos'),
    ('c0000001-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'reports', 'artecheck.reports.download', 'Baixar laudo técnico em PDF', 'Permite gerar certificado de aprovação técnica para o cliente')
ON CONFLICT (permission_key) DO NOTHING;

-- 3. Perfis do Sistema (System Roles)

-- OrçaGraf Roles
INSERT INTO public.roles (id, organization_id, product_id, name, description, is_system) VALUES
    ('r1111111-0000-0000-0000-000000000001', NULL, '11111111-1111-1111-1111-111111111111', 'Administrador Comercial', 'Acesso irrestrito a orçamentos, clientes e tabelas de custo', true),
    ('r1111111-0000-0000-0000-000000000002', NULL, '11111111-1111-1111-1111-111111111111', 'Vendedor / Comercial', 'Criação e edição de orçamentos e consulta a clientes', true),
    ('r1111111-0000-0000-0000-000000000003', NULL, '11111111-1111-1111-1111-111111111111', 'Consulta / Somente Leitura', 'Apenas visualização de propostas existentes', true),

-- ArteFlow Roles
    ('r2222222-0000-0000-0000-000000000001', NULL, '22222222-2222-2222-2222-222222222222', 'Gerente de Produção & PCP', 'Controle total da esteira produtiva e financeiro', true),
    ('r2222222-0000-0000-0000-000000000002', NULL, '22222222-2222-2222-2222-222222222222', 'Operador de Máquinas', 'Movimentação de etapas e apontamento de produção', true),
    ('r2222222-0000-0000-0000-000000000003', NULL, '22222222-2222-2222-2222-222222222222', 'Financeiro & Faturamento', 'Gestão de contas a receber e baixas', true),

-- ArteCheck Roles
    ('r3333333-0000-0000-0000-000000000001', NULL, '33333333-3333-3333-3333-333333333333', 'Auditor de Pré-impressão', 'Execução de testes, aprovações com ressalvas e laudos', true),
    ('r3333333-0000-0000-0000-000000000002', NULL, '33333333-3333-3333-3333-333333333333', 'Conferente Básico', 'Apenas upload e consulta de relatórios', true)
ON CONFLICT DO NOTHING;

-- 4. Associação de Permissões aos Roles de Sistema

-- Vendedor / Comercial no OrçaGraf
INSERT INTO public.role_permissions (role_id, permission_definition_id) VALUES
    ('r1111111-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001'), -- orcagraf.budgets.view
    ('r1111111-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002'), -- orcagraf.budgets.create
    ('r1111111-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000003'), -- orcagraf.budgets.edit
    ('r1111111-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000005'), -- orcagraf.budgets.apply_discount
    ('r1111111-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000006'), -- orcagraf.clients.view
    ('r1111111-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000007')  -- orcagraf.clients.manage
ON CONFLICT DO NOTHING;

-- Administrador Comercial no OrçaGraf (Todas as permissões)
INSERT INTO public.role_permissions (role_id, permission_definition_id)
SELECT 'r1111111-0000-0000-0000-000000000001', id
FROM public.permission_definitions
WHERE product_id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

-- Gerente de Produção no ArteFlow (Todas as permissões do ArteFlow)
INSERT INTO public.role_permissions (role_id, permission_definition_id)
SELECT 'r2222222-0000-0000-0000-000000000001', id
FROM public.permission_definitions
WHERE product_id = '22222222-2222-2222-2222-222222222222'
ON CONFLICT DO NOTHING;

-- Operador no ArteFlow
INSERT INTO public.role_permissions (role_id, permission_definition_id) VALUES
    ('r2222222-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000001'), -- orders.view
    ('r2222222-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000003')  -- production.move_stages
ON CONFLICT DO NOTHING;

-- Auditor de Pré-impressão no ArteCheck (Todas as permissões)
INSERT INTO public.role_permissions (role_id, permission_definition_id)
SELECT 'r3333333-0000-0000-0000-000000000001', id
FROM public.permission_definitions
WHERE product_id = '33333333-3333-3333-3333-333333333333'
ON CONFLICT DO NOTHING;
