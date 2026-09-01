import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/Login/LoginPage';
import { OnboardingPage } from './pages/Onboarding/OnboardingPage';
import { PortalLayout } from './components/layout/PortalLayout';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { SubscriptionPage } from './pages/Subscription/SubscriptionPage';
import { UsersPage } from './pages/Users/UsersPage';
import { PermissionsPage } from './pages/Permissions/PermissionsPage';
import { ProfilePage } from './pages/Profile/ProfilePage';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { Loader2 } from 'lucide-react';
import { PrexyonLogo } from './components/ui/PrexyonLogo';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, organization } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    const path = window.location.pathname;
    if (path === '/onboarding') return '/onboarding';
    return path.startsWith('/app') ? path : '/app';
  });
  const [selectedProductIdForPerms, setSelectedProductIdForPerms] = useState<string>('orcagraf');

  // Handle URL history state
  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(window.location.pathname || '/app');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (route: string) => {
    setCurrentRoute(route);
    window.history.pushState({}, '', route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 1. Loading State (avoid redirect flicker during session resolution)
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

  // 2. Unauthenticated: Render Login
  if (!isAuthenticated) {
    return (
      <LoginPage
        onLoginSuccess={() => navigate('/app')}
      />
    );
  }

  // 3. Authenticated without Organization: Enforce Onboarding
  const hasOrganization = Boolean(organization && organization.id && organization.id.trim() !== '');
  if (!hasOrganization) {
    return (
      <OnboardingPage
        onComplete={() => navigate('/app')}
      />
    );
  }

  // If user already has an organization but visited /onboarding, redirect to /app
  if (currentRoute === '/onboarding') {
    navigate('/app');
  }

  // 4. Authenticated with Organization: Render Shell & Sub-pages
  const renderSubPage = () => {
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
