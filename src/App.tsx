import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/Login/LoginPage';
import { OnboardingPage } from './pages/Onboarding/OnboardingPage';
import { AcceptInvitePage } from './pages/Invite/AcceptInvitePage';
import { PortalLayout } from './components/layout/PortalLayout';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { SubscriptionPage } from './pages/Subscription/SubscriptionPage';
import { UsersPage } from './pages/Users/UsersPage';
import { PermissionsPage } from './pages/Permissions/PermissionsPage';
import { ProfilePage } from './pages/Profile/ProfilePage';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { Loader2 } from 'lucide-react';
import { PrexyonLogo } from './components/ui/PrexyonLogo';
import { canAccessRoute } from './security/routeAuthorization';

const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading, organization, refreshUserData } = useAuth();

  // Preservação de rota e token de convite em memória
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const path = window.location.pathname;
    if (path === '/onboarding') return '/onboarding';
    if (path === '/app/convite') return '/app/convite';
    return path.startsWith('/app') ? path : '/app';
  });

  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  });

  const [selectedProductIdForPerms, setSelectedProductIdForPerms] = useState<string>('orcagraf');

  // Handle URL history state
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname || '/app';
      setCurrentRoute(path);
      const params = new URLSearchParams(window.location.search);
      const tok = params.get('token');
      if (tok) setPendingInviteToken(tok);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (route: string) => {
    setCurrentRoute(route.split('?')[0]);
    window.history.pushState({}, '', route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 1. Loading State (evita flicker de redirect enquanto a sessão é resolvida)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center space-y-4">
        <PrexyonLogo variant="dark" className="h-8 w-auto animate-pulse" />
        <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-[#0066ff]" />
          <span>Carregando ambiente seguro...</span>
        </div>
      </div>
    );
  }

  // Identificação segura de convite ativo (via query param ou rota)
  const isInviteRoute = currentRoute === '/app/convite' || window.location.pathname === '/app/convite';
  const urlToken = new URLSearchParams(window.location.search).get('token');
  const activeInviteToken = pendingInviteToken || urlToken;

  // 2. Unauthenticated: Render Login com preservação do convite
  if (!isAuthenticated) {
    return (
      <LoginPage
        hasPendingInvite={Boolean(activeInviteToken)}
        onLoginSuccess={() => {
          if (activeInviteToken) {
            navigate(`/app/convite?token=${activeInviteToken}`);
          } else {
            navigate('/app');
          }
        }}
      />
    );
  }

  // ==============================================================================
  // REGRA DE PRECEDÊNCIA PÓS-AUTENTICAÇÃO
  // 1. Convite válido pendente explicitamente iniciado pelo usuário
  // 2. Membership existente
  // 3. Onboarding para criação de organização
  // ==============================================================================

  // Precedência 1: Fluxo de Aceite de Convite
  if (activeInviteToken && isInviteRoute) {
    return (
      <AcceptInvitePage
        token={activeInviteToken}
        onAccepted={async () => {
          setPendingInviteToken(null);
          await refreshUserData();
          navigate('/app');
        }}
        onCancel={() => {
          setPendingInviteToken(null);
          navigate('/app');
        }}
      />
    );
  }

  // Precedência 2 & 3: Checagem de Membership existente vs Onboarding
  const hasOrganization = Boolean(organization && organization.id && organization.id.trim() !== '');
  if (!hasOrganization) {
    // Precedência 3: Sem convite + Sem membership -> Onboarding
    return (
      <OnboardingPage
        onComplete={async () => {
          await refreshUserData();
          navigate('/app');
        }}
      />
    );
  }

  // Se o usuário já possui organização mas acessou /onboarding ou /app/convite sem token, redireciona para /app
  if (currentRoute === '/onboarding' || (currentRoute === '/app/convite' && !activeInviteToken)) {
    navigate('/app');
  }

  // Route Guard Centralizado: Se o papel do usuário não tiver permissão para a rota solicitada, redireciona para /app
  if (!canAccessRoute(user?.role, currentRoute)) {
    navigate('/app');
  }

  // Precedência 2: Autenticado com Organização -> Shell do Portal
  const renderSubPage = () => {
    // Defesa em profundidade no renderizador
    if (!canAccessRoute(user?.role, currentRoute)) {
      return (
        <DashboardPage
          onNavigate={(route) => {
            if (route === '/app/permissoes') {
              setSelectedProductIdForPerms('orcagraf');
            }
            navigate(route);
          }}
        />
      );
    }

    switch (currentRoute) {
      case '/app/assinatura':
        return <SubscriptionPage onBack={() => navigate('/app')} />;
      case '/app/usuarios':
        return (
          <UsersPage
            onBack={() => navigate('/app')}
            onNavigateToPermissions={(prodId) => {
              if (prodId) setSelectedProductIdForPerms(prodId);
              navigate('/app/permissoes');
            }}
          />
        );
      case '/app/permissoes':
        return (
          <PermissionsPage
            onBack={() => navigate('/app/usuarios')}
            initialProductId={selectedProductIdForPerms}
          />
        );
      case '/app/perfil':
        return <ProfilePage onBack={() => navigate('/app')} />;
      case '/app/configuracoes':
        return <SettingsPage onBack={() => navigate('/app')} />;
      case '/app':
      default:
        return (
          <DashboardPage
            onNavigate={(route) => {
              if (route === '/app/permissoes') {
                setSelectedProductIdForPerms('orcagraf');
              }
              navigate(route);
            }}
          />
        );
    }
  };

  return (
    <PortalLayout currentRoute={currentRoute} onNavigate={navigate}>
      {renderSubPage()}
    </PortalLayout>
  );
};

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
