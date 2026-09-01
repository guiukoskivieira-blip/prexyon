import React from 'react';
import { clsx } from 'clsx';
import { CheckCircle2, Clock, AlertCircle, ShieldAlert } from 'lucide-react';
import { ProductStatus } from '../../types/product';
import { SubscriptionStatus } from '../../types/subscription';

interface BadgeProps {
  status?: ProductStatus | SubscriptionStatus | 'invited' | string;
  label?: string;
  variant?: 'success' | 'warning' | 'purple' | 'neutral' | 'danger';
  className?: string;
  showIcon?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  status = 'active',
  label,
  variant,
  className,
  showIcon = true,
}) => {
  let computedVariant = variant;
  let defaultLabel = label;
  let icon = <CheckCircle2 className="w-3.5 h-3.5 mr-1 stroke-[2.2]" />;

  if (!computedVariant) {
    switch (status) {
      case 'active':
        computedVariant = 'success';
        defaultLabel = defaultLabel || 'Ativo';
        icon = <CheckCircle2 className="w-3.5 h-3.5 mr-1 stroke-[2.2]" />;
        break;
      case 'coming_soon':
        computedVariant = 'purple';
        defaultLabel = defaultLabel || 'Em breve';
        icon = <Clock className="w-3.5 h-3.5 mr-1 stroke-[2.2]" />;
        break;
      case 'trial':
        computedVariant = 'warning';
        defaultLabel = defaultLabel || 'Teste';
        icon = <Clock className="w-3.5 h-3.5 mr-1 stroke-[2.2]" />;
        break;
      case 'suspended':
      case 'past_due':
      case 'canceled':
        computedVariant = 'danger';
        defaultLabel = defaultLabel || (status === 'suspended' ? 'Suspenso' : status === 'past_due' ? 'Fatura Pendente' : 'Cancelado');
        icon = <ShieldAlert className="w-3.5 h-3.5 mr-1 stroke-[2.2]" />;
        break;
      case 'inactive':
      case 'invited':
      default:
        computedVariant = 'neutral';
        defaultLabel = defaultLabel || (status === 'invited' ? 'Convidado' : 'Inativo');
        icon = <AlertCircle className="w-3.5 h-3.5 mr-1 stroke-[2.2]" />;
        break;
    }
  }

  const variantStyles = {
    success: 'bg-[#ecfdf5] text-[#059669] border-[#a7f3d0]',
    purple: 'bg-[#faf5ff] text-[#7c3aed] border-[#e9d5ff]',
    warning: 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]',
    danger: 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]',
    neutral: 'bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border transition-colors',
        variantStyles[computedVariant || 'neutral'],
        className
      )}
    >
      {showIcon && icon}
      <span>{defaultLabel}</span>
    </span>
  );
};
