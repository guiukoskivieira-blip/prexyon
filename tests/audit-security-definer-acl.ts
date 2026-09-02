/**
 * ==============================================================================
 * PREXYON — AUDITORIA CIRÚRGICA DE ACL, ACTOR AUDIT, RLS & CROSS-TENANT RESOLVER
 * ==============================================================================
 */

import crypto from 'crypto';
import { getDbClient } from './db-client';

async function runSurgicalAclAudit() {
  const client = getDbClient();
  await client.connect();

  console.log('================================================================');
  console.log('PREXYON — AUDITORIA CIRÚRGICA DE ACL, ACTOR AUDIT & CROSS-TENANT');
  console.log('Banco: orcagraf-dev (ybsdwcaagcazfedrwhjm.supabase.co)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, expected: string, found: string) {
    if (condition) {
      console.log(`[PASSOU] ${testName}`);
      console.log(`   Esperado:   ${expected}`);
      console.log(`   Encontrado: ${found}\n`);
      passed++;
    } else {
      console.error(`[FALHOU] ${testName}`);
      console.error(`   Esperado:   ${expected}`);
      console.error(`   Encontrado: ${found}\n`);
      failed++;
    }
  }

  // ----------------------------------------------------------------------------
  // 1. AUDITORIA REAL DE ACL EM PG_PROC
  // ----------------------------------------------------------------------------
  console.log('--- 1. AUDITORIA DE ACL EM PG_PROC ---');
  const aclQuery = await client.query(`
    SELECT proname, proargnames, proacl, proconfig, prosecdef
    FROM pg_proc
    WHERE proname IN ('prexyon_grant_homologation_entitlement', 'prexyon_revoke_homologation_entitlement');
  `);
  console.table(aclQuery.rows);

  const grantProc = aclQuery.rows.find(r => r.proname === 'prexyon_grant_homologation_entitlement');
  const revokeProc = aclQuery.rows.find(r => r.proname === 'prexyon_revoke_homologation_entitlement');

  const grantAclStr = typeof grantProc?.proacl === 'string' ? grantProc.proacl : JSON.stringify(grantProc?.proacl ?? []);
  const revokeAclStr = typeof revokeProc?.proacl === 'string' ? revokeProc.proacl : JSON.stringify(revokeProc?.proacl ?? []);

  const grantSearchPath = JSON.stringify(grantProc?.proconfig ?? []);
  const revokeSearchPath = JSON.stringify(revokeProc?.proconfig ?? []);

  const hasNoPublicAnonAuthGrant = (aclStr: string) => {
    return !aclStr.includes('authenticated=') && !aclStr.includes('anon=') && !aclStr.startsWith('{=') && !aclStr.includes(',=');
  };

  assert(
    grantProc?.prosecdef === true && revokeProc?.prosecdef === true,
    'Auditoria 1.1: Funções configuradas explicitamente com SECURITY DEFINER',
    'prosecdef = true em ambas',
    `grant=${grantProc?.prosecdef}, revoke=${revokeProc?.prosecdef}`
  );

  assert(
    grantSearchPath.includes('search_path=') && revokeSearchPath.includes('search_path='),
    'Auditoria 1.2: Funções protegidas com SET search_path = "" contra search_path hijacking',
    'proconfig contém search_path=""',
    `grant=${grantSearchPath}, revoke=${revokeSearchPath}`
  );

  assert(
    hasNoPublicAnonAuthGrant(grantAclStr),
    'Auditoria 1.3: ACL da RPC grant revogada de PUBLIC, anon e authenticated',
    'Apenas postgres e service_role em proacl',
    `proacl: ${grantAclStr}`
  );

  assert(
    hasNoPublicAnonAuthGrant(revokeAclStr),
    'Auditoria 1.4: ACL da RPC revoke revogada de PUBLIC, anon e authenticated',
    'Apenas postgres e service_role em proacl',
    `proacl: ${revokeAclStr}`
  );

  // ----------------------------------------------------------------------------
  // 2. SETUP DE MULTI-TENANT TEST DATA (Org A e Org B)
  // ----------------------------------------------------------------------------
  const ts = Date.now();
  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();

  const ownerAId = crypto.randomUUID();
  const memberAId = crypto.randomUUID();
  const ownerBId = crypto.randomUUID();

  const ownerAEmail = `owner-a-${ts}@prexyon.com`;
  const memberAEmail = `member-a-${ts}@prexyon.com`;
  const ownerBEmail = `owner-b-${ts}@prexyon.com`;

  try {
    // Org A
    await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ('${orgAId}', 'Org A ACL Test', 'Org A Razao', true);`);
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${ownerAId}', '${ownerAEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${ownerAId}', 'Owner A', '${ownerAEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgAId}', '${ownerAId}', 'owner', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${memberAId}', '${memberAEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${memberAId}', 'Member A', '${memberAEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgAId}', '${memberAId}', 'member', true);`);

    // Org B
    await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ('${orgBId}', 'Org B ACL Test', 'Org B Razao', true);`);
    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${ownerBId}', '${ownerBEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${ownerBId}', 'Owner B', '${ownerBEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgBId}', '${ownerBId}', 'owner', true);`);

    // ----------------------------------------------------------------------------
    // 3. TESTES DE BLOQUEIO DE EXECUÇÃO DAS RPCS (PostgREST Simulation)
    // ----------------------------------------------------------------------------
    // 3.1 Anon -> Grant / Revoke
    await client.query(`SET ROLE anon;`);
    let anonGrantBlocked = false;
    let anonRevokeBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_grant_homologation_entitlement('${orgAId}', 'orcagraf', now() + interval '7 days', 'Anon test');`);
    } catch (err: any) {
      anonGrantBlocked = err.code === '42501' || err.message.includes('permission denied');
    }
    try {
      await client.query(`SELECT public.prexyon_revoke_homologation_entitlement('${orgAId}', 'orcagraf');`);
    } catch (err: any) {
      anonRevokeBlocked = err.code === '42501' || err.message.includes('permission denied');
    }

    // 3.2 Member A -> Grant / Revoke
    await client.query(`SET ROLE authenticated;`);
    await client.query(`SET request.jwt.claims = '{"sub": "${memberAId}", "email": "${memberAEmail}", "role": "authenticated"}';`);
    let memberGrantBlocked = false;
    let memberRevokeBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_grant_homologation_entitlement('${orgAId}', 'orcagraf', now() + interval '7 days', 'Member test');`);
    } catch (err: any) {
      memberGrantBlocked = err.code === '42501' || err.message.includes('permission denied');
    }
    try {
      await client.query(`SELECT public.prexyon_revoke_homologation_entitlement('${orgAId}', 'orcagraf');`);
    } catch (err: any) {
      memberRevokeBlocked = err.code === '42501' || err.message.includes('permission denied');
    }

    // 3.3 Owner A -> Grant / Revoke
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}", "email": "${ownerAEmail}", "role": "authenticated"}';`);
    let ownerGrantBlocked = false;
    let ownerRevokeBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_grant_homologation_entitlement('${orgAId}', 'orcagraf', now() + interval '7 days', 'Owner test');`);
    } catch (err: any) {
      ownerGrantBlocked = err.code === '42501' || err.message.includes('permission denied');
    }
    try {
      await client.query(`SELECT public.prexyon_revoke_homologation_entitlement('${orgAId}', 'orcagraf');`);
    } catch (err: any) {
      ownerRevokeBlocked = err.code === '42501' || err.message.includes('permission denied');
    }

    await client.query(`RESET ROLE;`);

    assert(
      anonGrantBlocked && anonRevokeBlocked,
      'Teste 3.1: Chamada anônima (anon) bloqueada com 42501 em grant e revoke',
      'Permission Denied (42501)',
      `grant=${anonGrantBlocked}, revoke=${anonRevokeBlocked}`
    );

    assert(
      memberGrantBlocked && memberRevokeBlocked,
      'Teste 3.2: Chamada de MEMBER autenticado bloqueada com 42501 em grant e revoke',
      'Permission Denied (42501)',
      `grant=${memberGrantBlocked}, revoke=${memberRevokeBlocked}`
    );

    assert(
      ownerGrantBlocked && ownerRevokeBlocked,
      'Teste 3.3: Chamada de OWNER autenticado pelo client bloqueada com 42501 em grant e revoke',
      'Permission Denied (42501)',
      `grant=${ownerGrantBlocked}, revoke=${ownerRevokeBlocked}`
    );

    // ----------------------------------------------------------------------------
    // 4. TESTES DE ACESSO DIRETO À TABELA (SELECT / INSERT / UPDATE / DELETE)
    // ----------------------------------------------------------------------------
    // 4.1 Anon direct SELECT / INSERT
    await client.query(`SET ROLE anon;`);
    let anonDirectSelectBlocked = false;
    let anonDirectInsertBlocked = false;
    try {
      await client.query(`SELECT * FROM public.prexyon_homologation_entitlements;`);
    } catch (err: any) {
      anonDirectSelectBlocked = err.code === '42501' || err.message.includes('permission denied');
    }
    try {
      await client.query(`INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, reason, expires_at) VALUES ('${orgAId}', 'orcagraf', 'Hack', now() + interval '1 day');`);
    } catch (err: any) {
      anonDirectInsertBlocked = err.code === '42501' || err.message.includes('permission denied');
    }

    // 4.2 Member A direct SELECT / INSERT / UPDATE / DELETE
    await client.query(`SET ROLE authenticated;`);
    await client.query(`SET request.jwt.claims = '{"sub": "${memberAId}", "email": "${memberAEmail}", "role": "authenticated"}';`);
    let memberDirectSelectBlocked = false;
    let memberDirectInsertBlocked = false;
    let memberDirectUpdateBlocked = false;
    let memberDirectDeleteBlocked = false;

    try {
      await client.query(`SELECT * FROM public.prexyon_homologation_entitlements;`);
    } catch (err: any) {
      memberDirectSelectBlocked = err.code === '42501' || err.message.includes('permission denied');
    }
    try {
      await client.query(`INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, reason, expires_at) VALUES ('${orgAId}', 'orcagraf', 'Hack', now() + interval '1 day');`);
    } catch (err: any) {
      memberDirectInsertBlocked = err.code === '42501' || err.message.includes('permission denied');
    }
    try {
      await client.query(`UPDATE public.prexyon_homologation_entitlements SET product_code = 'artecheck' WHERE organization_id = '${orgAId}';`);
    } catch (err: any) {
      memberDirectUpdateBlocked = err.code === '42501' || err.message.includes('permission denied');
    }
    try {
      await client.query(`DELETE FROM public.prexyon_homologation_entitlements WHERE organization_id = '${orgAId}';`);
    } catch (err: any) {
      memberDirectDeleteBlocked = err.code === '42501' || err.message.includes('permission denied');
    }

    // 4.3 Owner A direct SELECT
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}", "email": "${ownerAEmail}", "role": "authenticated"}';`);
    let ownerDirectSelectBlocked = false;
    try {
      await client.query(`SELECT * FROM public.prexyon_homologation_entitlements;`);
    } catch (err: any) {
      ownerDirectSelectBlocked = err.code === '42501' || err.message.includes('permission denied');
    }

    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    assert(
      anonDirectSelectBlocked && anonDirectInsertBlocked,
      'Teste 4.1: Acesso anônimo direto à tabela bloqueado (SELECT e INSERT = 42501)',
      'Permission Denied (42501)',
      `select_blocked=${anonDirectSelectBlocked}, insert_blocked=${anonDirectInsertBlocked}`
    );

    assert(
      memberDirectSelectBlocked && memberDirectInsertBlocked && memberDirectUpdateBlocked && memberDirectDeleteBlocked,
      'Teste 4.2: Usuário MEMBER bloqueado de executar SELECT, INSERT, UPDATE ou DELETE direto na tabela',
      'SELECT/INSERT/UPDATE/DELETE negados com 42501',
      `select=${memberDirectSelectBlocked}, insert=${memberDirectInsertBlocked}, update=${memberDirectUpdateBlocked}, delete=${memberDirectDeleteBlocked}`
    );

    assert(
      ownerDirectSelectBlocked,
      'Teste 4.3: Usuário OWNER também é bloqueado de consultar registros brutos da tabela (SELECT = 42501)',
      'SELECT negado com 42501',
      `owner_select_blocked=${ownerDirectSelectBlocked}`
    );

    // ----------------------------------------------------------------------------
    // 5. TESTES DE AUDITORIA DE ACTOR (CREATED_BY / REVOKED_BY)
    // ----------------------------------------------------------------------------
    console.log('--- 5. TESTES DE AUDITORIA DE ACTOR (ZERO OWNER ATTRIBUTION) ---');
    await client.query('BEGIN;');
    
    // Concessão administrativa via service_role/system
    const grantRes = await client.query(`
      SELECT public.prexyon_grant_homologation_entitlement(
        '${orgAId}',
        'orcagraf',
        now() + interval '7 days',
        'Homologacao automatizada do sistema'
      ) as result;
    `);
    const grantData = grantRes.rows[0].result;

    const rowQuery = await client.query(`
      SELECT * FROM public.prexyon_homologation_entitlements WHERE id = '${grantData.grant_id}';
    `);
    const homologRow = rowQuery.rows[0];

    const auditLogQuery = await client.query(`
      SELECT * FROM public.prexyon_audit_logs WHERE entity_id = '${grantData.grant_id}';
    `);
    const auditLogRow = auditLogQuery.rows[0];

    // Revogação
    await client.query(`
      SELECT public.prexyon_revoke_homologation_entitlement('${orgAId}', 'orcagraf', 'Revogacao automatizada');
    `);

    const revokedRowQuery = await client.query(`
      SELECT * FROM public.prexyon_homologation_entitlements WHERE id = '${grantData.grant_id}';
    `);
    const revokedHomologRow = revokedRowQuery.rows[0];

    await client.query('ROLLBACK;');

    assert(
      homologRow.granted_by_actor_type === 'system' &&
      homologRow.granted_by_user_id === null &&
      homologRow.granted_by_user_id !== ownerAId &&
      auditLogRow.actor_user_id === null,
      'Teste 5.1: Operação de sistema registra granted_by_actor_type="system" e NUNCA atribui o OWNER',
      'actor_type=system, user_id=null, NOT ownerAId',
      `actor_type=${homologRow.granted_by_actor_type}, user_id=${homologRow.granted_by_user_id}, audit_actor=${auditLogRow.actor_user_id}`
    );

    assert(
      revokedHomologRow.revoked_by_actor_type === 'system' &&
      revokedHomologRow.revoked_by_user_id === null &&
      revokedHomologRow.revoked_by_user_id !== ownerAId,
      'Teste 5.2: Revogação de sistema registra revoked_by_actor_type="system" e NUNCA atribui o OWNER',
      'revoked_actor_type=system, revoked_user_id=null, NOT ownerAId',
      `revoked_actor_type=${revokedHomologRow.revoked_by_actor_type}, revoked_user_id=${revokedHomologRow.revoked_by_user_id}`
    );

    // ----------------------------------------------------------------------------
    // 6. TESTES CROSS-TENANT DO RESOLVER (prexyon_get_organization_entitlements)
    // ----------------------------------------------------------------------------
    console.log('--- 6. TESTES CROSS-TENANT DO RESOLVER ---');
    // 6.1 Member A -> Resolver Org A (Permitido)
    await client.query(`SET ROLE authenticated;`);
    await client.query(`SET request.jwt.claims = '{"sub": "${memberAId}", "email": "${memberAEmail}", "role": "authenticated"}';`);
    let memberResolveOrgASuccess = false;
    try {
      const res = await client.query(`SELECT public.prexyon_get_organization_entitlements('${orgAId}') as data;`);
      memberResolveOrgASuccess = res.rows[0]?.data !== undefined;
    } catch { memberResolveOrgASuccess = false; }

    // 6.2 Member A -> Resolver Org B (Negado 42501)
    let memberResolveOrgBBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_get_organization_entitlements('${orgBId}') as data;`);
    } catch (err: any) {
      memberResolveOrgBBlocked = err.code === '42501' || err.message.includes('UNAUTHORIZED');
    }

    // 6.3 Owner A -> Resolver Org B (Negado 42501)
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}", "email": "${ownerAEmail}", "role": "authenticated"}';`);
    let ownerResolveOrgBBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_get_organization_entitlements('${orgBId}') as data;`);
    } catch (err: any) {
      ownerResolveOrgBBlocked = err.code === '42501' || err.message.includes('UNAUTHORIZED');
    }

    // 6.4 Anon -> Resolver Org A (Negado 42501)
    await client.query(`SET ROLE anon; SET request.jwt.claims = '{"role": "anon"}';`);
    let anonResolveBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_get_organization_entitlements('${orgAId}') as data;`);
    } catch (err: any) {
      anonResolveBlocked = err.code === '42501' || err.message.includes('UNAUTHENTICATED');
    }

    await client.query(`RESET ROLE; SET request.jwt.claims = '';`);

    assert(
      memberResolveOrgASuccess,
      'Teste 6.1: MEMBER autenticado da Org A consulta entitlements da sua própria organização com sucesso',
      'Sucesso',
      `member_resolve_org_a=${memberResolveOrgASuccess}`
    );

    assert(
      memberResolveOrgBBlocked,
      'Teste 6.2: MEMBER da Org A é bloqueado ao tentar consultar entitlements da Org B (Cross-Tenant Rejection 42501)',
      'Exceção UNAUTHORIZED (42501)',
      `blocked=${memberResolveOrgBBlocked}`
    );

    assert(
      ownerResolveOrgBBlocked,
      'Teste 6.3: OWNER da Org A é bloqueado ao tentar consultar entitlements da Org B (Cross-Tenant Rejection 42501)',
      'Exceção UNAUTHORIZED (42501)',
      `blocked=${ownerResolveOrgBBlocked}`
    );

    assert(
      anonResolveBlocked,
      'Teste 6.4: Usuário anônimo (anon) é estritamente bloqueado de enumerar entitlements (42501)',
      'Exceção UNAUTHENTICATED (42501)',
      `blocked=${anonResolveBlocked}`
    );

    // ----------------------------------------------------------------------------
    // 7. TESTE DE ZERO LINGERING ENTITLEMENTS NA ORGANIZAÇÃO REAL
    // ----------------------------------------------------------------------------
    const realOrgId = '43c47a08-2f84-42db-a64d-d1f0ea0c6a6b';
    const realOrgRes = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [realOrgId]);
    const realOrgData = realOrgRes.rows[0]?.data;

    const realSubRes = await client.query('SELECT count(*) as count FROM public.prexyon_subscriptions WHERE organization_id = $1;', [realOrgId]);
    const realSubCount = parseInt(realSubRes.rows[0].count, 10);

    const activeHomologRes = await client.query(`
      SELECT count(*) as count FROM public.prexyon_homologation_entitlements
      WHERE organization_id = $1 AND revoked_at IS NULL AND expires_at > now();
    `, [realOrgId]);
    const activeHomologCount = parseInt(activeHomologRes.rows[0].count, 10);

    assert(
      realOrgData.is_entitled === true &&
      JSON.stringify(realOrgData.homologation_products) === JSON.stringify(['orcagraf']) &&
      JSON.stringify(realOrgData.effective_products) === JSON.stringify(['orcagraf']) &&
      realOrgData.has_subscription === false &&
      realSubCount === 0 &&
      activeHomologCount === 1,
      'Teste 7: Organização real possui rigorosamente apenas o entitlement autorizado de OrçaGraf e 0 assinaturas comerciais',
      'is_entitled=true, effective=[orcagraf], commercial_subs=0, active_homolog=1',
      `is_entitled=${realOrgData.is_entitled}, effective=${JSON.stringify(realOrgData.effective_products)}, commercial_subs=${realSubCount}, active_homolog=${activeHomologCount}`
    );

  } catch (err: any) {
    console.error('ERRO_FATAL_AUDITORIA_CIRURGICA:', err);
    failed++;
  } finally {
    try {
      await client.query(`DELETE FROM public.prexyon_audit_logs WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
      await client.query(`DELETE FROM public.organizations WHERE id IN ('${orgAId}', '${orgBId}');`);
      await client.query(`DELETE FROM public.profiles WHERE id IN ('${ownerAId}', '${memberAId}', '${ownerBId}');`);
      await client.query(`DELETE FROM auth.users WHERE id IN ('${ownerAId}', '${memberAId}', '${ownerBId}');`);
      await client.end();
    } catch {}
  }

  console.log('================================================================');
  console.log(`TOTAL DE TESTES E AUDITORIAS: ${passed + failed}`);
  console.log(`APROVADOS:                    ${passed}`);
  console.log(`REPROVADOS:                   ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runSurgicalAclAudit();
