import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { canManageSubscription } from '../../security/routeAuthorization';
import { GreetingHeader } from '../../components/dashboard/GreetingHeader';
import { ProductCard } from '../../components/dashboard/ProductCard';
import { SubscriptionSummaryCard } from '../../components/dashboard/SubscriptionSummaryCard';
import { ProfileSummaryCard } from '../../components/dashboard/ProfileSummaryCard';

interface DashboardPageProps {
  onNavigate: (route: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { user, products } = useAuth();

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Greeting Header */}
      <GreetingHeader
        onManageSubscription={() => onNavigate('/app/assinatura')}
      />

      {/* Section: Seus produtos */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            Seus produtos
          </h2>
          <span className="text-xs text-slate-500 font-medium hidden sm:inline-block">
            3 softwares disponíveis no ecossistema
          </span>
        </div>

        {/* 3 Product Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onNavigateToPermissions={() => onNavigate('/app/permissoes')}
              onNavigateToSubscription={() => onNavigate('/app/assinatura')}
            />
          ))}
        </div>
      </section>

      {/* Section: Resumo de Assinatura & Perfil da Conta */}
      <section className="pt-2">
        <div className={`grid grid-cols-1 ${canManageSubscription(user?.role) ? 'lg:grid-cols-2' : ''} gap-5 sm:gap-6`}>
          {/* Subscription Summary Card (Apenas para Owner/Admin) */}
          {canManageSubscription(user?.role) && (
            <SubscriptionSummaryCard
              onViewSubscription={() => onNavigate('/app/assinatura')}
            />
          )}

          {/* Profile & Organization Card */}
          <ProfileSummaryCard
            onViewProfile={() => onNavigate('/app/perfil')}
            onViewOrganization={() => onNavigate('/app/perfil')}
          />
        </div>
      </section>
    </div>
  );
};
