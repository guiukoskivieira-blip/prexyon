import React, { useState } from 'react';
import { ArrowLeft, Save, Sparkles, Shield, Lock } from 'lucide-react';
import { mockProductPermissionSchemas } from '../../data/mockPermissions';
import { Button } from '../../components/ui/Button';
import orcagrafSymbol from '../../assets/branding/orcagraf-symbol.png';
import arteflowSymbol from '../../assets/branding/arteflow-symbol.png';
import artecheckSymbol from '../../assets/branding/artecheck-symbol.png';

interface PermissionsPageProps {
  onBack: () => void;
  initialProductId?: string;
}

export const PermissionsPage: React.FC<PermissionsPageProps> = ({ onBack, initialProductId = 'orcagraf' }) => {
  const [selectedProduct, setSelectedProduct] = useState(initialProductId);
  const [selectedRoleByProduct, setSelectedRoleByProduct] = useState<Record<string, string>>({
    orcagraf: 'role_comercial',
    arteflow: 'role_producao',
    artecheck: 'role_auditor',
  });

  // State of overrides: key is `${productId}:${permId}`, value is 'allow' | 'deny' | 'none'
  const [overrides, setOverrides] = useState<Record<string, 'allow' | 'deny' | 'none'>>({
    'orcagraf:orc_quotes_delete': 'deny',
    'orcagraf:orc_config_rates': 'none',
  });

  const [schemas] = useState(mockProductPermissionSchemas);
  const [savedNotification, setSavedNotification] = useState(false);

  const currentSchema = schemas.find((s) => s.productId === selectedProduct) || schemas[0];

  const productTabs = [
    { id: 'orcagraf', name: 'OrçaGraf', img: orcagrafSymbol, activeClass: 'border-emerald-600 text-emerald-700 font-bold' },
    { id: 'arteflow', name: 'ArteFlow', img: arteflowSymbol, activeClass: 'border-sky-600 text-sky-700 font-bold' },
    { id: 'artecheck', name: 'ArteCheck', img: artecheckSymbol, activeClass: 'border-purple-600 text-purple-700 font-bold' },
  ];

  const rolesByProduct: Record<string, { id: string; name: string; desc: string; defaultPermissions: string[] }[]> = {
    orcagraf: [
      { id: 'role_admin', name: 'Administrador Comercial', desc: 'Acesso total a orçamentos, clientes e tabelas de custo', defaultPermissions: ['orc_quotes_view', 'orc_quotes_create', 'orc_quotes_edit', 'orc_quotes_delete', 'orc_clients_view', 'orc_clients_edit', 'orc_config_rates', 'orc_config_papers'] },
      { id: 'role_comercial', name: 'Vendedor / Comercial', desc: 'Criação e edição de propostas, consulta a clientes', defaultPermissions: ['orc_quotes_view', 'orc_quotes_create', 'orc_quotes_edit', 'orc_clients_view'] },
      { id: 'role_consulta', name: 'Consulta / Somente Leitura', desc: 'Apenas visualização de propostas existentes', defaultPermissions: ['orc_quotes_view', 'orc_clients_view'] },
    ],
    arteflow: [
      { id: 'role_gerente', name: 'Gerente de Produção & PCP', desc: 'Gestão da esteira de máquinas e financeiro', defaultPermissions: ['flow_orders_view', 'flow_orders_create', 'flow_orders_cancel', 'flow_prod_move', 'flow_prod_reassign', 'flow_fin_view', 'flow_fin_confirm'] },
      { id: 'role_producao', name: 'Operador de Máquinas', desc: 'Movimentação nas colunas do Kanban', defaultPermissions: ['flow_orders_view', 'flow_prod_move'] },
      { id: 'role_financeiro', name: 'Financeiro & Faturamento', desc: 'Gestão de contas a receber e baixas', defaultPermissions: ['flow_orders_view', 'flow_fin_view', 'flow_fin_confirm'] },
    ],
    artecheck: [
      { id: 'role_auditor', name: 'Auditor de Pré-impressão', desc: 'Execução de testes e aprovação técnica com ressalvas', defaultPermissions: ['chk_analysis_run', 'chk_analysis_override', 'chk_reports_export'] },
      { id: 'role_basico', name: 'Conferente Básico', desc: 'Apenas upload e visualização de relatórios', defaultPermissions: ['chk_analysis_run', 'chk_reports_export'] },
    ],
  };

  const currentRoles = rolesByProduct[selectedProduct] || [];
  const currentRole = currentRoles.find((r) => r.id === selectedRoleByProduct[selectedProduct]) || currentRoles[0];

  // Helper to determine effective permission state
  const getPermissionState = (permId: string) => {
    const overrideKey = `${selectedProduct}:${permId}`;
    const override = overrides[overrideKey];
    const isFromRole = currentRole.defaultPermissions.includes(permId);

    if (override === 'deny') {
      return { enabled: false, origin: 'override_deny', label: 'Bloqueado Manualmente' };
    }
    if (override === 'allow') {
      return { enabled: true, origin: 'override_allow', label: 'Liberado Manualmente' };
    }
    if (isFromRole) {
      return { enabled: true, origin: 'role', label: 'Herdado do Perfil' };
    }
    return { enabled: false, origin: 'none', label: 'Não Atribuído' };
  };

  const handleToggle = (permId: string) => {
    const overrideKey = `${selectedProduct}:${permId}`;
    const currentState = getPermissionState(permId);

    if (currentState.enabled) {
      // Switch to explicit deny
      setOverrides((prev) => ({ ...prev, [overrideKey]: 'deny' }));
    } else {
      // Switch to explicit allow
      setOverrides((prev) => ({ ...prev, [overrideKey]: 'allow' }));
    }
  };

  const handleResetToRole = (permId: string) => {
    const overrideKey = `${selectedProduct}:${permId}`;
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[overrideKey];
      return next;
    });
  };

  const handleSave = () => {
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 3000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0066ff]"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Matriz de Permissões Granulares
            </h1>
            <p className="text-sm text-slate-500">
              Controle o que os usuários podem executar em cada software do ecossistema Prexyon.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {savedNotification && (
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in">
              Matriz salva com sucesso!
            </span>
          )}
          <Button
            variant="primary"
            onClick={handleSave}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Salvar Alterações
          </Button>
        </div>
      </div>

      {/* Product Selector Tabs */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 overflow-x-auto pb-0.5">
        {productTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedProduct(tab.id)}
            className={`flex items-center space-x-2.5 px-4 py-3 border-b-2 text-sm transition-all whitespace-nowrap focus:outline-none ${
              selectedProduct === tab.id
                ? tab.activeClass
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300 font-medium'
            }`}
          >
            <img src={tab.img} alt={tab.name} className="w-5 h-5 object-contain" />
            <span>{tab.name}</span>
          </button>
        ))}
      </div>

      {/* Role Profile Selector Card */}
      <div className="bg-white rounded-3xl border border-[#e2e8f0] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-[#0066ff]" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Perfil de Acesso Base no {currentSchema.productName}
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Selecione o papel que define o conjunto inicial de permissões deste software.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <select
            value={selectedRoleByProduct[selectedProduct] || currentRoles[0]?.id}
            onChange={(e) =>
              setSelectedRoleByProduct((prev) => ({
                ...prev,
                [selectedProduct]: e.target.value,
              }))
            }
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0066ff] shadow-2xs"
          >
            {currentRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Clear overrides for this product
              setOverrides((prev) => {
                const next = { ...prev };
                Object.keys(next).forEach((k) => {
                  if (k.startsWith(`${selectedProduct}:`)) delete next[k];
                });
                return next;
              });
            }}
            className="text-xs"
          >
            Restaurar Padrão do Perfil
          </Button>
        </div>
      </div>

      {/* Modules & Granular Checkbox Grid */}
      <div className="space-y-6">
        {currentSchema.modules.map((module) => (
          <div
            key={module.moduleId}
            className="bg-white rounded-3xl border border-[#e2e8f0] p-6 sm:p-7 shadow-sm space-y-4"
          >
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{module.moduleName}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{module.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {module.permissions.map((perm) => {
                const state = getPermissionState(perm.id);

                return (
                  <div
                    key={perm.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                      state.enabled
                        ? 'bg-blue-50/20 border-blue-200'
                        : 'bg-slate-50/40 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-900">{perm.name}</div>
                        <div className="text-xs text-slate-500 mt-1 leading-relaxed">{perm.description}</div>
                      </div>

                      <input
                        type="checkbox"
                        checked={state.enabled}
                        onChange={() => handleToggle(perm.id)}
                        className="mt-1 w-5 h-5 rounded text-[#0066ff] focus:ring-[#0066ff] cursor-pointer"
                      />
                    </div>

                    {/* Origin Badge & Quick Reset */}
                    <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <div>
                        {state.origin === 'role' && (
                          <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                            <Shield className="w-3 h-3" /> Do Perfil: {currentRole.name}
                          </span>
                        )}
                        {state.origin === 'override_allow' && (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <Sparkles className="w-3 h-3" /> Liberado Manualmente
                          </span>
                        )}
                        {state.origin === 'override_deny' && (
                          <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                            <Lock className="w-3 h-3" /> Bloqueado Manualmente
                          </span>
                        )}
                        {state.origin === 'none' && (
                          <span className="text-slate-400 font-medium">Não atribuído</span>
                        )}
                      </div>

                      {state.origin.startsWith('override') && (
                        <button
                          onClick={() => handleResetToRole(perm.id)}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline"
                        >
                          Restaurar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
