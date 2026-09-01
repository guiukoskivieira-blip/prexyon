import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthUser, LoginCredentials } from '../types/auth';
import { Organization, AccountMember } from '../types/account';
import { ProductInfo, ProductId, ProductStatus } from '../types/product';
import { SubscriptionDetails } from '../types/subscription';
import { mockUser, mockOrganization, mockMembers } from '../data/mockAccount';
import { mockProducts } from '../data/mockProducts';
import { mockSubscription } from '../data/mockSubscription';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { organizationService } from '../services/organizationService';
import { subscriptionService } from '../services/subscriptionService';
import { invitesService, InviteRecord } from '../services/invitesService';
import { userService } from '../services/userService';
import { can, PermissionCheckResult, PermissionEngineContext } from '../services/permissionEngine';

const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

const noOrgState: Organization = {
  id: '',
  name: 'Nenhuma organização vinculada',
  tradeName: 'Nenhuma organização vinculada',
  status: 'suspended',
  createdAt: '',
  updatedAt: '',
};

interface AuthContextType {
  user: AuthUser | null;
  organization: Organization;
  subscription: SubscriptionDetails | null;
  products: ProductInfo[];
  members: AccountMember[];
  invites: InviteRecord[];
  isAuthenticated: boolean;
  isLoading: boolean;
  isBackendConnected: boolean;
  authError: string | null;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updateProductStatus: (productId: ProductId, status: ProductStatus) => void;
  setOrganizationName: (name: string) => Promise<{ success: boolean; error?: string }>;
  updateUserProfile: (fullName: string) => Promise<{ success: boolean; error?: string }>;
  inviteUser: (email: string, assignedProducts: ProductId[], role?: 'admin' | 'member' | 'guest') => Promise<{ success: boolean; error?: string }>;
  toggleMemberStatus: (memberId: string, status: 'active' | 'suspended') => Promise<{ success: boolean; error?: string }>;
  checkPermission: (productCode: ProductId, permissionKey?: string) => PermissionCheckResult;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<Organization>(isSupabaseConfigured() ? noOrgState : (isDev ? mockOrganization : noOrgState));
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(isSupabaseConfigured() ? null : (isDev ? mockSubscription : null));
  const [products, setProducts] = useState<ProductInfo[]>(mockProducts);
  const [members, setMembers] = useState<AccountMember[]>(isSupabaseConfigured() ? [] : (isDev ? mockMembers : []));
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const isBackendConnected = isSupabaseConfigured();

  // Helper para sincronizar status dos produtos com a assinatura real
  const syncProductsWithSubscription = useCallback((sub: SubscriptionDetails | null) => {
    setProducts((prev) =>
      prev.map((prod) => {
        const subProd = sub?.includedProducts.find((p) => p.id === prod.id);
        const isSubscribed = Boolean(subProd?.includedInPlan && (sub?.status === 'active' || sub?.status === 'trialing'));
        return {
          ...prod,
          status: isSubscribed ? ('active' as ProductStatus) : ('inactive' as ProductStatus),
          statusLabel: isSubscribed ? 'Ativo' : 'Não contratado',
          ctaText: isSubscribed ? `Abrir ${prod.name}` : `Assinar ${prod.name}`,
          isSubscribed,
        };
      })
    );
  }, []);

