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
  availableOrganizations: Organization[];
  subscription: SubscriptionDetails | null;
  products: ProductInfo[];
  members: AccountMember[];
  invites: InviteRecord[];
  effectiveProducts: ProductId[];
  commercialProducts: ProductId[];
  homologationProducts: ProductId[];
  isAuthenticated: boolean;
  isLoading: boolean;
  isBackendConnected: boolean;
  authError: string | null;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  switchOrganization: (organizationId: string) => Promise<{ success: boolean; error?: string }>;
  updateProductStatus: (productId: ProductId, status: ProductStatus) => void;
  setOrganizationName: (name: string) => Promise<{ success: boolean; error?: string }>;
  updateUserProfile: (fullName: string) => Promise<{ success: boolean; error?: string }>;
  completeOnboarding: (params: {
    fullName: string;
    tradeName: string;
    corporateName?: string;
    document?: string;
    phone?: string;
    city?: string;
    state?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  inviteUser: (email: string, assignedProducts: ProductId[], role?: 'admin' | 'member' | 'guest') => Promise<{ success: boolean; error?: string }>;
  toggleMemberStatus: (memberId: string, status: 'active' | 'suspended') => Promise<{ success: boolean; error?: string }>;
  checkPermission: (productCode: ProductId, permissionKey?: string) => PermissionCheckResult;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<Organization>(isSupabaseConfigured() ? noOrgState : (isDev ? mockOrganization : noOrgState));
  const [availableOrganizations, setAvailableOrganizations] = useState<Organization[]>(isSupabaseConfigured() ? [] : (isDev ? [mockOrganization] : []));
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(isSupabaseConfigured() ? null : (isDev ? mockSubscription : null));
  const [products, setProducts] = useState<ProductInfo[]>(mockProducts);
  const [members, setMembers] = useState<AccountMember[]>(isSupabaseConfigured() ? [] : (isDev ? mockMembers : []));
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const isBackendConnected = isSupabaseConfigured();
  const [effectiveProducts, setEffectiveProducts] = useState<ProductId[]>([]);
  const [commercialProducts, setCommercialProducts] = useState<ProductId[]>([]);
  const [homologationProducts, setHomologationProducts] = useState<ProductId[]>([]);

  // Helper para sincronizar status dos produtos separando estado comercial de autorização
  const syncProductsWithAuthorization = useCallback((
    _sub: SubscriptionDetails | null,
    commProducts: ProductId[],
    homologProducts: ProductId[],
    entitledProducts: ProductId[],
    userRole: string,
    currentMember: AccountMember | null
  ) => {
    setProducts((prev) =>
      prev.map((prod) => {
        const isCommercial = commProducts.includes(prod.id);
        const isHomologation = homologProducts.includes(prod.id) && !isCommercial;
        const isEntitledByOrg = entitledProducts.includes(prod.id);

        // Autorização efetiva do usuário no produto:
        // Owner possui acesso se a organização tiver entitlement
        // Member/Admin precisa de entitlement na org E habilitação em assignedProducts
        let userHasProductAccess = false;
        if (isEntitledByOrg) {
          if (userRole === 'owner') {
            userHasProductAccess = true;
          } else {
            userHasProductAccess = currentMember ? currentMember.assignedProducts.includes(prod.id) : false;
          }
        }

        let status: ProductStatus = 'inactive';
        let statusLabel = 'Não contratado';
        let entitlementType: 'commercial' | 'homologation' | 'none' = 'none';

        if (isCommercial) {
          entitlementType = 'commercial';
          statusLabel = userHasProductAccess ? 'Contratado' : 'Sem acesso';
          status = userHasProductAccess ? 'active' : 'inactive';
        } else if (isHomologation) {
          entitlementType = 'homologation';
          statusLabel = userHasProductAccess ? 'Acesso de homologação' : 'Sem acesso';
          status = userHasProductAccess ? 'homologation' : 'inactive';
        } else {
          entitlementType = 'none';
          statusLabel = 'Não contratado';
          status = 'inactive';
        }

        let ctaText = 'Não disponível';
        if (userHasProductAccess) {
          ctaText = `Abrir ${prod.name}`;
        } else if (userRole === 'owner') {
          ctaText = isEntitledByOrg ? 'Gerenciar acesso' : `Assinar ${prod.name}`;
        } else {
          ctaText = 'Não disponível';
        }

        return {
          ...prod,
          status,
          statusLabel,
          ctaText,
          isSubscribed: userHasProductAccess,
          entitlementType,
        };
      })
    );
  }, []);

  // Helper para carregar os dados de contexto de uma organização específica
  const loadOrgContext = useCallback(async (
    targetOrg: Organization,
    userId: string,
    authUser: AuthUser
  ) => {
    if (!targetOrg.id) {
      setSubscription(null);
      setEffectiveProducts([]);
      setCommercialProducts([]);
      setHomologationProducts([]);
      syncProductsWithAuthorization(null, [], [], [], 'member', null);
      setMembers([]);
      return;
    }

    try {
      const [sub, mems, entRes] = await Promise.all([
        subscriptionService.fetchOrganizationSubscription(targetOrg.id),
        organizationService.getMembers(targetOrg.id),
        (supabase.rpc as any)('prexyon_get_organization_entitlements', { p_org_id: targetOrg.id }),
      ]);

      const rawEffective: string[] = entRes?.data?.effective_products || [];
      const rawCommercial: string[] = entRes?.data?.commercial_products || [];
      const rawHomologation: string[] = entRes?.data?.homologation_products || [];

      const entProducts = rawEffective.filter((p): p is ProductId => ['orcagraf', 'arteflow', 'artecheck'].includes(p));
      const commProducts = rawCommercial.filter((p): p is ProductId => ['orcagraf', 'arteflow', 'artecheck'].includes(p));
      const homologProducts = rawHomologation.filter((p): p is ProductId => ['orcagraf', 'arteflow', 'artecheck'].includes(p));

      setEffectiveProducts(entProducts);
      setCommercialProducts(commProducts);
      setHomologationProducts(homologProducts);
      setSubscription(sub);

      const currentMember = (mems || []).find((m) => m.userId === userId) || null;
      syncProductsWithAuthorization(sub, commProducts, homologProducts, entProducts, authUser.role, currentMember);

      if (mems && mems.length > 0) {
        setMembers(mems);
      } else {
        setMembers([
          {
            id: `mem_${userId}`,
            userId: userId,
            name: authUser.name,
            email: authUser.email,
            initials: authUser.initials,
            role: (authUser.role as any) || 'owner',
            status: 'active',
            assignedProducts: entProducts,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error('Erro ao carregar contexto da organização:', err);
      setSubscription(null);
      setEffectiveProducts([]);
      setCommercialProducts([]);
      setHomologationProducts([]);
      syncProductsWithAuthorization(null, [], [], [], 'member', null);
    }
  }, [syncProductsWithAuthorization]);

  // Helper para carregar todos os dados reais do usuário autenticado e suas organizações
  const loadUserData = useCallback(async (userId: string, email: string, preferredOrgId?: string) => {
    try {
      const [profile, orgs] = await Promise.all([
        userService.getProfile(userId, email),
        organizationService.getUserOrganizations(userId),
      ]);

      const validOrgs = Array.isArray(orgs) ? orgs : [];
      setAvailableOrganizations(validOrgs);

      // Determinar organização ativa respeitando persistência ou primeira válida
      const savedOrgId = preferredOrgId || (typeof localStorage !== 'undefined' ? localStorage.getItem('prexyon_active_org_id') : null);
      const matchedOrg = savedOrgId ? validOrgs.find((o) => o.id === savedOrgId) : null;
      const effectiveOrg = matchedOrg || (validOrgs.length > 0 ? validOrgs[0] : noOrgState);

      setOrganization(effectiveOrg);

      if (effectiveOrg.id && typeof localStorage !== 'undefined') {
        localStorage.setItem('prexyon_active_org_id', effectiveOrg.id);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('prexyon_active_org_id');
      }

      // Resolução de nome por prioridade: profiles.full_name -> email derivado
      const resolvedFullName = profile.name && profile.name !== email.split('@')[0]
        ? profile.name
        : (profile.name || email.split('@')[0] || 'Usuário');

      const authUser: AuthUser = {
        id: userId,
        name: resolvedFullName,
        firstName: profile.firstName || resolvedFullName.split(' ')[0] || 'Usuário',
        lastName: profile.lastName || resolvedFullName.split(' ').slice(1).join(' ') || '',
        email: email,
        avatarUrl: profile.avatarUrl,
        initials: profile.initials || 'US',
        role: (effectiveOrg.userRole as any) || 'owner',
        accountId: effectiveOrg.id,
      };
      setUser(authUser);

      await loadOrgContext(effectiveOrg, userId, authUser);
    } catch (err) {
      console.error('Erro ao carregar dados do usuário:', err);
      setOrganization(noOrgState);
      setAvailableOrganizations([]);
      setSubscription(null);
      setEffectiveProducts([]);
      setCommercialProducts([]);
      setHomologationProducts([]);
      syncProductsWithAuthorization(null, [], [], [], 'member', null);
    }
  }, [loadOrgContext, syncProductsWithAuthorization]);

  // Função para alternar entre organizações autorizadas
  const switchOrganization = useCallback(async (orgId: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'Usuário não autenticado.' };
    }

    const targetOrg = availableOrganizations.find((o) => o.id === orgId);
    if (!targetOrg) {
      return { success: false, error: 'Organização não autorizada para este usuário.' };
    }

    setOrganization(targetOrg);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('prexyon_active_org_id', targetOrg.id);
    }

    const updatedUser: AuthUser = {
      ...user,
      role: (targetOrg.userRole as any) || 'owner',
      accountId: targetOrg.id,
    };
    setUser(updatedUser);

    await loadOrgContext(targetOrg, user.id, updatedUser);
    return { success: true };
  }, [availableOrganizations, loadOrgContext, user]);

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
          setAvailableOrganizations([]);
          setSubscription(null);
          setEffectiveProducts([]);
          setCommercialProducts([]);
          setHomologationProducts([]);
          setMembers([]);
          syncProductsWithAuthorization(null, [], [], [], 'member', null);
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('prexyon_demo_auth');
            localStorage.removeItem('prexyon_active_org_id');
          }
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
  }, [isBackendConnected, loadUserData, syncProductsWithAuthorization]);

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
    setAvailableOrganizations([]);
    setSubscription(null);
    setEffectiveProducts([]);
    setCommercialProducts([]);
    setHomologationProducts([]);
    setMembers([]);
    syncProductsWithAuthorization(null, [], [], [], 'member', null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('prexyon_demo_auth');
      localStorage.removeItem('prexyon_active_org_id');
    }
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
          homologation: 'Acesso de homologação',
          trial: 'Período de teste',
          inactive: 'Inativo',
          coming_soon: 'Em breve',
          suspended: 'Suspenso',
        };
        const ctas: Record<ProductStatus, string> = {
          active: `Abrir ${prod.name}`,
          homologation: `Abrir ${prod.name}`,
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
          isSubscribed: status === 'active' || status === 'homologation' || status === 'trial',
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

  const completeOnboarding = async (params: {
    fullName: string;
    tradeName: string;
    corporateName?: string;
    document?: string;
    phone?: string;
    city?: string;
    state?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Usuário não autenticado.' };

    const res = await organizationService.createOrganization({
      tradeName: params.tradeName,
      corporateName: params.corporateName,
      document: params.document,
      fullName: params.fullName,
    });

    if (!res.success || !res.organization) {
      return { success: false, error: res.error || 'Erro ao criar organização.' };
    }

    await loadUserData(user.id, user.email || '');
    return { success: true };
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
        assignedProducts: effectiveProducts,
        createdAt: new Date().toISOString(),
      };

      const userProductAccess: Record<ProductId, boolean> = {
        orcagraf: currentMember.role === 'owner' ? effectiveProducts.includes('orcagraf') : currentMember.assignedProducts.includes('orcagraf'),
        arteflow: currentMember.role === 'owner' ? effectiveProducts.includes('arteflow') : currentMember.assignedProducts.includes('arteflow'),
        artecheck: currentMember.role === 'owner' ? effectiveProducts.includes('artecheck') : currentMember.assignedProducts.includes('artecheck'),
      };

      const context: PermissionEngineContext = {
        user,
        organization,
        member: currentMember,
        subscription,
        effectiveProducts,
        userProductAccess,
      };

      return can(context, productCode, permissionKey);
    },
    [user, organization, members, subscription, effectiveProducts]
  );

  const refreshUserData = useCallback(async () => {
    if (isBackendConnected) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await loadUserData(session.user.id, session.user.email || '');
        }
      } catch (err) {
        console.error('Erro ao atualizar dados do usuário:', err);
      }
    }
  }, [loadUserData]);

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        availableOrganizations,
        subscription,
        products,
        members,
        invites,
        effectiveProducts,
        commercialProducts,
        homologationProducts,
        isAuthenticated: !!user,
        isLoading,
        isBackendConnected,
        authError,
        login,
        logout,
        resetPassword,
        switchOrganization,
        updateProductStatus,
        setOrganizationName,
        updateUserProfile,
        completeOnboarding,
        inviteUser,
        toggleMemberStatus,
        checkPermission,
        refreshUserData,
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
