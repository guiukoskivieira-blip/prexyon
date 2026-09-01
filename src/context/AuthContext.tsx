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
import { invitesService, InviteRecord } from '../services/invitesService';
import { userService } from '../services/userService';
import { can, PermissionCheckResult, PermissionEngineContext } from '../services/permissionEngine';

interface AuthContextType {
  user: AuthUser | null;
  organization: Organization;
  subscription: SubscriptionDetails;
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
  const [organization, setOrganization] = useState<Organization>(mockOrganization);
  const [subscription] = useState<SubscriptionDetails>(mockSubscription);
  const [products, setProducts] = useState<ProductInfo[]>(mockProducts);
  const [members, setMembers] = useState<AccountMember[]>(mockMembers);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const isBackendConnected = isSupabaseConfigured();

  // Verifica se está em ambiente de desenvolvimento Vite
  const isDevMode = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

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
            const profile = await userService.getProfile(session.user.id);
            const authUser: AuthUser = {
              id: session.user.id,
              name: profile.name || session.user.email?.split('@')[0] || 'Usuário',
              firstName: profile.firstName || session.user.email?.split('@')[0] || 'Usuário',
              lastName: profile.lastName || '',
              email: session.user.email || '',
              avatarUrl: profile.avatarUrl,
              initials: profile.initials || 'US',
              role: 'owner',
              accountId: mockOrganization.id,
            };
            setUser(authUser);
            const org = await organizationService.getOrganization();
            setOrganization(org);
            const mems = await organizationService.getMembers(org.id);
            setMembers(mems);
          } else if (mounted && isDevMode) {
            // Em DESENVOLVIMENTO: Restaura sessão de teste local se salva
            const localSaved = localStorage.getItem('prexyon_demo_auth');
            if (localSaved === 'true') {
              setUser(mockUser);
            }
          }
        } catch (err) {
          console.warn('Falha na inicialização do Supabase:', err);
          if (isDevMode && mounted) {
            const localSaved = localStorage.getItem('prexyon_demo_auth');
            if (localSaved === 'true') {
              setUser(mockUser);
            }
          } else if (!isDevMode && mounted) {
            // PRODUÇÃO: Fail-closed estrito
            setAuthError('Falha ao conectar com o serviço central de autenticação.');
          }
        }
      } else {
        // Supabase não configurado
        if (isDevMode) {
          // Modo desenvolvimento local
          const localSaved = localStorage.getItem('prexyon_demo_auth');
          if (localSaved === 'true' || localSaved === null) {
            setUser(mockUser);
          }
        } else {
          // PRODUÇÃO: Fail-closed (proíbe sessão simulada)
          setAuthError('Serviço de autenticação não configurado em ambiente de produção.');
          setUser(null);
          localStorage.removeItem('prexyon_demo_auth');
        }
      }

      if (mounted) setIsLoading(false);
    }

    initializeAuth();

    // Listen to Supabase auth events if configured
    if (isBackendConnected) {
      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_IN' && session?.user) {
          const profile = await userService.getProfile(session.user.id);
          const authUser: AuthUser = {
            id: session.user.id,
            name: profile.name || session.user.email?.split('@')[0] || 'Usuário',
            firstName: profile.firstName || session.user.email?.split('@')[0] || 'Usuário',
            lastName: profile.lastName || '',
            email: session.user.email || '',
            avatarUrl: profile.avatarUrl,
            initials: profile.initials || 'US',
            role: 'owner',
            accountId: organization.id,
          };
          setUser(authUser);
          localStorage.setItem('prexyon_demo_auth', 'true');
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
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
  }, [isBackendConnected, isDevMode, organization.id]);

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
          const profile = await userService.getProfile(data.user.id);
          const authUser: AuthUser = {
            id: data.user.id,
            name: profile.name || data.user.email?.split('@')[0] || 'Usuário',
            firstName: profile.firstName || data.user.email?.split('@')[0] || 'Usuário',
            lastName: profile.lastName || '',
            email: data.user.email || '',
            avatarUrl: profile.avatarUrl,
            initials: profile.initials || 'US',
            role: 'owner',
            accountId: organization.id,
          };
          setUser(authUser);
          localStorage.setItem('prexyon_demo_auth', 'true');
          setIsLoading(false);
          return { success: true };
        }
      } catch (err: any) {
        setIsLoading(false);
        return { success: false, error: err.message || 'Falha de comunicação com o servidor de autenticação.' };
      }
    }

    // Se em produção e sem Supabase -> Fail Closed
    if (!isDevMode) {
      setIsLoading(false);
      const errorMsg = 'Autenticação real obrigatória em ambiente de produção.';
      setAuthError(errorMsg);
      return { success: false, error: errorMsg };
    }

    // Fallback permitido apenas em desenvolvimento
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

    if (!isDevMode) {
      return { success: false, error: 'Serviço de recuperação indisponível em produção.' };
    }

    // Simulação apenas em dev
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
    setOrganization((prev) => ({ ...prev, name }));
    return organizationService.updateOrganization(organization.id, { name });
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
    if (!user) return { success: false, error: 'Usuário não autenticado.' };

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
        assignedProducts: ['orcagraf', 'arteflow', 'artecheck'],
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
