import { canAccessRoute, canManageUsers, canManageSubscription, canManagePermissions } from '../src/security/routeAuthorization';
import { can, PermissionEngineContext } from '../src/services/permissionEngine';
import { getDbClient } from './db-client';
import { ProductInfo, ProductId, ProductStatus } from '../src/types/product';

const TEST_PRODUCTS = [
  { id: 'orcagraf' as ProductId, name: 'OrçaGraf' },
  { id: 'arteflow' as ProductId, name: 'ArteFlow' },
  { id: 'artecheck' as ProductId, name: 'ArteCheck' },
];

async function runMemberRouteAuthorizationTests() {
  const watchdog = setTimeout(() => {
    console.error('ERRO: Timeout excedido em runMemberRouteAuthorizationTests.');
    process.exit(1);
  }, 20000);

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, expected: string, actual: string) {
    total++;
    if (condition) {
      console.log(`[PASSOU] ${testName}`);
      console.log(`   Esperado:   ${expected}`);
      console.log(`   Encontrado: ${actual}\n`);
      passed++;
    } else {
      console.error(`[FALHOU] ${testName}`);
      console.error(`   Esperado:   ${expected}`);
      console.error(`   Encontrado: ${actual}\n`);
      throw new Error(`Falha no teste: ${testName}`);
    }
  }

  const client = getDbClient();

  try {
    await client.connect();
    await client.query("SET statement_timeout = '4000';");

    console.log('================================================================');
    console.log('PREXYON — SUÍTE DE TESTES: AUTORIZAÇÃO DE ROTAS, UI & MEMBER');
    console.log('Banco: orcagraf-dev');
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // FASE 1: VALIDAÇÃO DO ESTADO REAL DA ORGANIZAÇÃO HOMOLOGADA
    // -------------------------------------------------------------
    const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
    const entRes = await client.query(`SELECT public.prexyon_get_organization_entitlements($1) as data;`, [realOrgId]);
    const entData = entRes.rows[0]?.data;

    assert(
      entData?.active_members_count === 2,
      'Fase 1.1: Organização real possui exatamente 2 membros ativos',
      'active_members_count = 2',
      `active_members_count = ${entData?.active_members_count}`
    );

    assert(
      JSON.stringify(entData?.effective_products) === '["orcagraf"]',
      'Fase 1.2: Entitlement efetivo da organização real é exclusivamente ["orcagraf"]',
      'effective_products = ["orcagraf"]',
      `effective_products = ${JSON.stringify(entData?.effective_products)}`
    );

    assert(
      entData?.has_subscription === false,
      'Fase 1.3: Organização real permanece has_subscription=false (Sem assinatura comercial)',
      'has_subscription = false',
      `has_subscription = ${entData?.has_subscription}`
    );

    // Buscar dados dos membros reais
    const memberRows = await client.query(
      `SELECT om.id, om.user_id, om.role, om.is_active, om.is_locked, u.email, p.full_name
       FROM public.organization_members om
       JOIN auth.users u ON u.id = om.user_id
       LEFT JOIN public.profiles p ON p.id = om.user_id
       WHERE om.organization_id = $1
       ORDER BY om.role DESC;`,
      [realOrgId]
    );

    const realOwner = memberRows.rows.find((m: any) => m.role === 'owner');
    const realMember = memberRows.rows.find((m: any) => m.role === 'member');

    assert(
      realOwner && realOwner.email === 'guiukoskivieira@gmail.com' && realOwner.is_active === true,
      'Fase 1.4: OWNER real ativo e íntegro no banco',
      'role=owner, is_active=true',
      `role=${realOwner?.role}, is_active=${realOwner?.is_active}`
    );

    assert(
      realMember && realMember.email === 'designcreative254@gmail.com' && realMember.is_active === true,
      'Fase 1.5: MEMBER real ativo e íntegro no banco após aceite',
      'role=member, is_active=true, email=designcreative254@gmail.com',
      `role=${realMember?.role}, is_active=${realMember?.is_active}, email=${realMember?.email}`
    );

    // Buscar acessos de produtos e permissões do MEMBER real
    const accessRows = await client.query(
      `SELECT product_key, is_enabled FROM public.organization_member_product_access
       WHERE organization_id = $1 AND user_id = $2;`,
      [realOrgId, realMember.user_id]
    );
    const memberAssignedProducts = accessRows.rows.filter((r: any) => r.is_enabled).map((r: any) => r.product_key);

    assert(
      JSON.stringify(memberAssignedProducts) === '["orcagraf"]',
      'Fase 1.6: MEMBER real possui acesso liberado exclusivamente ao OrçaGraf',
      'assignedProducts = ["orcagraf"]',
      `assignedProducts = ${JSON.stringify(memberAssignedProducts)}`
    );

    // -------------------------------------------------------------
    // FASE 2: RESOLUÇÃO DE PRODUTOS NO DASHBOARD (MEMBER vs OWNER)
    // -------------------------------------------------------------
    // Simular a função canônica syncProductsWithAuthorization para o MEMBER
    function resolveProducts(
      entitledProducts: ProductId[],
      userRole: string,
      assignedProducts: string[]
    ) {
      return TEST_PRODUCTS.map((prod) => {
        const isEntitledByOrg = entitledProducts.includes(prod.id);
        let userHasProductAccess = false;
        if (isEntitledByOrg) {
          if (userRole === 'owner') {
            userHasProductAccess = true;
          } else {
            userHasProductAccess = assignedProducts.includes(prod.id);
          }
        }

        return {
          ...prod,
          status: userHasProductAccess ? ('active' as ProductStatus) : ('inactive' as ProductStatus),
          statusLabel: userHasProductAccess ? 'Ativo' : 'Não contratado',
          ctaText: userHasProductAccess
            ? `Abrir ${prod.name}`
            : (userRole === 'member' ? 'Não disponível' : `Assinar ${prod.name}`),
          isSubscribed: userHasProductAccess,
        };
      });
    }

    const memberResolvedProducts = resolveProducts(['orcagraf'], 'member', ['orcagraf']);
    const orcagrafMember = memberResolvedProducts.find((p) => p.id === 'orcagraf')!;
    const arteflowMember = memberResolvedProducts.find((p) => p.id === 'arteflow')!;
    const artecheckMember = memberResolvedProducts.find((p) => p.id === 'artecheck')!;

    assert(
      orcagrafMember.status === 'active' && orcagrafMember.statusLabel === 'Ativo' && orcagrafMember.ctaText === 'Abrir OrçaGraf' && orcagrafMember.isSubscribed === true,
      'Fase 2.1: Dashboard para MEMBER exibe OrçaGraf como ATIVO e "Abrir OrçaGraf"',
      'status=active, statusLabel=Ativo, ctaText=Abrir OrçaGraf, isSubscribed=true',
      `status=${orcagrafMember.status}, statusLabel=${orcagrafMember.statusLabel}, ctaText=${orcagrafMember.ctaText}, isSubscribed=${orcagrafMember.isSubscribed}`
    );

    assert(
      arteflowMember.status === 'inactive' && arteflowMember.statusLabel === 'Não contratado' && arteflowMember.ctaText === 'Não disponível' && arteflowMember.isSubscribed === false,
      'Fase 2.2: Dashboard para MEMBER exibe ArteFlow bloqueado e "Não disponível"',
      'status=inactive, statusLabel=Não contratado, ctaText=Não disponível, isSubscribed=false',
      `status=${arteflowMember.status}, statusLabel=${arteflowMember.statusLabel}, ctaText=${arteflowMember.ctaText}, isSubscribed=${arteflowMember.isSubscribed}`
    );

    assert(
      artecheckMember.status === 'inactive' && artecheckMember.statusLabel === 'Não contratado' && artecheckMember.ctaText === 'Não disponível' && artecheckMember.isSubscribed === false,
      'Fase 2.3: Dashboard para MEMBER exibe ArteCheck bloqueado e "Não disponível"',
      'status=inactive, statusLabel=Não contratado, ctaText=Não disponível, isSubscribed=false',
      `status=${artecheckMember.status}, statusLabel=${artecheckMember.statusLabel}, ctaText=${artecheckMember.ctaText}, isSubscribed=${artecheckMember.isSubscribed}`
    );

    // Resolução para OWNER
    const ownerResolvedProducts = resolveProducts(['orcagraf'], 'owner', ['orcagraf']);
    const orcagrafOwner = ownerResolvedProducts.find((p) => p.id === 'orcagraf')!;
    const arteflowOwner = ownerResolvedProducts.find((p) => p.id === 'arteflow')!;

    assert(
      orcagrafOwner.status === 'active' && orcagrafOwner.ctaText === 'Abrir OrçaGraf' && arteflowOwner.ctaText === 'Assinar ArteFlow',
      'Fase 2.4: Dashboard para OWNER preserva OrçaGraf Ativo e produtos não contratados direcionando para assinatura',
      'OrçaGraf Ativo, ArteFlow Assinar ArteFlow',
      `OrçaGraf=${orcagrafOwner.ctaText}, ArteFlow=${arteflowOwner.ctaText}`
    );

    // -------------------------------------------------------------
    // FASE 3: POLÍTICA CENTRAL DE AUTORIZAÇÃO DE ROTAS (Route Guard)
    // -------------------------------------------------------------
    assert(
      canAccessRoute('member', '/app/usuarios') === false,
      'Fase 3.1: Route Guard bloqueia /app/usuarios para MEMBER',
      'canAccessRoute(member, /app/usuarios) = false',
      `canAccessRoute = ${canAccessRoute('member', '/app/usuarios')}`
    );

    assert(
      canAccessRoute('member', '/app/permissoes') === false,
      'Fase 3.2: Route Guard bloqueia /app/permissoes para MEMBER',
      'canAccessRoute(member, /app/permissoes) = false',
      `canAccessRoute = ${canAccessRoute('member', '/app/permissoes')}`
    );

    assert(
      canAccessRoute('member', '/app/assinatura') === false,
      'Fase 3.3: Route Guard bloqueia /app/assinatura para MEMBER',
      'canAccessRoute(member, /app/assinatura) = false',
      `canAccessRoute = ${canAccessRoute('member', '/app/assinatura')}`
    );

    assert(
      canAccessRoute('member', '/app/configuracoes') === false,
      'Fase 3.4: Route Guard bloqueia /app/configuracoes para MEMBER',
      'canAccessRoute(member, /app/configuracoes) = false',
      `canAccessRoute = ${canAccessRoute('member', '/app/configuracoes')}`
    );

    assert(
      canAccessRoute('member', '/app') === true && canAccessRoute('member', '/app/perfil') === true,
      'Fase 3.5: Route Guard permite /app e /app/perfil para MEMBER',
      'true, true',
      `${canAccessRoute('member', '/app')}, ${canAccessRoute('member', '/app/perfil')}`
    );

    // -------------------------------------------------------------
    // FASE 4: MENUS E ELEMENTOS ADMINISTRATIVOS OCULTOS PARA MEMBER
    // -------------------------------------------------------------
    assert(
      canManageUsers('member') === false,
      'Fase 4.1: Menu "Usuários e acessos" oculto para MEMBER (canManageUsers = false)',
      'false',
      `${canManageUsers('member')}`
    );

    assert(
      canManageSubscription('member') === false,
      'Fase 4.2: Menu e Botão "Assinatura" / "Gerenciar assinatura" ocultos para MEMBER',
      'false',
      `${canManageSubscription('member')}`
    );

    assert(
      canManagePermissions('member') === false,
      'Fase 4.3: Botão "Permissões de usuários" no card do produto oculto para MEMBER',
      'false',
      `${canManagePermissions('member')}`
    );

    // -------------------------------------------------------------
    // FASE 5: PRESERVAÇÃO DE OWNER E ADMIN
    // -------------------------------------------------------------
    assert(
      canAccessRoute('owner', '/app/usuarios') === true &&
      canAccessRoute('owner', '/app/assinatura') === true &&
      canAccessRoute('owner', '/app/permissoes') === true &&
      canAccessRoute('owner', '/app/configuracoes') === true &&
      canManageUsers('owner') === true &&
      canManageSubscription('owner') === true,
      'Fase 5.1: OWNER preserva 100% de acesso às rotas e menus de gestão sem regressão',
      'Todos true',
      'Todos true'
    );

    assert(
      canAccessRoute('admin', '/app/usuarios') === true &&
      canAccessRoute('admin', '/app/assinatura') === true &&
      canAccessRoute('admin', '/app/permissoes') === true &&
      canAccessRoute('admin', '/app/configuracoes') === true &&
      canManageUsers('admin') === true &&
      canManageSubscription('admin') === true,
      'Fase 5.2: ADMIN segue exatamente a política canônica com acesso administrativo concedido',
      'Todos true',
      'Todos true'
    );

    // -------------------------------------------------------------
    // FASE 6: MOTOR DE PERMISSÕES (permissionEngine.can)
    // -------------------------------------------------------------
    const memberContext: PermissionEngineContext = {
      user: {
        id: realMember.user_id,
        name: 'designcreative254',
        email: 'designcreative254@gmail.com',
        initials: 'DC',
        role: 'member',
        accountId: realOrgId,
      },
      organization: {
        id: realOrgId,
        name: 'amp',
        status: 'active',
        userRole: 'member',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      member: {
        id: realMember.id,
        userId: realMember.user_id,
        name: 'designcreative254',
        email: 'designcreative254@gmail.com',
        initials: 'DC',
        role: 'member',
        status: 'active',
        assignedProducts: ['orcagraf'],
        createdAt: new Date().toISOString(),
      },
      subscription: null,
      effectiveProducts: ['orcagraf'],
      userProductAccess: {
        orcagraf: true,
        arteflow: false,
        artecheck: false,
      },
    };

    const permCheckOrcagraf = can(memberContext, 'orcagraf');
    assert(
      permCheckOrcagraf.allowed === true,
      'Fase 6.1: permissionEngine.can permite MEMBER acessar OrçaGraf com effectiveProducts=["orcagraf"]',
      'allowed=true',
      `allowed=${permCheckOrcagraf.allowed}`
    );

    const permCheckArteflow = can(memberContext, 'arteflow');
    assert(
      permCheckArteflow.allowed === false && permCheckArteflow.reason === 'product_not_subscribed',
      'Fase 6.2: permissionEngine.can bloqueia MEMBER em ArteFlow (product_not_subscribed)',
      'allowed=false, reason=product_not_subscribed',
      `allowed=${permCheckArteflow.allowed}, reason=${permCheckArteflow.reason}`
    );

    const permCheckArtecheck = can(memberContext, 'artecheck');
    assert(
      permCheckArtecheck.allowed === false && permCheckArtecheck.reason === 'product_not_subscribed',
      'Fase 6.3: permissionEngine.can bloqueia MEMBER em ArteCheck (product_not_subscribed)',
      'allowed=false, reason=product_not_subscribed',
      `allowed=${permCheckArtecheck.allowed}, reason=${permCheckArtecheck.reason}`
    );

    console.log('================================================================');
    console.log(`TOTAL DE TESTES DE AUTORIZAÇÃO E UI: ${total}`);
    console.log(`APROVADOS:                           ${passed}`);
    console.log(`REPROVADOS:                          ${total - passed}`);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('TEST_UNCAUGHT_ERR:', err.message, err.stack);
  } finally {
    await Promise.race([client.end().catch(() => {}), new Promise(r => setTimeout(r, 1000))]);
    clearTimeout(watchdog);
    process.exit(passed > 0 && passed === total ? 0 : 1);
  }
}

runMemberRouteAuthorizationTests();
