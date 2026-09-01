import React, { useState } from 'react';
import { HelpCircle, Bell, Settings, Building2, ChevronDown, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserMenuDropdown } from './UserMenuDropdown';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import prexyonSymbol from '../../assets/branding/prexyon-symbol-circle.png';

interface PortalHeaderProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const PortalHeader: React.FC<PortalHeaderProps> = ({ currentRoute, onNavigate }) => {
  const { organization, setOrganizationName } = useAuth();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [editingOrgName, setEditingOrgName] = useState(organization.name);

  const demoNotifications = [
    {
      id: 'notif_1',
      title: 'ArteCheck em testes alfa',
      desc: 'O módulo de análise técnica está disponível para demonstração na sua conta.',
      time: 'Há 2 horas',
      unread: true,
    },
    {
      id: 'notif_2',
      title: 'Renovação da assinatura',
      desc: 'Sua assinatura do Plano Profissional renova em 15 de setembro de 2026.',
      time: 'Ontem',
      unread: true,
    },
    {
      id: 'notif_3',
      title: 'Novo usuário adicionado',
      desc: 'Mariana Lima foi convidada para o módulo de Pré-impressão.',
      time: 'Há 3 dias',
      unread: false,
    },
  ];

  const handleSaveOrgName = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOrgName.trim()) {
      setOrganizationName(editingOrgName.trim());
      setIsOrgModalOpen(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#061226] text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-18">
            {/* Left Section: Logo & Organization Switcher */}
            <div className="flex items-center space-x-3 sm:space-x-4">
              {/* Prexyon Brand Logo */}
              <button
                onClick={() => onNavigate('/app')}
                className="flex items-center space-x-2.5 focus:outline-none group text-left"
                aria-label="Ir para Dashboard"
              >
                <img
                  src={prexyonSymbol}
                  alt="Prexyon"
                  className="w-8 h-8 object-contain transition-transform group-hover:scale-105"
                />
                <span className="text-xl font-bold tracking-tight text-white hidden xs:inline-block">
                  prexyon
                </span>
              </button>

              {/* Vertical Divider */}
              <div className="h-5 w-[1px] bg-slate-700/80 hidden sm:block"></div>

              {/* Organization Selector Pill */}
              <button
                onClick={() => {
                  setEditingOrgName(organization.name);
                  setIsOrgModalOpen(true);
                }}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-200 border border-slate-700/60 transition-all focus:outline-none focus:ring-2 focus:ring-[#0066ff]"
                title="Alternar ou editar organização"
              >
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="max-w-[120px] sm:max-w-[180px] truncate">{organization.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            </div>

            {/* Center Section: Portal Prexyon Title */}
            <div className="hidden md:flex items-center justify-center">
              <span className="text-sm sm:text-base font-semibold text-slate-200 tracking-wide">
                Portal Prexyon
              </span>
            </div>

            {/* Right Section: Actions & User Avatar */}
            <div className="flex items-center space-x-1.5 sm:space-x-3">
              {/* Help Action */}
              <button
                onClick={() => setIsHelpOpen(true)}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 text-xs sm:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#0066ff]"
                aria-label="Central de Ajuda"
              >
                <span className="hidden sm:inline">Ajuda</span>
                <HelpCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>

              {/* Notifications Button */}
              <button
                onClick={() => setIsNotificationsOpen(true)}
                className="relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors focus:outline-none focus:ring-2 focus:ring-[#0066ff]"
                aria-label="Notificações"
              >
                <Bell className="w-4.5 h-4.5" />
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#0066ff] text-white text-[10px] font-bold rounded-full flex items-center justify-center border border-[#061226]">
                  3
                </span>
              </button>

              {/* Settings Action */}
              <button
                onClick={() => onNavigate('/app/configuracoes')}
                className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#0066ff] ${
                  currentRoute === '/app/configuracoes'
                    ? 'text-white bg-slate-800'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                }`}
                aria-label="Configurações da conta"
              >
                <Settings className="w-4.5 h-4.5" />
              </button>

              {/* User Dropdown */}
              <div className="pl-1">
                <UserMenuDropdown onNavigate={onNavigate} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Help Modal */}
      <Modal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="Central de Ajuda Prexyon"
        maxWidth="md"
      >
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            Bem-vindo ao suporte do ecossistema Prexyon. Como podemos ajudar sua empresa hoje?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-xl border border-slate-200 hover:border-[#0066ff] transition-all bg-slate-50/50">
              <h4 className="font-semibold text-slate-900 mb-1">Documentação</h4>
              <p className="text-xs text-slate-500">Guias de uso de OrçaGraf, ArteFlow e ArteCheck.</p>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 hover:border-[#0066ff] transition-all bg-slate-50/50">
              <h4 className="font-semibold text-slate-900 mb-1">Suporte Técnico</h4>
              <p className="text-xs text-slate-500">Atendimento especializado de segunda a sexta, 8h às 18h.</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setIsHelpOpen(false)}>
              Fechar
            </Button>
            <Button
              variant="primary"
              onClick={() => window.open('mailto:suporte@prexyon.com')}
              rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              Abrir chamado
            </Button>
          </div>
        </div>
      </Modal>

      {/* Notifications Modal / Sheet */}
      <Modal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        title="Notificações da Conta"
        maxWidth="md"
      >
        <div className="space-y-3">
          {demoNotifications.map((n) => (
            <div
              key={n.id}
              className={`p-3.5 rounded-xl border transition-all ${
                n.unread ? 'bg-blue-50/40 border-blue-200' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs font-bold text-slate-900">{n.title}</h4>
                <span className="text-[11px] text-slate-400 shrink-0">{n.time}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.desc}</p>
            </div>
          ))}
          <div className="pt-2 flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setIsNotificationsOpen(false)}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>

      {/* Organization Switcher / Edit Modal */}
      <Modal
        isOpen={isOrgModalOpen}
        onClose={() => setIsOrgModalOpen(false)}
        title="Gerenciar Organização"
        maxWidth="md"
      >
        <form onSubmit={handleSaveOrgName} className="space-y-4">
          <p className="text-xs sm:text-sm text-slate-600">
            Nome da conta ou organização exibida no cabeçalho e nos relatórios de acesso:
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Nome da Organização / Empresa
            </label>
            <input
              type="text"
              required
              value={editingOrgName}
              onChange={(e) => setEditingOrgName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0066ff]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" variant="secondary" onClick={() => setIsOrgModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Salvar Alterações
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
