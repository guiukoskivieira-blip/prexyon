import React, { useState, useRef, useEffect } from 'react';
import { User, Users, CreditCard, Settings, LogOut, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface UserMenuDropdownProps {
  onNavigate: (route: string) => void;
}

export const UserMenuDropdown: React.FC<UserMenuDropdownProps> = ({ onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, organization, logout } = useAuth();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-1 rounded-full hover:ring-2 hover:ring-white/20 focus:outline-none transition-all"
        aria-expanded={isOpen}
        aria-label="Menu do usuário"
      >
        <div className="w-9 h-9 rounded-full bg-white text-slate-900 font-bold text-xs flex items-center justify-center shadow-md tracking-wider">
          {user?.initials || 'GS'}
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white shadow-[0_15px_35px_-5px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.06)] border border-slate-100 py-2 z-50 animate-in fade-in-50 zoom-in-95 duration-100">
          {/* User Header */}
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {user?.name || 'Guilherme Vieira'}
            </p>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {user?.email || 'gui@exemplo.com'}
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-medium truncate">{organization.name}</span>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <button
              onClick={() => handleAction(() => onNavigate('/app/perfil'))}
              className="w-full flex items-center px-4 py-2.5 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors gap-3"
            >
              <User className="w-4 h-4 text-slate-400" />
              <span>Meu perfil</span>
            </button>

            <button
              onClick={() => handleAction(() => onNavigate('/app/usuarios'))}
              className="w-full flex items-center px-4 py-2.5 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors gap-3"
            >
              <Users className="w-4 h-4 text-slate-400" />
              <span>Usuários e acessos</span>
            </button>

            <button
              onClick={() => handleAction(() => onNavigate('/app/assinatura'))}
              className="w-full flex items-center px-4 py-2.5 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors gap-3"
            >
              <CreditCard className="w-4 h-4 text-slate-400" />
              <span>Assinatura</span>
            </button>

            <button
              onClick={() => handleAction(() => onNavigate('/app/configuracoes'))}
              className="w-full flex items-center px-4 py-2.5 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors gap-3"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Configurações</span>
            </button>
          </div>

          {/* Logout Section */}
          <div className="border-t border-slate-100 pt-1">
            <button
              onClick={() => handleAction(logout)}
              className="w-full flex items-center px-4 py-2.5 text-xs sm:text-sm text-red-600 hover:bg-red-50 transition-colors gap-3 font-medium"
            >
              <LogOut className="w-4 h-4 text-red-500" />
              <span>Sair da conta</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