  // Helper para carregar todos os dados reais do usuário autenticado
  const loadUserData = useCallback(async (userId: string, email: string) => {
    try {
      const [profile, org] = await Promise.all([
        userService.getProfile(userId, email),
        organizationService.getUserOrganization(userId),
      ]);

      const effectiveOrg = org || noOrgState;
      setOrganization(effectiveOrg);

      const authUser: AuthUser = {
        id: userId,
        name: profile.name || email.split('@')[0] || 'Usuário',
        firstName: profile.firstName || email.split('@')[0] || 'Usuário',
        lastName: profile.lastName || '',
        email: email,
        avatarUrl: profile.avatarUrl,
        initials: profile.initials || 'US',
        role: 'owner',
        accountId: effectiveOrg.id,
      };
      setUser(authUser);

      if (effectiveOrg.id) {
        const [sub, mems] = await Promise.all([
          subscriptionService.fetchOrganizationSubscription(effectiveOrg.id),
          organizationService.getMembers(effectiveOrg.id),
        ]);

        setSubscription(sub);
        syncProductsWithSubscription(sub);

        if (mems && mems.length > 0) {
          setMembers(mems);
        } else {
          // Se ainda não existirem outros membros, cria o registro do próprio usuário
          setMembers([
            {
              id: `mem_${userId}`,
              userId: userId,
              name: authUser.name,
              email: authUser.email,
              initials: authUser.initials,
              role: 'owner',
              status: 'active',
              assignedProducts: sub ? sub.includedProducts.filter((p) => p.includedInPlan).map((p) => p.id as ProductId) : [],
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } else {
        // Usuário sem organização: garante isolamento fail-closed estrito
        setSubscription(null);
        syncProductsWithSubscription(null);
        setMembers([]);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do usuário:', err);
      setOrganization(noOrgState);
      setSubscription(null);
      syncProductsWithSubscription(null);
    }
  }, [syncProductsWithSubscription]);

  // Load session on startup
  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      if (isBackendConnected) {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error) {
            console.error('Supabase session fetch error:', error);
          }

          if (session?.user && mounted) {
            await loadUserData(session.user.id, session.user.email || '');
          } else if (mounted && isDev) {
            const localSaved = localStorage.getItem('prexyon_demo_auth');
            if (localSaved === 'true') {
              setUser(mockUser);
            }
          }
        } catch (err) {
          console.warn('Falha na inicialização do Supabase:', err);
          if (isDev && mounted) {
            const localSaved = localStorage.getItem('prexyon_demo_auth');
            if (localSaved === 'true') {
              setUser(mockUser);
            }
          } else if (!isDev && mounted) {
            setAuthError('Falha ao conectar com o serviço central de autenticação.');
          }
        }
      } else {
        if (isDev) {
          const localSaved = localStorage.getItem('prexyon_demo_auth');
          if (localSaved === 'true' || localSaved === null) {
            setUser(mockUser);
          }
        } else {
          setAuthError('Serviço de autenticação não configurado em ambiente de produção.');
          setUser(null);
          localStorage.removeItem('prexyon_demo_auth');
        }
      }

      if (mounted) setIsLoading(false);
    }

    initializeAuth();

    if (isBackendConnected) {
      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_IN' && session?.user) {
          await loadUserData(session.user.id, session.user.email || '');
          localStorage.setItem('prexyon_demo_auth', 'true');
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setOrganization(noOrgState);
          setSubscription(null);
          setMembers([]);
          syncProductsWithSubscription(null);
          localStorage.removeItem('prexyon_demo_auth');
        }
      });

      return () => {
        mounted = false;
        authListener.subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, [isBackendConnected, loadUserData, syncProductsWithSubscription]);

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setAuthError(null);

    if (!credentials.email) {
      setIsLoading(false);
      return { success: false, error: 'Por favor, informe seu e-mail cadastrado.' };
    }

