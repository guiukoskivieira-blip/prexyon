/**
 * PREXYON PORTAL — SUÍTE DE TESTES REAIS CONTRA O SUPABASE CENTRAL
 * Projeto: orcagraf-dev (ybsdwcaagcazfedrwhjm)
 * Validação Real de Migrations, RLS, Multi-tenant Isolation, Acesso por Produto e Proteção de Owner
 */

import pg from 'pg';
import { can, PermissionEngineContext } from '../src/services/permissionEngine';
import { AuthUser } from '../src/types/auth';
import { Organization, AccountMember } from '../src/types/account';
import { SubscriptionDetails } from '../src/types/subscription';

const { Client } = pg;

interface RealTestResult {
  num: number;
  title: string;
  passed: boolean;
  expected: string;
  found: string;
  error?: string;
}

const results: RealTestResult[] = [];

function record(num: number, title: string, passed: boolean, expected: string, found: string, error?: string) {
  results.push({ num, title, passed, expected, found, error });
}

import { getDbClient } from './db-client';

async function runRealDatabaseTests() {
  console.log('================================================================');
  console.log('PREXYON — ETAPA 2.2: TESTES REAIS NO BANCO SUPABASE CENTRAL');
  console.log('Projeto: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
  console.log('================================================================\n');

  const client = getDbClient();
  await client.connect();

  try {
    // ------------------------------------------------------------------------
    // TESTE REAL 1: Verificação das 8 Tabelas Prexyon no Banco Real
    // ------------------------------------------------------------------------
    const prexyonTables = [
      'prexyon_products',
      'prexyon_user_product_access',
      'prexyon_permission_definitions',
      'prexyon_roles',
      'prexyon_role_permissions',
      'prexyon_user_product_roles',
      'prexyon_user_permission_overrides',
      'prexyon_organization_invites',
    ];

    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = ANY($1);
    `, [prexyonTables]);

    const foundTables = tablesRes.rows.map((r) => r.table_name);
    const allTablesPresent = prexyonTables.every((t) => foundTables.includes(t));
    record(
      1,
      'Tabelas Prexyon no Banco Real',
      allTablesPresent,
      '8 tabelas prexyon_* presentes no schema public',
      `Encontradas ${foundTables.length}/8 tabelas (${foundTables.join(', ')})`
    );

    // ------------------------------------------------------------------------
    // TESTE REAL 2: Preservação das 9 Tabelas Core do OrçaGraf
    // ------------------------------------------------------------------------
    const orcagrafCoreTables = [
      'products',
      'customers',
      'quotes',
      'quote_items',
      'materials',
      'finishings',
      'organization_members',
      'organizations',
      'profiles',
    ];

    const orcaRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = ANY($1);
    `, [orcagrafCoreTables]);

    const foundOrcaTables = orcaRes.rows.map((r) => r.table_name);
    const allOrcaPreserved = orcagrafCoreTables.every((t) => foundOrcaTables.includes(t));
    record(
      2,
      'Preservação das Tabelas do OrçaGraf',
      allOrcaPreserved,
      '9 tabelas do OrçaGraf preservadas sem colisão',
      `Encontradas ${foundOrcaTables.length}/9 tabelas (${foundOrcaTables.join(', ')})`
    );

    // ------------------------------------------------------------------------
    // TESTE REAL 3: Catálogo Oficial prexyon_products no Banco Real
    // ------------------------------------------------------------------------
    const prodRes = await client.query(`
      SELECT code, name, status 
      FROM public.prexyon_products 
      ORDER BY code;
    `);

    const codes = prodRes.rows.map((r) => r.code);
    const expectedCodes = ['artecheck', 'arteflow', 'orcagraf'];
    const codesMatch = JSON.stringify(codes) === JSON.stringify(expectedCodes);
    record(
      3,
      'Catálogo prexyon_products (orcagraf, arteflow, artecheck)',
      codesMatch,
      'Códigos [artecheck, arteflow, orcagraf] ativos',
      `Códigos encontrados: [${codes.join(', ')}]`
    );

    // ------------------------------------------------------------------------
    // TESTE REAL 4: Verificação de RLS Habilitada nas 8 Tabelas Prexyon
    // ------------------------------------------------------------------------
    const rlsRes = await client.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace 
      WHERE pg_namespace.nspname = 'public' 
        AND relname = ANY($1);
    `, [prexyonTables]);

    const allRlsEnabled = rlsRes.rows.every((r) => r.relrowsecurity === true) && rlsRes.rows.length === 8;
    record(
      4,
      'RLS Habilitada nas 8 Tabelas Prexyon',
      allRlsEnabled,
      'relrowsecurity = true para todas as 8 tabelas',
      `${rlsRes.rows.filter((r) => r.relrowsecurity).length}/8 tabelas com RLS ativo`
    );

    // ------------------------------------------------------------------------
    // TESTE REAL 5: Funções Helper Prexyon (SECURITY DEFINER)
    // ------------------------------------------------------------------------
    const funcsRes = await client.query(`
      SELECT proname, prosecdef 
      FROM pg_proc 
      JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace 
      WHERE pg_namespace.nspname = 'public' 
        AND proname IN ('prexyon_is_org_member', 'prexyon_is_org_admin_or_owner');
    `);

    const hasMemberFunc = funcsRes.rows.some((r) => r.proname === 'prexyon_is_org_member' && r.prosecdef === true);
    const hasAdminFunc = funcsRes.rows.some((r) => r.proname === 'prexyon_is_org_admin_or_owner' && r.prosecdef === true);
    record(
      5,
      'Funções Helper Prexyon com SECURITY DEFINER',
      hasMemberFunc && hasAdminFunc,
      'prexyon_is_org_member e prexyon_is_org_admin_or_owner com SECURITY DEFINER',
      `prexyon_is_org_member: ${hasMemberFunc}, prexyon_is_org_admin_or_owner: ${hasAdminFunc}`
    );

    // ------------------------------------------------------------------------
    // TESTE REAL 6: Trigger de Proteção do Último Owner no Banco Real
    // ------------------------------------------------------------------------
    const testOrgId = '00000000-0000-4000-a000-000000000001';
    const testUserId = '00000000-0000-4000-b000-000000000001';
    const testMemberId = '00000000-0000-4000-c000-000000000001';

    await client.query('BEGIN;');

    await client.query(`
      INSERT INTO auth.users (id, email, raw_user_meta_data) 
      VALUES ($1, 'owner.teste@prexyon.com', '{"full_name": "Owner Teste"}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `, [testUserId]);

    await client.query(`
      INSERT INTO public.profiles (id, email, full_name) 
      VALUES ($1, 'owner.teste@prexyon.com', 'Owner Teste')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
    `, [testUserId]);

    await client.query(`
      INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) 
      VALUES ($1, 'Org Teste Owner', 'Org Teste Owner Ltda', true)
      ON CONFLICT (id) DO NOTHING;
    `, [testOrgId]);

    await client.query(`
      INSERT INTO public.organization_members (id, organization_id, user_id, role, is_active, is_locked) 
      VALUES ($1, $2, $3, 'owner'::public.user_role, true, false)
      ON CONFLICT (id) DO NOTHING;
    `, [testMemberId, testOrgId, testUserId]);

    // Tentativa de suspender o único owner via SQL (deve ser rejeitada pelo trigger do banco)
    let triggerBlocked = false;
    let triggerError = '';
    try {
      await client.query(`
        UPDATE public.organization_members 
        SET is_active = false 
        WHERE id = $1;
      `, [testMemberId]);
    } catch (err: any) {
      triggerBlocked = true;
      triggerError = err.message;
    }

    await client.query('ROLLBACK;'); // Desfaz transação de teste

    record(
      6,
      'Proteção do Último Owner (Trigger no Banco Real)',
      triggerBlocked && triggerError.includes('proprietário'),
      'Exceção levantada pelo trigger trg_protect_last_active_owner',
      triggerBlocked ? `Trigger bloqueou com sucesso: "${triggerError}"` : 'FALHA: Trigger permitiu desativação do único owner'
    );

    // ------------------------------------------------------------------------
    // TESTE REAL 7: Isolamento Multi-tenant Real sob RLS (Org A vs Org B)
    // ------------------------------------------------------------------------
    const orgAId = 'a1111111-1111-4111-a111-111111111111';
    const orgBId = 'b2222222-2222-4222-b222-222222222222';
    const userAId = 'a3333333-3333-4333-a333-333333333333';
    const userBId = 'b4444444-4444-4444-b444-444444444444';

    await client.query('BEGIN;');

    await client.query(`
      INSERT INTO auth.users (id, email) VALUES 
        ($1, 'user.a@alfa.com'),
        ($2, 'user.b@beta.com')
      ON CONFLICT (id) DO NOTHING;
    `, [userAId, userBId]);

    await client.query(`
      INSERT INTO public.profiles (id, email, full_name) VALUES 
        ($1, 'user.a@alfa.com', 'User Alfa'),
        ($2, 'user.b@beta.com', 'User Beta')
      ON CONFLICT (id) DO NOTHING;
    `, [userAId, userBId]);

    await client.query(`
      INSERT INTO public.organizations (id, trade_name, is_active) VALUES 
        ($1, 'Alfa Print', true),
        ($2, 'Beta Print', true)
      ON CONFLICT (id) DO NOTHING;
    `, [orgAId, orgBId]);

    await client.query(`
      INSERT INTO public.organization_members (organization_id, user_id, role, is_active, is_locked) VALUES 
        ($1, $2, 'viewer'::public.user_role, true, false),
        ($3, $4, 'viewer'::public.user_role, true, false)
      ON CONFLICT DO NOTHING;
    `, [orgAId, userAId, orgBId, userBId]);

    await client.query(`
      INSERT INTO public.prexyon_user_product_access (organization_id, user_id, product_code, enabled) VALUES 
        ($1, $2, 'orcagraf', true),
        ($3, $4, 'arteflow', true)
      ON CONFLICT DO NOTHING;
    `, [orgAId, userAId, orgBId, userBId]);

    // Consultas sob RLS helpers
    const userAMemberOfOrgA = await client.query(`
      SELECT public.prexyon_is_org_member($1, $2) as is_member;
    `, [orgAId, userAId]);

    const userAMemberOfOrgB = await client.query(`
      SELECT public.prexyon_is_org_member($1, $2) as is_member;
    `, [orgBId, userAId]);

    const userBMemberOfOrgA = await client.query(`
      SELECT public.prexyon_is_org_member($1, $2) as is_member;
    `, [orgAId, userBId]);

    await client.query('ROLLBACK;');

    const isOrgAAllowed = userAMemberOfOrgA.rows[0].is_member === true;
    const isCrossOrgABlocked = userAMemberOfOrgB.rows[0].is_member === false;
    const isCrossOrgBBlocked = userBMemberOfOrgA.rows[0].is_member === false;

    const multiTenantPassed = isOrgAAllowed && isCrossOrgABlocked && isCrossOrgBBlocked;
    record(
      7,
      'Isolamento Multi-tenant Real (Org A vs Org B)',
      multiTenantPassed,
      'User A acessa Org A; User A bloqueado em Org B; User B bloqueado em Org A',
      `UserA->OrgA: ${isOrgAAllowed}, UserA->OrgB: ${!isCrossOrgABlocked ? 'PERMITIDO (ERRO)' : 'BLOQUEADO'}, UserB->OrgA: ${!isCrossOrgBBlocked ? 'PERMITIDO (ERRO)' : 'BLOQUEADO'}`
    );

    // ------------------------------------------------------------------------
    // TESTE REAL 8: Motor de Resolução de Permissões (Precedência e Overrides)
    // ------------------------------------------------------------------------
    const testOrg: Organization = {
      id: 'org_real_test',
      name: 'Empresa Teste Real',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-08-31T00:00:00Z',
    };

    const testSub: SubscriptionDetails = {
      planId: 'pro',
      planName: 'Profissional',
      status: 'active',
      statusLabel: 'Ativo',
      billingCycle: 'monthly',
      priceFormatted: 'R$ 289,00',
      nextRenewalFormatted: '15 set. 2026',
      nextRenewalDate: '2026-09-15T00:00:00Z',
      paymentMethod: { type: 'credit_card', brand: 'Visa', last4: '1234' },
      includedProducts: [
        { id: 'orcagraf', name: 'OrçaGraf', includedInPlan: true, status: 'active' },
        { id: 'arteflow', name: 'ArteFlow', includedInPlan: false, status: 'inactive' }, // Não contratado
        { id: 'artecheck', name: 'ArteCheck', includedInPlan: true, status: 'active' },
      ],
      userSeats: { total: 5, used: 2 },
    };

    const memberUser: AuthUser = {
      id: 'usr_mem_01',
      name: 'Vendedor Teste',
      firstName: 'Vendedor',
      lastName: 'Teste',
      email: 'vendedor@teste.com',
      initials: 'VT',
      role: 'member',
      accountId: 'org_real_test',
    };

    const memberRecord: AccountMember = {
      id: 'mem_rec_01',
      userId: 'usr_mem_01',
      name: 'Vendedor Teste',
      email: 'vendedor@teste.com',
      initials: 'VT',
      role: 'member',
      status: 'active',
      assignedProducts: ['orcagraf'],
      createdAt: '2026-01-01T00:00:00Z',
    };

    // Caso A: Produto Contratado e Liberado -> ALLOW
    const ctxA: PermissionEngineContext = {
      user: memberUser,
      organization: testOrg,
      member: memberRecord,
      subscription: testSub,
      userProductAccess: { orcagraf: true, arteflow: false, artecheck: false },
    };
    const resA = can(ctxA, 'orcagraf');

    // Caso B: Produto Não Contratado na Assinatura -> DENY
    const resB = can(ctxA, 'arteflow');

    // Caso C: Role Concede Permissão + Override Deny -> DENY (Precedência Máxima)
    const ctxC: PermissionEngineContext = {
      ...ctxA,
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
    const resC = can(ctxC, 'orcagraf', 'orcagraf.budgets.apply_discount');

    // Caso D: Role Não Concede Permissão + Override Allow -> ALLOW
    const ctxD: PermissionEngineContext = {
      ...ctxA,
      userProductRoles: {
        orcagraf: {
          roleId: 'role_consulta',
          roleName: 'Consulta',
          permissions: ['orcagraf.budgets.view'],
        },
      },
      userPermissionOverrides: {
        'orcagraf:orcagraf.budgets.create': 'allow',
      },
    };
    const resD = can(ctxD, 'orcagraf', 'orcagraf.budgets.create');

    const permsEnginePassed = resA.allowed === true &&
                             resB.allowed === false && resB.reason === 'product_not_subscribed' &&
                             resC.allowed === false && resC.reason === 'explicit_override_deny' &&
                             resD.allowed === true && resD.reason === 'explicit_override_allow';

    record(
      8,
      'Motor de Resolução de Permissões Efetivas (can)',
      permsEnginePassed,
      'Acesso a produtos, assinatura e precedência de overrides validados com perfeição',
      `Produto liberado: ${resA.allowed}, Produto fora da assinatura: ${!resB.allowed} (${resB.reason}), Override Deny: ${!resC.allowed} (${resC.reason}), Override Allow: ${resD.allowed} (${resD.reason})`
    );

    // ------------------------------------------------------------------------
    // RELATÓRIO CONSOLIDADO
    // ------------------------------------------------------------------------
    console.log('\n----------------------------------------------------------------');
    console.log('RESULTADOS DOS TESTES REAIS (SUPABASE CENTRAL / ETAPA 2.2):');
    console.log('----------------------------------------------------------------\n');

    let passedCount = 0;
    let failedCount = 0;

    for (const r of results) {
      if (r.passed) {
        passedCount++;
        console.log(`[PASSOU] Teste ${r.num}: ${r.title}`);
      } else {
        failedCount++;
        console.log(`[FALHOU] Teste ${r.num}: ${r.title}`);
      }
      console.log(`   Esperado:   ${r.expected}`);
      console.log(`   Encontrado: ${r.found}`);
      if (r.error) {
        console.log(`   Erro:       ${r.error}`);
      }
      console.log('');
    }

    console.log('================================================================');
    console.log(`TOTAL DE TESTES REAIS: ${results.length}`);
    console.log(`APROVADOS:             ${passedCount}`);
    console.log(`REPROVADOS:            ${failedCount}`);
    console.log('================================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (err: any) {
    console.error('Falha fatal nos testes contra o Supabase real:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runRealDatabaseTests();
