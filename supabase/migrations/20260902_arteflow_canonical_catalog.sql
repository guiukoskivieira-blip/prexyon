-- ==============================================================================
-- PREXYON — CATÁLOGO CANÔNICO DE PERMISSÕES: ARTEFLOW
-- 1. Inclusão idempotente da matriz canônica de 14 permissões do ArteFlow
-- 2. Preservação de aliases legados de produção para retrocompatibilidade
-- 3. ZERO concessão automática a usuários (Sem privilege expansion)
-- 4. ZERO alteração de billing, entitlements ou subscriptions
-- ==============================================================================

-- 1. Matriz Canônica de Permissões ArteFlow
INSERT INTO public.prexyon_permission_definitions (product_code, module_key, permission_key, label, description) VALUES
  ('arteflow', 'core', 'arteflow.view', 'Acesso Geral ao ArteFlow', 'Permite visualização do painel e módulos do ArteFlow'),
  ('arteflow', 'orders', 'arteflow.orders.view', 'Visualizar ordens de serviço', 'Permite consultar ordens de serviço em andamento'),
  ('arteflow', 'orders', 'arteflow.orders.create', 'Criar ordens de serviço', 'Permite cadastrar novas ordens de serviço'),
  ('arteflow', 'orders', 'arteflow.orders.edit', 'Editar ordens de serviço', 'Permite alterar ordens de serviço existentes'),
  ('arteflow', 'production', 'arteflow.production.view', 'Visualizar produção', 'Permite acompanhar esteira de produção e filas'),
  ('arteflow', 'production', 'arteflow.production.manage', 'Gerenciar produção', 'Permite movimentar etapas, apontar paradas e reatribuir operadores'),
  ('arteflow', 'inventory', 'arteflow.inventory.view', 'Visualizar estoque', 'Permite consultar saldos e movimentações de almoxarifado'),
  ('arteflow', 'inventory', 'arteflow.inventory.manage', 'Gerenciar estoque', 'Permite registrar entradas, saídas e ajustes de estoque'),
  ('arteflow', 'procurement', 'arteflow.procurement.view', 'Visualizar compras', 'Permite consultar pedidos de compra e suprimentos'),
  ('arteflow', 'procurement', 'arteflow.procurement.manage', 'Gerenciar compras', 'Permite emitir e aprovar pedidos para fornecedores'),
  ('arteflow', 'finance', 'arteflow.finance.view', 'Visualizar financeiro', 'Permite consultar contas a receber, faturamento e fluxo'),
  ('arteflow', 'finance', 'arteflow.finance.manage', 'Gerenciar financeiro', 'Permite lançar despesas, pagamentos e gerenciar faturamento'),
  ('arteflow', 'settings', 'arteflow.settings.manage', 'Configurações do ArteFlow', 'Permite configurar parâmetros gerais de fábrica e PCP'),
  ('arteflow', 'users', 'arteflow.users.manage', 'Gerenciar operadores e equipe', 'Permite gerenciar operadores e acessos da equipe do ArteFlow')
ON CONFLICT (permission_key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    module_key = EXCLUDED.module_key;

-- 2. Garantir que aliases legados permaneçam mapeados para compatibilidade histórica
INSERT INTO public.prexyon_permission_definitions (product_code, module_key, permission_key, label, description) VALUES
  ('arteflow', 'production', 'arteflow.production.move_stages', 'Avançar etapas [Legado]', 'Alias legado para movimentação de etapas fabris'),
  ('arteflow', 'production', 'arteflow.production.reassign', 'Reatribuir operadores [Legado]', 'Alias legado para reatribuição de operadores')
ON CONFLICT (permission_key) DO NOTHING;