    if (isBackendConnected) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password || '',
        });

        if (error) {
          setIsLoading(false);
          return { success: false, error: error.message };
        }

        if (data.user) {
          await loadUserData(data.user.id, data.user.email || credentials.email);
          localStorage.setItem('prexyon_demo_auth', 'true');
          setIsLoading(false);
          return { success: true };
        }
      } catch (err: any) {
        setIsLoading(false);
        return { success: false, error: err.message || 'Falha de comunicação com o servidor de autenticação.' };
      }
    }

    if (!isDev) {
      setIsLoading(false);
      const errorMsg = 'Autenticação real obrigatória em ambiente de produção.';
      setAuthError(errorMsg);
      return { success: false, error: errorMsg };
    }

    // Fallback permitido apenas em desenvolvimento sem backend
    await new Promise((resolve) => setTimeout(resolve, 500));
    const simulatedUser: AuthUser = {
      ...mockUser,
      email: credentials.email,
      name: credentials.email.split('@')[0] || mockUser.name,
      firstName: credentials.email.split('@')[0] || mockUser.firstName,
    };
    setUser(simulatedUser);
    localStorage.setItem('prexyon_demo_auth', 'true');
    setIsLoading(false);
    return { success: true };
  };

  const logout = async () => {
    setIsLoading(true);
    if (isBackendConnected) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Error signing out from Supabase:', err);
      }
    }
    setUser(null);
    setOrganization(noOrgState);
    setSubscription(null);
    setMembers([]);
    syncProductsWithSubscription(null);
    localStorage.removeItem('prexyon_demo_auth');
    setIsLoading(false);
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (!email) return { success: false, error: 'Informe um e-mail válido.' };

    if (isBackendConnected) {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login?recovery=true`,
        });
        if (error) return { success: false, error: error.message };
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    if (!isDev) {
      return { success: false, error: 'Serviço de recuperação indisponível em produção.' };
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
    return { success: true };
  };

  const updateProductStatus = (productId: ProductId, status: ProductStatus) => {
    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.id !== productId) return prod;
        const labels: Record<ProductStatus, string> = {
          active: 'Ativo',
          trial: 'Período de teste',
          inactive: 'Inativo',
          coming_soon: 'Em breve',
          suspended: 'Suspenso',
        };
        const ctas: Record<ProductStatus, string> = {
          active: `Abrir ${prod.name}`,
          trial: `Acessar Teste ${prod.name}`,
          inactive: `Assinar ${prod.name}`,
          coming_soon: 'Conhecer produto',
          suspended: 'Acesso suspenso',
        };
        return {
          ...prod,
          status,
          statusLabel: labels[status],
          ctaText: ctas[status],
          isSubscribed: status === 'active' || status === 'trial',
        };
      })
    );
  };

  const setOrganizationName = async (name: string): Promise<{ success: boolean; error?: string }> => {
    setOrganization((prev) => ({ ...prev, name, tradeName: name }));
    if (organization.id) {
      return organizationService.updateOrganization(organization.id, { name });
    }
    return { success: true };
  };

  const updateUserProfile = async (fullName: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Usuário não autenticado.' };
    const firstName = fullName.split(' ')[0];
    const lastName = fullName.split(' ').slice(1).join(' ');
    const initials = fullName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    setUser((prev) => (prev ? { ...prev, name: fullName, firstName, lastName, initials } : null));
    return userService.updateProfile(user.id, fullName);
  };

  const inviteUser = async (
    email: string,
    assignedProducts: ProductId[],
    role: 'admin' | 'member' | 'guest' = 'member'
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user || !organization.id) return { success: false, error: 'Usuário ou organização não autenticados.' };

    const res = await invitesService.createInvite({
      organizationId: organization.id,
      email,
      invitedByUserId: user.id,
      assignedProducts,
      role,
    });

    if (res.success && res.invite) {
      setInvites((prev) => [res.invite!, ...prev]);
      const newMember: AccountMember = {
        id: `mem_${Date.now()}`,
        userId: `usr_inv_${Date.now()}`,
        name: email.split('@')[0],
        email,
        initials: email.substring(0, 2).toUpperCase(),
        role,
        status: 'invited',
        assignedProducts,
        createdAt: new Date().toISOString(),
      };
      setMembers((prev) => [newMember, ...prev]);
      return { success: true };
    }

    return { success: false, error: res.error || 'Erro ao enviar convite.' };
  };

  const toggleMemberStatus = async (
    memberId: string,
    newStatus: 'active' | 'suspended'
  ): Promise<{ success: boolean; error?: string }> => {
    if (!organization.id) return { success: false, error: 'Organização não identificada.' };

    const result = await organizationService.updateMemberStatus(
      organization.id,
      memberId,
      newStatus,
      members
    );

    if (result.success) {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, status: newStatus } : m))
      );
      return { success: true };
    }

    return result;
  };

  const checkPermission = useCallback(
    (productCode: ProductId, permissionKey?: string): PermissionCheckResult => {
      const currentMember = members.find((m) => m.userId === user?.id) || {
        id: 'mem_owner',
        userId: user?.id || '',
        name: user?.name || '',
        email: user?.email || '',
        initials: user?.initials || 'US',
        role: (user?.role || 'owner') as any,
        status: 'active',
        assignedProducts: subscription ? subscription.includedProducts.filter((p) => p.includedInPlan).map((p) => p.id as ProductId) : [],
        createdAt: new Date().toISOString(),
      };

      const userProductAccess: Record<ProductId, boolean> = {
        orcagraf: currentMember.assignedProducts.includes('orcagraf'),
        arteflow: currentMember.assignedProducts.includes('arteflow'),
        artecheck: currentMember.assignedProducts.includes('artecheck'),
      };

      const context: PermissionEngineContext = {
        user,
        organization,
        member: currentMember,
        subscription,
        userProductAccess,
      };

      return can(context, productCode, permissionKey);
    },
    [user, organization, members, subscription]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        subscription,
        products,
        members,
        invites,
        isAuthenticated: !!user,
        isLoading,
        isBackendConnected,
        authError,
        login,
        logout,
        resetPassword,
        updateProductStatus,
        setOrganizationName,
        updateUserProfile,
        inviteUser,
        toggleMemberStatus,
        checkPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
