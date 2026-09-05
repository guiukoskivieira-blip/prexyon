import React, { useState } from 'react';
import { HelpCircle, Bell, Settings, Building2, ChevronDown, ExternalLink, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserMenuDropdown } from './UserMenuDropdown';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PrexyonLogo } from '../ui/PrexyonLogo';
import { canManageUsers } from '../../security/routeAuthorization';

interface PortalHeaderProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const PortalHeader: React.FC<PortalHeaderProps> = ({ currentRoute, onNavigate }) => {
  const { user, organization, availableOrganizations, switchOrganization, setOrganizationName } = useAuth();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [editingOrgName, setEditingOrgName] = useState(organization.name);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchFeedback, setSwitchFeedback] = useState<string | null>(null);
  const [notifications] = useState<{ id: string; title: string; desc: string; time: string; unread: boolean }[]>([]);

  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleSaveOrgName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOrgName.trim()) {
      await setOrganizationName(editingOrgName.trim());
      setIsOrgModalOpen(false);
    }
  };

  const handleSwitch = async (orgId: string) => {
    if (orgId === organization.id) return;
    setIsSwitching(true);
    setSwitchFeedback(null);
    const res = await switchOrganization(orgId);
    setIsSwitching(false);
    if (res.success) {
      setIsOrgModalOpen(false);
    } else {
      setSwitchFeedback(res.error || 'Erro ao alternar organização.');
    }
  };

  const getRoleLabel = (role?: string) => {
    if (role === 'owner') return 'Proprietário';
    if (role === 'admin') return 'Administrador';
    return 'Membro';
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
                className="flex items-center focus:outline-none group text-left"
                aria-label="Ir para Dashboard"
              >
                <PrexyonLogo
                  variant="dark"
                  className="h-7 sm:h-8 w-auto transition-transform group-hover:scale-105"
                />
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
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#0066ff] text-white text-[10px] font-bold rounded-full flex items-center justify-center border border-[#061226]">
                    {unreadCount}
                  </span>
                )}
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
          {notifications.length > 0 ? (
            notifications.map((n) => (
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
            ))
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              Nenhuma nova notificação no momento.
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setIsNotificationsOpen(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Organization Switcher & Details Modal */}
      <Modal
        isOpen={isOrgModalOpen}
        onClose={() => {
          setIsOrgModalOpen(false);
          setSwitchFeedback(null);
        }}
        title={availableOrganizations.length > 1 ? "Organizações da Conta" : "Organização Ativa"}
        maxWidth="md"
      >
        <div className="space-y-5">
          {/* Switcher Section (quando houver mais de 1 organização) */}
          {availableOrganizations.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Alternar Organização Ativa
              </label>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {availableOrganizations.map((org) => {
                  const isActive = org.id === organization.id;
                  return (
                    <button
                      key={org.id}
                      type="button"
                      disabled={isSwitching}
                      onClick={() => handleSwitch(org.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                        isActive
                          ? 'border-[#0066ff] bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-[#0066ff] text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {org.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            Papel: <span className="font-medium text-slate-700">{getRoleLabel(org.userRole)}</span>
                          </p>
                        </div>
                      </div>

                      {isActive ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-[#0066ff] bg-white px-2.5 py-1 rounded-full border border-blue-200 shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          Ativa
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500 hover:text-slate-900 shrink-0">
                          Selecionar
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {switchFeedback && (
                <p className="mt-2 text-xs text-red-600 font-medium">{switchFeedback}</p>
              )}
            </div>
          )}

          {/* Edit / Details Section */}
          {canManageUsers(user?.role) ? (
            <form onSubmit={handleSaveOrgName} className="space-y-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Editar Razão Social ({organization.name})
                </label>
                <input
                  type="text"
                  value={editingOrgName}
                  onChange={(e) => setEditingOrgName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0066ff] focus:border-transparent transition-all"
                  placeholder="Nome da sua gráfica ou empresa"
                  required
                />
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                <span className="font-semibold text-slate-700 block mb-0.5">Identificador da Conta Ativa:</span>
                <code className="font-mono text-[11px] text-slate-600 break-all">{organization.id || 'Nenhuma'}</code>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setIsOrgModalOpen(false)}>
                  Fechar
                </Button>
                <Button variant="primary" size="sm" type="submit">
                  Salvar nome
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                <span className="font-semibold text-slate-700 block mb-0.5">Identificador da Conta Ativa:</span>
                <code className="font-mono text-[11px] text-slate-600 break-all">{organization.id || 'Nenhuma'}</code>
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="secondary" size="sm" onClick={() => setIsOrgModalOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
