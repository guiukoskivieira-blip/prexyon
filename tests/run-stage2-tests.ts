/**
 * PREXYON PORTAL — SUÍTE DE TESTES AUTOMATIZADOS: ETAPA 2.1
 * Validação de Integração ao Supabase Compartilhado do OrçaGraf com Zero Regressão
 */

import { can, getPermissionOrigin, PermissionEngineContext } from '../src/services/permissionEngine';
import { organizationService } from '../src/services/organizationService';
import { invitesService } from '../src/services/invitesService';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuthUser } from '../src/types/auth';
import { Organization, AccountMember } from '../src/types/account';
import { SubscriptionDetails } from '../src/types/subscription';

interface TestResult {
  name: string;
  passed: boolean;
  expected: string;
  found: string;
  error?: string;
}

const results: TestResult[] = [];

function recordTest(name: string, passed: boolean, expected: string, found: string, error?: string) {
  results.push({ name, passed, expected, found, error });
}

async function runStage21Tests() {
  console.log('================================================================');
  console.log('PREXYON PORTAL — SUÍTE DE TESTES: ETAPA 2.1 (SUPABASE BRIDGE)');
  console.log('================================================================\n');

  // Configuração de Ambientes de Teste Isolados (Tenant A e Tenant B)
  const baseOrgA: Organization = {
    id: 'org_alpha_uuid',
    name: 'Gráfica Alfa Express',
    tradeName: 'Alfa Express',
    slug: 'grafica-alfa',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-08-31T00:00:00Z',
  };

  const baseOrgB: Organization = {
    id: 'org_beta_uuid',
    name: 'Gráfica Beta Print',
    tradeName: 'Beta Print',
    slug: 'grafica-beta',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-08-31T00:00:00Z',
  };

  const subWithOrcaAndCheck: SubscriptionDetails = {
    planId: 'professional',
    planName: 'Plano Profissional',
    status: 'active',
    statusLabel: 'Ativo',
    billingCycle: 'monthly',
    priceFormatted: 'R$ 289,00',
    nextRenewalFormatted: '15 set. 2026',
    nextRenewalDate: '2026-09-15T00:00:00Z',
    paymentMethod: { type: 'credit_card', brand: 'Mastercard', last4: '4829' },
    includedProducts: [
      { id: 'orcagraf', name: 'OrçaGraf', includedInPlan: true, status: 'active' },
      { id: 'arteflow', name: 'ArteFlow', includedInPlan: false, status: 'inactive' }, // Não contratado
      { id: 'artecheck', name: 'ArteCheck', includedInPlan: true, status: 'active' },
    ],
    userSeats: { total: 5, used: 2 },
  };

  const ownerUser: AuthUser = {
    id: 'usr_owner_01',
    name: 'Guilherme Vieira',
    firstName: 'Guilherme',
    lastName: 'Vieira',
    email: 'gui@alfa.com',
    initials: 'GV',
    role: 'owner',
    accountId: 'org_alpha_uuid',
  };

  const ownerMember: AccountMember = {
    id: 'mem_owner_01',
    userId: 'usr_owner_01',
    name: 'Guilherme Vieira',
    email: 'gui@alfa.com',
    initials: 'GV',
    role: 'owner',
    status: 'active',
    assignedProducts: ['orcagraf', 'artecheck'],
    createdAt: '2026-01-01T00:00:00Z',
  };

  const regularUser: AuthUser = {
    id: 'usr_regular_02',
    name: 'João Comercial',
    firstName: 'João',
    lastName: 'Comercial',
    email: 'joao@alfa.com',
    initials: 'JC',
    role: 'member',
    accountId: 'org_alpha_uuid',
  };

  const regularMember: AccountMember = {
    id: 'mem_regular_02',
    userId: 'usr_regular_02',
    name: 'João Comercial',
    email: 'joao@alfa.com',
    initials: 'JC',
    role: 'member',
    status: 'active',
    assignedProducts: ['orcagraf'],
    createdAt: '2026-02-01T00:00:00Z',
  };

  // --------------------------------------------------------------------------
  // CASO 1: Owner acessa administração
  // --------------------------------------------------------------------------
  try {
    const ctx: PermissionEngineContext = {
      user: ownerUser,
      organization: baseOrgA,
      member: ownerMember,
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: true, arteflow: false, artecheck: true },
    };

    const res = can(ctx, 'orcagraf', 'orcagraf.budgets.view');
    const passed = res.allowed && res.reason === 'owner_bypass';
    recordTest(
      'CASO 1: Owner possui acesso administrativo pleno (owner_bypass)',
      passed,
      'allowed=true, reason=owner_bypass',
      `allowed=${res.allowed}, reason=${res.reason}`
    );
  } catch (err: any) {
    recordTest('CASO 1: Owner acessa administração', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 2: Usuário comum não acessa administração sem permissão
  // --------------------------------------------------------------------------
  try {
    const ctx: PermissionEngineContext = {
      user: regularUser,
      organization: baseOrgA,
      member: regularMember,
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: true, arteflow: false, artecheck: false },
      userProductRoles: {
        orcagraf: {
          roleId: 'role_consulta',
          roleName: 'Consulta',
          permissions: ['orcagraf.budgets.view'],
        },
      },
    };

    const res = can(ctx, 'orcagraf', 'orcagraf.config.manage');
    const passed = !res.allowed && res.reason === 'default_deny';
    recordTest(
      'CASO 2: Usuário comum é bloqueado em ações administrativas não concedidas',
      passed,
      'allowed=false, reason=default_deny',
      `allowed=${res.allowed}, reason=${res.reason}`
    );
  } catch (err: any) {
    recordTest('CASO 2: Bloqueio de usuário comum', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 3: Isolamento Multi-tenant — Usuário da Org A rejeitado na Org B
  // --------------------------------------------------------------------------
  try {
    const ctxCrossTenant: PermissionEngineContext = {
      user: regularUser,
      organization: baseOrgB, // Org B
      member: null, // Sem membresia na Org B
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: true, arteflow: false, artecheck: false },
    };

    const res = can(ctxCrossTenant, 'orcagraf', 'orcagraf.budgets.view');
    const passed = !res.allowed && res.reason === 'not_organization_member';
    recordTest(
      'CASO 3: Isolamento Multi-tenant — Usuário da Org A rejeitado na Org B',
      passed,
      'allowed=false, reason=not_organization_member',
      `allowed=${res.allowed}, reason=${res.reason}`
    );
  } catch (err: any) {
    recordTest('CASO 3: Isolamento Multi-tenant', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 4: Conta possui produto contratado e usuário habilitado
  // --------------------------------------------------------------------------
  try {
    const ctx: PermissionEngineContext = {
      user: regularUser,
      organization: baseOrgA,
      member: regularMember,
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: true, arteflow: false, artecheck: false },
    };

    const res = can(ctx, 'orcagraf');
    const passed = res.allowed && res.reason === 'role_granted';
    recordTest(
      'CASO 4: Conta possui produto contratado e usuário habilitado -> Entrada Permitida',
      passed,
      'allowed=true, reason=role_granted',
      `allowed=${res.allowed}, reason=${res.reason}`
    );
  } catch (err: any) {
    recordTest('CASO 4: Entrada permitida', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 5: Conta possui produto, mas usuário sem acesso
  // --------------------------------------------------------------------------
  try {
    const userWithoutAccess: AccountMember = {
      ...regularMember,
      assignedProducts: ['artecheck'],
    };

    const ctx: PermissionEngineContext = {
      user: regularUser,
      organization: baseOrgA,
      member: userWithoutAccess,
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: false, arteflow: false, artecheck: true },
    };

    const res = can(ctx, 'orcagraf');
    const passed = !res.allowed && res.reason === 'product_access_disabled';
    recordTest(
      'CASO 5: Conta possui produto, mas usuário não tem acesso -> Entrada Negada',
      passed,
      'allowed=false, reason=product_access_disabled',
      `allowed=${res.allowed}, reason=${res.reason}`
    );
  } catch (err: any) {
    recordTest('CASO 5: Entrada negada', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 6: Produto ausente na assinatura da conta bloqueia
  // --------------------------------------------------------------------------
  try {
    const ctx: PermissionEngineContext = {
      user: regularUser,
      organization: baseOrgA,
      member: regularMember,
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: true, arteflow: true, artecheck: false },
    };

    const res = can(ctx, 'arteflow', 'arteflow.orders.view');
    const passed = !res.allowed && res.reason === 'product_not_subscribed';
    recordTest(
      'CASO 6: Produto ausente na assinatura da conta bloqueia execução',
      passed,
      'allowed=false, reason=product_not_subscribed',
      `allowed=${res.allowed}, reason=${res.reason}`
    );
  } catch (err: any) {
    recordTest('CASO 6: Produto não contratado', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 7: Role concede permissão sem override -> ALLOW
  // --------------------------------------------------------------------------
  try {
    const ctx: PermissionEngineContext = {
      user: regularUser,
      organization: baseOrgA,
      member: regularMember,
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: true, arteflow: false, artecheck: false },
      userProductRoles: {
        orcagraf: {
          roleId: 'role_vendedor',
          roleName: 'Vendedor',
          permissions: ['orcagraf.budgets.create', 'orcagraf.budgets.view'],
        },
      },
    };

    const res = can(ctx, 'orcagraf', 'orcagraf.budgets.create');
    const origin = getPermissionOrigin(ctx, 'orcagraf', 'orcagraf.budgets.create');
    const passed = res.allowed && res.reason === 'role_granted' && origin === 'role';
    recordTest(
      'CASO 7: Permissão concedida pelo Role sem override -> ALLOW',
      passed,
      'allowed=true, reason=role_granted, origin=role',
      `allowed=${res.allowed}, reason=${res.reason}, origin=${origin}`
    );
  } catch (err: any) {
    recordTest('CASO 7: Role concede permissão', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 8: Precedência de Negação — Explicit Deny prevalece sobre Role Allow
  // --------------------------------------------------------------------------
  try {
    const ctx: PermissionEngineContext = {
      user: regularUser,
      organization: baseOrgA,
      member: regularMember,
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: true, arteflow: false, artecheck: false },
      userProductRoles: {
        orcagraf: {
          roleId: 'role_vendedor',
          roleName: 'Vendedor',
          permissions: ['orcagraf.budgets.create', 'orcagraf.budgets.apply_discount'],
        },
      },
      userPermissionOverrides: {
        'orcagraf:orcagraf.budgets.apply_discount': 'deny',
      },
    };

    const res = can(ctx, 'orcagraf', 'orcagraf.budgets.apply_discount');
    const origin = getPermissionOrigin(ctx, 'orcagraf', 'orcagraf.budgets.apply_discount');
    const passed = !res.allowed && res.reason === 'explicit_override_deny' && origin === 'override_deny';
    recordTest(
      'CASO 8: Precedência de Negação — Explicit Deny prevalece sobre Role Allow -> DENY',
      passed,
      'allowed=false, reason=explicit_override_deny, origin=override_deny',
      `allowed=${res.allowed}, reason=${res.reason}, origin=${origin}`
    );
  } catch (err: any) {
    recordTest('CASO 8: Explicit Deny', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 9: Override individual positivo concede permissão extra
  // --------------------------------------------------------------------------
  try {
    const ctx: PermissionEngineContext = {
      user: regularUser,
      organization: baseOrgA,
      member: regularMember,
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: true, arteflow: false, artecheck: false },
      userProductRoles: {
        orcagraf: {
          roleId: 'role_consulta',
          roleName: 'Consulta',
          permissions: ['orcagraf.budgets.view'],
        },
      },
      userPermissionOverrides: {
        'orcagraf:orcagraf.budgets.edit': 'allow',
      },
    };

    const res = can(ctx, 'orcagraf', 'orcagraf.budgets.edit');
    const origin = getPermissionOrigin(ctx, 'orcagraf', 'orcagraf.budgets.edit');
    const passed = res.allowed && res.reason === 'explicit_override_allow' && origin === 'override_allow';
    recordTest(
      'CASO 9: Override individual positivo concede permissão extra -> ALLOW',
      passed,
      'allowed=true, reason=explicit_override_allow, origin=override_allow',
      `allowed=${res.allowed}, reason=${res.reason}, origin=${origin}`
    );
  } catch (err: any) {
    recordTest('CASO 9: Explicit Allow', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 10: Usuário suspenso: negar acesso
  // --------------------------------------------------------------------------
  try {
    const suspendedMember: AccountMember = {
      ...regularMember,
      status: 'suspended',
    };

    const ctx: PermissionEngineContext = {
      user: regularUser,
      organization: baseOrgA,
      member: suspendedMember,
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: true, arteflow: false, artecheck: false },
    };

    const res = can(ctx, 'orcagraf', 'orcagraf.budgets.view');
    const passed = !res.allowed && res.reason === 'member_suspended';
    recordTest(
      'CASO 10: Usuário com status suspenso é bloqueado integralmente',
      passed,
      'allowed=false, reason=member_suspended',
      `allowed=${res.allowed}, reason=${res.reason}`
    );
  } catch (err: any) {
    recordTest('CASO 10: Usuário suspenso', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 11: Bloqueio de suspensão/remoção do único Owner
  // --------------------------------------------------------------------------
  try {
    const membersList: AccountMember[] = [ownerMember, regularMember];
    const updateResult = await organizationService.updateMemberStatus(
      baseOrgA.id,
      ownerMember.id,
      'suspended',
      membersList
    );

    const passed = updateResult.success === false && updateResult.error?.includes('Proprietário (Owner)');
    recordTest(
      'CASO 11: Regra de Segurança — Bloqueio de suspensão/remoção do único Owner',
      passed,
      'success=false com mensagem de proteção de Owner',
      `success=${updateResult.success}, error="${updateResult.error}"`
    );
  } catch (err: any) {
    recordTest('CASO 11: Proteção do Owner', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 12: Sessão expirada / Usuário não autenticado
  // --------------------------------------------------------------------------
  try {
    const ctxNoAuth: PermissionEngineContext = {
      user: null,
      organization: baseOrgA,
      member: null,
      subscription: subWithOrcaAndCheck,
      userProductAccess: { orcagraf: true, arteflow: false, artecheck: false },
    };

    const res = can(ctxNoAuth, 'orcagraf', 'orcagraf.budgets.view');
    const passed = !res.allowed && res.reason === 'unauthenticated';
    recordTest(
      'CASO 12: Sessão expirada ou nula rejeita acesso (unauthenticated)',
      passed,
      'allowed=false, reason=unauthenticated',
      `allowed=${res.allowed}, reason=${res.reason}`
    );
  } catch (err: any) {
    recordTest('CASO 12: Sessão expirada', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 13: Validação de Coexistência de Namespaces (OrçaGraf vs Prexyon)
  // --------------------------------------------------------------------------
  try {
    const bridgeSql = readFileSync(resolve('supabase/migrations/001_prexyon_core_bridge.sql'), 'utf8');

    const usesNamespace = bridgeSql.includes('public.prexyon_products') &&
                          bridgeSql.includes('public.prexyon_user_product_access') &&
                          bridgeSql.includes('public.prexyon_permission_definitions') &&
                          bridgeSql.includes('public.prexyon_roles');

    const preservesOrcagraf = !bridgeSql.includes('DROP TABLE') &&
                             !bridgeSql.includes('DROP COLUMN') &&
                             !bridgeSql.includes('TRUNCATE');

    const passed = usesNamespace && preservesOrcagraf;
    recordTest(
      'CASO 13: Coexistência Segura — Prefixos prexyon_* sem colisão com public.products do OrçaGraf',
      passed,
      'usesNamespace=true, preservesOrcagraf=true',
      `usesNamespace=${usesNamespace}, preservesOrcagraf=${preservesOrcagraf}`
    );
  } catch (err: any) {
    recordTest('CASO 13: Coexistência de Schemas', false, 'Sucesso', 'Exceção', err.message);
  }

  // --------------------------------------------------------------------------
  // CASO 14: Criação e Validação Segura de Convites Prexyon
  // --------------------------------------------------------------------------
  try {
    const inviteRes = await invitesService.createInvite({
      organizationId: baseOrgA.id,
      email: 'novo.membro@alfa.com',
      invitedByUserId: ownerUser.id,
      assignedProducts: ['orcagraf', 'artecheck'],
      role: 'member',
    });

    const passed = inviteRes.success && Boolean(inviteRes.invite?.id) && inviteRes.invite?.status === 'pending';
    recordTest(
      'CASO 14: Convites — Criação segura em prexyon_organization_invites com hash e expiração',
      passed,
      'success=true, status=pending',
      `success=${inviteRes.success}, status=${inviteRes.invite?.status}`
    );
  } catch (err: any) {
    recordTest('CASO 14: Convites Prexyon', false, 'Sucesso', 'Exceção', err.message);
  }

  // Relatório Final
  let passedCount = 0;
  let failedCount = 0;

  console.log('\n----------------------------------------------------------------');
  console.log('RESULTADOS DOS TESTES DA ETAPA 2.1:');
  console.log('----------------------------------------------------------------\n');

  for (const r of results) {
    if (r.passed) {
      passedCount++;
      console.log(`[PASSOU] ${r.name}`);
    } else {
      failedCount++;
      console.log(`[FALHOU] ${r.name}`);
    }
    console.log(`   Esperado:   ${r.expected}`);
    console.log(`   Encontrado: ${r.found}`);
    if (r.error) {
      console.log(`   Erro:       ${r.error}`);
    }
    console.log('');
  }

  console.log('================================================================');
  console.log(`TOTAL DE TESTES ETAPA 2.1: ${results.length}`);
  console.log(`APROVADOS:                 ${passedCount}`);
  console.log(`REPROVADOS:                ${failedCount}`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStage21Tests().catch((err) => {
  console.error('Falha fatal nos testes da Etapa 2.1:', err);
  process.exit(1);
});
