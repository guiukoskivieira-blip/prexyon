import { ProductPermissionSchema } from '../types/permission';

export const mockProductPermissionSchemas: ProductPermissionSchema[] = [
  {
    productId: 'orcagraf',
    productName: 'OrçaGraf',
    modules: [
      {
        moduleId: 'orc_quotes',
        moduleName: 'Orçamentos',
        description: 'Criação, visualização e exportação de orçamentos e propostas',
        permissions: [
          { id: 'orc_quotes_view', name: 'Visualizar orçamentos', description: 'Permite consultar o histórico e detalhes dos orçamentos', enabled: true },
          { id: 'orc_quotes_create', name: 'Criar orçamentos', description: 'Permite gerar novos orçamentos no calculador de custos', enabled: true },
          { id: 'orc_quotes_edit', name: 'Editar orçamentos', description: 'Permite alterar valores e especificações de orçamentos abertos', enabled: true },
          { id: 'orc_quotes_delete', name: 'Excluir orçamentos', description: 'Permite remover orçamentos do banco de dados', enabled: false },
        ]
      },
      {
        moduleId: 'orc_clients',
        moduleName: 'Clientes',
        description: 'Cadastro e gestão da carteira de clientes comerciais',
        permissions: [
          { id: 'orc_clients_view', name: 'Visualizar clientes', description: 'Permite consultar dados de contato e histórico do cliente', enabled: true },
          { id: 'orc_clients_edit', name: 'Gerenciar cadastro', description: 'Permite cadastrar ou atualizar dados de clientes', enabled: true },
        ]
      },
      {
        moduleId: 'orc_config',
        moduleName: 'Configurações',
        description: 'Tabelas de papéis, máquinas, margens e custos operacionais',
        permissions: [
          { id: 'orc_config_rates', name: 'Alterar taxas e margens', description: 'Permite modificar markups e custos hora-máquina', enabled: false },
          { id: 'orc_config_papers', name: 'Gerenciar catálogo de papéis', description: 'Permite adicionar e ajustar preços de insumos', enabled: false },
        ]
      }
    ]
  },
  {
    productId: 'arteflow',
    productName: 'ArteFlow',
    modules: [
      {
        moduleId: 'flow_orders',
        moduleName: 'Pedidos & OS',
        description: 'Ordens de serviço, status de entrega e faturamento',
        permissions: [
          { id: 'flow_orders_view', name: 'Visualizar ordens de serviço', description: 'Consultar fila de pedidos e cronograma', enabled: true },
          { id: 'flow_orders_create', name: 'Abrir novas OS', description: 'Transformar orçamentos em ordens ativas', enabled: true },
          { id: 'flow_orders_cancel', name: 'Cancelar OS', description: 'Permite estornar ou cancelar pedidos', enabled: false },
        ]
      },
      {
        moduleId: 'flow_production',
        moduleName: 'Produção & Kanban',
        description: 'Movimentação nas colunas de produção e etapas de máquinas',
        permissions: [
          { id: 'flow_prod_move', name: 'Avançar etapas de produção', description: 'Mover cartões no painel Kanban de produção', enabled: true },
          { id: 'flow_prod_reassign', name: 'Reatribuir responsáveis', description: 'Trocar operador ou setor da ordem', enabled: true },
        ]
      },
      {
        moduleId: 'flow_finance',
        moduleName: 'Financeiro',
        description: 'Contas a receber, fluxo de caixa e comissões',
        permissions: [
          { id: 'flow_fin_view', name: 'Ver movimentações financeiras', description: 'Acesso a valores a receber e saldo', enabled: false },
          { id: 'flow_fin_confirm', name: 'Dar baixa em pagamentos', description: 'Confirmar recebimento de valores', enabled: false },
        ]
      }
    ]
  },
  {
    productId: 'artecheck',
    productName: 'ArteCheck',
    modules: [
      {
        moduleId: 'chk_analysis',
        moduleName: 'Análises & Pré-impressão',
        description: 'Upload e inspeção técnica de arquivos PDF/imagens',
        permissions: [
          { id: 'chk_analysis_run', name: 'Executar análise de arquivos', description: 'Permite enviar arquivos para conferência técnica', enabled: true },
          { id: 'chk_analysis_override', name: 'Aprovar com ressalvas', description: 'Liberar arquivos que contenham avisos técnicos', enabled: false },
          { id: 'chk_reports_export', name: 'Exportar laudos técnicos', description: 'Gerar relatórios de conformidade em PDF', enabled: true },
        ]
      }
    ]
  }
];
