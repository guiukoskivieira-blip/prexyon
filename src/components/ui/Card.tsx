import React from 'react';
import { clsx } from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  hoverEffect = false,
  ...props
}) => {
  return (
    <div
      className={clsx(
        'bg-white rounded-xl border border-[#e2e8f0] shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all duration-200',
        hoverEffect && 'hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.06)] hover:border-slate-300',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
