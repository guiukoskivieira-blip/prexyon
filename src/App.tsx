import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/Login/LoginPage';
import { PortalLayout } from './components/layout/PortalLayout';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { SubscriptionPage } from './pages/Subscription/SubscriptionPage';
import { UsersPage } from './pages/Users/UsersPage';
import { PermissionsPage } from './pages/Permissions/PermissionsPage';
import { ProfilePage } from './pages/Profile/ProfilePage';
import { SettingsPage } from './pages/Settings/SettingsPage';

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    return window.location.pathname.startsWith('/app') ? window.location.pathname : '/app';
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

  // If user is not logged in, render the 1:1 Login Page
  if (!isAuthenticated) {
    return (
      <LoginPage
        onLoginSuccess={() => navigate('/app')}
      />
    );
  }

  // Render the authenticated Shell & corresponding sub-page
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
