import React, { useState } from 'react';
import { ArrowLeft, UserPlus, Shield, Mail, AlertCircle, CheckCircle2, UserX, UserCheck, Settings, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AccountMember } from '../../types/account';
import { ProductId } from '../../types/product';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import orcagrafSymbol from '../../assets/branding/orcagraf-symbol.png';
import arteflowSymbol from '../../assets/branding/arteflow-symbol.png';
import artecheckSymbol from '../../assets/branding/artecheck-symbol.png';

interface UsersPageProps {
  onBack: () => void;
  onNavigateToPermissions: (productId?: string) => void;
}

export const UsersPage: React.FC<UsersPageProps> = ({ onBack, onNavigateToPermissions }) => {
  const { members, subscription, inviteUser, toggleMemberStatus } = useAuth();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<AccountMember | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'guest'>('member');
  const [selectedProducts, setSelectedProducts] = useState<ProductId[]>(['orcagraf']);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Products available in the organization subscription
  const isProductInPlan = (prodId: ProductId) => {
    const subProd = subscription?.includedProducts.find((p) => p.id === prodId);
    return subProd ? subProd.includedInPlan : false;
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsSubmitting(true);

    const res = await inviteUser(inviteEmail, selectedProducts, inviteRole);
    setIsSubmitting(false);

    if (res.success) {
      setActionSuccess(`Convite enviado com sucesso para ${inviteEmail}!`);
      setIsInviteModalOpen(false);
      setInviteEmail('');
      setSelectedProducts(['orcagraf']);
      setTimeout(() => setActionSuccess(null), 4000);
    } else {
      setActionError(res.error || 'Erro ao enviar convite.');
    }
  };

  const handleToggleStatus = async (member: AccountMember) => {
    setActionError(null);
    const newStatus = member.status === 'active' ? 'suspended' : 'active';
    const res = await toggleMemberStatus(member.id, newStatus);
    if (!res.success) {
      setActionError(res.error || 'Não foi possível alterar o status do membro.');
      setTimeout(() => setActionError(null), 5000);
    } else {
      setActionSuccess(`Status de ${member.name} alterado para ${newStatus === 'active' ? 'Ativo' : 'Suspenso'}.`);
      setTimeout(() => setActionSuccess(null), 3000);
    }
  };

  const toggleProductForInvite = (prodId: ProductId) => {
    if (!isProductInPlan(prodId)) return;
    setSelectedProducts((prev) =>
      prev.includes(prodId) ? prev.filter((p) => p !== prodId) : [...prev, prodId]
    );
  };

  const handleSaveMemberAccess = (e: React.FormEvent) => {
    e.preventDefault();
    setEditingMember(null);
    setActionSuccess('Acessos do usuário atualizados com sucesso.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              Usuários & Acessos
            </h1>
            <p className="text-sm text-slate-500">
              Controle de membros, permissões granulares e produtos autorizados.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => onNavigateToPermissions()}
            leftIcon={<Shield className="w-4 h-4 text-[#0066ff]" />}
          >
            Matriz de Permissões
          </Button>
          <Button
            variant="primary"
            onClick={() => setIsInviteModalOpen(true)}
            leftIcon={<UserPlus className="w-4 h-4" />}
          >
            Convidar Usuário
          </Button>
        </div>
      </div>

      {/* Action Alerts */}
      {actionError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex items-center gap-3 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Users Table Card */}
      <div className="bg-white rounded-3xl border border-[#e2e8f0] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-400 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Usuário</th>
                <th className="px-6 py-4">Papel na Conta</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Softwares Liberados</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-800 shrink-0">
                        {member.initials}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{member.name}</div>
                        <div className="text-xs text-slate-500">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="capitalize font-semibold text-xs text-slate-700">
                      {member.role === 'owner'
                        ? 'Proprietário (Owner)'
                        : member.role === 'admin'
                        ? 'Administrador'
                        : 'Membro'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Badge status={member.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {member.assignedProducts.includes('orcagraf') && (
                        <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-1.5" title="OrçaGraf">
                          <img src={orcagrafSymbol} alt="OrçaGraf" className="w-4 h-4 object-contain" />
                          <span className="text-[11px] font-semibold text-emerald-800 hidden sm:inline">OrçaGraf</span>
                        </div>
                      )}
                      {member.assignedProducts.includes('arteflow') && (
                        <div className="p-1.5 rounded-lg bg-sky-50 border border-sky-200 flex items-center gap-1.5" title="ArteFlow">
                          <img src={arteflowSymbol} alt="ArteFlow" className="w-4 h-4 object-contain" />
                          <span className="text-[11px] font-semibold text-sky-800 hidden sm:inline">ArteFlow</span>
                        </div>
                      )}
                      {member.assignedProducts.includes('artecheck') && (
                        <div className="p-1.5 rounded-lg bg-purple-50 border border-purple-200 flex items-center gap-1.5" title="ArteCheck">
                          <img src={artecheckSymbol} alt="ArteCheck" className="w-4 h-4 object-contain" />
                          <span className="text-[11px] font-semibold text-purple-800 hidden sm:inline">ArteCheck</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingMember(member)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#0066ff] hover:bg-blue-50 transition-colors"
                      >
                        Configurar
                      </button>

                      {member.role !== 'owner' && (
                        <button
                          onClick={() => handleToggleStatus(member)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            member.status === 'active'
                              ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={member.status === 'active' ? 'Suspender Usuário' : 'Ativar Usuário'}
                        >
                          {member.status === 'active' ? (
                            <UserX className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite User Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Convidar Novo Usuário"
        maxWidth="md"
      >
        <form onSubmit={handleSendInvite} className="space-y-4">
          <Input
            label="E-mail de Trabalho"
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colaborador@empresa.com"
            leftIcon={<Mail className="w-4 h-4" />}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Papel na Organização
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0066ff]"
            >
              <option value="member">Membro (Acesso aos produtos liberados)</option>
              <option value="admin">Administrador (Pode gerenciar usuários e assinaturas)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Liberar Acesso Aos Softwares da Assinatura
            </label>
            <div className="space-y-2">
              {[
                { id: 'orcagraf' as ProductId, name: 'OrçaGraf (Orçamentos & Custos)', img: orcagrafSymbol },
                { id: 'arteflow' as ProductId, name: 'ArteFlow (Produção & Financeiro)', img: arteflowSymbol },
                { id: 'artecheck' as ProductId, name: 'ArteCheck (Pré-impressão)', img: artecheckSymbol },
              ].map((prod) => {
                const inPlan = isProductInPlan(prod.id);
                return (
                  <label
                    key={prod.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                      inPlan
                        ? 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                        : 'border-slate-100 bg-slate-50/60 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <img src={prod.img} alt={prod.name} className="w-5 h-5 object-contain" />
                      <div>
                        <span className="text-xs sm:text-sm font-semibold text-slate-800 block">
                          {prod.name}
                        </span>
                        {!inPlan && (
                          <span className="text-[10px] text-amber-700 font-medium flex items-center gap-1 mt-0.5">
                            <Lock className="w-3 h-3" /> Não incluído na assinatura
                          </span>
                        )}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!inPlan}
                      checked={inPlan && selectedProducts.includes(prod.id)}
                      onChange={() => toggleProductForInvite(prod.id)}
                      className="w-4 h-4 rounded text-[#0066ff] focus:ring-[#0066ff]"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsInviteModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Enviar Convite
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Member & Product Access Modal */}
      <Modal
        isOpen={!!editingMember}
        onClose={() => setEditingMember(null)}
        title={`Configurar Acessos: ${editingMember?.name || ''}`}
        maxWidth="lg"
      >
        {editingMember && (
          <form onSubmit={handleSaveMemberAccess} className="space-y-5">
            {/* Step 1: User Info */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full bg-white border border-slate-200 font-bold text-sm text-slate-800 flex items-center justify-center">
                  {editingMember.initials}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{editingMember.name}</h4>
                  <p className="text-xs text-slate-500">{editingMember.email}</p>
                </div>
              </div>
              <Badge status={editingMember.status} />
            </div>

            {/* Step 2: Software Access Toggles */}
            <div>
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                Acesso aos Softwares Contratados
              </h5>
              <div className="space-y-2.5">
                {[
                  { id: 'orcagraf' as ProductId, name: 'OrçaGraf', desc: 'Orçamentos e gestão comercial', img: orcagrafSymbol },
                  { id: 'arteflow' as ProductId, name: 'ArteFlow', desc: 'Produção, pedidos e financeiro', img: arteflowSymbol },
                  { id: 'artecheck' as ProductId, name: 'ArteCheck', desc: 'Pré-impressão e análise técnica', img: artecheckSymbol },
                ].map((prod) => {
                  const inPlan = isProductInPlan(prod.id);
                  const hasAccess = editingMember.assignedProducts.includes(prod.id);

                  return (
                    <div
                      key={prod.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                        !inPlan
                          ? 'bg-slate-50/50 border-slate-200 opacity-60'
                          : hasAccess
                          ? 'bg-blue-50/30 border-blue-200'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <img src={prod.img} alt={prod.name} className="w-6 h-6 object-contain" />
                        <div>
                          <span className="text-sm font-bold text-slate-900 block">{prod.name}</span>
                          <span className="text-xs text-slate-500">{prod.desc}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        {!inPlan ? (
                          <span className="text-xs text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                            Não contratado
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                onNavigateToPermissions(prod.id);
                                setEditingMember(null);
                              }}
                              className="text-xs font-semibold text-[#0066ff] hover:underline flex items-center gap-1"
                            >
                              <Settings className="w-3.5 h-3.5" /> Permissões
                            </button>
                            <input
                              type="checkbox"
                              checked={hasAccess}
                              onChange={() => {
                                const updated = hasAccess
                                  ? editingMember.assignedProducts.filter((p) => p !== prod.id)
                                  : [...editingMember.assignedProducts, prod.id];
                                setEditingMember({ ...editingMember, assignedProducts: updated });
                              }}
                              className="w-4 h-4 rounded text-[#0066ff] focus:ring-[#0066ff]"
                            />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setEditingMember(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                Salvar Alterações
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
