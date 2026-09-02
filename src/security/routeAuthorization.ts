import { UserRole } from '../types/account';

export interface RoutePolicy {
  allowedRoles: UserRole[];
}

export const ROUTE_POLICIES: Record<string, RoutePolicy> = {
  '/app': { allowedRoles: ['owner', 'admin', 'member', 'guest'] },
  '/app/perfil': { allowedRoles: ['owner', 'admin', 'member', 'guest'] },
  '/app/usuarios': { allowedRoles: ['owner', 'admin'] },
  '/app/permissoes': { allowedRoles: ['owner', 'admin'] },
  '/app/assinatura': { allowedRoles: ['owner', 'admin'] },
  '/app/configuracoes': { allowedRoles: ['owner', 'admin'] },
};

/**
 * Verifica se um usuário com o papel informado pode acessar a rota especificada.
 * Bloqueia estritamente membros não administrativos de acessar telas de gestão.
 */
export function canAccessRoute(role: UserRole | string | undefined, route: string): boolean {
  if (!role) return false;
  const normalizedRoute = route.split('?')[0];
  const policy = ROUTE_POLICIES[normalizedRoute];
  if (!policy) {
    return true;
  }
  return policy.allowedRoles.includes(role as UserRole);
}

/**
 * Verifica se o usuário tem privilégio de gestão de usuários e convites.
 */
export function canManageUsers(role: UserRole | string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Verifica se o usuário tem privilégio de gestão de assinaturas e faturamento.
 */
export function canManageSubscription(role: UserRole | string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Verifica se o usuário tem privilégio de gestão de permissões de módulos.
 */
export function canManagePermissions(role: UserRole | string | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
