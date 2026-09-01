import React from 'react';
import { CreditCard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

interface GreetingHeaderProps {
  onManageSubscription: () => void;
}

export const GreetingHeader: React.FC<GreetingHeaderProps> = ({ onManageSubscription }) => {
  const { user } = useAuth();

  // Dynamic greeting based on current local hour
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Bom dia';
    } else if (hour >= 12 && hour < 18) {
      return 'Boa tarde';
    } else {
      return 'Boa noite';
    }
  };

  const firstName = user?.firstName || user?.name?.split(' ')[0] || 'Usuário';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {getGreeting()}, {firstName}
        </h1>
        <p className="mt-1 text-sm sm:text-base text-slate-500 font-normal">
          Escolha um produto para continuar a gestão da sua empresa.
        </p>
      </div>

      <div className="shrink-0">
        <Button
          variant="outline"
          size="md"
          onClick={onManageSubscription}
          leftIcon={<CreditCard className="w-4 h-4 text-slate-700" />}
          className="border-slate-300 font-semibold hover:border-slate-400 text-slate-800 shadow-2xs"
        >
          Gerenciar assinatura
        </Button>
      </div>
    </div>
  );
};
