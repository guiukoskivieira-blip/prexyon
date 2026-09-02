import { AuthUser } from '../types/auth';
import { Organization, AccountMember } from '../types/account';
import { ProductId } from '../types/product';
import { SubscriptionDetails } from '../types/subscription';

export type PermissionDecisionReason =
  | 'unauthenticated'
  | 'not_organization_member'
  | 'member_suspended'
  | 'organization_suspended'
  | 'owner_bypass'
  | 'product_not_subscribed'
  | 'product_access_disabled'
  | 'explicit_override_deny'
  | 'explicit_override_allow'
  | 'role_granted'
  | 'default_deny';

export interface PermissionCheckResult {
  allowed: boolean;
  reason: PermissionDecisionReason;
  details?: string;
}

export interface ProductRoleState {
  roleId: string;
  roleName: string;
  permissions: string[]; // List of permission keys
}

export interface PermissionEngineContext {
  user: AuthUser | null;
  organization: Organization | null;
  member: AccountMember | null;
  subscription: SubscriptionDetails | null;
  effectiveProducts?: ProductId[];
  userProductAccess: Record<ProductId, boolean>;
  userProductRoles?: Partial<Record<ProductId, ProductRoleState>>;
  userPermissionOverrides?: Record<string, 'allow' | 'deny'>; // key: `${productId}:${permissionKey}`
}

/**
 * Motor Central de Resolução de Permissão Efetiva Prexyon
 * 
 * Regra de Precedência Rigorosa:
 * 1. Autenticação & Vínculo com a Organização Ativa
 * 2. Status Ativo do Membro e da Organização
 * 3. Dono da Conta (Owner) possui acesso administrativo pleno
 * 4. Produto Contratado e Ativo na Assinatura da Organização
 * 5. Acesso do Usuário Habilitado ao Produto (user_product_access)
 * 6. Overrides Individuais:
 *    - EXPLICIT DENY -> NEGAÇÃO IMEDIATA (Prevalece sobre qualquer Role)
 *    - EXPLICIT ALLOW -> CONCEDE ACESSO
 * 7. Permissões do Papel (Role) Atribuído no Produto
 * 8. Fallback de Segurança: DENY
 */
export function can(
  context: PermissionEngineContext,
  productCode: ProductId,
  permissionKey?: string
): PermissionCheckResult {
  const {
    user,
    organization,
    member,
    subscription,
    userProductAccess,
    userProductRoles,
    userPermissionOverrides,
  } = context;

  // 1. Verificação de Autenticação
  if (!user) {
    return { allowed: false, reason: 'unauthenticated', details: 'Usuário não autenticado.' };
  }

  // 2. Verificação de Organização
  if (!organization || !member) {
    return { allowed: false, reason: 'not_organization_member', details: 'Usuário não pertence a esta organização.' };
  }

  // 3. Status do Membro
  if (member.status === 'suspended') {
    return { allowed: false, reason: 'member_suspended', details: 'Acesso do usuário suspenso pela administração.' };
  }
  if (member.status !== 'active') {
    return { allowed: false, reason: 'member_suspended', details: 'Membro aguardando ativação ou inativo.' };
  }

  // 4. Status da Organização
  if (organization.status === 'suspended' || organization.status === 'archived') {
    return { allowed: false, reason: 'organization_suspended', details: 'Conta da organização suspensa.' };
  }

  // 5. Bypass do Dono (Owner da conta possui privilégio administrativo geral)
  // Checagem de Entitlement Efetivo (Homologação OU Assinatura Comercial)
  const subProduct = subscription?.includedProducts.find((p) => p.id === productCode);
  const isSubscribed = Boolean(subProduct?.includedInPlan && (subscription?.status === 'active' || subscription?.status === 'trialing'));
  const isEntitled = Boolean((context.effectiveProducts && context.effectiveProducts.includes(productCode)) || isSubscribed);

  // 5. Bypass do Dono (Owner da conta possui privilégio administrativo geral)
  if (member.role === 'owner' || user.role === 'owner') {
    // Mesmo o owner respeita se o produto estiver totalmente ausente dos produtos ativos da conta
    if (!isEntitled && permissionKey) {
      return { allowed: false, reason: 'product_not_subscribed', details: `O produto ${productCode} não faz parte dos produtos ativos da organização.` };
    }

    return { allowed: true, reason: 'owner_bypass', details: 'Acesso concedido por privilégio de Proprietário da Conta.' };
  }

  // 6. Produto Disponível na Organização (Entitlement Efetivo)
  if (!isEntitled) {
    return {
      allowed: false,
      reason: 'product_not_subscribed',
      details: `O produto ${productCode} não está ativo na assinatura ou homologação da organização.`
    };
  }

  // 7. Acesso do Usuário ao Produto Específico (user_product_access)
  const hasProductAccess = userProductAccess[productCode] === true || member.assignedProducts.includes(productCode);
  if (!hasProductAccess) {
    return {
      allowed: false,
      reason: 'product_access_disabled',
      details: `O usuário não possui acesso liberado ao produto ${productCode}.`
    };
  }

  // Se a checagem for apenas para entrar no produto (sem permissão específica granular)
  if (!permissionKey) {
    return {
      allowed: true,
      reason: 'role_granted',
      details: `Acesso liberado ao produto ${productCode}.`
    };
  }

  // 8. Verificação de Override Individual
  const overrideKey = `${productCode}:${permissionKey}`;
  const override = userPermissionOverrides?.[overrideKey];

  if (override === 'deny') {
    return {
      allowed: false,
      reason: 'explicit_override_deny',
      details: `Permissão explicitamente negada por personalização individual.`
    };
  }

  if (override === 'allow') {
    return {
      allowed: true,
      reason: 'explicit_override_allow',
      details: `Permissão explicitamente concedida por personalização individual.`
    };
  }

  // 9. Verificação das Permissões do Role
  const productRole = userProductRoles?.[productCode];
  if (productRole && productRole.permissions.includes(permissionKey)) {
    return {
      allowed: true,
      reason: 'role_granted',
      details: `Permissão concedida pelo papel "${productRole.roleName}".`
    };
  }

  // 10. Fallback Padrão: DENY
  return {
    allowed: false,
    reason: 'default_deny',
    details: `Permissão não atribuída ao usuário.`
  };
}

/**
 * Identifica a origem da permissão para exibição na UI
 */
export function getPermissionOrigin(
  context: PermissionEngineContext,
  productCode: ProductId,
  permissionKey: string
): 'role' | 'override_allow' | 'override_deny' | 'owner_bypass' | 'none' {
  const result = can(context, productCode, permissionKey);
  if (result.reason === 'owner_bypass') return 'owner_bypass';
  if (result.reason === 'explicit_override_allow') return 'override_allow';
  if (result.reason === 'explicit_override_deny') return 'override_deny';
  if (result.reason === 'role_granted') return 'role';
  return 'none';
}
