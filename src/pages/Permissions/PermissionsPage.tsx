import React, { useState } from 'react';
import { ArrowLeft, Shield, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PERMISSIONS_MATRIX } from '../../constants/permissionsMatrix';
import orcagrafSymbol from '../../assets/branding/orcagraf-symbol.png';
import arteflowSymbol from '../../assets/branding/arteflow-symbol.png';
import artecheckSymbol from '../../assets/branding/artecheck-symbol.png';

interface PermissionsPageProps {
  onBack: () => void;
  initialProductId?: string;
}

export const PermissionsPage: React.FC<PermissionsPageProps> = ({ onBack, initialProductId = 'orcagraf' }) => {
  const [selectedProduct, setSelectedProduct] = useState<'orcagraf' | 'arteflow' | 'artecheck'>(
    initialProductId === 'arteflow' || initialProductId === 'artecheck' ? initialProductId : 'orcagraf'
  );

  const productTabs = [
    { id: 'orcagraf', name: 'OrçaGraf', img: orcagrafSymbol, activeClass: 'border-emerald-600 text-emerald-700 font-bold dark:text-emerald-400' },
    { id: 'arteflow', name: 'ArteFlow', img: arteflowSymbol, activeClass: 'border-sky-600 text-sky-700 font-bold dark:text-sky-400' },
    { id: 'artecheck', name: 'ArteCheck', img: artecheckSymbol, activeClass: 'border-purple-600 text-purple-700 font-bold dark:text-purple-400' },
  ] as const;

  const currentSchema = PERMISSIONS_MATRIX[selectedProduct];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Matriz de Permissões & Presets
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Catálogo oficial de permissões de cada software Prexyon e modelos de perfil pré-configurados.
            </p>
          </div>
        </div>
      </div>

      {/* Product Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        {productTabs.map((tab) => {
          const isActive = selectedProduct === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedProduct(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 text-sm transition-colors ${
                isActive
                  ? tab.activeClass
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <img src={tab.img} alt="" className="w-4 h-4 object-contain" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* Presets Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          Perfis Pré-configurados (Presets) do {currentSchema.productName}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {currentSchema.presets.map((preset) => (
            <div
              key={preset.id}
              className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 shadow-sm"
            >
              <div className="font-bold text-sm text-slate-900 dark:text-white">{preset.name}</div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{preset.description}</p>
              <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold pt-1">
                {preset.permissions.length} permissões incluídas
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categorized Permissions Grid */}
      <div className="space-y-6 pt-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          Permissões Disponíveis no {currentSchema.productName}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {currentSchema.categories.map((cat) => (
            <div
              key={cat.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 shadow-sm"
            >
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-2">
                {cat.label}
              </h4>
              <div className="space-y-2.5">
                {cat.permissions.map((perm) => (
                  <div key={perm.key} className="space-y-0.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                      <span>{perm.label}</span>
                      <code className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-mono">
                        {perm.key}
                      </code>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{perm.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
