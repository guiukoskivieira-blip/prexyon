import React from 'react';
import { PortalHeader } from './PortalHeader';

interface PortalLayoutProps {
  children: React.ReactNode;
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const PortalLayout: React.FC<PortalLayoutProps> = ({
  children,
  currentRoute,
  onNavigate
}) => {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col antialiased">
      {/* Top Header Shell */}
      <PortalHeader currentRoute={currentRoute} onNavigate={onNavigate} />

      {/* Main Page Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {children}
      </main>

      {/* Global Minimal Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white/50 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-700">Prexyon</span>
            <span>•</span>
            <span>Tecnologia para pequenas empresas</span>
          </div>
          <div>
            <span>© {new Date().getFullYear()} Prexyon. Todos os direitos reservados.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
