import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Calendar,
  ShieldCheck,
  Zap,
  Check,
  Sparkles,
  Users,
  AlertTriangle,
  Loader2,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  subscriptionService,
  formatCentsToBrl,
} from '../../services/subscriptionService';
import { billingService, PaymentTransaction } from '../../services/billingService';
import { PrexyonPlan, SubscriptionDetails, SubscriptionBillingCycle } from '../../types/subscription';
import orcagrafSymbol from '../../assets/branding/orcagraf-symbol.png';
import arteflowSymbol from '../../assets/branding/arteflow-symbol.png';
import artecheckSymbol from '../../assets/branding/artecheck-symbol.png';

interface SubscriptionPageProps {
  onBack: () => void;
}

export const SubscriptionPage: React.FC<SubscriptionPageProps> = ({ onBack }) => {
  const { organization, user } = useAuth();
  const [plans, setPlans] = useState<PrexyonPlan[]>([]);
  const [details, setDetails] = useState<SubscriptionDetails | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<SubscriptionBillingCycle>('monthly');
  const [loadingCheckoutPlanCode, setLoadingCheckoutPlanCode] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const isOrgAdmin = user?.role === 'owner' || user?.role === 'admin';

  useEffect(() => {
    async function loadData() {
      try {
        const loadedPlans = await subscriptionService.fetchPlans();
        setPlans(loadedPlans);

        if (organization?.id) {
          const subDetails = await subscriptionService.fetchOrganizationSubscription(organization.id);
          setDetails(subDetails);
          if (subDetails) {
            setSelectedCycle(subDetails.billingCycle);
          }

          const txs = await billingService.fetchBillingTransactions(organization.id);
          setTransactions(txs);
        }
      } catch (err) {
        console.error('Erro ao carregar dados de assinatura:', err);
      }
    }

    loadData();
  }, [organization?.id]);

  const handleStartCheckout = async (plan: PrexyonPlan) => {
    if (!organization?.id || !isOrgAdmin) return;

    setCheckoutError(null);
    setLoadingCheckoutPlanCode(plan.code);

    try {
      const res = await billingService.createCheckoutSession(organization.id, plan.code, selectedCycle);

      if (res.success && res.checkoutUrl) {
        // Redireciona para o checkout oficial do Mercado Pago
        window.location.href = res.checkoutUrl;
      } else {
        setCheckoutError(res.error || 'Não foi possível iniciar o checkout.');
        setLoadingCheckoutPlanCode(null);
      }
    } catch (err: any) {
      setCheckoutError(err.message || 'Erro inesperado ao conectar ao provedor de pagamento.');
      setLoadingCheckoutPlanCode(null);
    }
  };

  const getProductInfo = (code: string) => {
    switch (code) {
      case 'orcagraf':
        return { name: 'OrçaGraf', symbol: orcagrafSymbol, desc: 'Orçamentos & Gestão Comercial' };
      case 'arteflow':
        return { name: 'ArteFlow', symbol: arteflowSymbol, desc: 'Produção & Financeiro' };
      case 'artecheck':
        return { name: 'ArteCheck', symbol: artecheckSymbol, desc: 'Pré-impressão Automatizada' };
      default:
        return { name: code, symbol: orcagrafSymbol, desc: 'Software Prexyon' };
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0066ff]"
            aria-label="Voltar para Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Assinatura & Planos
            </h1>
            <p className="text-sm text-slate-500">
              Controle o plano, softwares contratados, faturamento recorrente com Mercado Pago e limites de usuários.
            </p>
          </div>
        </div>
      </div>

      {/* Global Error Banner */}
      {checkoutError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{checkoutError}</span>
          </div>
          <button
            onClick={() => setCheckoutError(null)}
            className="text-xs text-rose-600 hover:text-rose-900 underline font-medium"
          >
            Dispensar
          </button>
        </div>
      )}

      {/* Current Plan Card */}
      {details && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-2xl bg-blue-50 text-[#0066ff]">
                  <Zap className="w-6 h-6" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">{details.planName}</h2>
                    <Badge status={details.status} label={details.statusLabel} />
                    {details.cancelAtPeriodEnd && (
                      <span className="text-[11px] font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                        Cancela no fim do período
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cobrança {details.billingCycle === 'annual' ? 'Anual' : 'Mensal'} via Mercado Pago
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900">{details.priceFormatted}</span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 py-6 border-b border-slate-100 text-sm">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Próxima Renovação
              </span>
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <Calendar className="w-4 h-4 text-[#0066ff]" />
                <span>{details.nextRenewalFormatted}</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Usuários Incluídos no Pacote
              </span>
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>
                  {details.userSeats.used} de {details.userSeats.total} usuários utilizados
                </span>
              </div>
              {details.userSeats.extra > 0 && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {details.userSeats.extra} usuário(s) extra(s) (+{formatCentsToBrl(details.userSeats.extraUserPriceCents)}/mês cada)
                </p>
              )}
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Autoridade de Faturamento
              </span>
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <ShieldCheck className="w-4 h-4 text-slate-500" />
                <span>{isOrgAdmin ? 'Administrador / Proprietário' : 'Visualização de Membro'}</span>
              </div>
            </div>
          </div>

          {/* Softwares Inclusos */}
          <div className="pt-6">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
              Softwares contratados na organização
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {details.includedProducts.map((prod) => {
                const info = getProductInfo(prod.id);
                return (
                  <div
                    key={prod.id}
                    className={`p-4 rounded-2xl border flex items-center justify-between ${
                      prod.includedInPlan
                        ? 'border-emerald-200 bg-emerald-50/40 text-slate-900'
                        : 'border-slate-200 bg-slate-50/60 opacity-60 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <img src={info.symbol} alt={info.name} className="w-8 h-8 object-contain" />
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{info.name}</h4>
                        <p className="text-[11px] text-slate-500">{info.desc}</p>
                      </div>
                    </div>
                    {prod.includedInPlan ? (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                        Incluso
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-md">
                        Não contratado
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* No Active Plan State */}
      {!details && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 text-[#0066ff] flex items-center justify-center mb-3">
            <Zap className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Nenhum plano contratado</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Sua organização ainda não possui uma assinatura ativa. Escolha um dos planos oficiais abaixo para liberar o acesso aos softwares.
          </p>
        </div>
      )}

      {/* Plan Catalog & Selection */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Planos do Ecossistema Prexyon
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Escolha a combinação ideal de softwares para o tamanho e fluxo da sua gráfica.
            </p>
          </div>

          {/* Monthly / Annual Toggle */}
          <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200/80 self-start sm:self-auto">
            <button
              onClick={() => setSelectedCycle('monthly')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedCycle === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setSelectedCycle('annual')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                selectedCycle === 'annual'
                  ? 'bg-[#0066ff] text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Anual</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  selectedCycle === 'annual'
                    ? 'bg-white/20 text-white'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                -16%
              </span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {plans.map((plan) => {
            const isCurrent = details?.planCode === plan.code;
            const priceCents = selectedCycle === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents;
            const monthlyEquivalentCents = selectedCycle === 'annual' ? Math.round(plan.annualPriceCents / 12) : plan.monthlyPriceCents;
            const isCheckoutLoading = loadingCheckoutPlanCode === plan.code;

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                  plan.isFeatured
                    ? 'border-[#0066ff] ring-2 ring-[#0066ff]/20 shadow-md'
                    : isCurrent
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                {/* Featured Badge */}
                {plan.isFeatured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0066ff] text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1 whitespace-nowrap">
                    <Sparkles className="w-3 h-3" />
                    <span>Melhor Custo-Benefício</span>
                  </div>
                )}

                <div>
                  <div className="mb-3">
                    <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                    <p className="text-[11px] text-slate-500 mt-1 min-h-[32px] leading-tight">
                      {plan.description}
                    </p>
                  </div>

                  {/* Pricing */}
                  <div className="my-4 pb-4 border-b border-slate-100">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-extrabold text-slate-900">
                        {formatCentsToBrl(monthlyEquivalentCents)}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">/mês</span>
                    </div>
                    {selectedCycle === 'annual' && (
                      <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                        Cobrado {formatCentsToBrl(priceCents)} ao ano (pague 10, use 12)
                      </p>
                    )}
                  </div>

                  {/* Features / Included Softwares */}
                  <div className="space-y-2 mb-6">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Softwares Inclusos
                    </span>
                    <ul className="space-y-1.5 text-xs text-slate-600">
                      <li className="flex items-center gap-2">
                        <Check
                          className={`w-3.5 h-3.5 ${
                            plan.includedProductCodes.includes('orcagraf')
                              ? 'text-emerald-600 font-bold'
                              : 'text-slate-300'
                          }`}
                        />
                        <span
                          className={
                            plan.includedProductCodes.includes('orcagraf')
                              ? 'font-medium text-slate-800'
                              : 'text-slate-400 line-through'
                          }
                        >
                          OrçaGraf
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check
                          className={`w-3.5 h-3.5 ${
                            plan.includedProductCodes.includes('arteflow')
                              ? 'text-emerald-600 font-bold'
                              : 'text-slate-300'
                          }`}
                        />
                        <span
                          className={
                            plan.includedProductCodes.includes('arteflow')
                              ? 'font-medium text-slate-800'
                              : 'text-slate-400 line-through'
                          }
                        >
                          ArteFlow
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check
                          className={`w-3.5 h-3.5 ${
                            plan.includedProductCodes.includes('artecheck')
                              ? 'text-emerald-600 font-bold'
                              : 'text-slate-300'
                          }`}
                        />
                        <span
                          className={
                            plan.includedProductCodes.includes('artecheck')
                              ? 'font-medium text-slate-800'
                              : 'text-slate-400 line-through'
                          }
                        >
                          ArteCheck
                        </span>
                      </li>
                    </ul>

                    <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{plan.includedUsers} usuários inclusos</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Usuários adicionais: {formatCentsToBrl(plan.extraUserPriceCents)}/mês por usuário
                      </p>
                    </div>
                  </div>
                </div>

                {/* CTA Button */}
                <div>
                  {isCurrent ? (
                    <div className="w-full py-2 px-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold text-center border border-emerald-200">
                      Plano Atual
                    </div>
                  ) : (
                    <Button
                      variant={plan.isFeatured ? 'primary' : 'outline'}
                      size="sm"
                      className="w-full justify-center text-xs"
                      disabled={!isOrgAdmin || Boolean(loadingCheckoutPlanCode)}
                      onClick={() => handleStartCheckout(plan)}
                    >
                      {isCheckoutLoading ? (
                        <div className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Preparando...</span>
                        </div>
                      ) : isOrgAdmin ? (
                        'Assinar com Mercado Pago'
                      ) : (
                        'Apenas Administrador'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing & Payment History */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <span className="p-2 rounded-xl bg-slate-100 text-slate-700">
              <Receipt className="w-5 h-5" />
            </span>
            <h3 className="text-base font-bold text-slate-900">Histórico de Cobranças</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-600">
              <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-2.5 px-4 rounded-l-xl">Identificador</th>
                  <th className="py-2.5 px-4">Valor</th>
                  <th className="py-2.5 px-4">Ciclo</th>
                  <th className="py-2.5 px-4">Data</th>
                  <th className="py-2.5 px-4 rounded-r-xl">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-700">{tx.providerPaymentId}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{formatCentsToBrl(tx.amountCents)}</td>
                    <td className="py-3 px-4 capitalize">{tx.billingInterval === 'annual' ? 'Anual' : 'Mensal'}</td>
                    <td className="py-3 px-4">{new Date(tx.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                        tx.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {tx.status === 'approved' ? 'Aprovado' : tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
