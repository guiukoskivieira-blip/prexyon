import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Shield,
  Mail,
  AlertCircle,
  CheckCircle2,
  UserX,
  UserCheck,
  Settings,
  Lock,
  X,
  Save,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ProductId } from '../../types/product';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import {
  memberManagementService,
  MemberDetail,
  OrganizationRole,
} from '../../services/memberManagementService';
import { PERMISSIONS_MATRIX } from '../../constants/permissionsMatrix';

import orcagrafSymbol from '../../assets/branding/orcagraf-symbol.png';
import arteflowSymbol from '../../assets/branding/arteflow-symbol.png';
import artecheckSymbol from '../../assets/branding/artecheck-symbol.png';

interface UsersPageProps {
  onBack?: () => void;
  onNavigateToPermissions?: (prodId: any) => void;
}

export const UsersPage: React.FC<UsersPageProps> = ({ onBack: _onBack, onNavigateToPermissions: _onNavigateToPermissions }) => {
  const { organization, subscription, user: currentUser } = useAuth();

  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Invite modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviteProducts, setInviteProducts] = useState<ProductId[]>(['orcagraf']);
  const [isInviting, setIsInviting] = useState(false);

  // Edit Drawer state
  const [editingMember, setEditingMember] = useState<MemberDetail | null>(null);
  const [editRole, setEditRole] = useState<OrganizationRole>('member');
  const [editProducts, setEditProducts] = useState<ProductId[]>([]);
  const [editPermissions, setEditPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [activeProductTab, setActiveProductTab] = useState<'orcagraf' | 'arteflow' | 'artecheck'>('orcagraf');
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  // Check if organization has subscription entitlement for a product
  const orgHasEntitlement = useCallback((prodId: ProductId) => {
    if (!subscription) return false;
    const subProd = subscription.includedProducts.find((p) => p.id === prodId);
    return subProd ? subProd.includedInPlan : false;
  }, [subscription]);

  // Load real members
  const fetchMembers = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    const res = await memberManagementService.getMembers(organization.id);
    setIsLoading(false);
    if (res.success) {
      setMembers(res.data);
    } else {
      setActionError(res.error || 'Erro ao carregar lista de membros.');
    }
  }, [organization?.id]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Handle Invite
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id) return;

    setActionError(null);
    setIsInviting(true);

    const res = await memberManagementService.inviteUser({
      organizationId: organization.id,
      email: inviteEmail,
      role: inviteRole,
      productAccess: inviteProducts,
    });

    setIsInviting(false);

    if (res.success) {
      setActionSuccess(`Convite gerado com sucesso para ${inviteEmail}!`);
      setIsInviteModalOpen(false);
      setInviteEmail('');
      setInviteProducts(['orcagraf']);
      fetchMembers();
      setTimeout(() => setActionSuccess(null), 5000);
    } else {
      setActionError(res.error || 'Erro ao convidar usuário.');
    }
  };

  // Open Drawer to edit
  const handleOpenEdit = (member: MemberDetail) => {
    setEditingMember(member);
    setEditRole(member.role);
    setEditProducts([...member.products]);
    setEditPermissions(JSON.parse(JSON.stringify(member.permissions || {})));
    // Pick first entitled product as active tab
    if (member.products.length > 0) {
      setActiveProductTab(member.products[0] as 'orcagraf' | 'arteflow' | 'artecheck');
    } else {
      setActiveProductTab('orcagraf');
    }
  };

  // Toggle Member Status
  const handleToggleStatus = async (member: MemberDetail) => {
    if (!organization?.id) return;
    setActionError(null);

    const newStatus = !member.isActive;
    const res = await memberManagementService.updateStatus(organization.id, member.userId, newStatus);

    if (res.success) {
      setActionSuccess(`Status de ${member.fullName || member.email} atualizado com sucesso.`);
      fetchMembers();
      setTimeout(() => setActionSuccess(null), 4000);
    } else {
      setActionError(res.error || 'Erro ao alterar status do membro.');
    }
  };

  // Apply Preset in Edit Drawer
  const handleApplyPreset = (productId: 'orcagraf' | 'arteflow' | 'artecheck', presetId: string) => {
    const schema = PERMISSIONS_MATRIX[productId];
    const preset = schema.presets.find((p) => p.id === presetId);
    if (!preset) return;

    setEditPermissions((prev) => {
      const currentProdPerms: Record<string, boolean> = {};
      // Set all to false first
      schema.categories.forEach((cat) => {
        cat.permissions.forEach((perm) => {
          currentProdPerms[perm.key] = false;
        });
      });
      // Grant preset permissions
      preset.permissions.forEach((pKey) => {
        currentProdPerms[pKey] = true;
      });

      return {
        ...prev,
        [productId]: currentProdPerms,
      };
    });
  };

  // Toggle single permission switch
  const handleTogglePermission = (productId: string, permKey: string) => {
    setEditPermissions((prev) => {
      const prodPerms = { ...(prev[productId] || {}) };
      prodPerms[permKey] = !prodPerms[permKey];
      return {
        ...prev,
        [productId]: prodPerms,
      };
    });
  };

  // Save all permissions and role in Edit Drawer
  const handleSaveMemberChanges = async () => {
    if (!organization?.id || !editingMember) return;

    setIsSavingPermissions(true);
    setActionError(null);

    // 1. Role update if changed
    if (editRole !== editingMember.role) {
      const roleRes = await memberManagementService.updateRole(organization.id, editingMember.userId, editRole);
      if (!roleRes.success) {
        setIsSavingPermissions(false);
        setActionError(roleRes.error || 'Erro ao atualizar papel do usuário.');
        return;
      }
    }

    // 2. Filter out products/permissions that are not entitled for this org
    const validProducts = editProducts.filter((p) => orgHasEntitlement(p));
    const validPermissions: Record<string, Record<string, boolean>> = {};
    for (const [prodKey, perms] of Object.entries(editPermissions)) {
      if (orgHasEntitlement(prodKey as ProductId)) {
        validPermissions[prodKey] = perms;
      }
    }

    // Access and permissions update
    const accessRes = await memberManagementService.updateAccessAndPermissions(
      organization.id,
      editingMember.userId,
      validProducts,
      validPermissions
    );

    setIsSavingPermissions(false);

    if (accessRes.success) {
      setActionSuccess(`Permissões de ${editingMember.fullName || editingMember.email} salvas com sucesso.`);
      setEditingMember(null);
      fetchMembers();
      setTimeout(() => setActionSuccess(null), 4000);
    } else {
      setActionError(accessRes.error || 'Erro ao salvar acessos e permissões.');
    }
  };

  const productIcons: Record<string, string> = {
    orcagraf: orcagrafSymbol,
    arteflow: arteflowSymbol,
    artecheck: artecheckSymbol,
  };

  const isCurrentActorAdminOrOwner =
    members.find((m) => m.userId === currentUser?.id)?.role === 'owner' ||
    members.find((m) => m.userId === currentUser?.id)?.role === 'admin';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Shield className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Usuários e Permissões
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie o time da sua organização e controle o acesso granular ao OrçaGraf, ArteFlow e ArteCheck.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchMembers} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {isCurrentActorAdminOrOwner && (
            <Button variant="primary" size="sm" onClick={() => setIsInviteModalOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Convidar Usuário
            </Button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-3 text-rose-800 dark:text-rose-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold">Erro: </span>
            {actionError}
          </div>
          <button onClick={() => setActionError(null)} className="ml-auto text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-3 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm font-medium">{actionSuccess}</div>
          <button onClick={() => setActionSuccess(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Members Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Membros da Organização ({members.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Todos os acessos são autenticados e isolados com segurança multi-tenant.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm">Carregando membros e permissões...</p>
          </div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            Nenhum membro encontrado na organização.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3.5">Usuário</th>
                  <th className="px-6 py-3.5">Papel</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Softwares Autorizados</th>
                  <th className="px-6 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.map((member) => {
                  const isOwner = member.role === 'owner';
                  const isSelf = member.userId === currentUser?.id;

                  return (
                    <tr key={member.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      {/* User Info */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-sm border border-indigo-200 dark:border-indigo-800">
                            {member.fullName?.charAt(0)?.toUpperCase() || member.email?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              {member.fullName || 'Usuário'}
                              {isSelf && (
                                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded font-normal">
                                  Você
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                              <Mail className="w-3.5 h-3.5" />
                              {member.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-6 py-4">
                        {isOwner ? (
                          <Badge variant="success" label="Proprietário" className="bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-semibold" />
                        ) : member.role === 'admin' ? (
                          <Badge variant="success" label="Administrador" className="bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 font-semibold" />
                        ) : (
                          <Badge variant="neutral" label="Membro" className="font-normal text-slate-600 dark:text-slate-400" />
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="px-6 py-4">
                        {member.isActive ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Inativo
                          </span>
                        )}
                      </td>

                      {/* Product Access Badges */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {member.products && member.products.length > 0 ? (
                            member.products.map((prod) => (
                              <span
                                key={prod}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
                                  prod === 'orcagraf'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                    : prod === 'arteflow'
                                    ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                                    : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                                }`}
                              >
                                <img src={productIcons[prod]} alt="" className="w-3.5 h-3.5 object-contain" />
                                {prod === 'orcagraf' ? 'OrçaGraf' : prod === 'arteflow' ? 'ArteFlow' : 'ArteCheck'}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">Nenhum produto liberado</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isCurrentActorAdminOrOwner && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEdit(member)}
                                title="Configurar permissões e acessos"
                              >
                                <Settings className="w-3.5 h-3.5 mr-1.5" />
                                Permissões
                              </Button>

                              {!isOwner && (
                                <button
                                  onClick={() => handleToggleStatus(member)}
                                  className={`p-1.5 rounded-lg border transition-colors ${
                                    member.isActive
                                      ? 'text-slate-400 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-800'
                                      : 'text-emerald-600 hover:text-emerald-700 hover:border-emerald-200 dark:hover:border-emerald-800'
                                  }`}
                                  title={member.isActive ? 'Desativar usuário' : 'Ativar usuário'}
                                >
                                  {member.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* DRAWER LATERAL: EDITAR MEMBRO & PERMISSÕES GRANULARES POR PRODUTO          */}
      {/* ========================================================================= */}
      {editingMember && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-600" />
                  Gerenciar Membro & Permissões
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {editingMember.fullName || editingMember.email} ({editingMember.email})
                </p>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Papel Organizacional */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Papel na Organização
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditRole('admin')}
                    disabled={editingMember.role === 'owner'}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      editRole === 'admin'
                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold ring-1 ring-indigo-600'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    } ${editingMember.role === 'owner' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="text-sm font-bold flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-indigo-600" />
                      Administrador
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Gerencia membros, permissões e convites da empresa.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditRole('member')}
                    disabled={editingMember.role === 'owner'}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      editRole === 'member'
                        ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold ring-1 ring-indigo-600'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    } ${editingMember.role === 'owner' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="text-sm font-bold flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-slate-500" />
                      Membro Padrão
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Acesso restrito apenas aos softwares e telas autorizadas.
                    </div>
                  </button>
                </div>
              </div>

              {/* Acesso por Software (Entitlements) */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Softwares Liberados para o Usuário
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['orcagraf', 'arteflow', 'artecheck'] as const).map((prodId) => {
                    const hasPlan = orgHasEntitlement(prodId);
                    const isEnabled = editProducts.includes(prodId);

                    return (
                      <button
                        key={prodId}
                        type="button"
                        disabled={!hasPlan}
                        onClick={() => {
                          if (isEnabled) {
                            setEditProducts(editProducts.filter((p) => p !== prodId));
                          } else {
                            setEditProducts([...editProducts, prodId]);
                          }
                        }}
                        className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          !hasPlan
                            ? 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/20'
                            : isEnabled
                            ? prodId === 'orcagraf'
                              ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 ring-1 ring-emerald-600'
                              : prodId === 'arteflow'
                              ? 'border-sky-600 bg-sky-50/50 dark:bg-sky-950/30 text-sky-900 dark:text-sky-200 ring-1 ring-sky-600'
                              : 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200 ring-1 ring-purple-600'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <img src={productIcons[prodId]} alt="" className="w-5 h-5 object-contain" />
                          <span className="font-bold text-xs uppercase tracking-wider">
                            {prodId === 'orcagraf' ? 'OrçaGraf' : prodId === 'arteflow' ? 'ArteFlow' : 'ArteCheck'}
                          </span>
                        </div>
                        <div className="mt-2 text-[11px]">
                          {!hasPlan ? (
                            <span className="text-rose-600 dark:text-rose-400 font-medium">Não contratado</span>
                          ) : isEnabled ? (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Liberado</span>
                          ) : (
                            <span className="text-slate-400">Bloqueado</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Abas Independentes de Permissões por Software */}
              <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 gap-3">
                  <div className="flex gap-2">
                    {(['orcagraf', 'arteflow', 'artecheck'] as const).map((prodId) => {
                      const tabHasPlan = orgHasEntitlement(prodId);
                      return (
                        <button
                          key={prodId}
                          onClick={() => setActiveProductTab(prodId)}
                          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                            activeProductTab === prodId
                              ? prodId === 'orcagraf'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : prodId === 'arteflow'
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'bg-purple-600 text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <img src={productIcons[prodId]} alt="" className="w-4 h-4 object-contain" />
                          <span>{prodId === 'orcagraf' ? 'OrçaGraf' : prodId === 'arteflow' ? 'ArteFlow' : 'ArteCheck'}</span>
                          {!tabHasPlan && (
                            <span className="text-[9px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 px-1.5 py-0.2 rounded">
                              Não contratado
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Preset Dropdown */}
                  <div className="flex items-center gap-2">
                    <Sparkles className={`w-4 h-4 ${orgHasEntitlement(activeProductTab) ? 'text-amber-500' : 'text-slate-300'}`} />
                    <select
                      disabled={!orgHasEntitlement(activeProductTab)}
                      className={`text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 font-medium text-slate-700 dark:text-slate-300 ${
                        !orgHasEntitlement(activeProductTab) ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800/40' : ''
                      }`}
                      onChange={(e) => {
                        if (e.target.value) handleApplyPreset(activeProductTab, e.target.value);
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        {orgHasEntitlement(activeProductTab) ? 'Aplicar Preset...' : 'Presets bloqueados'}
                      </option>
                      {PERMISSIONS_MATRIX[activeProductTab].presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Banner de Produto Não Contratado */}
                {!orgHasEntitlement(activeProductTab) && (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2.5 animate-in fade-in">
                    <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div>
                      <span className="font-bold">Produto não contratado pela organização.</span>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                        Contrate este software no menu Assinatura para liberar o acesso e habilitar a configuração de permissões para os usuários.
                      </p>
                    </div>
                  </div>
                )}

                {/* Categories & Switches */}
                <div className="space-y-6">
                  {PERMISSIONS_MATRIX[activeProductTab].categories.map((cat) => (
                    <div key={cat.id} className="space-y-2.5">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {cat.label}
                      </h4>
                      <div className="space-y-2">
                        {cat.permissions.map((perm) => {
                          const isTabEntitled = orgHasEntitlement(activeProductTab);
                          const isChecked = isTabEntitled && (editPermissions[activeProductTab]?.[perm.key] ?? false);

                          return (
                            <label
                              key={perm.key}
                              className={`flex items-start justify-between p-3 rounded-xl border transition-colors ${
                                !isTabEntitled
                                  ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                                  : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer'
                              }`}
                            >
                              <div className="pr-4">
                                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                  {perm.label}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  {perm.description}
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                disabled={!isTabEntitled}
                                checked={isChecked}
                                onChange={() => {
                                  if (isTabEntitled) {
                                    handleTogglePermission(activeProductTab, perm.key);
                                  }
                                }}
                                className="mt-1 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 disabled:cursor-not-allowed"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-end gap-3">
              <Button variant="outline" size="md" onClick={() => setEditingMember(null)}>
                Cancelar
              </Button>
              <Button variant="primary" size="md" onClick={handleSaveMemberChanges} disabled={isSavingPermissions}>
                {isSavingPermissions ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONVIDAR NOVO USUÁRIO                                              */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Convidar Novo Usuário"
      >
        <form onSubmit={handleSendInvite} className="space-y-5">
          <Input
            label="E-mail Corporativo"
            type="email"
            placeholder="usuario@suagrafica.com.br"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Papel na Organização
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setInviteRole('member')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  inviteRole === 'member'
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold ring-1 ring-indigo-600'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="text-xs font-bold">Membro Padrão</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Acessa apenas os softwares autorizados.</div>
              </button>

              <button
                type="button"
                onClick={() => setInviteRole('admin')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  inviteRole === 'admin'
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold ring-1 ring-indigo-600'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="text-xs font-bold">Administrador</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Pode gerenciar usuários e convites.</div>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Softwares a Liberar
            </label>
            <div className="space-y-2">
              {(['orcagraf', 'arteflow', 'artecheck'] as const).map((prodId) => {
                const hasPlan = orgHasEntitlement(prodId);
                const isSelected = inviteProducts.includes(prodId);

                return (
                  <label
                    key={prodId}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                      !hasPlan
                        ? 'opacity-40 cursor-not-allowed bg-slate-50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-800'
                        : isSelected
                        ? 'bg-indigo-50/30 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img src={productIcons[prodId]} alt="" className="w-5 h-5 object-contain" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {prodId === 'orcagraf' ? 'OrçaGraf' : prodId === 'arteflow' ? 'ArteFlow' : 'ArteCheck'}
                      </span>
                    </div>

                    {!hasPlan ? (
                      <span className="text-xs text-rose-500 font-medium">Não contratado</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (isSelected) {
                            setInviteProducts(inviteProducts.filter((p) => p !== prodId));
                          } else {
                            setInviteProducts([...inviteProducts, prodId]);
                          }
                        }}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setIsInviteModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" disabled={isInviting || !inviteEmail}>
              {isInviting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando Convite...
                </>
              ) : (
                'Gerar Convite'
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
