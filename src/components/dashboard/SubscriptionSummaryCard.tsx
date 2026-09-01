import React from 'react';
import { CreditCard, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import orcagrafSymbol from '../../assets/branding/orcagraf-symbol.png';
import arteflowSymbol from '../../assets/branding/arteflow-symbol.png';
import artecheckSymbol from '../../assets/branding/artecheck-symbol.png';

interface SubscriptionSummaryCardProps {
  onViewSubscription: () => void;
}

export const SubscriptionSummaryCard: React.FC<SubscriptionSummaryCardProps> = ({
  onViewSubscription
}) => {
  const { subscription } = useAuth();
  const includedProducts = subscription ? subscription.includedProducts.filter((p) => p.includedInPlan) : [];

  const getSymbol = (id: string) => {
    switch (id) {
      case 'orcagraf':
        return orcagrafSymbol;
      case 'arteflow':
        return arteflowSymbol;
      case 'artecheck':
        return artecheckSymbol;
      default:
        return orcagrafSymbol;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-6 flex flex-col justify-between h-full transition-all duration-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.05)]">
      {/* Header Section */}
      <div className="flex items-center space-x-2.5 pb-5 border-b border-slate-100">
        <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
          <CreditCard className="w-4 h-4" />
        </div>
        <h3 className="text-base font-bold text-slate-900 tracking-tight">
          Sua assinatura
        </h3>
      </div>

      {/* Main Content Grid (3 Columns on Desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-5 items-center">
        {/* Column 1: Plan & Status */}
        <div>
          <h4 className="text-lg font-bold text-slate-900 tracking-tight">
            {subscription ? subscription.planName : 'Sem assinatura ativa'}
          </h4>
          <div className="mt-2">
            {subscription ? (
              <Badge status={subscription.status} label={subscription.statusLabel} />
            ) : (
              <Badge status="inactive" label="Não contratado" />
            )}
          </div>
        </div>

        {/* Column 2: Included Products */}
        <div>
          <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Produtos incluídos
          </span>
          <div className="flex flex-col space-y-2">
            {includedProducts.length > 0 ? (
              includedProducts.map((prod) => (
                <div key={prod.id} className="flex items-center space-x-2">
                  <img
                    src={getSymbol(prod.id)}
                    alt={prod.name}
                    className="w-5 h-5 object-contain"
                  />
                  <span className="text-xs font-semibold text-slate-800">{prod.name}</span>
                </div>
              ))
            ) : (
              <span className="text-xs text-slate-400 font-medium">Nenhum produto ativo</span>
            )}
          </div>
        </div>

        {/* Column 3: Renewal & Action */}
        <div className="flex flex-col sm:items-start md:items-end justify-between space-y-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-[#0066ff] border border-blue-100">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="text-left">
              <span className="block text-[11px] text-slate-400 font-medium">Próxima renovação</span>
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                {subscription ? subscription.nextRenewalFormatted : '—'}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onViewSubscription}
            className="w-full sm:w-auto text-xs font-semibold text-[#0066ff] border-slate-300 hover:border-[#0066ff] hover:bg-blue-50/50"
          >
            Ver assinatura
          </Button>
        </div>
      </div>
    </div>
  );
};
