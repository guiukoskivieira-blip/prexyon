/**
 * ==============================================================================
 * PREXYON — ETAPA 7: TESTES DE ENTITLEMENTS DE HOMOLOGAÇÃO SEPARADOS
 * Validação do modelo prexyon_homologation_entitlements e effective_products
 * ==============================================================================
 */

import crypto from 'crypto';
import { getDbClient } from './db-client';

async function runHomologationEntitlementsTests() {
  const client = getDbClient();
  await client.connect();

  console.log('================================================================');
  console.log('PREXYON — TESTES DE ENTITLEMENTS DE HOMOLOGAÇÃO & EFFECTIVE PRODUCTS');
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

  const ts = Date.now();
  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();
  const ownerAId = crypto.randomUUID();
  const memberAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  const ownerAEmail = `owner-a-${ts}@prexyon.com`;
  const memberAEmail = `member-a-${ts}@prexyon.com`;
  const userBEmail = `user-b-${ts}@prexyon.com`;

  try {
    // --------------------------------------------------------------------------
    // SETUP ISOLADO
    // --------------------------------------------------------------------------
    await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ('${orgAId}', 'Org Homolog A', 'Org Homolog A Razao', true);`);
    await client.query(`INSERT INTO public.organizations (id, trade_name, corporate_name, is_active) VALUES ('${orgBId}', 'Org Homolog B', 'Org Homolog B Razao', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${ownerAId}', '${ownerAEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${ownerAId}', 'Owner Org A', '${ownerAEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgAId}', '${ownerAId}', 'owner', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${memberAId}', '${memberAEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${memberAId}', 'Member Org A', '${memberAEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgAId}', '${memberAId}', 'member', true);`);

    await client.query(`INSERT INTO auth.users (id, email) VALUES ('${userBId}', '${userBEmail}');`);
    await client.query(`INSERT INTO public.profiles (id, full_name, email) VALUES ('${userBId}', 'User Org B', '${userBEmail}');`);
    await client.query(`INSERT INTO public.organization_members (organization_id, user_id, role, is_active) VALUES ('${orgBId}', '${userBId}', 'owner', true);`);

    // --------------------------------------------------------------------------
    // TESTE 1: Sem assinatura + Sem homologação = Nenhum produto liberado
    // --------------------------------------------------------------------------
    const entRes1 = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [orgAId]);
    const ent1 = entRes1.rows[0]?.data;
    assert(
      ent1.has_subscription === false && ent1.is_entitled === false && ent1.effective_products.length === 0,
      'Teste 1: Organização sem assinatura e sem homologação permanece sem nenhum acesso',
      'has_subscription=false, is_entitled=false, effective_products=[]',
      `has_subscription=${ent1.has_subscription}, is_entitled=${ent1.is_entitled}, effective_products=${JSON.stringify(ent1.effective_products)}`
    );

    // --------------------------------------------------------------------------
    // TESTE 2: Assinatura Comercial OrçaGraf = commercial=['orcagraf'], has_subscription=true
    // --------------------------------------------------------------------------
    const planRes = await client.query("SELECT id FROM public.prexyon_plans WHERE code = 'orcagraf';");
    const orcagrafPlanId = planRes.rows[0]?.id;

    await client.query(`
      INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
      VALUES ('${orgAId}', '${orcagrafPlanId}', 'active', now(), now() + interval '30 days');
    `);

    const entRes2 = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [orgAId]);
    const ent2 = entRes2.rows[0]?.data;
    assert(
      ent2.has_subscription === true && JSON.stringify(ent2.commercial_products) === JSON.stringify(['orcagraf']) && JSON.stringify(ent2.effective_products) === JSON.stringify(['orcagraf']),
      'Teste 2: Assinatura comercial legítima reflete em commercial_products e has_subscription = true',
      'has_subscription=true, commercial_products=[orcagraf], effective_products=[orcagraf]',
      `has_subscription=${ent2.has_subscription}, commercial=${JSON.stringify(ent2.commercial_products)}, effective=${JSON.stringify(ent2.effective_products)}`
    );

    // Limpar assinatura comercial para testar homologação pura
    await client.query(`DELETE FROM public.prexyon_subscriptions WHERE organization_id = '${orgAId}';`);

    // --------------------------------------------------------------------------
    // TESTE 3: Homologação OrçaGraf sem assinatura comercial = has_subscription: false, effective: ['orcagraf']
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}", "email": "${ownerAEmail}"}';`);
    await client.query(`
      SELECT public.prexyon_grant_homologation_entitlement(
        '${orgAId}',
        'orcagraf',
        now() + interval '7 days',
        'Homologacao multiusuario Etapa 7'
      );
    `);

    const entRes3 = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [orgAId]);
    const ent3 = entRes3.rows[0]?.data;
    assert(
      ent3.has_subscription === false && ent3.is_entitled === true && JSON.stringify(ent3.homologation_products) === JSON.stringify(['orcagraf']) && JSON.stringify(ent3.effective_products) === JSON.stringify(['orcagraf']),
      'Teste 3: Entitlement de homologação libera software mas mantém has_subscription = false (zero contaminação comercial)',
      'has_subscription=false, is_entitled=true, homologation_products=[orcagraf], effective=[orcagraf]',
      `has_subscription=${ent3.has_subscription}, is_entitled=${ent3.is_entitled}, homologation=${JSON.stringify(ent3.homologation_products)}, effective=${JSON.stringify(ent3.effective_products)}`
    );

    // --------------------------------------------------------------------------
    // TESTE 4: Homologação expirada (expires_at no passado) = Nenhum acesso
    // --------------------------------------------------------------------------
    const expOrgId = crypto.randomUUID();
    await client.query(`INSERT INTO public.organizations (id, trade_name, is_active) VALUES ('${expOrgId}', 'Org Exp Homolog', true);`);
    await client.query(`
      INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, created_at, expires_at)
      VALUES ('${expOrgId}', 'orcagraf', 'system', 'Teste expirado', now() - interval '10 days', now() - interval '1 second');
    `);

    const entRes4 = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [expOrgId]);
    const ent4 = entRes4.rows[0]?.data;
    assert(
      ent4.is_entitled === false && ent4.effective_products.length === 0,
      'Teste 4: Concessão de homologação com expires_at no passado perde acesso automaticamente (Fail-Closed)',
      'is_entitled=false, effective_products=[]',
      `is_entitled=${ent4.is_entitled}, effective_products=${JSON.stringify(ent4.effective_products)}`
    );
    await client.query(`DELETE FROM public.organizations WHERE id = '${expOrgId}';`);

    // --------------------------------------------------------------------------
    // TESTE 5: Homologação revogada (revoked_at preenchido) = Nenhum acesso
    // --------------------------------------------------------------------------
    await client.query(`
      SELECT public.prexyon_revoke_homologation_entitlement('${orgAId}', 'orcagraf', 'Revogacao de teste');
    `);

    const entRes5 = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [orgAId]);
    const ent5 = entRes5.rows[0]?.data;
    assert(
      ent5.is_entitled === false && ent5.effective_products.length === 0,
      'Teste 5: RPC de revogação de homologação cancela imediatamente o entitlement (revoked_at)',
      'is_entitled=false, effective_products=[]',
      `is_entitled=${ent5.is_entitled}, effective_products=${JSON.stringify(ent5.effective_products)}`
    );

    // --------------------------------------------------------------------------
    // TESTE 6: Homologação de ArteFlow NÃO libera OrçaGraf (Isolamento de Produtos)
    // --------------------------------------------------------------------------
    await client.query(`
      SELECT public.prexyon_grant_homologation_entitlement(
        '${orgAId}',
        'arteflow',
        now() + interval '7 days',
        'Homologacao isolada ArteFlow'
      );
    `);

    const entRes6 = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [orgAId]);
    const ent6 = entRes6.rows[0]?.data;
    assert(
      JSON.stringify(ent6.effective_products) === JSON.stringify(['arteflow']),
      'Teste 6: Concessão de ArteFlow restringe effective_products estritamente a ArteFlow',
      'effective_products=[arteflow]',
      `effective_products=${JSON.stringify(ent6.effective_products)}`
    );

    // --------------------------------------------------------------------------
    // TESTE 7: Combinação Assinatura Comercial + Homologação (União dos Produtos)
    // --------------------------------------------------------------------------
    // Assinatura comercial de OrçaGraf + Homologação de ArteFlow
    await client.query(`
      INSERT INTO public.prexyon_subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
      VALUES ('${orgAId}', '${orcagrafPlanId}', 'active', now(), now() + interval '30 days');
    `);

    const entRes7 = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [orgAId]);
    const ent7 = entRes7.rows[0]?.data;
    assert(
      ent7.has_subscription === true &&
      JSON.stringify(ent7.commercial_products) === JSON.stringify(['orcagraf']) &&
      JSON.stringify(ent7.homologation_products) === JSON.stringify(['arteflow']) &&
      JSON.stringify(ent7.effective_products) === JSON.stringify(['arteflow', 'orcagraf']),
      'Teste 7: Combinação de assinatura comercial e homologação produz união lógica precisa em effective_products',
      'commercial=[orcagraf], homologation=[arteflow], effective=[arteflow, orcagraf]',
      `commercial=${JSON.stringify(ent7.commercial_products)}, homologation=${JSON.stringify(ent7.homologation_products)}, effective=${JSON.stringify(ent7.effective_products)}`
    );

    // Limpar assinatura comercial para manter testes focados em homologação
    await client.query(`DELETE FROM public.prexyon_subscriptions WHERE organization_id = '${orgAId}';`);

    // --------------------------------------------------------------------------
    // TESTE 8: SSO Central consome rigorosamente effective_products
    // --------------------------------------------------------------------------
    // Conceder OrçaGraf via homologação
    await client.query(`
      SELECT public.prexyon_grant_homologation_entitlement(
        '${orgAId}',
        'orcagraf',
        now() + interval '7 days',
        'Homologacao OrçaGraf para SSO'
      );
    `);

    // Owner gerando SSO para OrçaGraf (permitido)
    await client.query(`SET request.jwt.claims = '{"sub": "${ownerAId}", "email": "${ownerAEmail}"}';`);
    let ssoAllowed = false;
    try {
      const ssoRes = await client.query(`SELECT public.prexyon_generate_sso_code('${orgAId}', '${ownerAId}', 'orcagraf') as code;`);
      ssoAllowed = !!ssoRes.rows[0]?.code;
    } catch {
      ssoAllowed = false;
    }

    // Owner tentando gerar SSO para ArteCheck (não concedido -> 403)
    let artecheckSsoBlocked = false;
    try {
      await client.query(`SELECT public.prexyon_generate_sso_code('${orgAId}', '${ownerAId}', 'artecheck');`);
    } catch (err: any) {
      artecheckSsoBlocked = err.message.includes('PRODUCT_NOT_SUBSCRIBED') || err.code === 'P0001';
    }

    assert(
      ssoAllowed && artecheckSsoBlocked,
      'Teste 8: SSO autoriza produtos em homologation_products e bloqueia estritamente produtos não autorizados',
      'OrçaGraf SSO = permitido, ArteCheck SSO = bloqueado (P0001)',
      `OrçaGraf SSO=${ssoAllowed}, ArteCheck Bloqueado=${artecheckSsoBlocked}`
    );

    // --------------------------------------------------------------------------
    // TESTE 9: Isolamento Cross-Tenant (Homologação na Org A não afeta Org B)
    // --------------------------------------------------------------------------
    const entResB = await client.query('SELECT public.prexyon_get_organization_entitlements($1) as data;', [orgBId]);
    const entB = entResB.rows[0]?.data;
    assert(
      entB.is_entitled === false && entB.effective_products.length === 0,
      'Teste 9: Entitlements concedidos para a Org A não vazam para a Org B (Isolamento Tenant)',
      'Org B is_entitled=false, effective_products=[]',
      `Org B is_entitled=${entB.is_entitled}, effective_products=${JSON.stringify(entB.effective_products)}`
    );

    // --------------------------------------------------------------------------
    // TESTE 10: RLS Client-Side Fail-Closed (Authenticated não consegue inserir diretamente)
    // --------------------------------------------------------------------------
    await client.query(`SET request.jwt.claims = '{"sub": "${memberAId}", "email": "${memberAEmail}", "role": "authenticated"}';`);
    await client.query(`SET ROLE authenticated;`);
    let directInsertBlocked = false;
    try {
      await client.query(`
        INSERT INTO public.prexyon_homologation_entitlements (organization_id, product_code, granted_by_actor_type, reason, expires_at)
        VALUES ('${orgAId}', 'artecheck', 'system', 'Tentativa client-side', now() + interval '7 days');
      `);
    } catch (err: any) {
      directInsertBlocked = err.message.includes('policy') || err.message.includes('permission') || err.code === '42501';
    } finally {
      await client.query(`RESET ROLE; SET request.jwt.claims = '';`);
    }

    assert(
      directInsertBlocked,
      'Teste 10: Política RLS bloqueia qualquer tentativa de INSERT direto no client authenticated (Fail-Closed)',
      'Bloqueio RLS / Permission Denied (42501)',
      directInsertBlocked ? 'Bloqueado com 42501' : 'Falhou: permitiu insert direto'
    );

    // --------------------------------------------------------------------------
    // TESTE 11: Auditoria em prexyon_audit_logs registra concessão e revogação
    // --------------------------------------------------------------------------
    const auditLogsRes = await client.query(`
      SELECT action, entity_type, metadata 
      FROM public.prexyon_audit_logs 
      WHERE organization_id = '${orgAId}' AND entity_type = 'prexyon_homologation_entitlements'
      ORDER BY created_at ASC;
    `);
    const logs = auditLogsRes.rows;
    const hasGrantAudit = logs.some(l => l.action === 'homologation_entitlement_granted');
    const hasRevokeAudit = logs.some(l => l.action === 'homologation_entitlement_revoked');
    assert(
      hasGrantAudit && hasRevokeAudit,
      'Teste 11: Concessões e revogações de homologação geram trilha completa em prexyon_audit_logs',
      'Eventos homologation_entitlement_granted e homologation_entitlement_revoked registrados',
      `Logs encontrados: ${logs.map(l => l.action).join(', ')}`
    );

    // --------------------------------------------------------------------------
    // CLEANUP TOTAL
    // --------------------------------------------------------------------------
    await client.query(`DELETE FROM public.prexyon_homologation_entitlements WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.prexyon_audit_logs WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.prexyon_sso_codes WHERE organization_id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.organizations WHERE id IN ('${orgAId}', '${orgBId}');`);
    await client.query(`DELETE FROM public.profiles WHERE id IN ('${ownerAId}', '${memberAId}', '${userBId}');`);
    await client.query(`DELETE FROM auth.users WHERE id IN ('${ownerAId}', '${memberAId}', '${userBId}');`);

  } catch (err: any) {
    console.error('ERRO_FATAL_TESTE_HOMOLOG:', err);
    failed++;
  } finally {
    try {
      await client.end();
    } catch {}
  }

  console.log('================================================================');
  console.log(`TOTAL DE TESTES DE HOMOLOGAÇÃO: ${passed + failed}`);
  console.log(`APROVADOS:                      ${passed}`);
  console.log(`REPROVADOS:                     ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runHomologationEntitlementsTests();
