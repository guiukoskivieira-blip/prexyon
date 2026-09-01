/**
 * ==============================================================================
 * PREXYON — MATRIZ DE PERMISSÕES E PRESETS OFICIAIS (ETAPA 6)
 * ==============================================================================
 */

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
  category: string;
}

export interface ProductPermissionSchema {
  productId: 'orcagraf' | 'arteflow' | 'artecheck';
  productName: string;
  themeColor: 'emerald' | 'sky' | 'purple';
  categories: {
    id: string;
    label: string;
    permissions: PermissionDefinition[];
  }[];
  presets: {
    id: string;
    name: string;
    description: string;
    permissions: string[];
  }[];
}

export const PERMISSIONS_MATRIX: Record<'orcagraf' | 'arteflow' | 'artecheck', ProductPermissionSchema> = {
  orcagraf: {
    productId: 'orcagraf',
    productName: 'OrçaGraf',
    themeColor: 'emerald',
    categories: [
      {
        id: 'general',
        label: 'Acesso Geral',
        permissions: [
          { key: 'orcagraf.view', label: 'Visualizar Módulo', description: 'Permite acessar a interface do OrçaGraf', category: 'general' },
        ],
      },
      {
        id: 'quotes',
        label: 'Orçamentos & Propostas',
        permissions: [
          { key: 'orcagraf.quotes.view', label: 'Visualizar Orçamentos', description: 'Consultar propostas e orçamentos emitidos', category: 'quotes' },
          { key: 'orcagraf.quotes.create', label: 'Criar Orçamentos', description: 'Gerar novos orçamentos comerciais', category: 'quotes' },
          { key: 'orcagraf.quotes.edit', label: 'Editar Orçamentos', description: 'Alterar itens, quantidades e acabamentos', category: 'quotes' },
          { key: 'orcagraf.quotes.approve', label: 'Aprovar Orçamentos', description: 'Conceder aprovação comercial de propostas', category: 'quotes' },
          { key: 'orcagraf.quotes.delete', label: 'Excluir Orçamentos', description: 'Remover orçamentos cancelados ou inválidos', category: 'quotes' },
        ],
      },
      {
        id: 'clients',
        label: 'Clientes & Contatos',
        permissions: [
          { key: 'orcagraf.clients.view', label: 'Visualizar Clientes', description: 'Consultar carteira de clientes e histórico', category: 'clients' },
          { key: 'orcagraf.clients.manage', label: 'Gerenciar Clientes', description: 'Cadastrar, editar e inativar clientes', category: 'clients' },
        ],
      },
      {
        id: 'products_pricing',
        label: 'Produtos & Precificação',
        permissions: [
          { key: 'orcagraf.products.view', label: 'Visualizar Produtos', description: 'Consultar catálogo de produtos gráficos', category: 'products_pricing' },
          { key: 'orcagraf.products.manage', label: 'Gerenciar Produtos', description: 'Cadastrar e editar parâmetros de produtos', category: 'products_pricing' },
          { key: 'orcagraf.pricing.manage', label: 'Tabelas de Custo & Margem', description: 'Ajustar taxas de hora-máquina e markup', category: 'products_pricing' },
          { key: 'orcagraf.settings.manage', label: 'Configurações do OrçaGraf', description: 'Parâmetros avançados do motor de cálculo', category: 'products_pricing' },
        ],
      },
    ],
    presets: [
      {
        id: 'preset_view',
        name: 'Visualização',
        description: 'Apenas consulta de propostas e clientes sem edição.',
        permissions: ['orcagraf.view', 'orcagraf.quotes.view', 'orcagraf.clients.view', 'orcagraf.products.view'],
      },
      {
        id: 'preset_comercial',
        name: 'Comercial',
        description: 'Emissão e edição de orçamentos e gestão de clientes.',
        permissions: ['orcagraf.view', 'orcagraf.quotes.view', 'orcagraf.quotes.create', 'orcagraf.quotes.edit', 'orcagraf.clients.view', 'orcagraf.clients.manage', 'orcagraf.products.view'],
      },
      {
        id: 'preset_gerente',
        name: 'Gerente Comercial',
        description: 'Aprovação de propostas, alteração de margens e produtos.',
        permissions: [
          'orcagraf.view',
          'orcagraf.quotes.view',
          'orcagraf.quotes.create',
          'orcagraf.quotes.edit',
          'orcagraf.quotes.approve',
          'orcagraf.clients.view',
          'orcagraf.clients.manage',
          'orcagraf.products.view',
          'orcagraf.products.manage',
          'orcagraf.pricing.manage',
        ],
      },
      {
        id: 'preset_admin',
        name: 'Administrador',
        description: 'Acesso irrestrito a todos os recursos e configurações.',
        permissions: [
          'orcagraf.view',
          'orcagraf.quotes.view',
          'orcagraf.quotes.create',
          'orcagraf.quotes.edit',
          'orcagraf.quotes.approve',
          'orcagraf.quotes.delete',
          'orcagraf.clients.view',
          'orcagraf.clients.manage',
          'orcagraf.products.view',
          'orcagraf.products.manage',
          'orcagraf.pricing.manage',
          'orcagraf.settings.manage',
        ],
      },
    ],
  },

  arteflow: {
    productId: 'arteflow',
    productName: 'ArteFlow',
    themeColor: 'sky',
    categories: [
      {
        id: 'general',
        label: 'Acesso Geral',
        permissions: [
          { key: 'arteflow.view', label: 'Visualizar Módulo', description: 'Acessar o painel e kanban de ordens', category: 'general' },
        ],
      },
      {
        id: 'orders_production',
        label: 'Ordens & Produção (PCP)',
        permissions: [
          { key: 'arteflow.orders.view', label: 'Visualizar Ordens', description: 'Consultar ordens de serviço em andamento', category: 'orders_production' },
          { key: 'arteflow.orders.manage', label: 'Gerenciar Ordens', description: 'Criar, alterar e cancelar ordens', category: 'orders_production' },
          { key: 'arteflow.production.view', label: 'Visualizar Produção', description: 'Acompanhar esteira de máquinas e filas', category: 'orders_production' },
          { key: 'arteflow.production.manage', label: 'Movimentar Produção', description: 'Avançar etapas e registrar apontamentos', category: 'orders_production' },
          { key: 'arteflow.stages.manage', label: 'Configurar Etapas / Setores', description: 'Criar e ordenar etapas do fluxo fabril', category: 'orders_production' },
        ],
      },
      {
        id: 'materials_stock',
        label: 'Materiais, Estoque & Compras',
        permissions: [
          { key: 'arteflow.materials.view', label: 'Visualizar Materiais', description: 'Consultar insumos e substratos cadastrados', category: 'materials_stock' },
          { key: 'arteflow.materials.manage', label: 'Gerenciar Materiais', description: 'Cadastrar e editar fichas técnicas de insumos', category: 'materials_stock' },
          { key: 'arteflow.stock.view', label: 'Visualizar Estoque', description: 'Consultar saldos e movimentações de almoxarifado', category: 'materials_stock' },
          { key: 'arteflow.stock.manage', label: 'Movimentar Estoque', description: 'Registrar entradas, saídas e inventários', category: 'materials_stock' },
          { key: 'arteflow.purchases.view', label: 'Visualizar Compras', description: 'Consultar pedidos de compra de matérias-primas', category: 'materials_stock' },
          { key: 'arteflow.purchases.manage', label: 'Gerenciar Compras', description: 'Emitir e aprovar pedidos para fornecedores', category: 'materials_stock' },
          { key: 'arteflow.suppliers.view', label: 'Visualizar Fornecedores', description: 'Consultar catálogo de fornecedores', category: 'materials_stock' },
          { key: 'arteflow.suppliers.manage', label: 'Gerenciar Fornecedores', description: 'Cadastrar e homologar fornecedores', category: 'materials_stock' },
        ],
      },
      {
        id: 'shipping_settings',
        label: 'Expedição & Configurações',
        permissions: [
          { key: 'arteflow.shipping.view', label: 'Visualizar Expedição', description: 'Consultar pacotes prontos para despacho', category: 'shipping_settings' },
          { key: 'arteflow.shipping.manage', label: 'Gerenciar Despachos', description: 'Registrar coletas, entregas e rastreios', category: 'shipping_settings' },
          { key: 'arteflow.settings.manage', label: 'Configurações da Fábrica', description: 'Parâmetros gerais de PCP e automação', category: 'shipping_settings' },
        ],
      },
    ],
    presets: [
      {
        id: 'preset_view',
        name: 'Visualização',
        description: 'Apenas acompanhamento de ordens e esteira.',
        permissions: ['arteflow.view', 'arteflow.orders.view', 'arteflow.production.view'],
      },
      {
        id: 'preset_producao',
        name: 'Produção',
        description: 'Operadores de máquina e apontamento de produção.',
        permissions: ['arteflow.view', 'arteflow.orders.view', 'arteflow.production.view', 'arteflow.production.manage', 'arteflow.materials.view'],
      },
      {
        id: 'preset_lider_producao',
        name: 'Líder de Produção',
        description: 'Gestão da esteira, movimentação de estoque e expedição.',
        permissions: [
          'arteflow.view',
          'arteflow.orders.view',
          'arteflow.production.view',
          'arteflow.production.manage',
          'arteflow.stages.manage',
          'arteflow.materials.view',
          'arteflow.stock.view',
          'arteflow.stock.manage',
          'arteflow.shipping.view',
          'arteflow.shipping.manage',
        ],
      },
      {
        id: 'preset_operacional_completo',
        name: 'Operacional Completo',
        description: 'Gestão total de PCP, suprimentos, compras e logística.',
        permissions: [
          'arteflow.view',
          'arteflow.orders.view',
          'arteflow.orders.manage',
          'arteflow.production.view',
          'arteflow.production.manage',
          'arteflow.stages.manage',
          'arteflow.materials.view',
          'arteflow.materials.manage',
          'arteflow.stock.view',
          'arteflow.stock.manage',
          'arteflow.purchases.view',
          'arteflow.purchases.manage',
          'arteflow.suppliers.view',
          'arteflow.suppliers.manage',
          'arteflow.shipping.view',
          'arteflow.shipping.manage',
        ],
      },
      {
        id: 'preset_admin',
        name: 'Administrador',
        description: 'Acesso integral incluindo configurações do sistema.',
        permissions: [
          'arteflow.view',
          'arteflow.orders.view',
          'arteflow.orders.manage',
          'arteflow.production.view',
          'arteflow.production.manage',
          'arteflow.stages.manage',
          'arteflow.materials.view',
          'arteflow.materials.manage',
          'arteflow.stock.view',
          'arteflow.stock.manage',
          'arteflow.purchases.view',
          'arteflow.purchases.manage',
          'arteflow.suppliers.view',
          'arteflow.suppliers.manage',
          'arteflow.shipping.view',
          'arteflow.shipping.manage',
          'arteflow.settings.manage',
        ],
      },
    ],
  },

  artecheck: {
    productId: 'artecheck',
    productName: 'ArteCheck',
    themeColor: 'purple',
    categories: [
      {
        id: 'general',
        label: 'Acesso Geral',
        permissions: [
          { key: 'artecheck.view', label: 'Visualizar Módulo', description: 'Acessar painel de inspeção de arquivos', category: 'general' },
        ],
      },
      {
        id: 'preflight',
        label: 'Análise de Preflight & Relatórios',
        permissions: [
          { key: 'artecheck.analysis.view', label: 'Visualizar Análises', description: 'Consultar laudos técnicos de pré-impressão', category: 'preflight' },
          { key: 'artecheck.analysis.create', label: 'Executar Pré-voo', description: 'Fazer upload de PDFs e rodar auditoria técnica', category: 'preflight' },
          { key: 'artecheck.analysis.delete', label: 'Excluir Laudos', description: 'Remover histórico de análises de arquivos', category: 'preflight' },
          { key: 'artecheck.reports.view', label: 'Visualizar Relatórios', description: 'Ver detalhes de fontes, sangrias e cores', category: 'preflight' },
          { key: 'artecheck.reports.download', label: 'Exportar Relatórios', description: 'Baixar laudos técnicos em PDF', category: 'preflight' },
          { key: 'artecheck.history.view', label: 'Histórico de Inspeções', description: 'Auditar arquivos passados e versões', category: 'preflight' },
          { key: 'artecheck.settings.manage', label: 'Configurações de Tolerância', description: 'Definir perfis de cor e limites de corte', category: 'preflight' },
        ],
      },
    ],
    presets: [
      {
        id: 'preset_view',
        name: 'Visualização',
        description: 'Consulta de laudos e relatórios existentes.',
        permissions: ['artecheck.view', 'artecheck.analysis.view', 'artecheck.reports.view'],
      },
      {
        id: 'preset_operador',
        name: 'Operador',
        description: 'Upload de arquivos, execução de testes e download de relatórios.',
        permissions: ['artecheck.view', 'artecheck.analysis.view', 'artecheck.analysis.create', 'artecheck.reports.view', 'artecheck.reports.download'],
      },
      {
        id: 'preset_pre_impressao',
        name: 'Pré-impressão',
        description: 'Auditoria avançada, exclusão de laudos e histórico.',
        permissions: [
          'artecheck.view',
          'artecheck.analysis.view',
          'artecheck.analysis.create',
          'artecheck.analysis.delete',
          'artecheck.reports.view',
          'artecheck.reports.download',
          'artecheck.history.view',
        ],
      },
      {
        id: 'preset_admin',
        name: 'Administrador',
        description: 'Acesso total incluindo parâmetros de tolerância.',
        permissions: [
          'artecheck.view',
          'artecheck.analysis.view',
          'artecheck.analysis.create',
          'artecheck.analysis.delete',
          'artecheck.reports.view',
          'artecheck.reports.download',
          'artecheck.history.view',
          'artecheck.settings.manage',
        ],
      },
    ],
  },
};
